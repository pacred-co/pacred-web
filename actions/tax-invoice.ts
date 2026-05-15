"use server";

/**
 * Customer-side tax invoice request action — closes part of ภูม T-P4 G2b.
 *
 * Follows the ADR-0014 canonical pattern: admin-client-after-ownership-verify
 * (auth → RLS-fetch verify → idempotency → admin-client mutate → notify).
 *
 * **Scope of this file:** customer-initiated `requestTaxInvoice`.
 *
 * **Out of scope (ภูม T-P4 G2c/G2d/G2e):**
 *   - `adminIssueTaxInvoice` — admin side; needs react-pdf template
 *     (`components/pdf/tax-invoice.tsx`) + Storage upload + serial reservation
 *     via `next_tax_invoice_serial()` Postgres function
 *   - `adminCancelTaxInvoice` — admin side; cancellation + credit-note flow
 *   - `/api/tax-invoice/[id].pdf` — customer download route
 *
 * Skeleton state:
 *   ✅ Full action body — auth, ownership verify, idempotency, buyer snapshot,
 *      insert, notify, revalidate
 *   ❓ Waiting on migration 0034 to be applied on dev/prod (ภูม)
 *   ❓ Waiting on `notify.taxInvoiceRequested` admin template (added in this
 *      same commit to lib/notifications/templates.ts)
 *
 * @see docs/decisions/0006-tax-invoice-flow.md     — design contract
 * @see docs/decisions/0014-customer-self-service-state-transitions.md
 *      — pattern this action follows
 * @see supabase/migrations/0034_tax_invoices.sql   — schema this writes
 * @see lib/tax-invoice/types.ts                     — typed Input/Result shapes
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import type {
  RequestTaxInvoiceInput,
  TaxInvoiceActionResult,
  ParentOrderRef,
} from "@/lib/tax-invoice";

type RequestResult = TaxInvoiceActionResult<{
  tax_invoice_id: string;
  already_requested: boolean;
}>;

/**
 * Customer requests a tax invoice for a parent order they own.
 *
 * Flow (ADR-0014 compliant 7 steps):
 *   1. Auth → identify auth.uid()
 *   2. RLS-fetch parent order, verify ownership + status
 *   3. Idempotency — existing pending/issued tax_invoices for same
 *      (profile_id, parent_ref)? short-circuit return already_requested
 *   4. Buyer snapshot from `corporate` (juristic) OR `profiles.tax_id`
 *      (personal-with-tax-ID) — fail if tax_id missing
 *   5. Admin client INSERT into tax_invoices (status='pending', financial
 *      snapshot copied from parent order)
 *   6. Notify admins (super + accounting per ADR-0005 K-7) — they review
 *      and issue via /admin/tax-invoices/[id]
 *   7. revalidatePath on receipt page + admin tax-invoices list
 */
export async function requestTaxInvoice(input: RequestTaxInvoiceInput): Promise<RequestResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // 1. Validate input shape (already typed; defensive checks for VAT mode)
  if (input.vat_mode !== "inclusive" && input.vat_mode !== "exclusive") {
    return { ok: false, error: "invalid_vat_mode" };
  }
  const payment_method = (input.payment_method ?? "").trim();
  if (!payment_method) return { ok: false, error: "missing_payment_method" };

  // 2. Verify parent ownership + status via RLS-protected fetch
  const parentInfo = await fetchParentOrder(supabase, input.parent);
  if (!parentInfo.ok) return { ok: false, error: parentInfo.error };
  const { parent_id, total_thb, status: parentStatus } = parentInfo.data;

  // Status gate — allow only orders that are paid + reached terminal-ish state
  if (input.parent.kind === "service_order") {
    if (parentStatus !== "completed" && parentStatus !== "ordered" && parentStatus !== "awaiting_chn_dispatch") {
      return { ok: false, error: "order_not_yet_payable_for_tax_invoice" };
    }
  } else /* forwarder */ {
    if (parentStatus !== "delivered" && parentStatus !== "shipped_china" && parentStatus !== "in_transit" && parentStatus !== "arrived_thailand" && parentStatus !== "out_for_delivery") {
      return { ok: false, error: "forwarder_not_yet_payable_for_tax_invoice" };
    }
  }

  // 3. Idempotency — existing pending/issued tax_invoices for this profile + parent?
  let idemQuery = supabase
    .from("tax_invoices")
    .select("id, status")
    .eq("profile_id", user.id)
    .in("status", ["pending", "issued"]);
  if (input.parent.kind === "service_order") {
    idemQuery = idemQuery.eq("order_h_no", input.parent.h_no);
  } else {
    idemQuery = idemQuery.eq("forwarder_f_no", input.parent.f_no);
  }
  const { data: existing } = await idemQuery.maybeSingle<{ id: string; status: string }>();
  if (existing) {
    return { ok: true, data: { tax_invoice_id: existing.id, already_requested: true } };
  }

  // 4. Buyer snapshot (from corporate for juristic; from profiles for personal-with-tax_id)
  const buyer = await fetchBuyerSnapshot(supabase, user.id);
  if (!buyer.ok) return { ok: false, error: buyer.error };

  // 5. Financial snapshot (VAT inclusive default per Pacred retail pricing)
  const { subtotal_thb, vat_thb } = computeVatBreakdown(total_thb, input.vat_mode);

  // 6. Admin client INSERT (RLS would also allow since profile_id = auth.uid(),
  // but admin client matches the ADR-0014 pattern + lets us return the id cleanly).
  const admin = createAdminClient();

  type InsertedRow = { id: string };
  const insertRow: Record<string, unknown> = {
    profile_id:        user.id,
    buyer_name:        buyer.data.buyer_name,
    buyer_address:     buyer.data.buyer_address,
    buyer_tax_id:      buyer.data.buyer_tax_id,
    buyer_branch:      buyer.data.buyer_branch,
    status:            "pending",
    subtotal_thb,
    vat_thb,
    total_thb,
    vat_mode:          input.vat_mode,
    payment_method,
  };
  if (input.parent.kind === "service_order") insertRow.order_h_no     = input.parent.h_no;
  if (input.parent.kind === "forwarder")     insertRow.forwarder_f_no = input.parent.f_no;

  const { data: row, error: insErr } = await admin
    .from("tax_invoices")
    .insert(insertRow)
    .select("id")
    .single<InsertedRow>();
  if (insErr) return { ok: false, error: `insert_failed:${insErr.message}` };

  // 7. Notify admins — super + accounting (per ADR-0005 K-7)
  void notifyAdminsTaxInvoiceRequested({
    admin,
    parent: input.parent,
    parent_id,
    customer_id: user.id,
    tax_invoice_id: row.id,
    buyer_name: buyer.data.buyer_name,
  });

  // 8. revalidate UI on customer + admin sides
  const receiptPath =
    input.parent.kind === "service_order"
      ? `/service-order/${input.parent.h_no}/receipt`
      : `/service-import/${input.parent.f_no}/receipt`;
  revalidatePath(receiptPath);
  revalidatePath("/admin/tax-invoices");

  return { ok: true, data: { tax_invoice_id: row.id, already_requested: false } };
}

// ── helpers ──────────────────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function fetchParentOrder(
  supabase: SupabaseClient,
  parent: ParentOrderRef,
): Promise<{ ok: true; data: { parent_id: string; total_thb: number; status: string } } | { ok: false; error: string }> {
  if (parent.kind === "service_order") {
    const { data, error } = await supabase
      .from("service_orders")
      .select("id, status, total_thb")
      .eq("h_no", parent.h_no)
      .maybeSingle<{ id: string; status: string; total_thb: number }>();
    if (error) return { ok: false, error: `parent_fetch_failed:${error.message}` };
    if (!data)  return { ok: false, error: "order_not_found_or_not_owned" };
    return { ok: true, data: { parent_id: data.id, total_thb: Number(data.total_thb), status: data.status } };
  }
  // forwarder
  const { data, error } = await supabase
    .from("forwarders")
    .select("id, status, total_price")
    .eq("f_no", parent.f_no)
    .maybeSingle<{ id: string; status: string; total_price: number }>();
  if (error) return { ok: false, error: `parent_fetch_failed:${error.message}` };
  if (!data)  return { ok: false, error: "forwarder_not_found_or_not_owned" };
  return { ok: true, data: { parent_id: data.id, total_thb: Number(data.total_price), status: data.status } };
}

async function fetchBuyerSnapshot(
  supabase: SupabaseClient,
  profile_id: string,
): Promise<{ ok: true; data: { buyer_name: string; buyer_address: string; buyer_tax_id: string; buyer_branch: string } } | { ok: false; error: string }> {
  // Try corporate first (juristic customer)
  const { data: corp } = await supabase
    .from("corporate")
    .select("company_name, tax_id, company_address")
    .eq("profile_id", profile_id)
    .maybeSingle<{ company_name: string | null; tax_id: string | null; company_address: string | null }>();

  if (corp && corp.company_name && corp.tax_id && corp.company_address) {
    return {
      ok: true,
      data: {
        buyer_name:    corp.company_name,
        buyer_address: corp.company_address,
        buyer_tax_id:  corp.tax_id,
        buyer_branch:  "สำนักงานใหญ่",  // default branch — admin can edit at issuance time
      },
    };
  }

  // Fall back to profile (personal customer with tax_id — rare but allowed per ADR-0006)
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, tax_id, address_line, sub_district, district, province, postal_code")
    .eq("id", profile_id)
    .maybeSingle<{
      first_name:     string | null;
      last_name:      string | null;
      tax_id:         string | null;
      address_line:   string | null;
      sub_district:   string | null;
      district:       string | null;
      province:       string | null;
      postal_code:    string | null;
    }>();

  if (!profile || !profile.tax_id) {
    return {
      ok: false,
      error: "buyer_missing_tax_id — กรุณาเพิ่มเลขประจำตัวผู้เสียภาษีใน /profile ก่อน หรือสมัครเป็นนิติบุคคล",
    };
  }

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "(no name)";
  const fullAddress = [
    profile.address_line,
    profile.sub_district ? `ต.${profile.sub_district}` : null,
    profile.district     ? `อ.${profile.district}`     : null,
    profile.province     ? `จ.${profile.province}`     : null,
    profile.postal_code  ?? null,
  ].filter(Boolean).join(" ");
  if (!fullAddress.trim()) {
    return { ok: false, error: "buyer_missing_address — กรุณาเพิ่มที่อยู่ใน /profile ก่อน" };
  }

  return {
    ok: true,
    data: {
      buyer_name:    fullName,
      buyer_address: fullAddress,
      buyer_tax_id:  profile.tax_id,
      buyer_branch:  "สำนักงานใหญ่",
    },
  };
}

function computeVatBreakdown(total_thb: number, vat_mode: "inclusive" | "exclusive"): { subtotal_thb: number; vat_thb: number } {
  // Pacred is VAT-registered (7% per Thai Revenue Department).
  // - inclusive: total INCLUDES vat → vat = total * 7/107, subtotal = total - vat
  // - exclusive: total = subtotal + vat → subtotal = total / 1.07, vat = total - subtotal
  if (vat_mode === "inclusive") {
    const vat       = Math.round((total_thb * 7 / 107) * 100) / 100;
    const subtotal  = Math.round((total_thb - vat) * 100) / 100;
    return { subtotal_thb: subtotal, vat_thb: vat };
  }
  // exclusive
  const subtotal = Math.round((total_thb / 1.07) * 100) / 100;
  const vat      = Math.round((total_thb - subtotal) * 100) / 100;
  return { subtotal_thb: subtotal, vat_thb: vat };
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function notifyAdminsTaxInvoiceRequested(opts: {
  admin:           AdminClient;
  parent:          ParentOrderRef;
  parent_id:       string;
  customer_id:     string;
  tax_invoice_id:  string;
  buyer_name:      string;
}): Promise<void> {
  // Fetch active admins with super or accounting role (RBAC per ADR-0005 K-7).
  const { data: targets } = await opts.admin
    .from("admins")
    .select("profile_id")
    .in("role", ["super", "accounting"])
    .eq("is_active", true);

  const seen = new Set<string>();
  for (const t of (targets ?? []) as Array<{ profile_id: string | null }>) {
    const pid = t.profile_id;
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    await sendNotification(pid, notify.taxInvoiceRequested({
      taxInvoiceId: opts.tax_invoice_id,
      buyerName:    opts.buyer_name,
      parentLabel:  opts.parent.kind === "service_order"
        ? `ฝากสั่งซื้อ ${opts.parent.h_no}`
        : `ฝากนำเข้า ${opts.parent.f_no}`,
    }));
  }
}
