import type { ProductId, TransportId, WarehouseId } from "@/lib/admin/customer-rate-tables";

/**
 * ทุนจริงต่อคิว — ส่วน PURE ของพื้นกัน "ขายต่ำกว่าทุน"
 * (ฝั่ง IO ที่อ่าน tb_settings อยู่ใน `sell-cost-floor.ts` · แยกเพราะไฟล์นั้น
 *  `import "server-only"` แล้วเทสรันตรงไม่ได้ — คอนเวนชันเดียวกับ `*-plan.ts`)
 *
 * 🔴 owner 2026-07-30: *"ขาดทุนที่เก็บตังแล้ว ต้องยอมแหละครับ ... และ ต่อไปจากนี้
 * ห้ามมีงานขาดทุนอีกแล้วนะครับ"*
 *
 * ── ทำไมพื้นราคา (sell-floor) อย่างเดียวไม่พอ ─────────────────────────────
 * `getResolvedFloor()` (sell-floor-config.ts) = **ราคาขายขั้นต่ำเชิงนโยบาย** ตั้งไว้
 * สูงกว่าทุนอยู่แล้ว (กวางโจว รถ 4,900 vs ทุน 4,700) และด่านใน `adminSaveCustomerRate`
 * บล็อกเฉพาะ **เซลที่เพิ่งตั้งใหม่** — เซลเก่าที่ต่ำกว่าพื้นถูก **ยกเว้น (grandfather)**
 * ตั้งแต่ 2026-06-19 เพื่อไม่ให้การเซฟเรื่องอื่นของลูกค้าเก่าพัง (กันงานหาย · ถูกต้องแล้ว
 * สำหรับเซลที่ "ต่ำกว่าพื้นแต่ยังเหนือทุน").
 *
 * แต่การยกเว้นนั้นครอบไปถึงเซลที่ **ต่ำกว่าทุนจริง** ด้วย ⇒ ระเบิดเวลา: ตราบใดที่ยังอยู่
 * ในตาราง ออเดอร์ถัดไปของลูกค้ารายนั้น **ขาดทุนแน่นอนตั้งแต่วินาทีที่คิดราคา**
 * (prod 2026-07-30: 12 เซล / 5 ลูกค้า — โชคดีที่ทั้ง 5 ยังไม่เคยมีงานสักใบ).
 *
 * ── กฎที่โมดูลนี้ทำให้เกิดขึ้น ─────────────────────────────────────────────
 *   ต่ำกว่าพื้น แต่ ≥ ทุนจริง  → ยกเว้นเหมือนเดิม (ยังไม่ขาดทุน · ไม่พังงานเก่า)
 *   **ต่ำกว่าทุนจริง**          → บล็อกเสมอ แม้ไม่ได้แก้เซลนั้น
 * ⇒ เซลต่ำกว่าทุนที่ค้างอยู่ออกจากระบบไม่ได้เงียบๆ และ **สร้างใหม่ไม่ได้เลย**
 * = ปิดที่ต้นทาง (ตอนตั้งเรท/ออกใบเสนอราคา) ตามที่ owner เคาะ ไม่ใช่ด่านเตือนปลายทาง
 * หลังเก็บเงินไปแล้ว.
 *
 * ⚠️ เทียบเฉพาะฐาน **คิว (CBM)** — ฐานกิโลเทียบกับทุนต่อคิวตรงๆ ไม่ได้ (ต้องรู้ความ
 * หนาแน่นของพัสดุก่อน) ตัวคุมฝั่งกิโลคือ `CHARGE_HIGHER_BASIS` (resolve-rate.ts ·
 * owner 2026-07-21 "เก็บค่าที่แพงกว่า") ซึ่งพิสูจน์แล้วว่าปิดคลาสนี้ได้จริง —
 * prod หลัง 21/07 ตั้งราคา 287 แถว **ขาดทุน 0 แถว**.
 */

/** ทุนจริงต่อคิว แยกตามคลัง → ขนส่ง (฿/คิว). */
export type CbmCostFloor = Record<WarehouseId, Record<TransportId, number>>;

/**
 * ค่าสำรองเมื่ออ่าน tb_settings ไม่ได้ — ตรงกับที่ prod ใช้อยู่ (mig 0194/0260 ·
 * ทุนที่ MOMO เก็บเราจริง).
 */
export const CBM_COST_FALLBACK: CbmCostFloor = {
  "1": { "1": 4700, "2": 2500 }, // กวางโจว · รถ / เรือ
  "2": { "1": 5300, "2": 2600 }, // อี้อู   · รถ / เรือ
};

/**
 * ชื่อคอลัมน์ทุนใน `tb_settings` — mirror ของ `lib/forwarder/resolve-cost.ts`
 * (คอลัมน์ชุดเดียวกับที่คิดต้นทุนจริง ⇒ drift ไม่ได้: บัญชีขยับทุนที่ /admin/settings
 * พื้นกันขาดทุนขยับตามทันที).
 */
export function costColumn(wh: WarehouseId, transport: TransportId, product: ProductId): string {
  const prefix = transport === "1" ? "fcostcar" : "fcostship";
  const citySuffix = wh === "2" ? "2" : "";
  return `${prefix}${product}defaultmomo${citySuffix}`;
}

/** ทุกคอลัมน์ทุนที่ต้องอ่าน (4 ประเภท × 2 ขนส่ง × 2 คลัง · ไม่ซ้ำ). */
export function allCostColumns(): string[] {
  const cols: string[] = [];
  for (const wh of ["1", "2"] as WarehouseId[]) {
    for (const t of ["1", "2"] as TransportId[]) {
      for (const p of ["1", "2", "3", "4"] as ProductId[]) cols.push(costColumn(wh, t, p));
    }
  }
  return [...new Set(cols)];
}

const finite = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * แปลงแถว `tb_settings` ดิบ → ทุนต่อคิวรายคลัง×ขนส่ง.
 *
 * ใช้ **ค่าต่ำสุด** ของ 4 ประเภทสินค้าเป็นพื้น (prod ตั้งเท่ากันหมดอยู่แล้ว · ถ้าวันหลัง
 * ตั้งต่างกัน การใช้ค่าต่ำสุดจะไม่บล็อกเกินจำเป็น — ต่ำกว่าค่าต่ำสุด = ขาดทุนแน่ทุกประเภท).
 * ช่องที่อ่านไม่ได้ → คงค่าสำรอง (ยังบล็อกได้ ไม่ปล่อยผ่านทั้งหมด).
 */
export function parseCbmCostFloor(row: Record<string, unknown> | null | undefined): CbmCostFloor {
  const out: CbmCostFloor = {
    "1": { ...CBM_COST_FALLBACK["1"] },
    "2": { ...CBM_COST_FALLBACK["2"] },
  };
  if (!row) return out;
  for (const wh of ["1", "2"] as WarehouseId[]) {
    for (const t of ["1", "2"] as TransportId[]) {
      const vals = (["1", "2", "3", "4"] as ProductId[])
        .map((p) => finite(row[costColumn(wh, t, p)]))
        .filter((v): v is number => v != null);
      if (vals.length > 0) out[wh][t] = Math.min(...vals);
    }
  }
  return out;
}

/**
 * เรทขายต่อคิวนี้ ต่ำกว่าทุนจริงไหม.
 *
 * • เท่าทุนพอดี = **ไม่บล็อก** (กำไร 0 ยังไม่ขาดทุน · เป็นดุลพินิจ owner)
 * • เรท 0/ว่าง = **ไม่บล็อก** (ลูกค้าที่คิดตามกิโลอย่างเดียวปล่อยช่องคิวว่างไว้ —
 *   บล็อกจะทำให้เซฟไม่ได้ทั้งใบ = งานหาย)
 * • ไม่รู้ทุน = **ไม่บล็อก** (ห้ามเดา · พื้นราคาปกติยังทำงานอยู่)
 */
export function isCbmRateBelowCost(rateCbm: number, costCbm: number): boolean {
  if (!Number.isFinite(rateCbm) || rateCbm <= 0) return false;
  if (!Number.isFinite(costCbm) || costCbm <= 0) return false;
  return rateCbm < costCbm;
}
