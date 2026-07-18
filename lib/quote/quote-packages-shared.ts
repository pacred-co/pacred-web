/**
 * แพ็กเกจใบเสนอราคาแบบแก้ได้ (owner ปอน 2026-07-18) — types + seed + helpers ที่
 * share ระหว่าง server loader (quote-packages.ts · server-only) และ client
 * (editor · quote-tab · booking). แยกจาก server-only เพราะ client ต้อง import
 * ค่า/ฟังก์ชัน (seed/blank) ไม่ได้จากโมดูล server-only.
 *
 * แพ็ก = **พรีเซ็ตใบเสนอราคา** (เลือกแพ็ก → โชว์เรทแพ็กในใบเสนอราคา) · ไม่กระทบ billing.
 * เก็บ "กริดเต็ม" (โกดัง × ทาง × กลุ่มสินค้า) ตรงกับตารางหน้า "ตั้งเรทใบเสนอราคา".
 */
import {
  CARGO_PROMO_PACKAGES,
  FDA_SPECIAL_RATE,
  rateFor,
  WAREHOUSE_KEYS,
  type QuoteMode,
  type WarehouseKey,
} from "./cargo-promo-packages";
import type { TransportId, WarehouseId } from "@/lib/admin/customer-rate-tables";
import type { QuoteRateGroup } from "@/lib/admin/quote-default-rates-shared";

export type PkgRate = { cbm: number; kg: number };
/** rates[โกดัง '1'|'2'][ทาง '1'รถ|'2'เรือ][กลุ่ม 'general'|'fda'] = { cbm, kg }. */
export type PkgRateGrid = Record<WarehouseId, Record<TransportId, Record<QuoteRateGroup, PkgRate>>>;

export type QuotePackage = {
  id: string;
  name: string;
  conditions: string[];
  days: { truck: string; ship: string };
  rates: PkgRateGrid;
};

const WH_KEY_TO_ID: Record<WarehouseKey, WarehouseId> = { guangzhou: "1", yiwu: "2" };
const MODE_TO_TT: Record<QuoteMode, TransportId> = { truck: "1", ship: "2" };
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

/** กริดว่าง (0 ทุกช่อง). */
export function emptyPackageGrid(): PkgRateGrid {
  const cell = (): PkgRate => ({ cbm: 0, kg: 0 });
  const groups = (): Record<QuoteRateGroup, PkgRate> => ({ general: cell(), fda: cell() });
  const transports = (): Record<TransportId, Record<QuoteRateGroup, PkgRate>> => ({ "1": groups(), "2": groups() });
  return { "1": transports(), "2": transports() };
}

/** map แพ็กโปรฯ 1 อัน → กริด (general = เรทฐาน rateFor · fda = FDA_SPECIAL_RATE · yiwu-รถ +600 อยู่ใน rateFor แล้ว). */
function gridFromPromo(pkg: (typeof CARGO_PROMO_PACKAGES)[number]): PkgRateGrid {
  const grid = emptyPackageGrid();
  for (const wh of WAREHOUSE_KEYS) {
    const whId = WH_KEY_TO_ID[wh];
    for (const mode of ["truck", "ship"] as QuoteMode[]) {
      const tt = MODE_TO_TT[mode];
      const base = rateFor(pkg, false, wh, mode);
      grid[whId][tt].general = { cbm: base.cbm, kg: base.kg };
      grid[whId][tt].fda = { cbm: FDA_SPECIAL_RATE[mode].cbm, kg: FDA_SPECIAL_RATE[mode].kg };
    }
  }
  return grid;
}

/** แพ็กตั้งต้น (fallback/seed) จาก CARGO_PROMO_PACKAGES เดิม 3 แพ็ก. */
export function seedQuotePackages(): QuotePackage[] {
  return CARGO_PROMO_PACKAGES.map((pkg) => ({
    id: pkg.id,
    name: pkg.name,
    conditions: [...pkg.conditions],
    days: { truck: pkg.rates.truck.days, ship: pkg.rates.ship.days },
    rates: gridFromPromo(pkg),
  }));
}

/** แพ็กใหม่ (template จากแพ็กแรก · id/name จากผู้เรียก). */
export function newBlankPackage(id: string, name: string): QuotePackage {
  const template = seedQuotePackages()[0];
  return { id, name, conditions: [], days: { ...template.days }, rates: gridFromPromo(CARGO_PROMO_PACKAGES[0]) };
}

/** validate/normalize ค่าจาก config → QuotePackage[] (คืน null ถ้าไม่ใช่รูปที่ถูก). */
export function parseQuotePackages(raw: unknown): QuotePackage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: QuotePackage[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") return null;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.name !== "string") return null;
    const grid = emptyPackageGrid();
    const rr = (o.rates ?? {}) as Record<string, unknown>;
    for (const wh of ["1", "2"] as WarehouseId[]) {
      const whCfg = (rr[wh] ?? {}) as Record<string, unknown>;
      for (const tt of ["1", "2"] as TransportId[]) {
        const ttCfg = (whCfg[tt] ?? {}) as Record<string, unknown>;
        for (const g of ["general", "fda"] as QuoteRateGroup[]) {
          const cell = (ttCfg[g] ?? {}) as Record<string, unknown>;
          grid[wh][tt][g] = { cbm: num(cell.cbm), kg: num(cell.kg) };
        }
      }
    }
    const days = (o.days ?? {}) as Record<string, unknown>;
    out.push({
      id: o.id,
      name: o.name,
      conditions: Array.isArray(o.conditions) ? o.conditions.filter((c): c is string => typeof c === "string") : [],
      days: { truck: typeof days.truck === "string" ? days.truck : "", ship: typeof days.ship === "string" ? days.ship : "" },
      rates: grid,
    });
  }
  return out;
}
