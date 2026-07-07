/**
 * 🏦 Pacred bank accounts — THE money-routing source of truth (owner 2026-06-30).
 *
 * "ฝังไว้ในรากฐานของ source code ห้ามผิดพลาด ห้ามมั่ว" — every place that tells a
 * customer WHERE to pay, or that books a receipt, MUST resolve the destination
 * account through `resolvePaymentAccount()` here. Never hardcode an account number.
 *
 * THREE accounts, all บมจ. กสิกรไทย (Kasikorn), all owned by บจก. แพคเรด (ประเทศไทย):
 *
 *   1) SERVICE   ออมทรัพย์   204-1-55856-6   PromptPay นิติ 0105564077716
 *        ฝากสั่งซื้อ (จ่ายค่าสินค้า) · ฝากโอนชำระ (โอนหยวน) เท่านั้น
 *        ❌ ไม่ออกใบกำกับภาษี (no VAT)
 *
 *   2) LOGISTICS กระแสรายวัน 225-2-91144-0   (Thai-QR / K-Shop · ref KPS004KB…)
 *        ค่าขนส่งในไทย · ฝากนำเข้าคาร์โก้ (freight + เหมาๆ + ค่าขนส่งในไทย ·
 *        งานขนส่งผ่านบริษัทเฟรทเจ้าอื่น) · ชำระก่อนจัดส่ง
 *        ❌ ไม่ออกใบกำกับภาษี
 *
 *   3) TRADING   กระแสรายวัน 232-1-07669-9   (Thai-QR / K-Shop · ref KPS004KB…)
 *        ทุกงานที่ "เลือกออกใบกำกับภาษี" → เข้าบัญชีนี้ + เก็บ VAT 7%
 *        ✅ ออกใบกำกับภาษี (Trading / นิติ-to-นิติ)
 *
 * ROUTING RULE (the load-bearing decision — order matters):
 *   (a) ออกใบกำกับภาษี? ............................ → TRADING  (+ VAT 7%)   [overrides type]
 *   (b) ค่าขนส่งในไทย / ฝากนำเข้าคาร์โก้ (freight + เหมาๆ + ftransportprice)? → LOGISTICS
 *   (c) ฝากสั่งซื้อ / ฝากโอนชำระ (ไม่ออกใบกำกับ) ...... → SERVICE (PromptPay)
 *
 * VAT: only TRADING charges output VAT 7% to the customer (true ใบกำกับ → ภพ.30).
 * SERVICE/LOGISTICS = ไม่ออกใบกำกับ → no customer VAT line. (ใบขน = Non, margin-VAT is
 * internal only — see lib/tax/tax-doc-mode.ts.)
 */

export type PacredAccountKey = "service" | "logistics" | "trading";

export interface PacredBankAccount {
  key: PacredAccountKey;
  /** Display name of the lane (TH). */
  label: string;
  bankName: string;          // ธนาคาร
  bankCode: string;          // SOT key in lib/banks.ts (kasikorn)
  accountType: "ออมทรัพย์" | "กระแสรายวัน";
  accountNo: string;         // เลขที่บัญชี (the dashed display form)
  accountName: string;       // ชื่อบัญชี
  /** Pay channel the customer uses for THIS lane. */
  channel: "promptpay" | "qr";
  /** PromptPay id (juristic tax id) — only the SERVICE lane. */
  promptPayId?: string;
  /** Thai-QR / K-Shop image under public/ — only the QR lanes. */
  qrImagePath?: string;
  /** K-Shop merchant reference printed on the QR card (audit only). */
  qrRef?: string;
  /** Does paying into this lane mean a ใบกำกับภาษี is issued (+ VAT 7%)? */
  issuesTaxInvoice: boolean;
  note: string;
}

export const PACRED_TAX_ID = "0105564077716";

export const PACRED_BANK_ACCOUNTS: Record<PacredAccountKey, PacredBankAccount> = {
  service: {
    key: "service",
    label: "บริการ (Service)",
    bankName: "ธนาคารกสิกรไทย",
    bankCode: "kasikorn",
    accountType: "ออมทรัพย์",
    accountNo: "204-1-55856-6",
    accountName: "บจก. แพคเรด (ประเทศไทย)",
    channel: "promptpay",
    promptPayId: PACRED_TAX_ID,
    issuesTaxInvoice: false,
    note: "ฝากสั่งซื้อ (จ่ายค่าสินค้า) · ฝากโอนชำระ (โอนหยวน) — ไม่ออกใบกำกับภาษี",
  },
  logistics: {
    key: "logistics",
    label: "โลจิสติกส์ (Logistics)",
    bankName: "ธนาคารกสิกรไทย",
    bankCode: "kasikorn",
    accountType: "กระแสรายวัน",
    accountNo: "225-2-91144-0",
    accountName: "บจก. แพคเรด (ประเทศไทย)",
    channel: "qr",
    // owner-confirmed 2026-06-30 (file named by account no) — K-Shop QR for 225-2-91144-0.
    qrImagePath: "/images/payment/qr-logistics.jpg",
    qrRef: "KPS004KB",
    issuesTaxInvoice: false,
    note: "ค่าขนส่งในไทย · ฝากนำเข้าคาร์โก้ (freight + เหมาๆ + ค่าขนส่งในไทย) — ไม่ออกใบกำกับภาษี",
  },
  trading: {
    key: "trading",
    label: "เทรดดิ้ง/ขายสินค้า (Trading · ใบกำกับ)",
    bankName: "ธนาคารกสิกรไทย",
    bankCode: "kasikorn",
    accountType: "กระแสรายวัน",
    accountNo: "232-1-07669-9",
    accountName: "บจก. แพคเรด (ประเทศไทย)",
    channel: "qr",
    // owner-confirmed 2026-06-30 (file named by account no) — K-Shop QR for 232-1-07669-9.
    qrImagePath: "/images/payment/qr-trading.jpg",
    qrRef: "KPS004KB",
    issuesTaxInvoice: true,
    note: "ทุกงานที่ออกใบกำกับภาษี → เข้านี้ + เก็บ VAT 7%",
  },
};

/**
 * Resolve the destination account for a payment.
 *
 * @param issuesTaxInvoice  the job issues a ใบกำกับภาษี (doc-mode = ใบกำกับ)
 * @param isDomesticDeliveryLeg  ค่าขนส่งในไทย / ชำระปลายทางก่อนจัดส่ง (ฝากนำเข้า leg)
 *
 * Tax-invoice ALWAYS wins (a ใบกำกับ job pays into TRADING + VAT 7% even if it is
 * also a domestic-delivery leg). Otherwise a domestic-delivery/in-Thailand-shipping
 * charge goes to LOGISTICS; everything else (general service/freight/forwarding,
 * no tax invoice) goes to SERVICE (PromptPay).
 */
export function resolvePaymentAccount(opts: {
  issuesTaxInvoice: boolean;
  isDomesticDeliveryLeg?: boolean;
}): PacredBankAccount {
  if (opts.issuesTaxInvoice) return PACRED_BANK_ACCOUNTS.trading;
  if (opts.isDomesticDeliveryLeg) return PACRED_BANK_ACCOUNTS.logistics;
  return PACRED_BANK_ACCOUNTS.service;
}

/** VAT rate charged to the customer — ONLY on the TRADING (ใบกำกับ) lane. */
export const OUTPUT_VAT_RATE = 0.07;
