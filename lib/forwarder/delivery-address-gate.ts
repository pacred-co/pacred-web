/**
 * delivery-address-gate.ts — ด่าน "ต้องมีที่อยู่จัดส่งก่อนส่งไปรอชำระเงิน"
 * (owner 2026-07-23 · MONEY).
 *
 * owner (verbatim): *"ด่านวางผิดที่นะครับ ด่านใส่ที่อยู่ต้องกันไว้ตรงก่อนส่งไป
 * รอชำระต่างหากครับ เพราะกระทบเรื่องเงิน กับ เก็บตังออกเอกสารครับ"*
 *
 * WHY 4→5 คือจุดที่ถูก (ไม่ใช่ตอนมอบงานคนขับ):
 *   ที่อยู่เป็นตัวกำหนด **ค่าส่งไทย (ftransportprice) ที่ขึ้นบิล** + **ที่อยู่ผู้รับที่
 *   พิมพ์ลงเอกสารเงิน** (ใบแจ้งหนี้ · ใบวางบิล · ใบเสร็จ · ใบส่งของ). แถวที่ไปถึง
 *   "รอชำระเงิน(5)" โดยยังไม่มีที่อยู่ = เก็บเงินผิด + ออกเอกสารปลายทางผิด/ว่าง.
 *   ตอนมอบงานคนขับมันสายไปแล้ว — บิลออกไปแล้ว.
 *
 * WHY ต้องมีด่านนี้ตอนนี้: การกด "นำเข้าระบบ" (MOMO commit) ยอมให้งานที่ยังไม่รู้
 * ที่อยู่เข้ามาได้แล้ว (owner "ให้งานที่ถูกต้อง มันเข้าไปก่อนเถอะ" ·
 * `commit-momo-row-core` EMPTY_ADDRESS) → หลวมตอนเข้า จึงต้อง **เข้มตรงด่านเงิน**.
 *
 * ─── กติกา (calibrate กับ prod จริง 2026-07-23 · ไม่ได้เดา) ──────────────────
 *
 *  • **PCS รับเองที่โกดัง → ยกเว้น** — ไม่มีขาจัดส่ง ก็ไม่ต้องมีที่อยู่ปลายทาง.
 *
 *  • **ขาด = ไม่มีทั้ง จังหวัด และ บ้านเลขที่** (ทั้งคู่ว่าง = ส่งไม่ได้จริง).
 *
 *  • ⚠️ **ห้ามบังคับ zip** — prod มี **15 แถว fstatus=6 ที่มีจังหวัดแต่ไม่มี zip**
 *    (+1 ที่ '5' · +1 ที่ '3') และหลายแถวในนั้น **มอบคนขับ/ส่งสำเร็จไปแล้ว**.
 *    ถ้าบังคับ zip = ไปทำงานที่ใช้ได้อยู่แล้วพัง. คนขับ/ขนส่งต้องการ "ที่ไปได้"
 *    ไม่ใช่ zip.
 *
 *  • **COD (paymethod='2') ไม่ยกเว้น** — ต่างจากด่าน "ค่าส่งไทยห้ามลืม"
 *    (`isThShippingCostMissing`) ที่ยกเว้น COD เพราะเอกชนเก็บเงินปลายทาง.
 *    ตรงนี้ตรงข้าม: COD ยิ่ง**ต้องมี**ปลายทาง — ไม่มีที่อยู่ = ไม่รู้จะไปเก็บที่ไหน
 *    และเอกสารก็ไม่มีผู้รับ.
 *
 *  • **เหมาๆ (PCSF/PRF) + Express (PCSE/PRE) ไม่ยกเว้น** — สองตัวนี้ได้รับยกเว้น
 *    จากด่าน *ค่าส่งไทย* (฿0 ถูกต้อง) แต่มันคือ **การจัดส่งจริง** → ต้องมีที่อยู่.
 *    (เหตุผลที่ไม่ reuse `isThShippingCostRequired` ตรงๆ: มันตอบคำถามคนละข้อ —
 *    "ต้องคิดค่าส่งไหม" ไม่ใช่ "มีขาจัดส่งไหม".)
 *
 * ─── prod calibration (2026-07-23 · read-only probe) ────────────────────────
 *   แถวที่จะโดนบล็อก (ไม่ใช่ PCS · ไม่มีทั้งจังหวัดและบ้านเลขที่) ต่อ fstatus:
 *     '2' 6 · '3' 85 · **'4' 2** · '5' 2 · '6' 3 · '7' 2
 *   → ที่ด่านนี้ (4→5) กระทบแค่ **2 แถว** (ชิปเม้นเดียวกัน 1783582289-1/2 + -2/2 ·
 *     PR7083 · ลูกค้ามีที่อยู่ในระบบ 1 รายการ → แก้ = เลือกที่อยู่ 1 คลิก).
 *   → 85 แถวที่ '3' (ยังอยู่ระหว่างทาง · 45 แถวลูกค้ามีที่อยู่ในระบบแล้ว) คือคิวงาน
 *     CS ที่จะโผล่ตอนของถึง — ไม่ใช่เหตุผลให้ผ่อนกติกา.
 *   → กติกา 3 แบบ (province+houseno / +zip union / province-OR-zip แบบด่านคิว
 *     ตรวจสอบเดิม) ให้ผลลัพธ์ **เท่ากันเป๊ะบน prod วันนี้** (zip-only = 0 แถว ·
 *     houseno-only = 0 แถว) → เลือกแบบที่ตรงเจตนาที่สุด ไม่มีความเสี่ยงต่างกัน.
 *
 * Pure + testable (ไม่แตะ DB · ไม่แตะสูตรเงิน). ผู้เรียกส่งค่าที่อ่านมาแล้วเข้ามา.
 */

import { SELF_PICKUP_CARRIER } from "./domestic-shipping";

/** ฟิลด์ที่ด่านนี้อ่าน (ผู้เรียก SELECT มาให้). */
export type AddressGateRow = {
  /** ใช้ทำป้ายชื่อแถวเวลาแจ้ง error (fallback สุดท้าย). */
  id?: number | string | null;
  /** เลขที่ออเดอร์ legacy — ป้ายชื่อสำรอง (แนวเดียวกับ report-cnt-add-check-gate). */
  fidorco?: string | null;
  /** เลขแทรคกิ้งจีน — ป้ายชื่อหลัก (พนักงานค้นด้วยตัวนี้). */
  ftrackingchn?: string | null;
  /** ขนส่ง — 'PCS' = รับเองที่โกดัง → ยกเว้น. */
  fshipby?: string | null;
  faddressprovince?: string | null;
  /**
   * ⚠️ **ไม่ได้ใช้ตัดสิน** — เก็บไว้ใน type เพื่อบอกให้ชัดว่า *จงใจ* ไม่บังคับ zip
   * (prod มีแถวที่มีจังหวัดแต่ไม่มี zip แล้วส่งสำเร็จจริง · ดูหัวไฟล์).
   */
  faddresszipcode?: string | null;
  faddressno?: string | null;
  /**
   * ⚠️ **ไม่ได้ใช้ตัดสิน** — ชื่อผู้รับไม่ใช่ "ปลายทาง" และ prod มี placeholder
   * อย่าง "รับที่โกดัง Pacred" ปนอยู่ → เชื่อไม่ได้.
   */
  faddressname?: string | null;
};

/** ว่างจริง = null/undefined/มีแต่ช่องว่าง. */
function isBlank(v: string | number | null | undefined): boolean {
  return String(v ?? "").trim() === "";
}

/** รับเองที่โกดัง (fshipby='PCS') → ไม่มีขาจัดส่ง → ไม่ต้องมีที่อยู่ปลายทาง. */
export function isSelfPickupRow(row: AddressGateRow): boolean {
  return String(row.fshipby ?? "").trim().toUpperCase() === SELF_PICKUP_CARRIER;
}

/**
 * แถวนี้ "ยังไม่มีที่อยู่จัดส่ง" หรือยัง?
 * true = ไม่มีทั้งจังหวัดและบ้านเลขที่ (และไม่ใช่รับเองที่โกดัง) = ส่งไม่ได้จริง
 *        → ห้ามให้ไปถึง "รอชำระเงิน" เพราะบิล+เอกสารจะผิด.
 */
export function isDeliveryAddressMissing(row: AddressGateRow): boolean {
  if (isSelfPickupRow(row)) return false;
  return isBlank(row.faddressprovince) && isBlank(row.faddressno);
}

/** ป้ายชื่อแถวสำหรับข้อความ error — แทรคกิ้งก่อน (พนักงานค้นด้วยตัวนี้). */
export function deliveryAddressRowLabel(row: AddressGateRow): string {
  const tracking = String(row.ftrackingchn ?? "").trim();
  if (tracking) return tracking;
  const fidorco = String(row.fidorco ?? "").trim();
  if (fidorco) return fidorco;
  const id = String(row.id ?? "").trim();
  return id ? `#${id}` : "-";
}

/**
 * เหตุผล + ทางแก้ — แยกเป็น const เพื่อให้ทุกทางเข้าใช้ "คำเดียวกัน"
 * (บาง path ตอบเป็น BillFailure {reason, nextAction} · บาง path ตอบเป็นข้อความเดียว).
 * §0f + [[wrong-error-message-hides-real-block]]: ต้องบอกว่าอะไรบล็อก + แก้ที่ไหน
 * ห้ามเป็น "ผิดพลาด N" ลอยๆ.
 */
export const DELIVERY_ADDRESS_BLOCK_REASON =
  "ยังไม่มีที่อยู่จัดส่ง (ไม่มีทั้งจังหวัดและบ้านเลขที่) — " +
  "ที่อยู่เป็นตัวกำหนดค่าส่งไทยที่ขึ้นบิล และที่อยู่ผู้รับบนเอกสาร ถ้าปล่อยไปรอชำระตอนนี้ เก็บเงินและออกเอกสารจะผิด";

export const DELIVERY_ADDRESS_BLOCK_NEXT_ACTION =
  "ใส่ที่อยู่จัดส่ง (หรือเลือก “รับเองที่โกดัง”) ที่หน้ารายการนำเข้า /admin/forwarders/[เลขที่ออเดอร์] แล้วทำรายการอีกครั้ง";

export type DeliveryAddressGateResult = {
  /** true = ผ่านทุกแถว (ไม่มีแถวไหนขาดที่อยู่). */
  ok: boolean;
  /** แถวที่ขาดที่อยู่ (ผู้เรียกเอาไปทำ per-row failure ต่อได้). */
  blocked: AddressGateRow[];
  /** ข้อความไทยพร้อมใช้ — ว่างเมื่อ ok. */
  message: string;
};

/**
 * ตรวจทั้งชุด — ใช้กับทั้ง path เดี่ยวและ bulk.
 * ลิสต์รายการที่ติดสูงสุด 5 ตัว (ที่เหลือสรุปเป็นจำนวน) เพื่อให้พนักงานไปแก้ถูกตัว.
 */
export function evaluateDeliveryAddressGate(
  rows: readonly AddressGateRow[],
): DeliveryAddressGateResult {
  const blocked = (rows ?? []).filter(isDeliveryAddressMissing);
  if (blocked.length === 0) return { ok: true, blocked: [], message: "" };

  const sample = blocked.slice(0, 5).map(deliveryAddressRowLabel).join(", ");
  const more = blocked.length > 5 ? ` และอีก ${blocked.length - 5} รายการ` : "";
  return {
    ok: false,
    blocked,
    message:
      `${blocked.length} รายการ${DELIVERY_ADDRESS_BLOCK_REASON} — ` +
      `${sample}${more} · ${DELIVERY_ADDRESS_BLOCK_NEXT_ACTION}`,
  };
}
