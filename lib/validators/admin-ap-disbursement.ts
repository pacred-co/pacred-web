/**
 * Zod schemas for the AP / เบิกจ่าย ledger WRITE side (Slice 2).
 * Spec: docs/research/accounting-ap-2026-07-01/spec.md · mig 0239.
 *
 * These live in a PLAIN module (NOT the "use server" action file) because a
 * "use server" file may only export async functions — a `export const schema =
 * z.object(...)` from it crashes at runtime (AGENTS build-trap). The action
 * file (actions/admin/ap-disbursement.ts) imports these.
 *
 * ── MONEY-SAFETY ──────────────────────────────────────────────────────
 * NONE of these schemas describes a write to any EXISTING money table. They
 * only validate input for the NEW ap_disbursement / ap_central_fund rows.
 * markApTransferredSchema is a REGISTER of an out-of-band transfer (the money
 * already moved by bank scan/K-Shop; the slip is the audit artifact) — it only
 * stamps the ap_disbursement row.
 */

import { z } from "zod";

// ── shared enums — mirror the mig 0239 CHECK constraints EXACTLY ──
export const AP_LANE_VALUES = [
  "sea", "air", "truck", "tr_6699", "sea_choho",
  "tua_chon", "export", "cn_vat_refund",
  "general", "cargo", "close_inspect", "nnb",
] as const;

export const AP_ENTITY_VALUES = ["pacred", "axelra", "nnb", "pcs", "ttp"] as const;

export const AP_CATEGORY_VALUES = [
  "service_cost", "advance_passthrough", "refund_correction",
] as const;

export const AP_RECEIPT_STATUS_VALUES = [
  "pending", "received", "customer_named", "na",
] as const;

export const AP_SOURCE_ACCOUNT_VALUES = ["service", "logistics", "trading"] as const;

// ── money bounds — the ap_disbursement columns are numeric(14,2) so the
//    magnitude ceiling is 999,999,999,999.99. A fat-finger past that would
//    fail the DB check anyway; reject early with a clear message. ──
const AP_MONEY_MAX = 999_999_999_999.99;
const apMoney = z
  .coerce.number()
  .min(0, "จำนวนเงินต้องไม่ติดลบ")
  .max(AP_MONEY_MAX, "จำนวนเงินเกินขอบเขต");

// ════════════════════════════════════════════════════════════
// createApRequest — ขอเบิก (transfer_status starts at 'requested')
// ════════════════════════════════════════════════════════════
export const createApRequestSchema = z
  .object({
    lane: z.enum(AP_LANE_VALUES),
    entity: z.enum(AP_ENTITY_VALUES).default("pacred"),
    category: z.enum(AP_CATEGORY_VALUES),
    item_label: z.string().trim().min(1, "กรุณากรอกรายการเบิกเงิน").max(500, "รายการยาวเกินไป"),

    // linkage — all optional (OPEX rows have no shipment)
    shipment_no: z.string().trim().max(100).optional().nullable(),
    quotation_no: z.string().trim().max(200).optional().nullable(),
    invoice_no: z.string().trim().max(100).optional().nullable(),
    receipt_no: z.string().trim().max(100).optional().nullable(),
    container_no: z.string().trim().max(100).optional().nullable(),
    customer_id: z.string().trim().max(50).optional().nullable(),
    line_name: z.string().trim().max(300).optional().nullable(),
    expense_category: z.string().trim().max(200).optional().nullable(),
    note: z.string().trim().max(2000).optional().nullable(),
    is_customer_named_receipt: z.coerce.boolean().default(false),

    // money — a normal spend fills amount_withdraw, a refund/correction fills
    // amount_refund (the DB check requires at least one > 0).
    amount_withdraw: apMoney.default(0),
    amount_refund: apMoney.default(0),
    amount_gross: apMoney.optional().nullable(),
    wht_pct: z.coerce.number().min(0).max(100).optional().nullable(),
    wht_cert_no: z.string().trim().max(100).optional().nullable(),

    // accounts
    source_account_key: z.enum(AP_SOURCE_ACCOUNT_VALUES).optional().nullable(),
    payee_name: z.string().trim().max(300).optional().nullable(),
    payee_account_no: z.string().trim().max(100).optional().nullable(),
    payee_bank: z.string().trim().max(100).optional().nullable(),
    pay_channel: z.string().trim().max(100).optional().nullable(),

    receipt_status: z.enum(AP_RECEIPT_STATUS_VALUES).default("pending"),

    // optional batch wrapper
    batch_id: z.string().uuid().optional().nullable(),
  })
  .refine(
    (v) => (v.amount_withdraw ?? 0) > 0 || (v.amount_refund ?? 0) > 0,
    { message: "ต้องมียอดเบิกหรือยอดคืนอย่างน้อยหนึ่งช่อง (> 0)", path: ["amount_withdraw"] },
  );

export type CreateApRequestInput = z.infer<typeof createApRequestSchema>;

// ════════════════════════════════════════════════════════════
// approveApRequest — อนุมัติ (requested → approved)
// ════════════════════════════════════════════════════════════
export const approveApRequestSchema = z.object({
  id: z.string().uuid(),
});
export type ApproveApRequestInput = z.infer<typeof approveApRequestSchema>;

// ════════════════════════════════════════════════════════════
// rejectApRequest — ยกเลิก (requested|approved → rejected)
// ════════════════════════════════════════════════════════════
export const rejectApRequestSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().max(500).optional().nullable(),
});
export type RejectApRequestInput = z.infer<typeof rejectApRequestSchema>;

// ════════════════════════════════════════════════════════════
// markApTransferred — "โอนแล้ว" (approved → transferred · REGISTER)
// The slip File is passed separately (FormData), not in this schema.
// ════════════════════════════════════════════════════════════
export const markApTransferredSchema = z.object({
  id: z.string().uuid(),
  /** วันที่/เวลาโอน — optional; server defaults to now() when absent. */
  transferred_at: z.string().datetime().optional().nullable(),
});
export type MarkApTransferredInput = z.infer<typeof markApTransferredSchema>;

// ════════════════════════════════════════════════════════════
// updateApReceiptStatus — the second (independent) status axis, non-money.
// ════════════════════════════════════════════════════════════
export const updateApReceiptStatusSchema = z.object({
  id: z.string().uuid(),
  receipt_status: z.enum(AP_RECEIPT_STATUS_VALUES),
});
export type UpdateApReceiptStatusInput = z.infer<typeof updateApReceiptStatusSchema>;
