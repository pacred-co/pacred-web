"use server";

/**
 * Wave C BI — Forwarder PROFIT / MARGIN ANALYTICS (the 10× value · Theme 1).
 *
 * A NEW aggregated analytics report (distinct from the per-order P&L list in
 * `actions/admin/reports.ts` → getForwarderProfitReport). This one mines the
 * 47k-row × 114-col `tb_forwarder` dataset (cluster-doc §5 U-1) to surface
 * profit/cost/margin grouped by:
 *   • carrier        (fshipby)
 *   • China warehouse(fwarehousename — 1..8)
 *   • transport mode (ftransporttype — 1รถ/2เรือ/3แอร์)
 *   • overall        (summary totals)
 *
 * PostgREST cannot GROUP BY, so — like reports-monitoring.ts + forwarder-volume
 * page — we pull a capped slice (LIMIT 20000) keyed on fdate within the range,
 * then aggregate in JS. Every supabase query destructures `{ data, error }`
 * (AGENTS.md §0c); on error we console.error + return the error.
 *
 * Money formulae (faithful to report-forwarder-profit.php / reports.ts):
 *   revenue = ftotalprice
 *   cost    = fcosttotalprice
 *   profit  = fprofittotal  (when non-zero — admin's after-discount edits)
 *             else  ftotalprice − fdiscount − fcosttotalprice
 *   margin% = profit / revenue × 100
 *
 * NB columns (verified migration 0081, all lowercase): fshipby, fwarehousename,
 * ftransporttype, ftotalprice, fcosttotalprice, fdiscount, fprofittotal,
 * fdate, fstatus. (See cluster doc 02-cargo-forwarder.md §1.)
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  type DateRange,
  dayStartIso,
  dayEndIso,
} from "@/lib/admin/reports/types";
import {
  type ForwarderProfitAnalytics,
  type ProfitGroupRow,
  type ProfitSummary,
  WAREHOUSE_NAME_LABEL,
  TRANSPORT_TYPE_LABEL,
  SHIP_BY_LABEL,
  marginPct,
} from "./reports-profit-types";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

// Match the cap used by reports-monitoring.ts + the forwarder-volume page.
const LIMIT = 20_000;

/** Raw shape pulled from tb_forwarder (lowercase cols, migration 0081). */
type FwRaw = {
  fshipby: string | null;
  fwarehousename: string | null;
  ftransporttype: string | null;
  ftotalprice: number | null;
  fcosttotalprice: number | null;
  fdiscount: number | null;
  fprofittotal: number | null;
};

/** Mutable accumulator while bucketing. */
type Acc = { count: number; revenue: number; cost: number; profit: number };

function emptyAcc(): Acc {
  return { count: 0, revenue: 0, cost: 0, profit: 0 };
}

/** Per-row profit (precomputed fprofittotal wins, else compute). */
function rowProfit(r: FwRaw): { revenue: number; cost: number; profit: number } {
  const revenue = Number(r.ftotalprice ?? 0);
  const cost = Number(r.fcosttotalprice ?? 0);
  const discount = Number(r.fdiscount ?? 0);
  const pre = Number(r.fprofittotal ?? 0);
  const profit = pre !== 0 ? pre : revenue - discount - cost;
  return { revenue, cost, profit };
}

/** Finalize a bucket map into sorted ProfitGroupRow[] (by profit desc). */
function finalize(
  map: Map<string, Acc>,
  labelFor: (key: string) => string,
): ProfitGroupRow[] {
  return Array.from(map.entries())
    .map(([key, a]) => ({
      key,
      label: labelFor(key),
      count: a.count,
      revenue: a.revenue,
      cost: a.cost,
      profit: a.profit,
      margin_pct: marginPct(a.profit, a.revenue),
    }))
    .sort((x, y) => y.profit - x.profit);
}

/**
 * Aggregate `tb_forwarder` profit/cost/margin over a date range, grouped by
 * carrier / warehouse / transport mode + an overall summary.
 *
 * Excludes fstatus='99' (cancelled/special — matches the forwarder-volume
 * report). Keys off `fdate` (creation), the legacy report's default column.
 */
export async function getForwarderProfitAnalytics(
  range: DateRange,
): Promise<Result<ForwarderProfitAnalytics>> {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("tb_forwarder")
      .select(
        "fshipby, fwarehousename, ftransporttype, ftotalprice, fcosttotalprice, fdiscount, fprofittotal",
      )
      .gte("fdate", dayStartIso(range.from))
      .lte("fdate", dayEndIso(range.to))
      .neq("fstatus", "99")
      .order("fdate", { ascending: false })
      .limit(LIMIT);

    if (error) {
      logger.error("reports", "forwarder-profit-analytics tb_forwarder query failed", error);
      return { ok: false, error: error.message };
    }

    const rows = (data ?? []) as FwRaw[];

    const byCarrier = new Map<string, Acc>();
    const byWarehouse = new Map<string, Acc>();
    const byMode = new Map<string, Acc>();
    const total: Acc = emptyAcc();
    let withCost = 0;

    for (const r of rows) {
      const { revenue, cost, profit } = rowProfit(r);

      total.count += 1;
      total.revenue += revenue;
      total.cost += cost;
      total.profit += profit;
      if (cost > 0) withCost += 1;

      const carrierKey = (r.fshipby ?? "").trim() || "(ไม่ระบุ)";
      const warehouseKey = (r.fwarehousename ?? "").trim() || "(ไม่ระบุ)";
      const modeKey = (r.ftransporttype ?? "").trim() || "(ไม่ระบุ)";

      for (const [map, key] of [
        [byCarrier, carrierKey],
        [byWarehouse, warehouseKey],
        [byMode, modeKey],
      ] as [Map<string, Acc>, string][]) {
        const a = map.get(key) ?? emptyAcc();
        a.count += 1;
        a.revenue += revenue;
        a.cost += cost;
        a.profit += profit;
        map.set(key, a);
      }
    }

    const summary: ProfitSummary = {
      order_count: total.count,
      total_revenue: total.revenue,
      total_cost: total.cost,
      total_profit: total.profit,
      margin_pct: marginPct(total.profit, total.revenue),
      with_cost_count: withCost,
    };

    return {
      ok: true,
      data: {
        summary,
        byCarrier: finalize(byCarrier, (k) => SHIP_BY_LABEL[k] ?? (k === "(ไม่ระบุ)" ? k : `รหัส ${k}`)),
        byWarehouse: finalize(byWarehouse, (k) => WAREHOUSE_NAME_LABEL[k] ?? k),
        byMode: finalize(byMode, (k) => TRANSPORT_TYPE_LABEL[k] ?? k),
      },
    };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "forwarder-profit-analytics threw", err);
    return { ok: false, error: err.message };
  }
}

/**
 * Summary-totals only (cheap header card / KPI consumers). Re-runs the same
 * capped pull and returns just the {@link ProfitSummary}. Kept separate so a
 * caller that only needs the headline numbers doesn't build the breakdowns.
 */
export async function getForwarderProfitSummary(
  range: DateRange,
): Promise<Result<ProfitSummary>> {
  const res = await getForwarderProfitAnalytics(range);
  if (!res.ok) return res;
  return { ok: true, data: res.data.summary };
}
