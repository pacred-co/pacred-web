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
  /** MTD orders whose profit exceeds the soft ฿15k/ตู้ guidance (CEO §4 · advisory, never blocks). */
  marginOverCount: number;
  /** Σ profit of those over-guidance orders (THB). */
  marginOverProfit: number;
  /** The soft profit cap applied (THB · from lib/pricing/margin-advisory). */
  marginCapThb: number;
  /** True if the MTD pull hit the row cap (volume/MTD totals may understate). */
  capped: boolean;
};
