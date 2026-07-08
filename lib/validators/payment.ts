/**
 * Zod schema for Yuan transfer (service-payment) requests.
 *
 * V-E5 hardening (2026-05-25): exchange_rate is now bounded — the legacy
 * Excel sheets in cargo-ops-forensics §3.5 carried int32-overflow garbage
 * for currency rates; this gate stops them at the door.
 */

import { z } from "zod";
import { isInt32OverflowSuspect } from "./safe-numeric";

/** CNY→THB rate: real-world ~5.0; tight floor/ceiling protects from typos. */
const CNY_RATE_MIN = 1;
const CNY_RATE_MAX = 100;

export const yuanPaymentSchema = z.object({
  channel:          z.enum(["alipay", "wechat", "bank"], {
    message: "กรุณาเลือกช่องทาง",
  }),
  recipient_detail: z
    .string()
    .trim()
    .min(5, "กรุณาระบุข้อมูลผู้รับ (บัญชี / ชื่อ / ข้อความ)")
    .max(2000),
  yuan_amount:      z
    .number({ message: "กรุณากรอกจำนวนหยวน" })
    .refine((n) => !isInt32OverflowSuspect(n), {
      message: "int32_overflow_suspected — กรุณาตรวจค่าตัวเลขที่กรอก",
    })
    .refine((n) => n > 0,         { message: "จำนวนต้องมากกว่า 0" })
    .refine((n) => n <= 1_000_000, { message: "เกินวงเงิน" }),
  exchange_rate:    z
    .number({ message: "ไม่มีเรทแลกเปลี่ยน" })
    .refine((n) => !isInt32OverflowSuspect(n), {
      message: "int32_overflow_suspected — กรุณาตรวจค่าเรทแลกเปลี่ยน",
    })
    .refine(
      (n) => n >= CNY_RATE_MIN && n <= CNY_RATE_MAX,
      { message: `เรทแลกเปลี่ยน CNY→THB อยู่นอกช่วงที่อนุญาต (${CNY_RATE_MIN}-${CNY_RATE_MAX})` },
    ),
  paid_via_wallet:  z.boolean().optional(),
  slip_url:         z.string().optional(),
  id_doc_url:       z.string().optional(),
  // owner 2026-07-08 — payee 收款码 QR (Alipay/WeChat) the customer attaches so
  // the operator can scan+pay. → tb_payment.payee_qr_image (mig 0244).
  payee_qr_url:     z.string().optional(),
  // GAP 3 (2026-06-12) — the customer's tax-document choice for THIS yuan
  // transfer (ฝากโอน). Raw form fields, mapped to tb_payment.tax_doc_* (mig
  // 0140) the same way cart.ts + forwarder-legacy.ts do. SELECTION only — the
  // ใบกำกับ issuance stays gated by tax_invoice.shop_yuan_enabled.
  taxDocPref:        z.string().trim().max(20).optional(),
  taxDocTaxId:       z.string().trim().max(20).optional(),
  taxDocBillingName: z.string().trim().max(300).optional(),
  taxDocAddress:     z.string().trim().max(500).optional(),
});
export type YuanPaymentInput = z.infer<typeof yuanPaymentSchema>;
