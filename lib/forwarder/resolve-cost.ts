/**
 * resolve-cost.ts — the forwarder COST resolver (ต้นทุน นำเข้าจีน-ไทย).
 *
 * Pacred reads the COST rate from the 144-cell `tb_settings` matrix
 * (`fcost{car|ship}{1..4}default{carrier}{city}`) the SAME way the container
 * report does — this is a faithful extract of the cost lookup already living
 * inline in `actions/admin/report-cnt-detail.ts` (warehouseSegment + calcRowCost,
 * itself a port of legacy `calPriceForwarderCost()`). Extracted so the forwarder
 * DETAIL page can show ต้นทุน + กำไร live (option A · ภูม/พี่ป๊อป 2026-06-18
 * "แบบ PCS forwarder.php — คำนวณต้นทุนสด") without re-implementing — and so the
 * detail-page cost and the report-cnt-stored cost can never silently diverge.
 *
 * COST model (matches report-cnt-detail.ts byte-for-byte):
 *   - rate  = tb_settings[ costColumn(wh, productType, transport, china) ]
 *   - basis = Sang(1) + MX(4) bill by WEIGHT; every other carrier by CBM
 *   - cost  = round2( dimension × rate )   (dimension = fweight or fvolume, RAW)
 *
 * A 0 rate cell (carrier×mode×type×city not filled in /admin/settings/
 * forwarder-costs) → cost 0. NEVER guesses a rate. Display-only; no write.
 *
 * ⚠️ Intentionally NOT modeled (faithful to the simplified report-cnt port —
 * the deeper legacy calPriceForwarderCost does these, the container reset-rate
 * path does not): the MX weight-vs-CBM max() tier and Sang's literal
 * width×length×height multiplier. So MX(4)/Sang(1) live cost is the single
 * carrier-default basis, not the full legacy formula. A container that was
 * MANUALLY custom-rated (tb_cost_container · a non-default frefprice basis) can
 * therefore have a stored fcosttotalprice that differs from this live figure —
 * the CALLER must prefer the stored value + flag the divergence (the forwarder
 * panel does: displayCost = stored when it disagrees with live > ฿0.01).
 */

export type WarehouseDigit = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
export type CostTransport = "1" | "2"; // 1 = รถ (car) · 2 = เรือ (ship)
export type CostBasis = "weight" | "cbm";

const VALID_WH: readonly string[] = ["1", "2", "3", "4", "5", "6", "7", "8"];

/**
 * Build the `tb_settings` cost-column name for a carrier × mode × type × city.
 * Faithful copy of report-cnt-detail.ts `warehouseSegment()`:
 *   prefix      = transport==="1" ? "fcostcar" : "fcostship"
 *   citySuffix  = china==="2" (อี้อู) ? "2" : "" (กวางโจว)
 *   carrier seg = sang | default(CTT) | mkcargo(MK & MX) | jmf | gogo |
 *                 cargocenter | momo
 * Returns null for an invalid warehouse digit (→ no cost).
 */
export function costColumn(
  wh: WarehouseDigit,
  productTypeIdx: 1 | 2 | 3 | 4,
  transport: CostTransport,
  china: string,
): string | null {
  const prefix = transport === "1" ? "fcostcar" : "fcostship";
  const citySuffix = china === "2" ? "2" : "";
  switch (wh) {
    case "1": return `${prefix}${productTypeIdx}defaultsang${citySuffix}`;        // แสง
    case "2": return `${prefix}${productTypeIdx}default${citySuffix}`;            // CTT (bare default)
    case "3": return `${prefix}${productTypeIdx}defaultmkcargo${citySuffix}`;     // MK
    case "4": return `${prefix}${productTypeIdx}defaultmkcargo${citySuffix}`;     // MX → mkcargo (legacy)
    case "5": return `${prefix}${productTypeIdx}defaultjmf${citySuffix}`;         // JMF
    case "6": return `${prefix}${productTypeIdx}defaultgogo${citySuffix}`;        // GOGO
    case "7": return `${prefix}${productTypeIdx}defaultcargocenter${citySuffix}`; // Cargo Center
    case "8": return `${prefix}${productTypeIdx}defaultmomo${citySuffix}`;        // MOMO
    default: return null;
  }
}

/** Sang(1) + MX(4) bill by weight; every other carrier by CBM (report-cnt L335). */
export function costBasisMode(wh: WarehouseDigit): CostBasis {
  return wh === "1" || wh === "4" ? "weight" : "cbm";
}

/** Map fProductsType ("1".."4", default "1") → the matrix product index. */
export function productTypeIdx(fProductsType: string | null | undefined): 1 | 2 | 3 | 4 {
  const t = (fProductsType ?? "").trim();
  return t === "2" ? 2 : t === "3" ? 3 : t === "4" ? 4 : 1;
}

export type CostRowInput = {
  fwarehousename: string | null | undefined;
  fwarehousechina: string | null | undefined;
  ftransporttype: string | null | undefined;
  fproductstype: string | null | undefined;
  /** RAW per-row weight (kg) — the same value report-cnt feeds calcRowCost. */
  fweight: number;
  /** RAW per-row volume (cbm) — the same value report-cnt feeds calcRowCost. */
  fvolume: number;
};

export type RowCost = {
  /** the matrix cell value used (0 = cell unset → cost 0) */
  rate: number;
  /** "weight" → cost = rate × fweight · "cbm" → cost = rate × fvolume */
  basis: CostBasis;
  /** the dimension actually multiplied (fweight or fvolume) */
  dimension: number;
  /** round2(dimension × rate) — 0 when rate ≤ 0 or dimension ≤ 0 */
  cost: number;
  /** the tb_settings column resolved (null = invalid warehouse) */
  column: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Resolve ONE forwarder row's cost from the settings matrix. `settings` is the
 * `tb_settings` row (id=1); only the resolved cost column is read — pass a slim
 * `{ [col]: value }` record or the full row, both work.
 */
export function resolveRowCost(
  row: CostRowInput,
  settings: Record<string, number | string | null | undefined> | null | undefined,
): RowCost {
  const wh = (row.fwarehousename ?? "") as WarehouseDigit;
  if (!VALID_WH.includes(wh)) {
    return { rate: 0, basis: "cbm", dimension: 0, cost: 0, column: null };
  }
  const transport: CostTransport = row.ftransporttype === "2" ? "2" : "1";
  const idx = productTypeIdx(row.fproductstype);
  const column = costColumn(wh, idx, transport, row.fwarehousechina ?? "");
  // Explicit finite-check (not a `|| 0` quirk): a non-numeric / NaN cell → rate 0
  // → cost 0 ("never guess"), and a legitimate 0 stays 0.
  const rawRate = column ? Number(settings?.[column] ?? 0) : 0;
  const rate = Number.isFinite(rawRate) && rawRate > 0 ? rawRate : 0;
  const basis = costBasisMode(wh);
  const rawDim = basis === "weight" ? row.fweight : row.fvolume;
  const dimension = Number.isFinite(rawDim) && rawDim > 0 ? rawDim : 0;
  const cost = rate > 0 && dimension > 0 ? round2(dimension * rate) : 0;
  return { rate, basis, dimension, cost, column };
}

/** Sum the live cost across a set of rows (multi-tracking aggregate). */
export function resolveOrderCost(
  rows: CostRowInput[],
  settings: Record<string, number | string | null | undefined> | null | undefined,
): { total: number; perRow: RowCost[] } {
  const perRow = rows.map((r) => resolveRowCost(r, settings));
  const total = round2(perRow.reduce((s, rc) => s + rc.cost, 0));
  return { total, perRow };
}
