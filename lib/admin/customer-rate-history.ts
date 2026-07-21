/**
 * ประวัติเรทขายต่อลูกค้า — ตัวแปลง "การบันทึกเรท 1 ครั้ง" → "แถวประวัติ" (pure)
 * + ตัวประกอบ timeline ตอนอ่าน (owner 2026-07-21).
 *
 * แยกออกมาเป็นโมดูล pure เพราะตรรกะ "ช่วงวันที่" คือหัวใจของสิ่งที่ owner กลัว
 * (*"กลัวออกใบเสนอราคาแล้วเรทเก่าเปลี่ยน"*) — ต้องล็อกด้วยเทสได้ ไม่ใช่ฝังใน action
 * ที่ต้องมี DB ถึงจะรันได้.
 *
 * 🔑 ตารางนี้ไม่มีใครอ่านไปคิดเงิน — เครื่องคิดเงินยังอ่าน `tb_rate_custom_*` ตัวเดิม.
 */

/** 1 ช่องเรทที่ถูกตั้ง (ตรงกับ cell ที่ adminSaveCustomerRate รับ). */
export type RateCell = { t: string; p: string; rkg: number; rcbm: number };

export type RateHistoryRow = {
  userid: string;
  package_id: string;
  package_label: string;
  quotation_ref: string;
  sourcewarehouse: string;
  rtransporttype: string;
  rproductstype: string;
  rcbm: number;
  rkg: number;
  effective_from: string;
  set_by: string;
};

/**
 * แปลงการบันทึก 1 ครั้ง → แถวประวัติ (1 แถวต่อ 1 ช่อง).
 *
 * ไม่กรอง/ไม่ยุบอะไรทั้งนั้น — บันทึกทุกช่องที่ตั้ง แม้ค่าจะเท่าเดิม เพราะประวัติต้องตอบ
 * ได้ว่า "วันนั้นยืนยันเรทนี้ไว้กับใบไหน" ไม่ใช่แค่ "วันที่ตัวเลขเปลี่ยน" — ใบเสนอราคา
 * ที่ยืนยันเรทเดิมก็เป็นข้อตกลงที่ต้องอ้างอิงได้เหมือนกัน.
 */
export function buildRateHistoryRows(input: {
  userid: string;
  sourceWarehouse: string;
  cells: RateCell[];
  packageId?: string;
  packageLabel?: string;
  quotationRef?: string;
  setBy?: string;
  /** เวลาที่มีผล — ส่งเข้ามาเพื่อให้ทุกแถวของการบันทึกครั้งเดียวกันมีเวลา *เดียวกันเป๊ะ*
   *  (ถ้าปล่อยให้ DB default now() ทีละแถว จะได้ไมโครวินาทีต่างกัน แล้ว timeline
   *  ของแต่ละช่องจะเหลื่อมกันเองโดยไม่มีเหตุผล) */
  effectiveFrom: string;
}): RateHistoryRow[] {
  return input.cells.map((c) => ({
    userid: input.userid,
    package_id: input.packageId ?? "",
    package_label: input.packageLabel ?? "",
    quotation_ref: input.quotationRef ?? "",
    sourcewarehouse: input.sourceWarehouse,
    rtransporttype: c.t,
    rproductstype: c.p,
    rcbm: c.rcbm,
    rkg: c.rkg,
    effective_from: input.effectiveFrom,
    set_by: input.setBy ?? "",
  }));
}

/** ประวัติ 1 ครั้งที่บันทึก (ยุบหลายช่องของการกดครั้งเดียวกันเป็นรายการเดียว). */
export type RateHistoryEntry = {
  effectiveFrom: string;
  packageId: string;
  packageLabel: string;
  quotationRef: string;
  setBy: string;
  cells: { sourcewarehouse: string; rtransporttype: string; rproductstype: string; rcbm: number; rkg: number }[];
};

/**
 * รวมแถวประวัติดิบ → รายการ "การบันทึก 1 ครั้ง" เรียงใหม่ก่อน.
 *
 * จัดกลุ่มด้วย (effective_from + ใบเสนอราคา + แพ็กเกจ) — เวลาเดียวกันเป๊ะจากการกด
 * ครั้งเดียวกัน (ดู `effectiveFrom` ข้างบน) จึงยุบกลับได้แม่นยำ ไม่ต้องเดาด้วยช่วงเวลา.
 */
export function groupRateHistory(rows: RateHistoryRow[]): RateHistoryEntry[] {
  const byKey = new Map<string, RateHistoryEntry>();
  for (const r of rows) {
    const key = `${r.effective_from}|${r.quotation_ref}|${r.package_id}`;
    const hit = byKey.get(key);
    const cell = {
      sourcewarehouse: r.sourcewarehouse, rtransporttype: r.rtransporttype,
      rproductstype: r.rproductstype, rcbm: r.rcbm, rkg: r.rkg,
    };
    if (hit) hit.cells.push(cell);
    else byKey.set(key, {
      effectiveFrom: r.effective_from, packageId: r.package_id, packageLabel: r.package_label,
      quotationRef: r.quotation_ref, setBy: r.set_by, cells: [cell],
    });
  }
  return [...byKey.values()].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}

/**
 * เรทของช่องหนึ่ง **ณ วันที่ที่ระบุ** — ตัวตอบคำถาม "งานที่เกิดวันนั้น ตกลงเรทเท่าไร".
 *
 * half-open range: แถวที่ effective_from <= at และใหม่ที่สุด คือแถวที่มีผล ณ เวลานั้น
 * (แถวถัดไปคือจุดสิ้นสุดโดยปริยาย — ไม่เก็บ effective_to เพื่อไม่ให้ 2 คอลัมน์ขัดกันเอง).
 * ไม่มีแถวที่เก่ากว่านั้น = ยังไม่เคยตั้งเรท → null (ผู้เรียก fallback เรททั่วไปเอง).
 */
export function rateAsOf(
  rows: RateHistoryRow[],
  at: string,
  cell: { sourcewarehouse: string; rtransporttype: string; rproductstype: string },
): RateHistoryRow | null {
  let best: RateHistoryRow | null = null;
  for (const r of rows) {
    if (r.sourcewarehouse !== cell.sourcewarehouse) continue;
    if (r.rtransporttype !== cell.rtransporttype) continue;
    if (r.rproductstype !== cell.rproductstype) continue;
    if (r.effective_from > at) continue; // ยังไม่มีผล ณ เวลานั้น
    if (!best || r.effective_from > best.effective_from) best = r;
  }
  return best;
}
