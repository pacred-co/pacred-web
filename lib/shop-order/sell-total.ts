/**
 * ยอดขายฝากสั่งซื้อ (htotalpriceuser) — สูตรที่เดียวของทั้งระบบ.
 *
 * owner 2026-07-27 (P22456 · PR075): *"เจ้าหน้าที่ทำราคามา 151k แล้วทำไมลูกค้าเห็นแค่ 150k
 * ลูกค้าจะจ่ายตังแล้ว"* — ส่วนต่าง ฿618 = **ค่าลังไม้ ¥120 × เรท 5.15 เป๊ะ**.
 *
 * ── ราก: จอกับตัวเก็บเงินใช้คนละสูตร ─────────────────────────────────────
 * จอแอดมิน (legacy-view · ภูม 2026-07-01) คิด "ราคารวมสุทธิ" แบบ**รวมค่าลังไม้**:
 *   (สินค้า ¥ + ขนส่งจีน ¥ + ลังไม้ ¥) × เรท + ค่าบริการ  → 151,219.45 (ที่ Pricing ส่งลูกค้า)
 * แต่ writer ของ `htotalpriceuser` ทุกตัว (ตั้งเรท · ลบรายการ · refund) ใช้สูตรเก่า
 * **ไม่มีลังไม้**: (สินค้า + ขนส่งจีน) × เรท + ค่าบริการ → 150,601.45 (ที่ modal ลูกค้าเก็บจริง)
 * และตัวเซฟค่าลัง (adminUpdateOrderCrate) ประกาศไว้เลยว่า "ไม่แตะยอดขาย" = ความเชื่อเก่า
 * ที่ขัดกับจอ → **เก็บเงินขาดทุกออเดอร์ที่ตีลังไม้**.
 *
 * ── กติกา ───────────────────────────────────────────────────────────────
 * ค่าลังไม้เข้ายอดขายก็ต่อเมื่อ `crate === '1'` (ลูกค้าเลือกตีลัง) — ตรงกับจอ.
 * ทุก writer ของ htotalpriceuser ต้องเรียก `shopSellTotalThb` ห้ามก๊อปสูตรเอง
 * (cbm-sot-guard สอนไว้แล้วว่า สูตรกระจาย = เพี้ยนเงียบ).
 */

import { roundUp } from "@/lib/admin/shop-disbursement-calc";

/** ¥ ค่าลังไม้ที่เข้ายอด — 0 เมื่อไม่ได้เลือกตีลัง. */
export function crateCnyOf(h: {
  crate?: string | null;
  pricecrate?: number | string | null;
}): number {
  if (String(h.crate ?? "").trim() !== "1") return 0;
  const n = Number(h.pricecrate ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * ยอดขายรวมสุทธิ (฿) = roundUp((สินค้า¥ + ขนส่งจีน¥ + ลังไม้¥) × เรทขาย + ค่าบริการ฿, 2)
 * — สูตรเดียวกับ "ราคารวมสุทธิ" บนจอแอดมิน/ใบเสนอราคา ที่ลูกค้าเห็นก่อนจ่ายเสมอ.
 */
export function shopSellTotalThb(h: {
  htotalpricechn: number | string | null;
  hshippingchn: number | string | null;
  hrate: number | string | null;
  hshippingservice?: number | string | null;
  crate?: string | null;
  pricecrate?: number | string | null;
}): number {
  const chn = Number(h.htotalpricechn ?? 0);
  const ship = Number(h.hshippingchn ?? 0);
  const rate = Number(h.hrate ?? 0);
  const svc = Number(h.hshippingservice ?? 0);
  // roundUp ตัวเดียวกับ writer เดิมทุกตัว (float-safe · ห้ามเขียนสูตรปัดเอง)
  return roundUp((chn + ship + crateCnyOf(h)) * rate + svc, 2);
}
