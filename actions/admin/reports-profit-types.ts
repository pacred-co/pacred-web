/**
 * Wave C BI — Forwarder profit/margin analytics: shared types + label maps.
 *
 * Co-located NON-"use server" module. The sibling `reports-profit.ts` is a
 * `"use server"` file and so may only export async functions — type aliases,
 * const maps, and pure helpers live here (see CLAUDE_TECHNICAL.md "use server"
 * rule + the same split in lib/admin/reports/types.ts).
 *
 * Ground-truth columns (tb_forwarder, migration 0081 — ALL LOWERCASE):
 *   fwarehousename varchar(1) — "โกดังรับของที่จีน" 1=แสง 2=CTT 3=MK 4=MX
 *                               5=JMF 6=GOGO 7=CargoCenter 8=MOMO
 *   fshipby        varchar(10)— "รูปแบบการขนส่งไทย" (TH carrier, 46-value sparse set)
 *   ftransporttype varchar    — 1=รถ 2=เรือ 3=แอร์ (china→thai mode)
 *   fcosttotalprice numeric   — "ต้นทุนขนส่ง"
 *   ftotalprice    numeric    — sale total (revenue)
 *   fdiscount      numeric    — discount on sale
 *   fprofittotal   numeric    — "กำไรสุทธิ" (precomputed; preferred when non-zero)
 *   fdate          timestamp  — created date (report keys off this, like
 *                               report-forwarder-profit.php)
 *   fstatus        varchar    — lifecycle 1-7,99 (99 = cancelled/special)
 */

/** One aggregated breakdown bucket (per carrier / warehouse / mode). */
export type ProfitGroupRow = {
  /** Stable React key + group key (raw column value). */
  key: string;
  /** Display label for the group (mapped where known, else the raw value). */
  label: string;
  /** Orders in this bucket. */
  count: number;
  /** Σ ftotalprice — sale/revenue total (THB). */
  revenue: number;
  /** Σ fcosttotalprice — cost total (THB). */
  cost: number;
  /** Σ profit (fprofittotal when non-zero, else ftotalprice−fdiscount−cost). */
  profit: number;
  /** profit / revenue × 100 (0 when revenue is 0). */
  margin_pct: number;
};

/** Whole-report summary totals. */
export type ProfitSummary = {
  order_count: number;
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  /** total_profit / total_revenue × 100. */
  margin_pct: number;
  /** Orders that have a cost filled in (fcosttotalprice > 0). */
  with_cost_count: number;
};

/** The full payload the page renders. */
export type ForwarderProfitAnalytics = {
  summary: ProfitSummary;
  byCarrier: ProfitGroupRow[];
  byWarehouse: ProfitGroupRow[];
  byMode: ProfitGroupRow[];
};

// ── label maps (canonical from migration 0081 + existing report pages) ────

/** tb_forwarder.fwarehousename → label (migration 0081 comment L1779). */
export const WAREHOUSE_NAME_LABEL: Record<string, string> = {
  "1": "แสง (Sang)",
  "2": "CTT",
  "3": "MK",
  "4": "MX",
  "5": "JMF",
  "6": "GOGO",
  "7": "Cargo Center",
  "8": "MOMO",
};

/** tb_forwarder.ftransporttype → label (matches forwarder-volume page). */
export const TRANSPORT_TYPE_LABEL: Record<string, string> = {
  "1": "🚚 รถ",
  "2": "🚢 เรือ",
  "3": "✈️ เครื่องบิน",
};

/**
 * tb_forwarder.fshipby → carrier label. SPARSE: the legacy fshipby map has
 * ~46 values but no single authoritative table exists in-repo (the manual
 * form only lists 9). We label the common ones and fall back to the raw
 * code for the rest — the breakdown stays correct, just shows the code.
 */
export const SHIP_BY_LABEL: Record<string, string> = {
  PCS: "รับเองโกดัง Pacred (สมุทรสาคร)",
  "1": "DHL Express",
  "2": "Flash Express",
  "3": "J.K. เอ็กซ์เพรส",
  "4": "Kerry Express",
  "5": "Nim Express",
  "11": "ไปรษณีย์ไทย",
  "21": "นิ่มซี่เส็งขนส่ง 1988",
  "24": "J&T Express",
};

/** Compute margin % safely (0 when revenue is 0/negative-zero). */
export function marginPct(profit: number, revenue: number): number {
  if (!revenue) return 0;
  const pct = (profit / revenue) * 100;
  return Number.isFinite(pct) ? pct : 0;
}

/** The four tb_forwarder money columns the profit derivation reads. */
export type ForwarderProfitCols = {
  ftotalprice:     number | string | null;
  fcosttotalprice: number | string | null;
  fdiscount:       number | string | null;
  fprofittotal:    number | string | null;
};

/**
 * Canonical per-forwarder-row profit derivation — the SINGLE source of truth
 * shared by the full profit report (reports-profit.ts) AND the exec cockpit
 * (reports-cockpit.ts) so their margins reconcile (audit SF-4).
 *
 *   revenue = ftotalprice                          (NOT + ftransport/fpriceupdate)
 *   cost    = fcosttotalprice
 *   profit  = fprofittotal when non-zero (admin's after-discount edit wins),
 *             else  ftotalprice − fdiscount − fcosttotalprice
 *
 * Pure — no IO. `fprofittotal !== 0` (not "> 0") so a genuine negative
 * precomputed profit is respected; only an unset/zero field triggers the
 * fallback compute.
 */
export function forwarderRowProfit(r: ForwarderProfitCols): {
  revenue: number;
  cost: number;
  profit: number;
} {
  const revenue = Number(r.ftotalprice ?? 0);
  const cost = Number(r.fcosttotalprice ?? 0);
  const discount = Number(r.fdiscount ?? 0);
  const pre = Number(r.fprofittotal ?? 0);
  const profit = pre !== 0 ? pre : revenue - discount - cost;
  return { revenue, cost, profit };
}
