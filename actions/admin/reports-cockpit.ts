"use server";

/**
 * Wave C BI · Theme 1 — EXEC COCKPIT (แดชบอร์ดผู้บริหาร · at-a-glance).
 *
 * One server action that assembles the headline numbers a CEO/manager checks
 * daily — ALL from LIVE tb_* tables (NOT the rebuilt 0-row twins the big audit
 * flagged · docs/research/big-audit-2026-06-01/_MASTER-PLAN.md):
 *   • MTD revenue + profit + order count  ← tb_forwarder (fdate ≥ month-start)
 *   • orders-by-status funnel (current)   ← tb_forwarder head-counts per fstatus
 *   • wallet system total                 ← Σ tb_wallet.wallettotal
 *   • outstanding AR total + order count  ← reuse getArAgingReport (Theme 1)
 *   • open cold-leads                     ← tb_users userActive='' w/ phone
 *   • top carriers / warehouses by volume ← MTD tb_forwarder group-in-JS
 *
 * Read-only · createAdminClient · capped pull + JS aggregate for the MTD
 * breakdowns; cheap head-counts for the funnel/leads. Every query destructures
 * { data, error } (§0c); a failed sub-query degrades that ONE metric to 0 and
 * logs — the cockpit must never 500 (same posture as the reports hub).
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { LEGACY_FORWARDER_STATUS, type LegacyForwarderCode } from "@/lib/legacy-status-map";
import {
  SHIP_BY_LABEL,
  WAREHOUSE_NAME_LABEL,
} from "./reports-profit-types";
import { getArAgingReport } from "./reports-ar";
import { MARGIN_CAP_PER_CONTAINER_THB } from "@/lib/pricing/margin-advisory";
import type {
  CockpitReport,
  FunnelStage,
  VolumeRow,
} from "./reports-cockpit-types";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

const LIMIT = 20_000;
const TOP_VOLUME_N = 6;

/** First-of-month at UTC midnight as ISO YYYY-MM-DD (computed server-side). */
function monthStartIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

/** MTD forwarder row shape (lowercase cols · migration 0081). */
type MtdRow = {
  fstatus: string | null;
  ftotalprice: number | null;
  ftransportprice: number | null;
  fpriceupdate: number | null;
  fcosttotalprice: number | null;
  fdiscount: number | null;
  fprofittotal: number | null;
  fshipby: string | null;
  fwarehousename: string | null;
};

/** Finalize a volume bucket map → sorted VolumeRow[] (count desc), top-N. */
function topVolume(
  map: Map<string, number>,
  labelFor: (k: string) => string,
  n: number,
): VolumeRow[] {
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, label: labelFor(key), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export async function getCockpitReport(): Promise<Result<CockpitReport>> {
  try {
    const admin = createAdminClient();
    const now = new Date();
    const monthStart = monthStartIso(now);
    const monthStartTs = new Date(`${monthStart}T00:00:00Z`).toISOString();

    // ── 1) MTD forwarder pull (revenue/profit/volume — JS aggregate) ───────
    const mtdQ = admin
      .from("tb_forwarder")
      .select(
        "fstatus, ftotalprice, ftransportprice, fpriceupdate, fcosttotalprice, fdiscount, fprofittotal, fshipby, fwarehousename",
      )
      .gte("fdate", monthStartTs)
      .neq("fstatus", "99")
      .order("fdate", { ascending: false })
      .limit(LIMIT);

    // ── 2) Orders-by-status funnel — one cheap head-count per fstatus 1..7 ──
    const funnelCodes = ["1", "2", "3", "4", "5", "6", "7"] as const;
    const funnelQs = funnelCodes.map((code) =>
      admin
        .from("tb_forwarder")
        .select("id", { count: "exact", head: true })
        .eq("fstatus", code),
    );

    // ── 3) Open cold-leads (tb_users userActive='' with a phone) ───────────
    const leadsQ = admin
      .from("tb_users")
      .select("userID", { count: "exact", head: true })
      .eq("userActive", "")
      .neq("userTel", "");

    // ── 4) Wallet pull — Σ wallettotal (small table · capped) ──────────────
    const walletQ = admin.from("tb_wallet").select("wallettotal").limit(LIMIT);

    // Fan-out everything (incl. the AR report) in parallel.
    const [
      { data: mtdData, error: mtdErr },
      funnelResults,
      { count: leadCount, error: leadErr },
      { data: walletData, error: walletErr },
      arRes,
    ] = await Promise.all([
      mtdQ,
      Promise.all(funnelQs),
      leadsQ,
      walletQ,
      getArAgingReport(0), // 0 = totals only, skip the debtor name-resolve
    ]);

    // MTD revenue/profit/volume + carrier/warehouse leaderboards.
    let mtdRevenue = 0;
    let mtdProfit = 0;
    let mtdOrders = 0;
    let marginOverCount = 0;   // CEO §4 — MTD orders over the soft ฿15k/ตู้ guidance (advisory)
    let marginOverProfit = 0;
    const byCarrier = new Map<string, number>();
    const byWarehouse = new Map<string, number>();
    let capped = false;
    if (mtdErr) {
      logger.error("reports", "cockpit MTD forwarder query failed", mtdErr);
    } else {
      const rows = (mtdData ?? []) as MtdRow[];
      capped = rows.length >= LIMIT;
      for (const r of rows) {
        const ftotal = Number(r.ftotalprice ?? 0);
        const revenue = ftotal + Number(r.ftransportprice ?? 0) + Number(r.fpriceupdate ?? 0);
        const cost = Number(r.fcosttotalprice ?? 0);
        const pre = Number(r.fprofittotal ?? 0);
        const profit = pre !== 0 ? pre : ftotal - Number(r.fdiscount ?? 0) - cost;
        mtdRevenue += revenue;
        mtdProfit += profit;
        mtdOrders += 1;
        if (profit > MARGIN_CAP_PER_CONTAINER_THB) {
          marginOverCount += 1;
          marginOverProfit += profit;
        }
        const carrierKey = (r.fshipby ?? "").trim() || "(ไม่ระบุ)";
        const whKey = (r.fwarehousename ?? "").trim() || "(ไม่ระบุ)";
        byCarrier.set(carrierKey, (byCarrier.get(carrierKey) ?? 0) + 1);
        byWarehouse.set(whKey, (byWarehouse.get(whKey) ?? 0) + 1);
      }
    }

    // Funnel — degrade each missing count to 0.
    const funnel: FunnelStage[] = funnelCodes.map((code, i) => {
      const r = funnelResults[i];
      if (r.error) {
        logger.error("reports", `cockpit funnel count failed (fstatus=${code})`, r.error);
      }
      return {
        code,
        label: LEGACY_FORWARDER_STATUS[code as LegacyForwarderCode]?.thai ?? code,
        count: r.error ? 0 : r.count ?? 0,
      };
    });

    if (leadErr) logger.error("reports", "cockpit cold-leads count failed", leadErr);

    // Wallet system total — Σ wallettotal.
    let walletSystemTotal = 0;
    if (walletErr) {
      logger.error("reports", "cockpit wallet sum query failed", walletErr);
    } else {
      for (const w of (walletData ?? []) as { wallettotal: number | null }[]) {
        walletSystemTotal += Number(w.wallettotal ?? 0);
      }
    }

    // AR — reuse the aging report's totals (already §0c-safe internally).
    const arTotal = arRes.ok ? arRes.data.grandTotal : 0;
    const arOrders = arRes.ok ? arRes.data.grandCount : 0;
    if (!arRes.ok) logger.error("reports", "cockpit AR sub-report failed", new Error(arRes.error));

    return {
      ok: true,
      data: {
        monthStart,
        mtdRevenue,
        mtdProfit,
        mtdOrders,
        funnel,
        walletSystemTotal,
        arTotal,
        arOrders,
        openLeads: leadErr ? 0 : leadCount ?? 0,
        topCarriers: topVolume(byCarrier, (k) => SHIP_BY_LABEL[k] ?? (k === "(ไม่ระบุ)" ? k : `รหัส ${k}`), TOP_VOLUME_N),
        topWarehouses: topVolume(byWarehouse, (k) => WAREHOUSE_NAME_LABEL[k] ?? k, TOP_VOLUME_N),
        marginOverCount,
        marginOverProfit,
        marginCapThb: MARGIN_CAP_PER_CONTAINER_THB,
        capped,
      },
    };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "cockpit threw", err);
    return { ok: false, error: err.message };
  }
}
