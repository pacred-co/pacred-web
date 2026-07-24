/**
 * container-cost-engine.ts — THE ONE cost rule for a ตู้ (owner 2026-07-23
 * "ตู้นี้ทำไมไปโชว์ −เป็นแสนบาทเลยครับ แต่พอกดข้างใน +สามหมื่นห้า ทันยังไงกันแน่ครับ").
 *
 * ══ ทำไมต้องมีไฟล์นี้ ══
 * รายการตู้ (LIST) กับ หน้าในตู้ (DETAIL) เคยคิดต้นทุนคนละเครื่อง:
 *   - LIST   Σ `fcosttotalprice` ที่ "เก็บไว้ใน DB"
 *   - DETAIL คิดสด `เรทต้นทุน × คิว` ทุกครั้งที่เปิดหน้า
 * ⇒ วินาทีที่ค่าที่เก็บไว้ผิด สองจอพูดคนละเรื่องทันที. เคสจริง GZE260720-1:
 *   LIST ต้นทุน 391,437.34 → กำไร −330,786.05
 *   DETAIL ต้นทุน  25,067.78 → กำไร  +35,583.51   (ยอดขาย 60,651.29 เท่ากันทั้งคู่)
 * ต้นเหตุ = 4 แถวเก็บ `fcosttotalprice` เป็น **น้ำหนัก × เรท** (78.50 กก. × 4,700 =
 * 368,950) แทนที่จะเป็น **คิว × เรท** (2,480.56). owner: "ทุกข้อมูลทุกคนเชื่อ และ
 * เอาไปทำงานจริงนะครับ" → เลขที่ไม่ตรงกันเองระหว่างจอ = ใช้ทำงานไม่ได้.
 *
 * ทุก surface ที่โชว์ต้นทุน/กำไรของตู้ ต้องเรียกไฟล์นี้ตัวเดียว — ห้ามคัดลอกกฎไปเขียนซ้ำ
 * (คัดลอกเมื่อไหร่ = drift เมื่อนั้น).
 *
 * ══ กฎ (ยึดตาม DETAIL ซึ่งเป็นตัวที่ถูก) ══
 *   เรท      = tb_cost_container ของตู้นั้น (บัญชีตั้ง) ▸ fallback tb_settings   [resolve-cost.ts]
 *   ฐาน      = ตาม CARRIER เท่านั้น — Sang(1)/MX(4) = น้ำหนัก · ที่เหลือ (MOMO 8 /
 *              TTW 9 / ฯลฯ) = คิว                                              [costBasisMode]
 *   คิวต่อแถว = totalCbmOf (กฎ famountcount: '1' = ยอดรวมแล้ว · else × จำนวนกล่อง) [quantities.ts]
 *   ต้นทุน   = round2(ฐาน × เรท)
 *   ตู้ที่จ่ายค่าตู้แล้ว (paid) → **ล็อกค่าที่เก็บไว้** (อาจถูกบัญชีปรับมือ · เป็นเอกสารแล้ว)
 *   ไม่มีเรท (0) → ใช้ค่าที่เก็บไว้ (ไม่เดาเรท)
 *
 * ══ WRITE GUARD ══
 * `checkCostWritePlausible` = ด่านสุดท้ายก่อนเขียน `fcosttotalprice` ลง DB.
 * เรททุกตัวในระบบนี้เป็น **ต่อคิว** (พิสูจน์บน prod 2026-07-23: tb_cost_container
 * 42/42 แถวอยู่ช่วง 2,500–4,700 · tb_settings ทุกเซลล์ 2,400–6,500 · ไม่มีเรทต่อกิโล
 * อยู่จริงสักตัว) → ต้นทุนที่สูงกว่า `คิว × เรท` หลายเท่า = คิดหน่วยผิด ไม่ใช่ราคาจริง.
 * กันไว้ตรงนี้ = ขยะเข้า DB เงียบๆ ไม่ได้อีก ไม่ว่าจะมาจาก writer ตัวไหน.
 *
 * pure + client-safe (ไม่มี server import) → RSC · "use client" · script ใช้ร่วมกันได้.
 */

import { totalCbmOf, type QuantityRow } from "./quantities";
import { costBasisMode, type CostBasis, type WarehouseDigit } from "./resolve-cost";

const round2 = (n: number) => Math.round(n * 100) / 100;

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** เรทต้นทุน 4 ประเภทสินค้าของตู้ (tb_cost_container ▸ tb_settings). */
export type ContainerRates = { p1: number; p2: number; p3: number; p4: number };

/** แถว tb_forwarder เท่าที่เครื่องคิดต้นทุนต้องใช้. */
export type CostEngineRow = QuantityRow & {
  fweight: number | string | null | undefined;
  fproductstype: string | null | undefined;
  /** ต้นทุนที่เก็บไว้ใน DB — ใช้เมื่อตู้จ่ายแล้ว หรือไม่มีเรท */
  fcosttotalprice: number | string | null | undefined;
};

/**
 * เลือกเรทตามประเภทสินค้า. ประเภทที่ไม่รู้จัก/ว่าง → 0 (= ไม่คิดสด ใช้ค่าที่เก็บไว้)
 * ตรงกับ DETAIL: `pType==='1'?p1: … :0`.
 */
export function rateForProductType(rates: ContainerRates, fproductstype: string | null | undefined): number {
  switch (String(fproductstype ?? "").trim()) {
    case "1": return num(rates.p1);
    case "2": return num(rates.p2);
    case "3": return num(rates.p3);
    case "4": return num(rates.p4);
    default:  return 0;
  }
}

/**
 * ฐานคิดต้นทุนของตู้ — ตัดสินด้วย CARRIER ตัวเดียว (costBasisMode = SOT).
 * โกดังว่าง/ไม่รู้จัก → "cbm" (ค่าปลอดภัย · ไม่มีเรทต่อกิโลอยู่จริงในระบบ).
 */
export function costBasisForWarehouse(warehouse: string | null | undefined): CostBasis {
  return costBasisMode(String(warehouse ?? "").trim() as WarehouseDigit);
}

/**
 * โกดังของตู้ = โกดังตัวแรกที่ไม่ว่างในบรรดาแถวของตู้.
 * ทั้ง LIST และ DETAIL ต้องใช้ตัวนี้ เพื่อให้ "ฐาน" ออกมาเหมือนกันเป๊ะ — ก่อนหน้านี้
 * DETAIL อ่านจากแถวแรกดื้อๆ ซึ่งถ้าแถวแรกโกดังว่าง (prod มี 12 แถว) ก็ตัดสินจากค่าว่าง.
 */
export function resolveContainerWarehouse(
  rows: Array<{ fwarehousename?: string | null }>,
): string {
  for (const r of rows) {
    const wh = String(r.fwarehousename ?? "").trim();
    if (wh) return wh;
  }
  return "";
}

export type RowCostResult = {
  /** เรทที่ใช้ (0 = ไม่มีเรท → ใช้ค่าที่เก็บไว้) */
  rate: number;
  basis: CostBasis;
  /** ตัวเลขที่เอาไปคูณเรท (คิวรวมของแถว หรือ น้ำหนัก) */
  dimension: number;
  /** ต้นทุนคิดสด = round2(dimension × rate) */
  liveCost: number;
  /** ต้นทุนที่เก็บไว้ใน DB */
  storedCost: number;
  /** ต้นทุนที่ใช้จริง (live เมื่อยังไม่จ่ายค่าตู้ + มีเรท · ไม่งั้น stored) */
  cost: number;
  /** true = ตัวเลขนี้คิดสด · false = ล็อกจากค่าที่เก็บไว้ */
  isLive: boolean;
};

export type ContainerCostOptions = {
  rates: ContainerRates;
  /** โกดังระดับตู้ (resolveContainerWarehouse) */
  containerWarehouse: string | null | undefined;
  /** จ่ายค่าตู้แล้ว (มีแถวใน tb_cnt_item) → ล็อกค่าที่เก็บไว้ */
  cabinetIsPaid: boolean;
};

/**
 * ต้นทุน 1 แถว — สำเนากฎของหน้า DETAIL แบบตรงตัว (ดูหัวไฟล์).
 */
export function resolveRowContainerCost(row: CostEngineRow, opts: ContainerCostOptions): RowCostResult {
  const rate = rateForProductType(opts.rates, row.fproductstype);
  const basis = costBasisForWarehouse(opts.containerWarehouse);
  const dimension = basis === "weight" ? num(row.fweight) : totalCbmOf(row);
  const liveCost = round2(rate * dimension);
  const storedCost = num(row.fcosttotalprice);
  const isLive = !opts.cabinetIsPaid && rate > 0;
  return { rate, basis, dimension, liveCost, storedCost, cost: isLive ? liveCost : storedCost, isLive };
}

export type ContainerCostRollup = {
  /** Σ ต้นทุนของตู้ (ตัวเลขเดียวกับที่หน้า DETAIL โชว์) */
  costSum: number;
  /** จำนวนแถวที่คิดสด */
  liveRows: number;
  /** จำนวนแถวที่ใช้ค่าที่เก็บไว้ (จ่ายแล้ว/ไม่มีเรท) */
  storedRows: number;
};

/** Σ ต้นทุนทั้งตู้ ผ่านกฎต่อแถวข้างบน. */
export function rollupContainerCost(rows: CostEngineRow[], opts: ContainerCostOptions): ContainerCostRollup {
  let costSum = 0, liveRows = 0, storedRows = 0;
  for (const r of rows) {
    const rc = resolveRowContainerCost(r, opts);
    costSum += rc.cost;
    if (rc.isLive) liveRows += 1;
    else storedRows += 1;
  }
  return { costSum: round2(costSum), liveRows, storedRows };
}

// ═══════════════════════════════════════════════════════════════════════
// WRITE GUARD — ด่านก่อนเขียน fcosttotalprice
// ═══════════════════════════════════════════════════════════════════════

/**
 * ต้นทุนต่อคิว เกินเรทได้กี่เท่าถึงจะถือว่า "ผิดหน่วย".
 * ฐานคิว: ต้นทุน/คิว = เรท พอดี (อัตราส่วน 1) → 5 เท่าคือเผื่อไว้เหลือเฟือ.
 * ของจริงที่หลุดมา: 116× · 657× · 98× · 430× → จับได้ทุกตัวแบบไม่ต้องลุ้น.
 */
export const COST_MAX_CBM_MULTIPLE = 5;

export type CostWriteCheckInput = {
  rate: number;
  /** ฐานที่ writer ตั้งใจใช้ */
  basis: CostBasis;
  /** โกดังของแถว (ใช้ตัดสินว่า "น้ำหนัก" เป็นฐานที่ถูกต้องของ carrier นี้จริงไหม) */
  warehouse: string | null | undefined;
  /** คิวรวมของแถว (totalCbmOf) */
  totalCbm: number;
  /** ต้นทุนที่กำลังจะเขียน */
  cost: number;
};

export type CostWriteCheck =
  | { ok: true }
  | { ok: false; reason: string; maxPlausible: number };

/**
 * ต้นทุนที่กำลังจะเขียน สมเหตุสมผลไหม.
 *
 * 2 ด่าน:
 *   1. ฐาน "น้ำหนัก" ใช้ได้เฉพาะ carrier ที่คิดตามน้ำหนักจริง (Sang 1 / MX 4).
 *      ที่เหลือ = เรทต่อคิว → เอาไปคูณกิโล คือคิดหน่วยผิด.
 *   2. ขนาดตัวเลข: ต้นทุน ต้องไม่เกิน คิว × เรท × COST_MAX_CBM_MULTIPLE
 *
 * ⚠️ ด่าน 2 ตัดสินจาก **CARRIER** (ข้อเท็จจริง) ไม่ใช่จากฐานที่ writer อ้าง —
 * writer ที่บอกว่า "cbm" แต่ส่งตัวเลขที่คำนวณจากน้ำหนักมา ก็ยังโดนจับ (คือเคสจริง
 * ทั้ง 4 แถว). แต่ถ้า carrier นั้นคิดตามน้ำหนักจริง (Sang/MX) เรทเป็น "ต่อกิโล"
 * → เอาไปเทียบกับ คิว × เรท ไม่ได้ (คนละหน่วย) จึงข้ามด่าน 2 ให้.
 * prod 2026-07-23: Sang(1)/MX(4) มี 0 แถวที่ใช้งานจริง — ข้อยกเว้นนี้จึงไม่เปิดรู
 * ให้ของจริงวันนี้ แต่กันไม่ให้ guard ไปบล็อกงานที่ถูกต้องถ้าวันหนึ่งมีการใช้.
 *
 * ไม่มีคิว (คิว = 0) หรือไม่มีเรท → ผ่าน (ตัดสินไม่ได้ ไม่บล็อกงานปกติ).
 */
export function checkCostWritePlausible(input: CostWriteCheckInput): CostWriteCheck {
  const { rate, basis, warehouse, totalCbm, cost } = input;
  if (!(rate > 0) || !(cost > 0)) return { ok: true };
  const carrierBasis = costBasisForWarehouse(warehouse);

  // ด่าน 1 — ฐานน้ำหนักบน carrier ที่คิดตามคิว
  if (basis === "weight" && carrierBasis !== "weight") {
    return {
      ok: false,
      reason:
        `คิดต้นทุนด้วย "น้ำหนัก" กับขนส่งที่คิดเป็น "คิว" ` +
        `(โกดัง "${String(warehouse ?? "").trim() || "ไม่ระบุ"}") — เรทนี้เป็นเรทต่อคิว`,
      maxPlausible: round2(totalCbm * rate * COST_MAX_CBM_MULTIPLE),
    };
  }

  // ด่าน 2 — ขนาดของตัวเลข เทียบ คิว × เรท (เฉพาะ carrier ที่เรทเป็น "ต่อคิว")
  if (carrierBasis === "weight") return { ok: true };
  if (!(totalCbm > 0)) return { ok: true };
  const maxPlausible = round2(totalCbm * rate * COST_MAX_CBM_MULTIPLE);
  if (cost > maxPlausible) {
    const perCbm = Math.round(cost / totalCbm);
    return {
      ok: false,
      reason:
        `ต้นทุนสูงผิดปกติ — ตกคิวละ ฿${perCbm.toLocaleString("th-TH")} ` +
        `แต่เรทที่ตั้งไว้คือ ฿${rate.toLocaleString("th-TH")}/คิว`,
      maxPlausible,
    };
  }
  return { ok: true };
}
