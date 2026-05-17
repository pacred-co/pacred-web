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
 * entry — no external gateway). method='wallet' DOES debit the customer's
 * Pacred wallet (W-3 / gap-schema-security G-3 — migration 0063 added the
 * 'freight_invoice' reference_type so the bridge exists); voiding such a
 * payment reverses the debit. See debitWalletForFreightPayment below.
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
import {
  getAvailableBalance,
  hasSufficientAvailable,
  type LedgerRow,
} from "@/lib/wallet/ledger";

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

/**
 * W-3 / gap-schema-security G-3 — debit the customer's wallet for a
 * freight payment recorded with method='wallet'.
 *
 * Before this fix, method='wallet' was a bookkeeping note that did NOT
 * move money: wallet_transactions.reference_type had no 'freight_invoice'
 * value (the 0007 CHECK), so the invoice flipped to `paid` while the
 * wallet balance never dropped — a free shipment. Migration 0063 adds the
 * reference_type value + a partial-unique guard; this helper writes the
 * actual debit, mirroring the cargo order_payment debit in
 * payServiceOrderFromWallet.
 *
 * Contract:
 *   - `paymentRowId` is the freight_invoice_payments row just inserted —
 *     it is the reference_id, giving a 1:1 debit per partial payment and
 *     matching the wallet_tx_freight_payment_uniq index (0063).
 *   - The debit is status='completed' (an instant debit, like cargo
 *     pay-from-wallet) so it reduces wallet.balance immediately.
 *   - Balance is checked against the AVAILABLE balance (completed minus
 *     pending debits — lib/wallet/ledger.ts) so a freight wallet payment
 *     cannot push the wallet negative past funds already reserved by
 *     pending withdraws / yuan transfers.
 *   - 23505 (the 0063 unique guard) is treated as an idempotent retry:
 *     the debit already exists for this payment row → success.
 *
 * Returns { ok:true } on success (debit written or already present), or
 * { ok:false, error } — the caller MUST then void the freight payment
 * row so the invoice is never flipped to paid without the debit.
 */
async function debitWalletForFreightPayment(
  admin: ReturnType<typeof createAdminClient>,
  args: { profileId: string; paymentRowId: string; amountThb: number; invoiceNo: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profileId, paymentRowId, amountThb, invoiceNo } = args;

  // Available-balance check (completed balance − Σ pending debits).
  const { data: wallet } = await admin
    .from("wallet")
    .select("balance")
    .eq("profile_id", profileId)
    .maybeSingle<{ balance: number }>();
  const { data: pendingRows } = await admin
    .from("wallet_transactions")
    .select("amount, status")
    .eq("profile_id", profileId)
    .eq("bucket", "main")
    .eq("status", "pending");
  const available = getAvailableBalance(
    Number(wallet?.balance ?? 0),
    (pendingRows ?? []) as LedgerRow[],
  );
  if (!hasSufficientAvailable(available, amountThb)) {
    return {
      ok: false,
      error: `wallet_insufficient — ใช้ได้ ฿${available.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ต้อง ฿${amountThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
    };
  }

  // Write the debit. kind='import_payment' — freight is the import side
  // (legacy enum 5 ชำระนำเข้า → import_payment); reference_type=
  // 'freight_invoice' is the value migration 0063 added to the CHECK.
  const { error: debitErr } = await admin
    .from("wallet_transactions")
    .insert({
      profile_id:     profileId,
      bucket:         "main",
      amount:         -amountThb,
      kind:           "import_payment",
      status:         "completed",
      reference_type: "freight_invoice",
      reference_id:   paymentRowId,
      admin_id:       null,
      note:           `ชำระค่าขนส่ง freight invoice ${invoiceNo ?? paymentRowId} (ตัดจาก wallet)`,
    });

  if (debitErr) {
    // 23505 = the 0063 partial-unique guard (wallet_tx_freight_payment_uniq)
    // caught a double-submit — the debit for this payment row already
    // exists. Idempotent: treat as success, don't double-debit.
    if (debitErr.code === "23505" || /duplicate|unique/i.test(debitErr.message)) {
      return { ok: true };
    }
    return { ok: false, error: `wallet_debit_failed: ${debitErr.message}` };
  }
  return { ok: true };
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

    // W-3 / gap-schema-security G-3 — method='wallet' now writes a REAL
    // wallet debit. Migration 0063 added the 'freight_invoice'
    // reference_type value + a partial-unique guard, so the freight
    // payment can be bridged to wallet_transactions exactly like the
    // cargo order_payment debit. The debit is inserted just below, after
    // the ledger row exists (it is the reference_id); if the debit fails
    // the freight payment row is voided so the invoice never flips to
    // `paid` without the money being taken.

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
      // P1-2: 23505 = the 0061 partial-unique guard
      // (freight_payment_bank_ref_uniq) caught a double-submit — the same
      // bank_ref was already recorded on this invoice. Re-SELECT the
      // existing payment + return idempotently instead of inserting a
      // duplicate that would over-collect / flip the invoice to overpaid.
      if (
        insErr &&
        (insErr.code === "23505" || /duplicate|unique/i.test(insErr.message)) &&
        d.bank_ref
      ) {
        const { data: raced } = await admin
          .from("freight_invoice_payments")
          .select("id")
          .eq("freight_invoice_id", invoice.id)
          .eq("bank_ref", d.bank_ref)
          .eq("status", "recorded")
          .maybeSingle<{ id: string }>();
        if (raced) {
          const recomputed = await recomputeInvoicePayment(admin, invoice);
          return {
            ok: true,
            data: {
              id:             raced.id,
              paid_thb:       recomputed.paid_thb,
              total_thb:      recomputed.total_thb,
              payment_status: recomputed.payment_status,
            },
          };
        }
      }
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    // W-3 / G-3 — if the customer settled via wallet, take the money now.
    // The debit references THIS payment row (1:1 per partial payment). If
    // it fails (insufficient balance, DB error), VOID the freight payment
    // row so recomputeInvoicePayment below does not count it — the invoice
    // must never flip to `paid` without the wallet actually being debited.
    if (d.method === "wallet") {
      const debit = await debitWalletForFreightPayment(admin, {
        profileId:    invoice.profile_id,
        paymentRowId: inserted.id,
        amountThb:    d.amount_thb,
        invoiceNo:    invoice.invoice_no,
      });
      if (!debit.ok) {
        await admin
          .from("freight_invoice_payments")
          .update({
            status:             "voided",
            voided_at:          new Date().toISOString(),
            voided_by_admin_id: adminId,
            void_reason:        `auto-void — wallet debit failed: ${debit.error}`,
          })
          .eq("id", inserted.id);
        return { ok: false, error: debit.error };
      }
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
      .select("id, status, freight_invoice_id, amount_thb, method")
      .eq("id", d.id)
      .maybeSingle<{ id: string; status: string; freight_invoice_id: string; amount_thb: number; method: string }>();
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

    // W-3 / G-3 — if this payment debited the wallet (method='wallet'),
    // reverse it: flip the paired wallet_transactions debit to 'cancelled'
    // so the balance trigger (0007) drops it from the balance and the
    // customer is refunded the freight charge. The debit is keyed on the
    // payment row id (reference_id) per migration 0063.
    if (payment.method === "wallet") {
      const { error: revErr } = await admin
        .from("wallet_transactions")
        .update({ status: "cancelled", admin_id_update: adminId })
        .eq("reference_type", "freight_invoice")
        .eq("reference_id", payment.id)
        .eq("kind", "import_payment")
        .eq("status", "completed");
      if (revErr) {
        // The payment is already voided; surface so an admin reconciles
        // the still-standing debit rather than silently leaving the
        // customer charged.
        return {
          ok: false,
          error: `payment voided but wallet refund failed (debit for payment ${payment.id} stands): ${revErr.message}`,
        };
      }
    }

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
