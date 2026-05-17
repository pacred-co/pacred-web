"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requestTaxInvoiceSchema,
  type RequestTaxInvoiceInput,
} from "@/lib/validators/tax-invoice";
import { assertNotImpersonating } from "@/lib/auth/impersonation";

/**
 * Customer-side tax invoice actions (T-P4 G2b).
 *
 * Per ADR-0006 (`docs/decisions/0006-tax-invoice-flow.md`):
 *   - Customer requests from receipt page once order is paid + completed
 *   - Buyer info captured FROM form (immutable RD snapshot — not auto-
 *     refreshed if profile changes later)
 *   - Status flow: pending → issued (admin G2c) → cancelled (admin G2e)
 *   - Numbering only assigned at issuance; pending rows have null serial
 *
 * Auth: customer-scoped via supabase.auth.getUser() + ownership check
 * against the source order. Admin client used ONLY for the actual writes
 * to tax_invoices / tax_invoice_lines because RLS would otherwise force
 * the customer's auth.uid() into the row — fine, but we want server-
 * controlled values for status/snapshot consistency.
 *
 * Idempotency: if a non-cancelled tax invoice already exists for this
 * source order, return its id with already_exists=true. Customer can
 * keep retrying without creating duplicates; UI can show the existing
 * row's status.
 */

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type RequestResult = { id: string; status: string; already_exists: boolean };

// ────────────────────────────────────────────────────────────
// REQUEST tax invoice (customer)
// ────────────────────────────────────────────────────────────

export async function requestTaxInvoice(
  input: RequestTaxInvoiceInput,
): Promise<ActionResult<RequestResult>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = requestTaxInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // ── 1. Resolve source order + verify ownership + status eligibility ──
  let sourceOrderTotal: number | null = null;
  // Default payment_method label — admin can refine per-row in G2c if
  // needed. Most flows are wallet (T-P3 bulk approve / customer self-pay
  // / T-P1 admin mark-paid all settle to wallet ledger).
  let sourcePaymentMethod = "Wallet";
  let sourceDescription   = "";
  // Pull all three source-parent foreign keys for the tax_invoices row insert.
  let order_h_no:      string | null = null;
  let forwarder_f_no:  string | null = null;
  let yuan_payment_id: string | null = null;

  if (d.order_type === "service_order") {
    const { data: order } = await supabase
      .from("service_orders")
      .select("h_no, profile_id, status, total_thb, title, item_count")
      .eq("h_no", d.order_id)
      .maybeSingle<{
        h_no: string;
        profile_id: string;
        status: string;
        total_thb: number;
        title: string | null;
        item_count: number;
      }>();
    if (!order)                          return { ok: false, error: "order_not_found" };
    if (order.profile_id !== user.id)    return { ok: false, error: "not_your_order" };
    if (order.status === "cancelled")    return { ok: false, error: "order_cancelled" };
    if (order.status === "pending" || order.status === "awaiting_payment") {
      return { ok: false, error: "order_not_paid_yet" };
    }

    sourceOrderTotal     = Number(order.total_thb);
    sourceDescription    = order.title
      ? `ฝากสั่งซื้อ ${order.h_no}: ${order.title} (${order.item_count} รายการ)`
      : `ฝากสั่งซื้อ ${order.h_no} (${order.item_count} รายการ)`;
    order_h_no           = order.h_no;
  } else if (d.order_type === "forwarder") {
    // forwarder
    const { data: f } = await supabase
      .from("forwarders")
      .select("f_no, profile_id, status, total_price, source_warehouse, transport_type, product_type, box_count")
      .eq("f_no", d.order_id)
      .maybeSingle<{
        f_no: string;
        profile_id: string;
        status: string;
        total_price: number;
        source_warehouse: string;
        transport_type: string;
        product_type: string;
        box_count: number;
      }>();
    if (!f)                          return { ok: false, error: "order_not_found" };
    if (f.profile_id !== user.id)    return { ok: false, error: "not_your_order" };
    if (f.status === "cancelled")    return { ok: false, error: "order_cancelled" };
    if (f.status === "pending_payment") {
      return { ok: false, error: "order_not_paid_yet" };
    }

    sourceOrderTotal     = Number(f.total_price);
    sourceDescription    = `ฝากนำเข้า ${f.f_no} · ${f.source_warehouse}/${f.transport_type}/${f.product_type} · ${f.box_count} กล่อง`;
    forwarder_f_no       = f.f_no;
  } else {
    // U4-3b — yuan_payment (ฝากโอน). order_id is the yuan_payments.id uuid.
    const { data: yp } = await supabase
      .from("yuan_payments")
      .select("id, profile_id, status, thb_amount, yuan_amount, channel, paid_via_wallet")
      .eq("id", d.order_id)
      .maybeSingle<{
        id: string;
        profile_id: string;
        status: string;
        thb_amount: number;
        yuan_amount: number;
        channel: "alipay" | "wechat" | "bank";
        paid_via_wallet: boolean;
      }>();
    if (!yp)                            return { ok: false, error: "order_not_found" };
    if (yp.profile_id !== user.id)      return { ok: false, error: "not_your_order" };
    if (yp.status === "refunded" || yp.status === "failed") {
      return { ok: false, error: "order_cancelled" };
    }
    // Only completed yuan transfers are billable — pending/processing
    // haven't settled yet, so no service was actually rendered to invoice.
    if (yp.status !== "completed") {
      return { ok: false, error: "order_not_paid_yet" };
    }

    sourceOrderTotal     = Number(yp.thb_amount);
    sourceDescription    = `ฝากโอนชำระ (${yp.channel.toUpperCase()}) ¥${Number(yp.yuan_amount).toFixed(2)} = ฿${Number(yp.thb_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;
    yuan_payment_id      = yp.id;
    sourcePaymentMethod  = yp.paid_via_wallet ? "Wallet" : "Bank Transfer";
  }

  if (!(sourceOrderTotal && sourceOrderTotal > 0)) {
    return { ok: false, error: "order_has_no_total" };
  }

  // Use admin client for the actual row mutations — bypasses RLS so we
  // can set buyer snapshot + financial snapshot deterministically (RLS
  // policy says customer can read their own row, doesn't have to gate
  // writes through the customer session).
  const admin = createAdminClient();

  // ── 2. Idempotency — existing non-cancelled invoice for this parent? ──
  const idempotencyFilter = admin
    .from("tax_invoices")
    .select("id, status")
    .neq("status", "cancelled");
  const { data: existing } =
    d.order_type === "service_order"
      ? await idempotencyFilter.eq("order_h_no", order_h_no).maybeSingle<{ id: string; status: string }>()
      : d.order_type === "forwarder"
        ? await idempotencyFilter.eq("forwarder_f_no", forwarder_f_no).maybeSingle<{ id: string; status: string }>()
        : await idempotencyFilter.eq("yuan_payment_id", yuan_payment_id).maybeSingle<{ id: string; status: string }>();

  if (existing) {
    return {
      ok: true,
      data: { id: existing.id, status: existing.status, already_exists: true },
    };
  }

  // ── 3. Compute financial snapshot (VAT inclusive — ADR-0006 §6 default) ──
  // total = sourceOrderTotal (price the customer paid)
  // subtotal = total / 1.07
  // vat = total - subtotal
  // Round to 2dp; small floor diff (≤0.01) absorbed in VAT to keep total exact.
  const total    = round2(sourceOrderTotal);
  const subtotal = round2(total / 1.07);
  const vat      = round2(total - subtotal);

  // ── 4. Insert tax_invoices header (status=pending) ──
  const { data: created, error: insErr } = await admin
    .from("tax_invoices")
    .insert({
      profile_id:     user.id,
      order_h_no,
      forwarder_f_no,
      yuan_payment_id,        // U4-3b
      buyer_name:     d.buyer_name,
      buyer_address:  d.buyer_address,
      buyer_tax_id:   d.buyer_tax_id,
      buyer_branch:   d.buyer_branch,
      status:         "pending",
      subtotal_thb:   subtotal,
      vat_thb:        vat,
      total_thb:      total,
      vat_mode:       "inclusive",
      payment_method: sourcePaymentMethod,
    })
    .select("id, status")
    .single<{ id: string; status: string }>();

  if (insErr) {
    // P1-4: 23505 = the 0061 partial-unique guard
    // (tax_invoice_one_per_order_uidx / _forwarder_uidx) caught a
    // concurrent double-request — a non-cancelled invoice already exists
    // for this order/forwarder. Re-SELECT it + return idempotently rather
    // than letting two pending invoices race to issuance (RD Code 86
    // numbering risk).
    if (insErr.code === "23505" || /duplicate|unique/i.test(insErr.message)) {
      const racedFilter = admin
        .from("tax_invoices")
        .select("id, status")
        .neq("status", "cancelled");
      const { data: raced } =
        d.order_type === "service_order"
          ? await racedFilter.eq("order_h_no", order_h_no).maybeSingle<{ id: string; status: string }>()
          : d.order_type === "forwarder"
            ? await racedFilter.eq("forwarder_f_no", forwarder_f_no).maybeSingle<{ id: string; status: string }>()
            : await racedFilter.eq("yuan_payment_id", yuan_payment_id).maybeSingle<{ id: string; status: string }>();
      if (raced) {
        return {
          ok: true,
          data: { id: raced.id, status: raced.status, already_exists: true },
        };
      }
    }
    return { ok: false, error: insErr.message };
  }

  // ── 5. Insert one summary line item (admin can refine in G2c if needed) ──
  const { error: linesErr } = await admin
    .from("tax_invoice_lines")
    .insert({
      tax_invoice_id: created.id,
      position:       1,
      description:    sourceDescription,
      qty:            1,
      unit_price_thb: subtotal,
      amount_thb:     subtotal,
      vat_thb:        vat,
    });

  if (linesErr) {
    // Don't roll back the header — admin can re-add lines manually + we
    // surface the error so customer knows. Header existing without lines
    // is recoverable; double-charging would be worse.
    return { ok: false, error: `lines insert failed: ${linesErr.message}` };
  }

  // Receipt pages render the request CTA → need to refresh after submit
  revalidatePath(`/service-order/${d.order_id}/receipt`);
  revalidatePath(`/service-import/${d.order_id}/receipt`);
  // U4-3b — yuan_payment listing surfaces the tax-invoice CTA.
  revalidatePath("/service-payment");

  return {
    ok: true,
    data: { id: created.id, status: created.status, already_exists: false },
  };
}

// ────────────────────────────────────────────────────────────
// READ — customer fetches their existing invoice (for showing
// "already requested — status: pending/issued" on the receipt page)
// ────────────────────────────────────────────────────────────

export type CustomerTaxInvoiceSummary = {
  id:           string;
  status:       "pending" | "issued" | "cancelled";
  serial_no:    string | null;
  issued_at:    string | null;
  total_thb:    number;
  buyer_name:   string;
  buyer_tax_id: string;
  pdf_storage_path: string | null;
  created_at:   string;
};

export async function getMyTaxInvoiceForOrder(
  orderType: "forwarder" | "service_order" | "yuan_payment",
  orderId:   string,
): Promise<ActionResult<CustomerTaxInvoiceSummary | null>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // RLS scopes to profile_id = auth.uid() automatically — but be explicit
  // for clarity.
  let q = supabase
    .from("tax_invoices")
    .select("id, status, serial_no, issued_at, total_thb, buyer_name, buyer_tax_id, pdf_storage_path, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  q = orderType === "service_order"
    ? q.eq("order_h_no", orderId)
    : orderType === "forwarder"
      ? q.eq("forwarder_f_no", orderId)
      : q.eq("yuan_payment_id", orderId);          // U4-3b

  const { data, error } = await q.maybeSingle<CustomerTaxInvoiceSummary>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? null };
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
