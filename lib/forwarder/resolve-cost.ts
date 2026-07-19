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
 * ══ THE COST-RATE WATERFALL (owner 2026-07-17 · "นายดึงเรทไหนมาคำนวณนะครับ") ══
 * Exactly ONE order of precedence, and the ACCOUNTANT ALWAYS WINS:
 *
 *   1. CONTAINER  — tb_cost_container[fcabinetnumber].fproductstype{1..4}
 *                   the rate accounting types at ตรวจตู้ / รายการตู้ for THIS
 *                   container. Per-container, per-product-type. Beats everything.
 *   2. SETTINGS   — tb_settings[ costColumn(wh, productType, transport, china) ]
 *                   the global carrier×mode×type×city default. Only a FALLBACK,
 *                   for a container accounting has not rated yet.
 *   3. NONE       — rate 0 → cost 0. NEVER guess a rate.
 *
 * 🔴 REGRESSION THIS FIXES (owner "ระบบก็ไม่เห็นดึงมาใช้เลยครับ"): tier 1 did not
 * exist. This resolver read tb_settings ONLY, so the forwarder panel's live line
 * showed the global MOMO default (2,500/CBM · mig 0194) for a container the
 * accountant had rated at 4,700 — e.g. GZE260701-1, where the booked cost 251.92
 * = 0.0536 × 4,700 while the panel claimed "0.05360 x 2,500 = 134.00 (เรทระบบ)".
 * The stored number was right; the rate the UI *reported* was a different number
 * from a different table. Same root as the owner's "เรท รถ และ เรือ ไม่เท่ากัน":
 * mig 0194 flattened fcostcar*defaultmomo AND fcostship*defaultmomo both to 2,500,
 * but prod accounting rates ROAD=4,700 (5/5 containers) vs SEA=2,500 (23/23).
 * Road and sea are NOT the same rate — tier 1 is what carries that truth today.
 *
 *   - basis = Sang(1) + MX(4) bill by WEIGHT; every other carrier by CBM
 *   - cost  = round2( dimension × rate )   (dimension = fweight or fvolume, RAW)
 *
 * Display/plan only; this module never writes. Callers: the forwarder cost panel
 * (read) and report-cnt (which owns the write and already reads tier 1 inline).
 *
 * ⚠️ Intentionally NOT modeled (faithful to the simplified report-cnt port —
 * the deeper legacy calPriceForwarderCost does these, the container reset-rate
 * path does not): the MX weight-vs-CBM max() tier and Sang's literal
 * width×length×height multiplier. So MX(4)/Sang(1) live cost is the single
 * carrier-default basis, not the full legacy formula. A container custom-rated
 * with a NON-default basis can still store a fcosttotalprice that differs from
 * this figure — the CALLER keeps preferring the stored value + flagging the
 * divergence (the forwarder panel does). With tier 1 wired, that divergence now
 * means a real basis/staleness gap, not merely "we read the wrong table".
 */

export type WarehouseDigit = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type CostTransport = "1" | "2"; // 1 = รถ (car) · 2 = เรือ (ship)
export type CostBasis = "weight" | "cbm";

const VALID_WH: readonly string[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

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
    case "8": return `${prefix}${productTypeIdx}defaultmomo${citySuffix}`;        // MOMO (กวางโจว)
    // TTW (อี้อู · owner 2026-07-19 "แค่ MOMO+TTW"): the COST rate is origin-driven, so
    // TTW reads the SAME momo cells + the citySuffix — a TTW row (fwarehousechina='2')
    // resolves `…defaultmomo2` = the อี้อู rate (เรือ 2600 / รถ 5300, set on tb_settings).
    // MOMO stays `…defaultmomo` (กวางโจว · เรือ 2500 / รถ 4700). No new columns needed.
    case "9": return `${prefix}${productTypeIdx}defaultmomo${citySuffix}`;        // TTW (อี้อู)
    default: return null;
  }
}

/** Sang(1) + MX(4) bill by weight; every other carrier (incl. MOMO(8) / TTW(9)) by CBM. */
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

/**
 * A `tb_cost_container` row — the per-container rate accounting sets at ตรวจตู้
 * (one cell per product type). Pass the row as-is; only the resolved cell reads.
 */
export type ContainerRateRow = {
  fproductstype1?: number | string | null;
  fproductstype2?: number | string | null;
  fproductstype3?: number | string | null;
  fproductstype4?: number | string | null;
};

/** Which tier of the waterfall produced the rate — surfaced so the UI can say so. */
export type CostRateSource = "container" | "settings" | "none";

export type RowCost = {
  /** the rate used (0 = no tier produced one → cost 0) */
  rate: number;
  /** WHERE `rate` came from — "container" = accounting's ตรวจตู้ rate (tier 1) */
  source: CostRateSource;
  /** "weight" → cost = rate × fweight · "cbm" → cost = rate × fvolume */
  basis: CostBasis;
  /** the dimension actually multiplied (fweight or fvolume) */
  dimension: number;
  /** round2(dimension × rate) — 0 when rate ≤ 0 or dimension ≤ 0 */
  cost: number;
  /** the tb_settings column resolved (null = invalid warehouse) — tier 2's cell */
  column: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Coerce a rate cell → a usable positive number, else 0 ("never guess"). */
function positiveRate(raw: unknown): number {
  const n = Number(raw ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * TIER 1 — pick this container's accounting rate for a row's product type.
 * Returns 0 when there is no container row / the cell is unset or garbage, which
 * lets the caller fall through to tier 2 (tb_settings).
 */
export function containerRate(
  cc: ContainerRateRow | null | undefined,
  fProductsType: string | null | undefined,
): number {
  if (!cc) return 0;
  return positiveRate(cc[`fproductstype${productTypeIdx(fProductsType)}` as keyof ContainerRateRow]);
}

/**
 * Resolve ONE forwarder row's cost through the full waterfall.
 *
 *   `settings`  — the `tb_settings` row (id=1). Only the resolved cost column is
 *                 read, so a slim `{ [col]: value }` record works as well as the
 *                 full row. This is tier 2 (the global default).
 *   `container` — this row's `tb_cost_container` row (tier 1 · accounting's
 *                 ตรวจตู้ rate). OPTIONAL and back-compat: omit it and the
 *                 resolver behaves exactly as before (settings-only).
 *                 🔴 Any caller that can reach the container SHOULD pass it —
 *                 omitting it is what produced the owner's 2,500-vs-4,700 lie.
 */
export function resolveRowCost(
  row: CostRowInput,
  settings: Record<string, number | string | null | undefined> | null | undefined,
  container?: ContainerRateRow | null,
): RowCost {
  const wh = (row.fwarehousename ?? "") as WarehouseDigit;
  if (!VALID_WH.includes(wh)) {
    return { rate: 0, source: "none", basis: "cbm", dimension: 0, cost: 0, column: null };
  }
  const transport: CostTransport = row.ftransporttype === "2" ? "2" : "1";
  const idx = productTypeIdx(row.fproductstype);
  const column = costColumn(wh, idx, transport, row.fwarehousechina ?? "");

  // ── the waterfall ── tier 1 CONTAINER (accounting) beats tier 2 SETTINGS.
  // positiveRate() is an explicit finite-check (not a `|| 0` quirk): a
  // non-numeric / NaN / ≤0 cell → 0 → fall through, and never a guessed rate.
  const fromContainer = containerRate(container, row.fproductstype);
  const fromSettings = column ? positiveRate(settings?.[column]) : 0;
  const rate = fromContainer > 0 ? fromContainer : fromSettings;
  const source: CostRateSource =
    fromContainer > 0 ? "container" : fromSettings > 0 ? "settings" : "none";

  const basis = costBasisMode(wh);
  const rawDim = basis === "weight" ? row.fweight : row.fvolume;
  const dimension = Number.isFinite(rawDim) && rawDim > 0 ? rawDim : 0;
  const cost = rate > 0 && dimension > 0 ? round2(dimension * rate) : 0;
  return { rate, source, basis, dimension, cost, column };
}

/**
 * Sum the live cost across a set of rows (multi-tracking aggregate).
 * `container` applies to every row — these rows are one shipment in one
 * container, so they share the container's accounting rate.
 */
export function resolveOrderCost(
  rows: CostRowInput[],
  settings: Record<string, number | string | null | undefined> | null | undefined,
  container?: ContainerRateRow | null,
): { total: number; perRow: RowCost[] } {
  const perRow = rows.map((r) => resolveRowCost(r, settings, container));
  const total = round2(perRow.reduce((s, rc) => s + rc.cost, 0));
  return { total, perRow };
}
