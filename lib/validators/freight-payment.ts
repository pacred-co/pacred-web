/**
 * Zod schemas + helpers for V-E7 freight invoice payments.
 *
 * Per [docs/port-specs/freight-receipt-and-payment.md] + migration
 * 0052_freight_invoice_payments.sql.
 *
 * V1 scope (admin-only, customer self-upload deferred):
 *   - Admin records a payment against an issued freight invoice
 *     (cash / bank_transfer / wallet — manual entry; no external gateway).
 *   - One invoice receives many partial payments (ledger pattern).
 *   - Admin voids a mistaken payment (kept for audit).
 *   - payment_status (unpaid → partial → paid → overpaid) is recomputed
 *     from the ledger by the server action — never trusted from a client.
 *
 * Currency: THB only V1.
 */

import { z } from "zod";
import { isInt32OverflowSuspect } from "./safe-numeric";

// ────────────────────────────────────────────────────────────
// Enums (mirror DB CHECK constraints)
// ────────────────────────────────────────────────────────────

/** Payment methods — manual entry V1. */
export const FREIGHT_PAYMENT_METHODS = ["cash", "bank_transfer", "wallet"] as const;
export type FreightPaymentMethod = (typeof FREIGHT_PAYMENT_METHODS)[number];

export const FREIGHT_PAYMENT_METHOD_LABEL: Record<FreightPaymentMethod, string> = {
  cash:          "เงินสด",
  bank_transfer: "โอนผ่านธนาคาร",
  wallet:        "ตัดจาก Wallet",
};

/** Ledger-row status. */
export const FREIGHT_PAYMENT_STATUSES = ["recorded", "voided"] as const;
export type FreightPaymentStatus = (typeof FREIGHT_PAYMENT_STATUSES)[number];

export const FREIGHT_PAYMENT_STATUS_LABEL: Record<FreightPaymentStatus, string> = {
  recorded: "บันทึกแล้ว",
  voided:   "ยกเลิก",
};

/**
 * Invoice-level payment settlement axis. DISTINCT from
 * freight_invoices.status (the document lifecycle: draft/issued/cancelled).
 */
export const FREIGHT_INVOICE_PAYMENT_STATUSES = [
  "unpaid", "partial", "paid", "overpaid",
] as const;
export type FreightInvoicePaymentStatus = (typeof FREIGHT_INVOICE_PAYMENT_STATUSES)[number];

export const FREIGHT_INVOICE_PAYMENT_STATUS_LABEL: Record<FreightInvoicePaymentStatus, string> = {
  unpaid:   "ยังไม่ชำระ",
  partial:  "ชำระบางส่วน",
  paid:     "ชำระครบแล้ว",
  overpaid: "ชำระเกิน",
};

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/** Round-half-up to 2dp (THB cents). Matches `numeric(14,2)` storage. */
export function roundThb(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The THB amount a freight invoice's customer owes Pacred (the receipt
 * "grand total" the payment ledger settles against).
 *
 * DESIGN DECISION (V-E7, beyond the pre-locked set) — freight_invoices
 * (migration 0051) has NO single "total_thb" column. Its ADR-0016 value
 * block is a *landed-cost* model: commercial_value_thb (goods value, USD×
 * rate) + duty_thb (import duty) + vat_thb (7% import VAT). The amount the
 * customer pays Pacred for the job IS that landed-cost sum. We compute it
 * here from the frozen-at-issuance figures so the payment ledger has a
 * stable target. Missing pieces count as 0 (defensive — the action
 * refuses to record a payment when the resulting total is 0).
 *
 * If Pacred later wants a *separate* service-fee total distinct from
 * landed cost, that's a freight_invoices schema addition (V-E7.1) — V1
 * uses landed cost, matching what the legacy `tb_receipt` decoded to.
 */
export function freightInvoiceTotalThb(parts: {
  commercial_value_thb: number | null;
  duty_thb:             number | null;
  vat_thb:              number | null;
}): number {
  return roundThb(
    Number(parts.commercial_value_thb ?? 0) +
    Number(parts.duty_thb ?? 0) +
    Number(parts.vat_thb ?? 0),
  );
}

/**
 * Derive a freight invoice's payment_status from the ledger.
 *
 * `paidThb` = Σ amount_thb of NON-voided payment rows.
 * `totalThb` = the invoice grand total (subtotal + VAT — the gross amount
 *   the customer owes; WHT does NOT reduce this per RD Code 86).
 *
 * Rules (epsilon-tolerant so float dust never traps an invoice at partial):
 *   paid == 0                  → unpaid
 *   0 < paid < total           → partial
 *   total <= paid <= total+ε   → paid
 *   paid > total + ε           → overpaid
 *
 * A zero/negative totalThb (invoice with no priced lines) is treated as
 * 'paid' when anything was received, else 'unpaid' — defensive only;
 * the action refuses to record against an unpriced invoice anyway.
 */
export function computeInvoicePaymentStatus(
  paidThb: number,
  totalThb: number,
): FreightInvoicePaymentStatus {
  const paid  = roundThb(Math.max(0, paidThb));
  const total = roundThb(Math.max(0, totalThb));
  const EPS = 0.01;

  if (paid <= 0) return "unpaid";
  if (total <= 0) return "paid";
  if (paid + EPS < total) return "partial";
  if (paid <= total + EPS) return "paid";
  return "overpaid";
}

// ────────────────────────────────────────────────────────────
// Record a payment (admin)
// ────────────────────────────────────────────────────────────

/**
 * `slip_storage_path` is set by the server action from the upload
 * response — clients should NOT pass an arbitrary path. It's accepted
 * here so the action can re-validate after it uploads the file.
 */
export const recordFreightPaymentSchema = z.object({
  freight_invoice_id: z.string().uuid(),

  method: z.enum(FREIGHT_PAYMENT_METHODS),

  amount_thb: z
    .number()
    .refine((n) => !isInt32OverflowSuspect(n), {
      message: "int32_overflow_suspected — กรุณาตรวจค่าตัวเลขที่กรอก",
    })
    .positive("จำนวนเงินต้อง > 0")
    .max(999_999_999.99, "จำนวนเงินเกินเพดาน"),

  /** Bank-print / actual money-movement time. ISO string. Defaults to now in the action. */
  paid_at: z
    .string()
    .datetime({ offset: true })
    .optional(),

  /** Storage path inside bucket 'freight-payment-slips' (set by action post-upload). */
  slip_storage_path: z.string().trim().min(1).max(500).optional().nullable(),

  /** Bank reference number from the slip (bank_transfer only). */
  bank_ref: z.string().trim().max(120).optional().nullable(),

  notes: z.string().trim().max(2000).optional().nullable(),
});
export type RecordFreightPaymentInput = z.infer<typeof recordFreightPaymentSchema>;

// ────────────────────────────────────────────────────────────
// Void a payment (mistaken entry — kept for audit)
// ────────────────────────────────────────────────────────────

export const voidFreightPaymentSchema = z.object({
  id: z.string().uuid(),
  void_reason: z
    .string()
    .trim()
    .min(3,   "กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร")
    .max(500, "เหตุผลยาวเกินไป"),
});
export type VoidFreightPaymentInput = z.infer<typeof voidFreightPaymentSchema>;

// ────────────────────────────────────────────────────────────
// id-only schemas (list / receipt)
// ────────────────────────────────────────────────────────────

export const freightInvoiceIdSchema = z.object({ freight_invoice_id: z.string().uuid() });
export type FreightInvoiceIdInput = z.infer<typeof freightInvoiceIdSchema>;
