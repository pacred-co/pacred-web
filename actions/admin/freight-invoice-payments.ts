"use server";

/**
 * V-E7 — Freight invoice payment ledger admin actions.
 *
 * Per [docs/port-specs/freight-receipt-and-payment.md] + migration
 * 0052_freight_invoice_payments.sql.
 *
 * Surface area V1:
 *   recordFreightPayment     — append a payment to an issued invoice;
 *                              recompute paid total + flip payment_status
 *   uploadFreightPaymentSlip — upload a bank-transfer slip → returns path
 *   voidFreightPayment       — void a mistaken payment (kept for audit);
 *                              recompute paid total + flip payment_status
 *   listFreightPayments      — ledger rows + computed totals for a panel
 *   getFreightReceiptGate    — WHT gate check before receipt download
 *
 * RBAC: super, ops, accounting (matches freight_invoices_admin_all in 0051).
 *
 * ── payment_status vs status ────────────────────────────────────────
 * freight_invoices.status        = document lifecycle (draft/issued/cancelled)
 * freight_invoices.payment_status = settlement (unpaid/partial/paid/overpaid)
 * This file ONLY ever writes payment_status — never status.
 *
 * ── Recompute model ─────────────────────────────────────────────────
 * After every insert/void, the action re-sums the NON-voided ledger rows
 * and writes payment_status + fully_paid_at back onto the invoice (the
 * F-11 "recompute in the action" pattern — simplest, no trigger). The sum
 * is the source of truth; payment_status is a denormalised cache.
 *
 * ── WHT gate (defensive) ────────────────────────────────────────────
 * withholding_tax_entries (migration 0044) keys its parent via
 * order_h_no XOR forwarder_f_no ONLY — no freight column. So no freight
 * invoice can currently be linked to a WHT row. getFreightReceiptGate
 * therefore returns { blocked:false } today, but is written as the single
 * choke-point so V-A6.1 (which would add freight_invoice_id to
 * withholding_tax_entries) only edits this one function.
 *
 * Audit: every mutation writes admin_audit_log per ADR-0014. Namespace:
 * freight_payment.*.
 *
 * Currency: THB only V1. Methods: cash / bank_transfer / wallet (manual
 * entry — no external gateway, no auto wallet-debit; see notes below).
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  recordFreightPaymentSchema, type RecordFreightPaymentInput,
  voidFreightPaymentSchema,   type VoidFreightPaymentInput,
  freightInvoiceIdSchema,     type FreightInvoiceIdInput,
  computeInvoicePaymentStatus,
  freightInvoiceTotalThb,
  roundThb,
  type FreightInvoicePaymentStatus,
} from "@/lib/validators/freight-payment";

const ROLES = ["super", "ops", "accounting"] as const;

// ────────────────────────────────────────────────────────────
// Shared shapes
// ────────────────────────────────────────────────────────────

type InvoiceFinancials = {
  id:                   string;
  status:               "draft" | "issued" | "cancelled";
  freight_shipment_id:  string;
  profile_id:           string;
  invoice_no:           string | null;
  commercial_value_thb: number | null;
  duty_thb:             number | null;
  vat_thb:              number | null;
};

type PaymentRow = {
  id:         string;
  amount_thb: number;
  status:     "recorded" | "voided";
};

/**
 * Re-sum the NON-voided ledger + write payment_status + fully_paid_at back
 * onto the invoice. Called after every insert/void. Returns the fresh
 * state so callers can surface it.
 */
async function recomputeInvoicePayment(
  admin: ReturnType<typeof createAdminClient>,
  invoice: InvoiceFinancials,
): Promise<{ paid_thb: number; total_thb: number; payment_status: FreightInvoicePaymentStatus }> {
  const { data: rows } = await admin
    .from("freight_invoice_payments")
    .select("id, amount_thb, status")
    .eq("freight_invoice_id", invoice.id);

  const paid_thb = roundThb(
    ((rows ?? []) as PaymentRow[])
      .filter((r) => r.status === "recorded")
      .reduce((s, r) => s + Number(r.amount_thb), 0),
  );

  const total_thb = freightInvoiceTotalThb({
    commercial_value_thb: invoice.commercial_value_thb,
    duty_thb:             invoice.duty_thb,
    vat_thb:              invoice.vat_thb,
  });

  const payment_status = computeInvoicePaymentStatus(paid_thb, total_thb);
  const fullyPaid = payment_status === "paid" || payment_status === "overpaid";

  await admin
    .from("freight_invoices")
    .update({
      payment_status,
      // Stamp fully_paid_at the first time it clears; clear it if a void
      // drops the invoice back below the total.
      fully_paid_at: fullyPaid ? new Date().toISOString() : null,
    })
    .eq("id", invoice.id);

  return { paid_thb, total_thb, payment_status };
}

async function loadInvoiceFinancials(
  admin: ReturnType<typeof createAdminClient>,
  invoiceId: string,
): Promise<InvoiceFinancials | null> {
  const { data } = await admin
    .from("freight_invoices")
    .select("id, status, freight_shipment_id, profile_id, invoice_no, commercial_value_thb, duty_thb, vat_thb")
    .eq("id", invoiceId)
    .maybeSingle<InvoiceFinancials>();
  return data ?? null;
}

// ────────────────────────────────────────────────────────────
// 1) Record a payment
// ────────────────────────────────────────────────────────────

type RecordResult = {
  id:             string;
  paid_thb:       number;
  total_thb:      number;
  payment_status: FreightInvoicePaymentStatus;
};

export async function recordFreightPayment(
  input: RecordFreightPaymentInput,
): Promise<AdminActionResult<RecordResult>> {
  const parsed = recordFreightPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const invoice = await loadInvoiceFinancials(admin, d.freight_invoice_id);
    if (!invoice) return { ok: false, error: "invoice_not_found" };

    // Payments only land on an ISSUED invoice — a draft has no frozen
    // figures + no invoice_no; a cancelled invoice is voided.
    if (invoice.status !== "issued") {
      return { ok: false, error: `invoice_not_issued:${invoice.status}` };
    }

    // The invoice must have a payable total (value block was frozen at
    // issuance). A 0 total = nothing to pay against.
    const total = freightInvoiceTotalThb({
      commercial_value_thb: invoice.commercial_value_thb,
      duty_thb:             invoice.duty_thb,
      vat_thb:              invoice.vat_thb,
    });
    if (total <= 0) return { ok: false, error: "invoice_total_zero" };

    // NOTE on method='wallet': V1 records the ledger row as a bookkeeping
    // note that the customer settled via their Pacred wallet. It does NOT
    // auto-debit wallet_transactions — that table's reference_type CHECK
    // (migration 0007) has a fixed enum with no 'freight_invoice' value;
    // a real wallet bridge needs a schema change → follow-up V-E7.1.

    const { data: inserted, error: insErr } = await admin
      .from("freight_invoice_payments")
      .insert({
        freight_invoice_id:   invoice.id,
        profile_id:           invoice.profile_id,        // denorm for RLS
        method:               d.method,
        amount_thb:           d.amount_thb,
        paid_at:              d.paid_at ?? new Date().toISOString(),
        slip_storage_path:    d.slip_storage_path ?? null,
        bank_ref:             d.bank_ref ?? null,
        notes:                d.notes ?? null,
        status:               "recorded",
        recorded_by_admin_id: adminId,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !inserted) {
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    const recomputed = await recomputeInvoicePayment(admin, invoice);

    await logAdminAction(adminId, "freight_payment.record", "freight_invoice", invoice.id, {
      payment_id:     inserted.id,
      invoice_no:     invoice.invoice_no,
      method:         d.method,
      amount_thb:     d.amount_thb,
      paid_thb:       recomputed.paid_thb,
      payment_status: recomputed.payment_status,
    });

    revalidatePath("/admin/freight/shipments");
    revalidatePath(`/admin/freight/shipments/${invoice.freight_shipment_id}`);
    return {
      ok: true,
      data: {
        id:             inserted.id,
        paid_thb:       recomputed.paid_thb,
        total_thb:      recomputed.total_thb,
        payment_status: recomputed.payment_status,
      },
    };
  });
}

// ────────────────────────────────────────────────────────────
// 2) Upload a bank-transfer slip
// ────────────────────────────────────────────────────────────
// Caller passes a File from a form. We write to bucket
// 'freight-payment-slips' under the customer's profile_id folder, then
// return the path so the caller passes it to recordFreightPayment.

export async function uploadFreightPaymentSlip(
  freightInvoiceId: string,
  file: File,
): Promise<AdminActionResult<{ storage_path: string }>> {
  if (!freightInvoiceId || typeof freightInvoiceId !== "string") {
    return { ok: false, error: "invalid_input" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "no_file" };
  }
  // 10 MB ceiling — slips are small PDFs/JPEGs (mirror uploadWhtCert).
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "file_too_large" };
  }

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const invoice = await loadInvoiceFinancials(admin, freightInvoiceId);
    if (!invoice) return { ok: false, error: "invoice_not_found" };

    const invoiceKey = invoice.invoice_no ?? invoice.id;
    const ext        = inferExtension(file);
    const stamp      = slipTimestamp();
    const path       = `${invoice.profile_id}/${invoiceKey}-${stamp}${ext}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadErr } = await admin.storage
      .from("freight-payment-slips")
      .upload(path, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert:      false,
      });
    if (uploadErr) {
      return { ok: false, error: `upload_failed: ${uploadErr.message}` };
    }

    await logAdminAction(adminId, "freight_payment.slip_upload", "freight_invoice", invoice.id, {
      storage_path: path,
      filename:     file.name,
      size_bytes:   file.size,
    });

    return { ok: true, data: { storage_path: path } };
  });
}

// ────────────────────────────────────────────────────────────
// 3) Void a payment (mistaken entry — kept for audit)
// ────────────────────────────────────────────────────────────

type VoidResult = {
  paid_thb:       number;
  total_thb:      number;
  payment_status: FreightInvoicePaymentStatus;
};

export async function voidFreightPayment(
  input: VoidFreightPaymentInput,
): Promise<AdminActionResult<VoidResult>> {
  const parsed = voidFreightPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: payment } = await admin
      .from("freight_invoice_payments")
      .select("id, status, freight_invoice_id, amount_thb")
      .eq("id", d.id)
      .maybeSingle<{ id: string; status: string; freight_invoice_id: string; amount_thb: number }>();
    if (!payment) return { ok: false, error: "payment_not_found" };
    if (payment.status === "voided") return { ok: false, error: "already_voided" };

    const { error: updErr } = await admin
      .from("freight_invoice_payments")
      .update({
        status:             "voided",
        voided_at:          new Date().toISOString(),
        voided_by_admin_id: adminId,
        void_reason:        d.void_reason,
      })
      .eq("id", d.id)
      .eq("status", "recorded");                                       // optimistic race-guard
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    const invoice = await loadInvoiceFinancials(admin, payment.freight_invoice_id);
    if (!invoice) {
      // Payment voided but parent vanished — recompute impossible; still OK.
      return { ok: false, error: "invoice_not_found_post_void" };
    }
    const recomputed = await recomputeInvoicePayment(admin, invoice);

    await logAdminAction(adminId, "freight_payment.void", "freight_invoice", invoice.id, {
      payment_id:     d.id,
      invoice_no:     invoice.invoice_no,
      amount_thb:     Number(payment.amount_thb),
      reason:         d.void_reason,
      payment_status: recomputed.payment_status,
    });

    revalidatePath("/admin/freight/shipments");
    revalidatePath(`/admin/freight/shipments/${invoice.freight_shipment_id}`);
    return {
      ok: true,
      data: {
        paid_thb:       recomputed.paid_thb,
        total_thb:      recomputed.total_thb,
        payment_status: recomputed.payment_status,
      },
    };
  });
}

// ────────────────────────────────────────────────────────────
// 4) List payments for an invoice (+ computed totals)
// ────────────────────────────────────────────────────────────

export type FreightPaymentListRow = {
  id:                 string;
  method:             string;
  amount_thb:         number;
  paid_at:            string;
  slip_storage_path:  string | null;
  bank_ref:           string | null;
  status:             "recorded" | "voided";
  void_reason:        string | null;
  notes:              string | null;
  created_at:         string;
};

export type FreightPaymentListResult = {
  payments:       FreightPaymentListRow[];
  paid_thb:       number;
  total_thb:      number;
  outstanding_thb: number;
  payment_status: FreightInvoicePaymentStatus;
};

export async function listFreightPayments(
  input: FreightInvoiceIdInput,
): Promise<AdminActionResult<FreightPaymentListResult>> {
  const parsed = freightInvoiceIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES], async () => {
    const admin = createAdminClient();

    const invoice = await loadInvoiceFinancials(admin, parsed.data.freight_invoice_id);
    if (!invoice) return { ok: false, error: "invoice_not_found" };

    const { data: rows } = await admin
      .from("freight_invoice_payments")
      .select("id, method, amount_thb, paid_at, slip_storage_path, bank_ref, status, void_reason, notes, created_at")
      .eq("freight_invoice_id", invoice.id)
      .order("paid_at", { ascending: false });

    const payments = ((rows ?? []) as FreightPaymentListRow[]).map((r) => ({
      ...r,
      amount_thb: Number(r.amount_thb),
    }));

    const paid_thb = roundThb(
      payments.filter((p) => p.status === "recorded").reduce((s, p) => s + p.amount_thb, 0),
    );
    const total_thb = freightInvoiceTotalThb({
      commercial_value_thb: invoice.commercial_value_thb,
      duty_thb:             invoice.duty_thb,
      vat_thb:              invoice.vat_thb,
    });
    const outstanding_thb = roundThb(Math.max(0, total_thb - paid_thb));
    const payment_status  = computeInvoicePaymentStatus(paid_thb, total_thb);

    return {
      ok: true,
      data: { payments, paid_thb, total_thb, outstanding_thb, payment_status },
    };
  });
}

// ────────────────────────────────────────────────────────────
// 5) Receipt issuance gate — WHT check (defensive)
// ────────────────────────────────────────────────────────────
// The receipt PDF is downloadable for an issued invoice. Per ADR-0015,
// issuing a RECEIPT while a WHT cert is still pending is blocked. But
// withholding_tax_entries (0044) cannot currently be keyed to a freight
// invoice (no freight column on that table). So this gate is the single
// choke-point that V-A6.1 will wire — today it allows freely.

export type FreightReceiptGate =
  | { blocked: false }
  | { blocked: true; reason: string };

/**
 * Returns whether the freight receipt download is blocked.
 *
 * V1: always { blocked:false } — freight↔WHT linkage does not exist.
 * The /api/freight-receipt/[id] route calls this so that when V-A6.1
 * adds freight_invoice_id to withholding_tax_entries, only THIS function
 * needs the join + cert_status check.
 */
export async function getFreightReceiptGate(
  freightInvoiceId: string,
): Promise<FreightReceiptGate> {
  // Validate shape defensively; never throw out of a gate.
  if (!freightInvoiceId || typeof freightInvoiceId !== "string") {
    return { blocked: false };
  }
  // V-A6.1 hook: when withholding_tax_entries gains a freight_invoice_id
  // column, query it here and return
  //   { blocked: true, reason: "wht_cert_pending" }
  // while cert_status === 'pending'. Until then there is no freight WHT
  // row to find → allow.
  return { blocked: false };
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Module-scope timestamp helper — React Compiler `react-hooks/purity`
 * flags Date.now() inside JSX; isolating the impure time source to module
 * scope matches the codebase pattern (see uploadWhtCert + the learnings
 * doc docs/learnings/nextjs-16-quirks.md).
 */
function slipTimestamp(): string {
  return String(Date.now());
}

function inferExtension(file: File): string {
  const name = (file.name ?? "").toLowerCase();
  if (name.endsWith(".pdf"))                            return ".pdf";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return ".jpg";
  if (name.endsWith(".png"))                            return ".png";
  if (name.endsWith(".webp"))                           return ".webp";
  const t = (file.type ?? "").toLowerCase();
  if (t.includes("pdf"))  return ".pdf";
  if (t.includes("jpeg") || t.includes("jpg")) return ".jpg";
  if (t.includes("png"))  return ".png";
  if (t.includes("webp")) return ".webp";
  return ".bin";
}
