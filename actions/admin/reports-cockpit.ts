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
import { requireAdmin } from "@/lib/auth/require-admin";
import { logger } from "@/lib/logger";
import { LEGACY_FORWARDER_STATUS, type LegacyForwarderCode } from "@/lib/legacy-status-map";
import {
  SHIP_BY_LABEL,
  WAREHOUSE_NAME_LABEL,
} from "./reports-profit-types";
import { getArAgingReport } from "./reports-ar";
import { getForwarderSlaReport } from "./reports-sla";
import { MARGIN_CAP_PER_CONTAINER_THB } from "@/lib/pricing/margin-advisory";
import { marginPct, forwarderRowProfit } from "./reports-profit-types";
import type {
  CockpitReport,
  CockpitProfitRow,
  FunnelStage,
  VolumeRow,
} from "./reports-cockpit-types";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

const LIMIT = 20_000;
const TOP_VOLUME_N = 6;
const TOP_PROFIT_N = 8;

/**
 * SLA dwell "from-stage" label (the stage an order SAT at during a transition).
 * Stages 1..6 mirror reports-sla.ts STAGE_TRANSITIONS + lib/legacy-status-map.
 */
const SLA_STAGE_LABEL: Record<string, string> = {
  "1": "รอเข้าโกดังจีน",
  "2": "ถึงโกดังจีนแล้ว",
  "3": "กำลังส่งมาไทย",
  "4": "ถึงไทยแล้ว",
  "5": "รอชำระเงิน",
  "6": "เตรียมส่ง",
};

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
  userid: string | null;
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

/** A profit accumulator (revenue + profit + count) per drill-down bucket. */
type ProfitAcc = { count: number; revenue: number; profit: number };
function emptyProfitAcc(): ProfitAcc {
  return { count: 0, revenue: 0, profit: 0 };
}

/** Finalize a profit bucket map → sorted CockpitProfitRow[] (profit desc), top-N. */
function topProfit(
  map: Map<string, ProfitAcc>,
  labelFor: (k: string) => string,
  n: number,
): CockpitProfitRow[] {
  return Array.from(map.entries())
    .map(([key, a]) => ({
      key,
      label: labelFor(key),
      count: a.count,
      revenue: a.revenue,
      profit: a.profit,
      margin_pct: marginPct(a.profit, a.revenue),
    }))
    .sort((x, y) => y.profit - x.profit)
    .slice(0, n);
}

export async function getCockpitReport(): Promise<Result<CockpitReport>> {
  await requireAdmin(["super", "accounting"]);
  try {
    const admin = createAdminClient();
    const now = new Date();
    const monthStart = monthStartIso(now);
    const monthStartTs = new Date(`${monthStart}T00:00:00Z`).toISOString();

    // ── 1) MTD forwarder pull (revenue/profit/volume — JS aggregate) ───────
    const mtdQ = admin
      .from("tb_forwarder")
      .select(
        "fstatus, ftotalprice, ftransportprice, fpriceupdate, fcosttotalprice, fdiscount, fprofittotal, fshipby, fwarehousename, userid",
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

    // Fan-out everything (incl. the AR + SLA sub-reports) in parallel.
    // SLA keys off fdate within [monthStart, today] so the dwell summary
    // reflects the same MTD window as the rest of the cockpit.
    const slaRange = { from: monthStart, to: now.toISOString().slice(0, 10) };
    const [
      { data: mtdData, error: mtdErr },
      funnelResults,
      { count: leadCount, error: leadErr },
      { data: walletData, error: walletErr },
      arRes,
      slaRes,
    ] = await Promise.all([
      mtdQ,
      Promise.all(funnelQs),
      leadsQ,
      walletQ,
      getArAgingReport(0), // 0 = totals only, skip the debtor name-resolve
      getForwarderSlaReport(slaRange),
    ]);

    // MTD revenue/profit/volume + carrier/warehouse leaderboards.
    let mtdRevenue = 0;
    let mtdProfit = 0;
    let mtdOrders = 0;
    let marginOverCount = 0;   // CEO §4 — MTD orders over the soft ฿15k/ตู้ guidance (advisory)
    let marginOverProfit = 0;
    const byCarrier = new Map<string, number>();
    const byWarehouse = new Map<string, number>();
    // Profit drill-down buckets (revenue + profit per group · MTD).
    const profitCarrier = new Map<string, ProfitAcc>();
    const profitWarehouse = new Map<string, ProfitAcc>();
    const profitByUser = new Map<string, ProfitAcc>(); // userid → acc (rep resolved after)
    let capped = false;
    if (mtdErr) {
      logger.error("reports", "cockpit MTD forwarder query failed", mtdErr);
    } else {
      const rows = (mtdData ?? []) as MtdRow[];
      capped = rows.length >= LIMIT;
      for (const r of rows) {
        // revenue = ftotalprice ONLY — shared `forwarderRowProfit` derivation so
        // the cockpit margin % reconciles with the "ดูรายงานกำไรเต็มรูปแบบ" report it
        // links to. Adding ftransportprice/fpriceupdate here made the cockpit margin
        // systematically lower than the report → BI-trust mismatch. (audit SF-4)
        const { revenue, cost, profit } = forwarderRowProfit(r);
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

        // Profit drill-down accumulation (carrier / warehouse / per-user).
        for (const [map, key] of [
          [profitCarrier, carrierKey],
          [profitWarehouse, whKey],
        ] as [Map<string, ProfitAcc>, string][]) {
          const a = map.get(key) ?? emptyProfitAcc();
          a.count += 1; a.revenue += revenue; a.profit += profit;
          map.set(key, a);
        }
        const uid = (r.userid ?? "").trim();
        if (uid) {
          const a = profitByUser.get(uid) ?? emptyProfitAcc();
          a.count += 1; a.revenue += revenue; a.profit += profit;
          profitByUser.set(uid, a);
        }
      }
    }

    // ── Resolve per-USER profit → per-SALES-REP profit ────────────────────
    // tb_forwarder has no rep column; the rep is the CUSTOMER's assigned rep
    // (tb_users.adminIDSale), resolved to a name via tb_admin. Two light
    // lookups, both §0c-guarded; on failure the rep drill-down degrades to [].
    const profitBySalesRep: CockpitProfitRow[] = [];
    try {
      const userIds = Array.from(profitByUser.keys());
      if (userIds.length > 0) {
        // user → rep id
        const userRep = new Map<string, string>();
        const repIds = new Set<string>();
        // Chunk the .in() to stay well under PostgREST URL limits.
        for (let i = 0; i < userIds.length; i += 1000) {
          const chunk = userIds.slice(i, i + 1000);
          const { data: uRows, error: uErr } = await admin
            .from("tb_users")
            .select('"userID", "adminIDSale"')
            .in("userID", chunk);
          if (uErr) {
            logger.error("reports", "cockpit rep-resolve tb_users failed", uErr);
            continue;
          }
          for (const u of (uRows ?? []) as { userID: string; adminIDSale: string | null }[]) {
            const rep = (u.adminIDSale ?? "").trim();
            if (rep) { userRep.set(u.userID, rep); repIds.add(rep); }
          }
        }

        // rep id → name
        const repName = new Map<string, string>();
        const repIdList = Array.from(repIds);
        if (repIdList.length > 0) {
          const { data: aRows, error: aErr } = await admin
            .from("tb_admin")
            .select('"adminID", "adminName", "adminLastName", "adminNickname"')
            .in("adminID", repIdList);
          if (aErr) {
            logger.error("reports", "cockpit rep-resolve tb_admin failed", aErr);
          }
          for (const a of (aRows ?? []) as {
            adminID: string; adminName: string | null; adminLastName: string | null; adminNickname: string | null;
          }[]) {
            const name = a.adminNickname?.trim()
              || [a.adminName, a.adminLastName].filter(Boolean).join(" ").trim()
              || a.adminID;
            repName.set(a.adminID, name);
          }
        }

        // Fold per-user → per-rep.
        const profitRep = new Map<string, ProfitAcc>();
        for (const [uid, acc] of profitByUser) {
          const rep = userRep.get(uid) ?? "(ไม่มีเซลล์)";
          const r = profitRep.get(rep) ?? emptyProfitAcc();
          r.count += acc.count; r.revenue += acc.revenue; r.profit += acc.profit;
          profitRep.set(rep, r);
        }
        profitBySalesRep.push(
          ...topProfit(
            profitRep,
            (k) => (k === "(ไม่มีเซลล์)" ? k : repName.get(k) ?? `รหัส ${k}`),
            TOP_PROFIT_N,
          ),
        );
      }
    } catch (e) {
      logger.error("reports", "cockpit rep-profit resolve threw", e instanceof Error ? e : new Error(String(e)));
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

    // SLA — condensed dwell summary (the full report lives at /sla-cycle-time).
    if (!slaRes.ok) logger.error("reports", "cockpit SLA sub-report failed", new Error(slaRes.error));
    const sla = slaRes.ok
      ? {
          cycleAvgDays: slaRes.data.cycleAvgDays,
          cycleP90Days: slaRes.data.cycleP90Days,
          slowestStage: slaRes.data.slowestStage,
          slowestStageLabel: SLA_STAGE_LABEL[slaRes.data.slowestStage] ?? slaRes.data.slowestStage,
          slowestAvgDays: slaRes.data.slowestAvgDays,
          stuckTotal: slaRes.data.stuckTotal,
          stuckThresholdDays: slaRes.data.stuckThresholdDays,
          failed: false,
        }
      : {
          cycleAvgDays: 0, cycleP90Days: 0, slowestStage: "", slowestStageLabel: "",
          slowestAvgDays: 0, stuckTotal: 0, stuckThresholdDays: 7, failed: true,
        };

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
        profitByCarrier: topProfit(profitCarrier, (k) => SHIP_BY_LABEL[k] ?? (k === "(ไม่ระบุ)" ? k : `รหัส ${k}`), TOP_PROFIT_N),
        profitByWarehouse: topProfit(profitWarehouse, (k) => WAREHOUSE_NAME_LABEL[k] ?? k, TOP_PROFIT_N),
        profitBySalesRep,
        sla,
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
