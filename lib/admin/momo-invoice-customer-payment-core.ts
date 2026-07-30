/**
 * momo-invoice-customer-payment-core.ts — "แทรคกิ้งที่ MOMO เก็บเงินเรามา · เราเก็บเงิน
 * ลูกค้ามาหรือยัง" — ส่วนที่เป็น **ตรรกะล้วน** (จัดกลุ่ม + นับสรุป). ไม่มี I/O ไม่มี DB
 * → เทสได้ตรงๆ (ตัว I/O อยู่ใน momo-invoice-customer-payment.ts ซึ่ง server-only).
 *
 * Owner 2026-07-30 (verbatim): *"ทำแยกมาให้ทีครับ ว่า แทรคกิ้งที่ MOMO เก็บเงินเรามา
 *   เราได้เก็บเงินลูกค้ามาหรือยังครับ และมีปุ่ม สามารถเข้าไปดูอ้างอิง ใบเสร็จ หรือ สลิปได้ด้วยครับ
 *   ถ้ารวมชิปเม้นก็แจงมาด้วยเลยครับ ให้เห็น ให้รู้ว่า อ้างอิงถึงกันและกันและเข้าไปกดดูตรวจสอบได้ด้วยครับ"*
 *
 * ══ paid-detection = กฎเดียวกับรายงานค่าคอม/งานที่จ่ายแล้ว (ห้ามคิดใหม่) ══
 * "ลูกค้าจ่ายแล้ว" ของฝากนำเข้า = แถวใน `tb_wallet_hs` ที่ `status='2'` (settled) และ
 * `reforder` = `tb_forwarder.id` (CHILD · type='4' typeservice='2') — ตัวเดียวกับที่
 * `lib/admin/sales-commission-report.ts` (L155-193) และ `lib/admin/paid-work-report.ts`
 * (L110-145) ใช้. HEADER type-1 มี reforder ว่าง จึงไม่โดนนับซ้ำโดยธรรมชาติ.
 *
 * ⚠️ **ช่องทางที่ 2 ที่กฎ wallet มองไม่เห็น — ใบวางบิล (billing-run)**
 * สำรวจ prod 2026-07-30 (fstatus 6/7 = เก็บเงินแล้วตาม flow): จ่ายผ่าน wallet 365 แถว ·
 * **จ่ายผ่านใบวางบิลอย่างเดียว (ไม่มีแถว wallet เลย) 177 แถว** · ไม่พบทั้งสองทาง 95 แถว.
 * `markBillingRunPaid` เขียน `tb_forwarder_invoice.status='paid'` + `paid_at` แล้วดัน
 * fstatus 5→6 โดย **ไม่ผ่าน tb_wallet_hs** → ถ้าโชว์เฉพาะกฎ wallet หน้านี้จะ "โกหก"
 * ว่ายังไม่เก็บ บน 177 แถวที่เก็บไปแล้ว (§0f อย่ามั่ว).
 * ⇒ เราจึง **ไม่นิยาม "จ่ายแล้ว" ขึ้นใหม่** แต่ **เปิดเผยช่องทาง** ตรงๆ: `channel` บอกว่า
 * รู้มาจากทางไหน · ตัวนับแยกกันคนละช่อง (`paidViaWallet` / `paidViaBillingRun`) · ฝั่ง wallet
 * ถูกถามก่อนเสมอ (เพราะถือสลิป + วันจ่ายรายแถว). ไม่มีการกลืนรวมเป็นตัวเลขเดียวแบบเงียบๆ.
 *
 * ══ "ถ้ารวมชิปเม้นก็แจงมาด้วย" — 1 การชำระ คลุมหลายแทรคกิ้ง มี 3 ทรง ══
 * (mirror `/admin/wallet/[id]/page.tsx` ห้ามคิดกฎจัดกลุ่มขึ้นเอง)
 *   1. **cascade "เติม-แล้วจ่าย"** (ทรงหลัก · prod 341/366 แถว) — CHILD หลายแถวชี้ `reforder2`
 *      ไปที่ HEADER topup ตัวเดียวกัน (สลิปอยู่บน topup · child ไม่มีสลิปเลย).
 *      → group = `reforder2` · เทียบ page.tsx:401-435 (reverse paydeposit) แต่แม่นกว่า
 *        เพราะ reforder2 ชี้ตรง (prod: 341/341 resolve ได้ · ทุกตัวเป็น type-1 ที่มีสลิป).
 *   2. **shared-slip (direct-slip)** — จ่ายตรงไม่ผ่านกระเป๋า หลายแถวใช้ "ไฟล์สลิปเดียวกัน"
 *      → group = `userid + imagesslip` · กฎเดียวกับ page.tsx:547-573 เป๊ะ
 *        (type='4' · typeservice='2' · reforder2 IS NULL · userid ตรง · imagesslip ตรง).
 *   3. **เดี่ยว** — ไม่เข้าทั้ง 2 ทรง → กลุ่มของตัวเอง.
 * ฝั่งใบวางบิล: 1 ใบคลุมหลายแถว (`tb_forwarder_invoice_item.forwarder_id`) = ทรงเดียวกัน.
 *
 * ══ กันนับซ้ำ ══ `amountThb` = ยอด**รายแถว** เสมอ (CHILD amount / invoice_item.amount_thb)
 * → บวกข้ามแถวได้ไม่เบิ้ล. ยอดทั้งกลุ่มอยู่ที่ `groupTotalThb` (ไว้โชว์อย่างเดียว ห้ามเอาไป Σ).
 *
 * READ-ONLY 100% · display-only — ไม่มีฟิลด์ไหนไหลไปเป็นการเขียน.
 */

/** ช่องทางที่ "รู้ว่าเก็บเงินแล้ว" — คนละความหมาย ห้ามกลืนรวมกัน. */
export type CustomerPaymentChannel = "wallet" | "billing_run";

/** คำตอบ "แทรคกิ้งนี้เก็บเงินลูกค้าแล้วหรือยัง" ของ 1 fid. */
export type CustomerPaymentInfo = {
  paid: boolean;
  /** รู้จากทางไหน (null = ยังไม่พบการชำระ). */
  channel: CustomerPaymentChannel | null;
  /** วันที่ลูกค้าจ่าย (wallet: tb_wallet_hs.date · billing: invoice.paid_at). */
  paidAt: string | null;
  /** ยอด**ของแถวนี้** ที่รับมา — บวกข้ามแถวได้ไม่ซ้ำ. */
  amountThb: number | null;
  /** ยอดรวมทั้งการชำระ/ทั้งใบ — โชว์อย่างเดียว **ห้ามเอาไปบวก** (จะเบิ้ล). */
  groupTotalThb: number | null;

  /** แถวการชำระของ fid นี้ → /admin/wallet/[id] (null เมื่อเป็นช่องทางใบวางบิล). */
  walletHsId: number | null;
  /**
   * แถวที่ **ถือไฟล์สลิปจริง** → ปุ่ม 📎 ต้องชี้มาที่นี่ ไม่ใช่ walletHsId.
   * เหตุผล: ทรง cascade สลิปอยู่บน HEADER topup ส่วนหน้า child หาสลิปเจอก็ต่อเมื่อ
   * reverse-lookup เจอ topup ที่ **ยอดตรงกันเป๊ะ** (page.tsx:417-424 `.eq("amount", …)`) —
   * พอ topup 1 ใบคลุมหลายแถว ยอดย่อม ≠ กัน → เปิดหน้า child แล้ว "ไม่มีสลิป" (ทางตัน).
   */
  slipWalletHsId: number | null;
  /** ใบวางบิล → /admin/billing-run/[id]. */
  billingInvoiceId: number | null;
  billingDocNo: string | null;
  /** มีไฟล์สลิปให้กดดูจริง (ตรวจจากแถวที่ถือสลิป ไม่ใช่เดา). */
  hasSlip: boolean;

  /** ใบเสร็จ → /admin/accounting/forwarder-invoice/[receiptId]. */
  receiptId: number | null;
  receiptNo: string | null;

  /** ทุก fid ที่การชำระ/ใบเดียวกันนี้คลุม (รวมตัวเอง · เรียงแล้ว). */
  coveredFids: number[];
  /**
   * เลขแทรคกิ้งของ `coveredFids` — **ยาวเท่ากันและเรียงตรงตำแหน่งกันเสมอ**
   * (`coveredTrackings[i]` คือของ `coveredFids[i]`) · หาไม่เจอ = `""` ไม่ใช่ตัดทิ้ง.
   * ถ้าตัดทิ้ง ดัชนีจะเลื่อน → จอจะโชว์เลขแทรคกิ้งสลับตัวกัน (เคยพลาดตอนเขียนครั้งแรก).
   */
  coveredTrackings: string[];
};

/** ไม่พบการชำระ — ค่าเริ่มต้นที่ปลอดภัย (ใช้ตอน query พังด้วย → fail-soft ไม่ throw). */
export const NO_PAYMENT: CustomerPaymentInfo = {
  paid: false,
  channel: null,
  paidAt: null,
  amountThb: null,
  groupTotalThb: null,
  walletHsId: null,
  slipWalletHsId: null,
  billingInvoiceId: null,
  billingDocNo: null,
  hasSlip: false,
  receiptId: null,
  receiptNo: null,
  coveredFids: [],
  coveredTrackings: [],
};

/** แถว tb_wallet_hs (settled) เท่าที่ตรรกะการจัดกลุ่มต้องรู้. */
export type WalletChildLike = {
  id: number;
  userid: string | null;
  /** HEADER topup ที่จ่ายให้แถวนี้ (null = จ่ายตรง ไม่ผ่านกระเป๋า). */
  reforder2: number | null;
  imagesslip: string | null;
};

/**
 * คีย์จัดกลุ่ม "การชำระเดียวกัน" ของแถว wallet — mirror /admin/wallet/[id] เป๊ะ:
 *   `topup:<reforder2>`   cascade เติม-แล้วจ่าย (สลิปอยู่บน topup)
 *   `slip:<userid>|<file>` จ่ายตรงด้วยสลิปใบเดียวกัน (page.tsx:547-573)
 *   `row:<id>`             ไม่เข้าทั้งสองทรง → กลุ่มของตัวเอง
 * ⚠️ ทรง slip ต้องมี **ทั้ง** userid และชื่อไฟล์ ไม่งั้นถอยไปเป็นกลุ่มเดี่ยว — สลิปชื่อ
 * เดียวกันของคนละลูกค้าต้องไม่ถูกมัดรวม (จะกลายเป็น "จ่ายให้กัน" ที่ไม่มีอยู่จริง).
 */
export function walletGroupKeyOf(row: WalletChildLike): string {
  if (row.reforder2 != null && Number.isFinite(row.reforder2)) return `topup:${row.reforder2}`;
  const slip = (row.imagesslip ?? "").trim();
  const user = (row.userid ?? "").trim();
  if (slip && user) return `slip:${user}|${slip}`;
  return `row:${row.id}`;
}

/** แถวเท่าที่ตัวนับสรุปต้องรู้ (ทั้ง preview row + ผลการค้นหาการชำระ). */
export type PaymentSummaryRow = {
  /** จับคู่กับ tb_forwarder ได้ไหม (ไม่ได้ = ตอบเรื่องเก็บเงินไม่ได้เลย). */
  matched: boolean;
  /** ค่านำเข้าที่เราขาย (ftotalprice) — ใช้บอก "ยอดที่ยังไม่ได้เก็บ". */
  ourSell: number | null;
  payment: CustomerPaymentInfo | null;
};

export type CustomerPaymentSummary = {
  /** จำนวนแทรคกิ้งที่ MOMO เรียกเก็บมาบนใบนี้. */
  lines: number;
  /** จับคู่กับงานในระบบไม่ได้ → ตอบไม่ได้ว่าเก็บหรือยัง (คนละเรื่องกับ "ยังไม่เก็บ"). */
  unmatched: number;
  /** เก็บเงินลูกค้าแล้ว (รวมทั้ง 2 ช่องทาง). */
  paid: number;
  paidViaWallet: number;
  paidViaBillingRun: number;
  /** จับคู่ได้ แต่ยังไม่พบการชำระ. */
  unpaid: number;
  /** Σ ยอดที่รับมาจริงของแถวที่เก็บแล้ว (รายแถว → ไม่เบิ้ล). */
  paidAmountThb: number;
  /** Σ ค่านำเข้า (ขาย) ของแถวที่ยังไม่เก็บ — ยอดที่ยังต้องตามเก็บ. */
  unpaidSellThb: number;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;
const num = (n: number | null | undefined): number => (Number.isFinite(Number(n)) ? Number(n) : 0);

/**
 * สรุป "MOMO เก็บเรา N แทรค · เก็บลูกค้าแล้ว X · ยังไม่เก็บ Y · ไม่พบงานในระบบ Z"
 * ให้ owner ตอบได้โดยไม่ต้องไล่อ่านทีละแถว. order-independent · ลิสต์ว่าง = ศูนย์ทั้งหมด.
 */
export function buildCustomerPaymentSummary(
  rows: readonly PaymentSummaryRow[],
): CustomerPaymentSummary {
  let unmatched = 0;
  let paidViaWallet = 0;
  let paidViaBillingRun = 0;
  let unpaid = 0;
  let paidAmountThb = 0;
  let unpaidSellThb = 0;

  for (const r of rows) {
    if (!r.matched) {
      unmatched += 1;
      continue;
    }
    const p = r.payment;
    if (p?.paid) {
      if (p.channel === "billing_run") paidViaBillingRun += 1;
      else paidViaWallet += 1;
      paidAmountThb += num(p.amountThb);
    } else {
      unpaid += 1;
      unpaidSellThb += num(r.ourSell);
    }
  }

  return {
    lines: rows.length,
    unmatched,
    paid: paidViaWallet + paidViaBillingRun,
    paidViaWallet,
    paidViaBillingRun,
    unpaid,
    paidAmountThb: round2(paidAmountThb),
    unpaidSellThb: round2(unpaidSellThb),
  };
}
