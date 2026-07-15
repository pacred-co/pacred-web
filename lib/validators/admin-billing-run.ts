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
  /** ค่าส่งเหมาๆ (PCSF flat ฿100/shipment · ภูม 2026-06-23) — admin-EDITABLE on the create
   *  form (default = the auto Σ once-per-shipment fee). The override exists for "เซลเก็บ
   *  รอบเดียว แต่ลูกค้ามีหลายออเดอร์" → charge เหมาๆ once instead of ฿100×N. When absent the
   *  action computes the auto value. Bounded by positiveMoney. */
  maoFeeThb: positiveMoney.optional(),
  /** หมายเหตุสำหรับลูกค้า — free text. Max 2000 to bound payload. */
  noteForCustomer: z.string().trim().max(2000, "หมายเหตุยาวเกินไป").default(""),
  /** Build A guard 2026-06-19 — explicit ack that the admin is billing row(s) with
   *  NO measured น้ำหนัก+ปริมาตร (the warehouse measure step was skipped → the
   *  auto-priced transport SELL is ฿0 → silent under-charge). The form shows a
   *  ⚠️ badge + a confirm before setting this; the server REFUSES unmeasured rows
   *  unless it is true. */
  allowUnmeasured: z.boolean().optional().default(false),
  /** ค่าส่งไทย "ห้ามลืม" gate (pop-spec #3, owner 2026-07-06) — explicit ack that
   *  the admin is billing row(s) whose domestic delivery leg cost (ค่าส่งไทย ·
   *  ftransportprice) is still ฿0 while a leg applies (not self-pickup). The form
   *  shows a "ยังไม่กรอกค่าส่งไทย" badge + a confirm before setting this; the server
   *  REFUSES those rows unless it is true (a client can't silently skip the TH leg). */
  allowMissingThShip: z.boolean().optional().default(false),
  /** G1 combo-flow packing-reconcile gate (2026-07-08) — explicit ack that the admin is
   *  billing row(s) whose container has NOT been reconciled against the MOMO packing list
   *  yet (mig 0245 · the กล่อง/น้ำหนัก basis that drives the SELL price may be pre-packing).
   *  The create-form shows a "ยังไม่อัพ packing" warning + a confirm before setting this;
   *  the server REFUSES those rows unless it is true (grandfathers pre-feature containers
   *  with no stamp — no retroactive hard-block). Pure validation — no pricing change. */
  allowUnreconciledPacking: z.boolean().optional().default(false),
  /** Build A D2 2026-06-19 — per-line bill-amount override (forwarder_id → ฿amount,
   *  keyed as a string). Lets the admin correct a row's billed amount inline (e.g.
   *  type the right figure on a ค่าขนส่ง-฿0 row). The action uses the override when
   *  present, else calcForwarderOutstanding; stray keys not in forwarderIds are
   *  ignored. Bounded by positiveMoney (≥0, ≤9,999,999,999.99) to block fat-finger. */
  overrides: z.record(z.string(), positiveMoney).optional().default({}),
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
  // ภูม 2026-07-01 — เวลาที่รับชำระ (24 ชม · HH:mm) แยกจากวันที่ ให้บันทึกได้
  // แบบเดียวกับหน้า wallet (ตรวจ 2 รอบ + เวลา 24 ชม). optional → ถ้าไม่กรอก
  // action จะ default เป็นเวลา ณ ขณะบันทึก. รูปแบบ 24 ชม (ไม่มี AM/PM).
  paidAtTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "กรุณากรอกเวลาในรูปแบบ 24 ชม HH:mm")
    .optional(),
  // STEP-2 doc-number panel (2026-07-07) — accounting may hand-pick the ใบเสร็จ
  // เลขที่ (rID) before mark-paid auto-creates the receipt. Passed through to
  // autoIssueReceiptOnPaymentLand, which re-validates it unique before insert.
  // Absent → the receipt auto-mints (MAX+1) as before.
  overrideRid: z.string().trim().min(1).max(20).optional(),
  // G7 (2026-07-08) — a bill with NO reviewed slip (slip_status null/'rejected')
  // must NOT settle silently. The UI's "ชำระนอกระบบ (ยืนยันจบการ)" acknowledgment
  // sets this + a reason; the action refuses to settle a no-slip bill without it and
  // stamps the confirming admin (reviewed_by · mig 0231) into the audit trail. The
  // slip-bearing round-1 path (slip_status='pending') is unaffected.
  offlineConfirmed: z.boolean().optional().default(false),
  offlineReason: z.string().trim().max(500).optional(),
}).superRefine((val, ctx) => {
  if (val.offlineConfirmed && (val.offlineReason ?? "").trim().length < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["offlineReason"],
      message: "กรุณาระบุเหตุผลการชำระนอกระบบ (อย่างน้อย 3 ตัวอักษร)",
    });
  }
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
// REVERSE PAID — "ย้อนการรับชำระ" (paid → issued · unwind the settle · owner 2026-07-16)
// ────────────────────────────────────────────────────────────────────────

export const reverseBillingRunPaidSchema = z.object({
  invoiceId: z.number().int().positive(),
  reason: z.string().trim().min(3, "กรุณาระบุเหตุผล (อย่างน้อย 3 ตัวอักษร)").max(500),
});

export type ReverseBillingRunPaidInput = z.infer<
  typeof reverseBillingRunPaidSchema
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
