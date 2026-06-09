/**
 * Wave C BI — Exec cockpit (แดชบอร์ดผู้บริหาร): shared types.
 *
 * Co-located NON-"use server" module (sibling reports-cockpit.ts is "use server"
 * and may only export async functions). All reads target LIVE tb_* tables — the
 * rebuilt twins are mostly 0-row (big audit) so anything reading them would show
 * ฿0. Verified live columns: tb_forwarder (lowercase) fdate/fstatus/ftotalprice/
 * ftransportprice/fpriceupdate/fprofittotal/fcosttotalprice/fdiscount/fshipby/
 * fwarehousename · tb_wallet.wallettotal · tb_users.userActive/userTel.
 */

/** One status in the orders funnel (current snapshot · all-time row counts). */
export type FunnelStage = {
  /** fstatus code "1".."7". */
  code: string;
  /** Thai stage label (lib/legacy-status-map.ts). */
  label: string;
  /** Live row count at this status. */
  count: number;
};

/** A volume leaderboard row (carrier or warehouse). */
export type VolumeRow = {
  /** Stable key + raw column value. */
  key: string;
  /** Display label (mapped where known, else raw). */
  label: string;
  /** Orders in the window (MTD). */
  count: number;
};

/**
 * A profit/margin drill-down row (per carrier / warehouse / sales-rep · MTD).
 * The same shape `reports-profit-types.ProfitGroupRow` uses, kept local so the
 * cockpit types module has no cross-dependency.
 */
export type CockpitProfitRow = {
  /** Stable React key + group key (raw column value). */
  key: string;
  /** Display label (mapped where known, else raw value). */
  label: string;
  /** Orders in this bucket (MTD). */
  count: number;
  /** Σ revenue (ftotalprice+ftransportprice+fpriceupdate · THB). */
  revenue: number;
  /** Σ profit (fprofittotal when non-zero, else ftotalprice−fdiscount−cost). */
  profit: number;
  /** profit / revenue × 100 (0 when revenue is 0). */
  margin_pct: number;
};

/**
 * SLA dwell-time summary for the cockpit (a condensed view of the full
 * /admin/reports/sla-cycle-time report). Derived from tb_forwarder
 * fdatestatus2..7 timestamps — ZERO new schema.
 */
export type CockpitSlaSummary = {
  /** End-to-end avg cycle time (days, 2 dp) over delivered orders MTD. */
  cycleAvgDays: number;
  /** End-to-end p90 cycle time (days, 2 dp). */
  cycleP90Days: number;
  /** The slowest stage "1".."6" by avg dwell (or "" if none in window). */
  slowestStage: string;
  /** Thai label of the slowest stage. */
  slowestStageLabel: string;
  /** That stage's avg dwell (days, 2 dp). */
  slowestAvgDays: number;
  /** Orders currently stuck past the threshold (whole platform · not MTD-bound). */
  stuckTotal: number;
  /** The stuck threshold (days) echoed for the caption. */
  stuckThresholdDays: number;
  /** True if the SLA sub-report failed (the cockpit degrades, never crashes). */
  failed: boolean;
};

/** The full cockpit payload. */
export type CockpitReport = {
  /** First day of the current month (ISO YYYY-MM-DD) — echoed for the caption. */
  monthStart: string;
  /** MTD forwarder revenue (Σ ftotalprice+ftransportprice+fpriceupdate). */
  mtdRevenue: number;
  /** MTD forwarder profit (Σ fprofittotal, else ftotalprice−fdiscount−cost). */
  mtdProfit: number;
  /** MTD forwarder order count (excl. fstatus=99). */
  mtdOrders: number;
  /** Orders-by-status funnel (current snapshot, fstatus 1..7). */
  funnel: FunnelStage[];
  /** Σ tb_wallet.wallettotal — total customer wallet liability held. */
  walletSystemTotal: number;
  /** Total outstanding AR (Σ from getArAgingReport). */
  arTotal: number;
  /** Outstanding AR order count. */
  arOrders: number;
  /** Never-contacted cold leads (tb_users userActive='' with a phone). */
  openLeads: number;
  /** Top carriers by MTD volume (fshipby). */
  topCarriers: VolumeRow[];
  /** Top China warehouses by MTD volume (fwarehousename). */
  topWarehouses: VolumeRow[];
  /** MTD profit/margin drill-down by carrier (fshipby), profit desc, top-N. */
  profitByCarrier: CockpitProfitRow[];
  /** MTD profit/margin drill-down by China warehouse (fwarehousename), top-N. */
  profitByWarehouse: CockpitProfitRow[];
  /**
   * MTD profit/margin drill-down by SALES REP (the customer's assigned rep via
   * tb_users.adminIDSale → tb_admin), profit desc, top-N. NEW dimension — the
   * profit-analytics report only groups by carrier/warehouse/mode.
   */
  profitBySalesRep: CockpitProfitRow[];
  /** Condensed SLA dwell-time summary (from tb_forwarder fdatestatus2..7). */
  sla: CockpitSlaSummary;
  /** MTD orders whose profit exceeds the soft ฿15k/ตู้ guidance (CEO §4 · advisory, never blocks). */
  marginOverCount: number;
  /** Σ profit of those over-guidance orders (THB). */
  marginOverProfit: number;
  /** The soft profit cap applied (THB · from lib/pricing/margin-advisory). */
  marginCapThb: number;
  /** True if the MTD pull hit the row cap (volume/MTD totals may understate). */
  capped: boolean;
};
