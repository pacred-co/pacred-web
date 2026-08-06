/**
 * shop-cart-group.ts — "1 ตะกร้าจีน = 1 กลุ่ม" (owner 2026-08-06 · เคส P22467)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ปัญหาที่แก้ (owner verbatim):
 *   "เขาสั่งร้าน 1688 เดียวกัน แต่ร้านแยกออกมาเป็น 2 ตะกร้าสินค้าของระบบเขา
 *    จึงจะมี 2 แทรคกิ้งจีน แต่นายไปแยกร้านค้าออกเป็น 4 ร้านค้า กลายเป็น 4
 *    แทรคกิ้ง แบบนี้งานเบิ้ล สถานะหาย พังแน่"
 *
 * ราก: ระบบจัดกลุ่ม "ร้าน" ด้วย **ชื่อร้านที่คนคีย์ (`cnameshop`)** — ร้านเดียวกัน
 * บน 1688 เขียนได้ 2 แบบ (ชื่อร้านสั้น `kevap168` vs ชื่อบริษัทจดทะเบียน
 * `广州海帝博斯五金有限公司`) → 1 ตะกร้ากลายเป็น 2 "ร้าน" → บอร์ดโชว์ 4 การ์ด/
 * 4 ช่องแทรคกิ้ง · ตัวนับ slot เพี้ยน (ออเดอร์ไม่มีวันครบ) · เสี่ยงคีย์เลขเดียวกัน
 * 2 ครั้ง = spawn ฝากนำเข้าเบิ้ล.
 *
 * คีย์ที่ถูก = **`cshippingnumber` (เลขออเดอร์/ตะกร้าจีน)** — ร้านตั้งชื่อยังไงก็ได้
 * แต่เลขตะกร้าคือตัวตนของ "ครั้งที่สั่ง" และเป็นตัวที่ผูก 1:1 กับแทรคกิ้ง.
 *
 * พิสูจน์กับ prod ก่อนเขียน (2026-08-06 · 900 แถวที่มีเลขตะกร้า):
 *   • 1 ตะกร้า → หลาย tracking = **0 กลุ่ม**  (⇒ 1 ตะกร้า = 1 แทรคกิ้ง เสมอ)
 *   • 1 ชื่อร้าน → หลายตะกร้า   = **0 กลุ่ม**  (⇒ ยุบตามตะกร้าไม่กลืนงานคนละครั้ง)
 *   • 1 ตะกร้า → หลายชื่อร้าน  = **2 กลุ่ม**  (= เคส P22467 ที่ owner เจอ)
 *
 * กติกา (fail-safe):
 *   • มีเลขตะกร้า → คีย์ = `cart:<เลข>`  (ยุบชื่อร้านที่ต่างกันเข้ากลุ่มเดียว)
 *   • ยังไม่มีเลขตะกร้า → คีย์ = `shop:<ชื่อร้าน>` (พฤติกรรมเดิมเป๊ะ — ยังไม่รู้ตะกร้า
 *     ก็ยังต้องแยกตามร้านเหมือนเดิม ไม่งั้นของทุกร้านจะกองเป็นก้อนเดียว)
 *   • ไม่มีทั้งคู่ → ข้าม (แถวขยะ)
 *
 * PURE — ไม่มี IO · import ได้ทั้ง client/server/test.
 */

/** แถว tb_order เท่าที่ตัวจัดกลุ่มต้องรู้. */
export type ShopCartRow = {
  cnameshop?: string | null;
  cshippingnumber?: string | null;
};

/**
 * คีย์กลุ่มของแถวหนึ่ง — เลขตะกร้าจีนมาก่อนเสมอ, ไม่มีค่อยใช้ชื่อร้าน.
 * คืน "" เมื่อแถวไม่มีทั้งเลขตะกร้าและชื่อร้าน (แถวขยะ · caller ข้ามได้).
 */
export function shopCartKey(row: ShopCartRow): string {
  const cart = (row.cshippingnumber ?? "").trim();
  if (cart !== "") return `cart:${cart}`;
  const shop = (row.cnameshop ?? "").trim();
  if (shop !== "") return `shop:${shop}`;
  return "";
}

/** ป้ายชื่อกลุ่มสำหรับโชว์ — ร้านเดียวกันที่เขียนหลายแบบ โชว์ต่อกันด้วย " / ". */
export function shopCartLabel(shopNames: readonly string[]): string {
  const uniq = [...new Set(shopNames.map((s) => (s ?? "").trim()).filter(Boolean))];
  return uniq.join(" / ");
}

export type ShopCartGroup<T> = {
  /** คีย์กลุ่ม (`cart:<เลข>` | `shop:<ชื่อ>`) */
  key: string;
  /** เลขออเดอร์/ตะกร้าจีน ("" = ยังไม่คีย์) */
  cshippingnumber: string;
  /** ชื่อร้านทุกแบบที่เจอในกลุ่มนี้ (P22467 = 2 ชื่อ/กลุ่ม) */
  shopNames: string[];
  /** ชื่อร้าน "ตัวแทน" — ตัวแรกที่เจอ (ใช้เป็น cnameshop ตอนเขียนแบบ legacy) */
  primaryShopName: string;
  rows: T[];
};

/**
 * ยุบแถว tb_order เป็นกลุ่มต่อ "ตะกร้าจีน" (เรียงตามลำดับที่เจอ = เสถียร).
 * ⚠️ ยุบ **การจัดกลุ่ม/การนับ** เท่านั้น — ไม่แตะข้อมูลในแถว ไม่แตะเงิน.
 */
export function groupShopRowsByCart<T extends ShopCartRow>(rows: readonly T[]): ShopCartGroup<T>[] {
  const map = new Map<string, ShopCartGroup<T>>();
  for (const row of rows) {
    const key = shopCartKey(row);
    if (key === "") continue;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        cshippingnumber: (row.cshippingnumber ?? "").trim(),
        shopNames: [],
        primaryShopName: (row.cnameshop ?? "").trim(),
        rows: [],
      };
      map.set(key, g);
    }
    const shop = (row.cnameshop ?? "").trim();
    if (shop !== "" && !g.shopNames.includes(shop)) g.shopNames.push(shop);
    if (g.primaryShopName === "" && shop !== "") g.primaryShopName = shop;
    g.rows.push(row);
  }
  return [...map.values()];
}

/**
 * จำนวน "ตะกร้า" ที่ต้องมีแทรคกิ้ง (slot) — ตัวหารของกติกา "คีย์แทรคครบทุกตะกร้า
 * ถึงปิดออเดอร์ได้". เดิมนับต่อ**แถว** ⇒ P22467 นับได้ 4 ทั้งที่จริง 2 → ออเดอร์
 * ไม่มีวันครบ. นับตามกลุ่มตะกร้าแทน (เฉพาะกลุ่มที่มีเลขตะกร้าแล้ว).
 */
export function countCartSlots(rows: readonly ShopCartRow[]): number {
  return groupShopRowsByCart(rows).filter((g) => g.cshippingnumber !== "").length;
}
