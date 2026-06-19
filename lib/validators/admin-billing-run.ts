/**
 * Zod schemas for the ใบวางบิล / billing-run R-2 port — `tb_forwarder_invoice`
 * + `tb_forwarder_invoice_item`.
 *
 * Pattern source: `lib/validators/admin-combine-bill.ts` (sibling).
 * Spec: `docs/audit/billing-run-port-2026-06-03.md` §4 R-2 + §5 Q1-Q6 defaults.
 *
 * All money fields are bounded to ≥0 and ≤9,999,999,999.99 (the NUMERIC(12,2)
 * ceiling). Negative values rejected with Thai error strings — staff sees the
 * mistake at the form, not at the Postgres CHECK fail downstream.
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

const positiveMoney = z
  .number({ message: "กรุณากรอกจำนวนเงินเป็นตัวเลข" })
  .nonnegative("จำนวนเงินต้องไม่ติดลบ")
  .max(9_999_999_999.99, "จำนวนเงินเกินขีดจำกัด");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "กรุณากรอกวันที่ในรูปแบบ YYYY-MM-DD")
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "วันที่ไม่ถูกต้อง");

// userID = legacy business key "PR<n>" (no UUID). varchar(20) on tb_users.
const userIDSchema = z
  .string()
  .min(1, "กรุณาเลือกลูกค้า")
  .max(20, "รหัสสมาชิกยาวเกินไป (>20 ตัวอักษร)")
  // Pacred PR codes + legacy PCS codes both fit /^[A-Z]+\d+$/i but we don't
  // enforce that pattern — some MOMO-imported customers use 3-digit numeric
  // codes (e.g. "005"). Bound by length only.
  .regex(/^[A-Za-z0-9_-]+$/, "รหัสสมาชิกมีอักษรไม่อนุญาต");

// ────────────────────────────────────────────────────────────────────────
// CREATE — staff picks 1+ eligible forwarders + sets due date
// ────────────────────────────────────────────────────────────────────────

export const createBillingRunInvoiceSchema = z.object({
  userid: userIDSchema,
  /** tb_forwarder.id values to bill on this invoice (≥1). Validator dedupes. */
  forwarderIds: z
    .array(z.number().int().positive("เลข forwarder ต้องเป็นจำนวนเต็มบวก"))
    .min(1, "กรุณาเลือกรายการฝากนำเข้าอย่างน้อย 1 รายการ")
    .max(500, "เลือกได้ไม่เกิน 500 รายการต่อ 1 ใบวางบิล")
    .transform((ids) => Array.from(new Set(ids))),
  /** วันที่ออกเอกสาร — default today on the page. Stored as DATE. */
  dateIssued: isoDate,
  /** วันที่ครบกำหนดจ่าย — the add-form defaults to today + 7 days. (Legacy has
   *  NO per-customer credit-DAYS column; tb_users.userCreditValue is the credit
   *  LIMIT in baht, the term lives per-order on tb_forwarder.fcreditdate — ADR-0023.
   *  So the 7-day default is intentional; staff edits it for other terms.)
   *  MUST be ≥ dateIssued. */
  dateDue: isoDate,
  /** Money-summary fields. subtotal_thb auto-computed by the action from the
   *  selected forwarder rows; the other 4 are admin-editable (legacy add.php
   *  L207-246: CHN charge / TH charge / Other / Discount). */
  deliveryChnThb: positiveMoney.default(0),
  deliveryThThb:  positiveMoney.default(0),
  otherThb:       positiveMoney.default(0),
  discountThb:    positiveMoney.default(0),
  /** หมายเหตุสำหรับลูกค้า — free text. Max 2000 to bound payload. */
  noteForCustomer: z.string().trim().max(2000, "หมายเหตุยาวเกินไป").default(""),
  /** Build A guard 2026-06-19 — explicit ack that the admin is billing row(s) with
   *  NO measured น้ำหนัก+ปริมาตร (the warehouse measure step was skipped → the
   *  auto-priced transport SELL is ฿0 → silent under-charge). The form shows a
   *  ⚠️ badge + a confirm before setting this; the server REFUSES unmeasured rows
   *  unless it is true. */
  allowUnmeasured: z.boolean().optional().default(false),
}).superRefine((val, ctx) => {
  if (new Date(val.dateDue) < new Date(val.dateIssued)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dateDue"],
      message: "วันที่ครบกำหนดจ่ายต้องไม่อยู่ก่อนวันที่ออกเอกสาร",
    });
  }
  if (val.discountThb > val.deliveryChnThb + val.deliveryThThb + val.otherThb + 1_000_000) {
    // Allow discount > sub-charges (e.g. promo blanket) but not absurdly negative
    // total. The action recomputes final total + clamps to ≥ 0.
  }
});

export type CreateBillingRunInvoiceInput = z.infer<
  typeof createBillingRunInvoiceSchema
>;

// ────────────────────────────────────────────────────────────────────────
// MARK PAID — flip status 'issued' → 'paid'
// ────────────────────────────────────────────────────────────────────────

export const markBillingRunPaidSchema = z.object({
  invoiceId: z.number().int().positive(),
  paymentMethod: z.enum(["bank_transfer", "cheque", "wallet", "other"], {
    message: "กรุณาเลือกวิธีการชำระ",
  }),
  paymentReference: z
    .string()
    .trim()
    .max(200, "หมายเลขอ้างอิงยาวเกินไป")
    .default(""),
  paidAt: isoDate.optional(),
});

export type MarkBillingRunPaidInput = z.infer<
  typeof markBillingRunPaidSchema
>;

// ────────────────────────────────────────────────────────────────────────
// CANCEL — soft-cancel an invoice (set status='cancelled' + reason)
// ────────────────────────────────────────────────────────────────────────

export const cancelBillingRunInvoiceSchema = z.object({
  invoiceId: z.number().int().positive(),
  cancelReason: z
    .string()
    .trim()
    .min(3, "เหตุผลยกเลิกต้องอย่างน้อย 3 ตัวอักษร")
    .max(1000, "เหตุผลยกเลิกยาวเกินไป"),
});

export type CancelBillingRunInvoiceInput = z.infer<
  typeof cancelBillingRunInvoiceSchema
>;

// ────────────────────────────────────────────────────────────────────────
// SEND NOTIFICATION — staff-triggered email/LINE push (idempotent retry)
// ────────────────────────────────────────────────────────────────────────

export const sendBillingRunNotificationSchema = z.object({
  invoiceId: z.number().int().positive(),
  channel: z.enum(["email", "line", "both"], {
    message: "กรุณาเลือกช่องทาง",
  }),
});

export type SendBillingRunNotificationInput = z.infer<
  typeof sendBillingRunNotificationSchema
>;
