/**
 * Re-sweep A2 #28 (money P0 · D1 faithful-port) — shared metadata for the
 * default forwarder-cost matrix editor.
 *
 * Legacy SOT: `member/pcs-admin/settings.php` (sections "ตั้งค่าเรทนำเข้าสินค้า
 * <CARRIER>"). The legacy page edits ~144 `tb_settings` cost columns — one
 * "บันทึก" button per cell — that auto-fill a NEW forwarder row's per-tier
 * cost when an order lands (the engine that reads them lives in
 * `actions/admin/report-cnt-detail.ts:warehouseSegment()`).
 *
 * This module is a PLAIN module (NOT "use server") so both the server action
 * (`actions/admin/tb-settings.ts`) and the page/form can import the same
 * carrier registry + column-name builder + allow-list — guaranteeing the UI
 * and the writer agree on exactly which `tb_settings` columns exist.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * COLUMN-NAME ANATOMY (verified against the live prod tb_settings row id=1):
 *
 *     fcost  car|ship   {1-4}   default{carrierSuffix}   [2]
 *     ─────  ────────   ─────   ──────────────────────   ───
 *     fixed  transport  type    carrier (bare=CTT)       city
 *
 *   • transport : `car`  = ทางรถ (truck)   ·  `ship` = ทางเรือ (sea)
 *   • type 1-4  : 1 ทั่วไป (general) · 2 มอก. (TIS) · 3 อย. (FDA) · 4 พิเศษ (special)
 *   • carrier   : bare "default" = CTT · then sang/mkcargo/mxcargo/wmxcargo/
 *                 jmf/cargocenter/momo/gogo appended after "default"
 *   • city `2`  : ""  = กวางโจว (Guangzhou) warehouse · "2" = อี้อู (Yiwu) warehouse
 *
 *   e.g. fcostcar1default            = CTT · truck · general · Guangzhou
 *        fcostcar1default2           = CTT · truck · general · Yiwu
 *        fcostship3defaultmxcargo    = MX  · sea   · FDA     · Guangzhou
 *        fcostship3defaultmxcargo2   = MX  · sea   · FDA     · Yiwu
 *
 * ALL columns are LOWERCASE on prod (legacy PHP wrote camelCase identifiers
 * but Postgres folded them — verified empirically: PostgREST returns
 * `fcostcar1default`, NOT `fCostCar1Default`). Do NOT quote/camelCase these.
 * ──────────────────────────────────────────────────────────────────────────
 */

// Product-type index 1-4 (legacy settings.php "ประเภท …" labels per cell).
export const PRODUCT_TYPES = [
  { idx: 1, label: "ทั่วไป" },
  { idx: 2, label: "มอก." },
  { idx: 3, label: "อย." },
  { idx: 4, label: "พิเศษ" },
] as const;

// City variant: "" = กวางโจว · "2" = อี้อู (the `2` suffix in the column name).
export const CITY_VARIANTS = [
  { suffix: "", label: "กวางโจว" },
  { suffix: "2", label: "อี้อู" },
] as const;

// Transport mode → column infix.
export const TRANSPORTS = [
  { infix: "car", label: "ทางรถ" },
  { infix: "ship", label: "ทางเรือ" },
] as const;

/**
 * Carrier registry. `suffix` is the literal text appended after "default" in
 * the column name (CTT = bare default, so suffix=""). Order + labels mirror
 * the legacy settings.php section headers. `weightBased` flags the MX
 * weight-tier (`wmxcargo`) which the legacy treats as a separate carrier
 * column family (คิดตามน้ำหนัก, not คิดตามคิว).
 */
export const CARRIERS = [
  { suffix: "",            label: "CTT" },
  { suffix: "sang",        label: "Sang Cargo" },
  { suffix: "mkcargo",     label: "MK Cargo" },
  { suffix: "mxcargo",     label: "MX Cargo" },
  { suffix: "wmxcargo",    label: "MX Cargo (คิดตามน้ำหนัก)", weightBased: true },
  { suffix: "jmf",         label: "JMF Cargo" },
  { suffix: "cargocenter", label: "Cargo Center" },
  { suffix: "momo",        label: "MOMO" },
  { suffix: "gogo",        label: "GOGO" },
] as const;

export type Carrier = (typeof CARRIERS)[number];

/** Build the exact lowercase tb_settings column name for a cost cell. */
export function costColumn(
  transportInfix: "car" | "ship",
  productTypeIdx: 1 | 2 | 3 | 4,
  carrierSuffix: string,
  citySuffix: "" | "2",
): string {
  return `fcost${transportInfix}${productTypeIdx}default${carrierSuffix}${citySuffix}`;
}

/**
 * The complete set of cost columns this editor manages, derived from the
 * registry above (9 carriers × 2 transports × 4 types × 2 cities = 144).
 * Used as the server-side allow-list (reject any key not in this set) AND to
 * render the grid.
 */
export const ALL_COST_COLUMNS: string[] = (() => {
  const cols: string[] = [];
  for (const c of CARRIERS) {
    for (const t of TRANSPORTS) {
      for (const p of PRODUCT_TYPES) {
        for (const city of CITY_VARIANTS) {
          cols.push(costColumn(t.infix, p.idx, c.suffix, city.suffix));
        }
      }
    }
  }
  return cols;
})();

export const ALL_COST_COLUMNS_SET: ReadonlySet<string> = new Set(ALL_COST_COLUMNS);

/**
 * Master "ตั้งค่าทั่วไป" config columns the SAME legacy screen edits
 * (settings.php L1789-1945). NOTE the legacy typo `numberPaymemt` (carried
 * verbatim to prod as `numberpaymemt`). `freeshipping` is "1" (on) | "2" (off).
 *
 * `rsdefault` / `rpdefault` / `rgdefault` are NOT included here — they already
 * have their own editor (`/admin/settings/legacy-rates` → adminSetTbSettingsRates,
 * with its own [2.0, 8.0] range guard). We avoid a second writer for them.
 */
export const MASTER_NUMERIC_COLUMNS = [
  {
    col: "hratecostdefault",
    label: "เรทฝากสั่งสินค้าต้นทุน (บาท/หยวน)",
    hint: "cost-rate ที่แอดมินใช้คำนวณ margin ฝากสั่ง",
  },
  {
    col: "hratecostsale",
    label: "เรทฝากสั่งสินค้าสำหรับแอดมินต่อรองลูกค้า (บาท/หยวน)",
    hint: "พื้นราคาต่อรอง (floor) ตอนแอดมินคุยกับลูกค้า",
  },
] as const;

export type MasterNumericCol = (typeof MASTER_NUMERIC_COLUMNS)[number]["col"];

// CNY-per-THB sanity band for the two master cost-rates (same logic as the
// rate editor's [2.0, 8.0] guard — block 47.5 / 0.475 digit-misplace typos).
export const COST_RATE_MIN = 2.0;
export const COST_RATE_MAX = 8.0;

// Per-cell forwarder cost is THB-per-CBM (or per-kg for wmxcargo) — legacy
// values run ฿2,400-฿13,000 for CBM tiers and small per-kg numbers (13) for
// weight tiers. Accept a wide [0, 100000] band: 0 = "carrier not used / unset"
// (many columns are 0 on prod), upper bound blocks a stray extra digit.
export const COST_CELL_MIN = 0;
export const COST_CELL_MAX = 100000;
