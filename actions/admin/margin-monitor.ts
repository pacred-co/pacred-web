"use server";

/**
 * actions/admin/margin-monitor.ts — Per-order profit/margin retrospective
 * report for CEO directive "profit-cap ≤ 15k/ตู้".
 *
 * Per CLAUDE.md PM section (CEO directives 2026-06-01):
 *   "pricing profit-cap ≤15k฿/ตู้ + sales quote-comparison tool"
 *
 * MVP scope: retrospective analytics over `tb_forwarder` — surfaces which
 * delivered orders fall into each margin bucket so accounting + CEO can:
 *   - Spot over-cap orders (>฿15k profit · likely undercharged customer
 *     should have got a better deal · OR over-charged unintentionally)
 *   - Spot under-cap losses (negative margin · costs > price · bug or
 *     bad rate sheet)
 *   - See per-rep average margin (rep attribution via tb_sales_report)
 *
 * Forward-looking quote-comparison tool is a separate next surface
 * (CEO's main ask · needs carrier-pricing engine + customer selector).
 *
 * Per AGENTS.md §0c — every Supabase query destructures `error`.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export type MarginRange = {
  dateFrom: string;
  dateTo:   string;
};

export type MarginRow = {
  fid:                 number;
  fdate:               string | null;
  userid:              string | null;
  fTrackingChn:        string | null;
  fStatus:             string | null;
  ftotalprice:         number;   // sale price (revenue)
  fcosttotalprice:     number;   // cost
  fdiscount:           number;
  margin:              number;   // ftotalprice − fcosttotalprice − fdiscount
  bucket:              MarginBucket;
};

export type MarginBucket = "negative" | "0-5k" | "5-10k" | "10-15k" | "15k+";

// NOT exported — a "use server" file may only export async functions (Next-16:
// "invalid-use-server-value"). MARGIN_BUCKETS is a value (array), used only
// internally by getMarginReport below, so keep it module-private. Exporting it
// crashed the page at runtime (blank screen) though tsc passed.
const MARGIN_BUCKETS: MarginBucket[] = ["negative", "0-5k", "5-10k", "10-15k", "15k+"];

export type MarginBucketStats = {
  bucket:    MarginBucket;
  count:     number;
  sumMargin: number;
};

export type MarginRepRow = {
  adminID:        string;
  count:          number;
  totalMargin:    number;
  avgMargin:      number;
  overCapCount:   number;        // count of rows with margin > 15k
};

export type MarginReport = {
  asOf:           string;
  totalRows:      number;
  totalMargin:    number;
  avgMargin:      number;
  buckets:        MarginBucketStats[];
  topOverCap:     MarginRow[];    // 20 highest-margin orders (≥ 15k)
  topNegative:    MarginRow[];    // 20 worst-loss orders
  byRep:          MarginRepRow[]; // top 20 reps by total margin (with over-cap flag)
};

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function bucketForMargin(margin: number): MarginBucket {
  if (margin < 0)      return "negative";
  if (margin < 5000)   return "0-5k";
  if (margin < 10_000) return "5-10k";
  if (margin <= 15_000) return "10-15k";
  return "15k+";
}

// ────────────────────────────────────────────────────────────────────────
// 1. Main entry
// ────────────────────────────────────────────────────────────────────────

export async function getMarginReport(range: MarginRange): Promise<MarginReport> {
  const admin = createAdminClient();
  const gte = `${range.dateFrom}T00:00:00`;
  const lte = `${range.dateTo}T23:59:59`;
  const asOf = new Date().toISOString();

  // ── 1. Load delivered cohort with margin signal ──
  // fstatus='7' = ส่งสำเร็จ (the only state with realised margin).
  type RawFwd = {
    id: number;
    fdate: string | null;
    userid: string | null;
    ftrackingchn: string | null;
    fstatus: string | null;
    ftotalprice: number | string | null;
    fcosttotalprice: number | string | null;
    fdiscount: number | string | null;
  };
  const { data: fwdRaw, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("id, fdate, userid, ftrackingchn, fstatus, ftotalprice, fcosttotalprice, fdiscount")
    .eq("fstatus", "7")
    .gte("fdate", gte)
    .lte("fdate", lte)
    .limit(20_000);
  if (fwdErr) {
    console.error("[margin-monitor tb_forwarder] failed", { code: fwdErr.code, message: fwdErr.message });
  }
  const fwd = (fwdRaw ?? []) as RawFwd[];

  // ── 2. Enrich rows ──
  const rows: MarginRow[] = fwd.map((r) => {
    const ftotalprice     = Number(r.ftotalprice ?? 0);
    const fcosttotalprice = Number(r.fcosttotalprice ?? 0);
    const fdiscount       = Number(r.fdiscount ?? 0);
    const margin          = ftotalprice - fcosttotalprice - fdiscount;
    return {
      fid:             r.id,
      fdate:           r.fdate,
      userid:          r.userid,
      fTrackingChn:    r.ftrackingchn,
      fStatus:         r.fstatus,
      ftotalprice,
      fcosttotalprice,
      fdiscount,
      margin,
      bucket:          bucketForMargin(margin),
    };
  });

  // ── 3. Bucket rollup ──
  const bucketAgg: Record<MarginBucket, { count: number; sum: number }> = {
    "negative": { count: 0, sum: 0 },
    "0-5k":     { count: 0, sum: 0 },
    "5-10k":    { count: 0, sum: 0 },
    "10-15k":   { count: 0, sum: 0 },
    "15k+":     { count: 0, sum: 0 },
  };
  let totalMargin = 0;
  for (const r of rows) {
    bucketAgg[r.bucket].count += 1;
    bucketAgg[r.bucket].sum   += r.margin;
    totalMargin += r.margin;
  }
  const buckets: MarginBucketStats[] = MARGIN_BUCKETS.map((b) => ({
    bucket:    b,
    count:     bucketAgg[b].count,
    sumMargin: Math.round(bucketAgg[b].sum * 100) / 100,
  }));

  // ── 4. Top over-cap + worst-loss extracts ──
  const topOverCap = [...rows]
    .filter((r) => r.margin > 15_000)
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 20);

  const topNegative = [...rows]
    .filter((r) => r.margin < 0)
    .sort((a, b) => a.margin - b.margin)
    .slice(0, 20);

  // ── 5. Per-rep rollup ──
  // Use tb_sales_report.sradminidsale for attribution (when present).
  type SrRow = { fid: number; sradminidsale: string };
  const fIds = rows.map((r) => r.fid);
  const srByFid = new Map<number, string>();
  if (fIds.length > 0) {
    const { data: srRaw, error: srErr } = await admin
      .from("tb_sales_report")
      .select("fid, sradminidsale")
      .in("fid", fIds);
    if (srErr) {
      console.error("[margin-monitor tb_sales_report] failed", { code: srErr.code, message: srErr.message });
    }
    for (const r of ((srRaw ?? []) as unknown as SrRow[])) {
      if (!srByFid.has(r.fid)) srByFid.set(r.fid, r.sradminidsale);
    }
  }

  const repAgg = new Map<string, { count: number; sum: number; overCap: number }>();
  for (const r of rows) {
    const repID = srByFid.get(r.fid);
    if (!repID) continue;
    const cur = repAgg.get(repID) ?? { count: 0, sum: 0, overCap: 0 };
    cur.count += 1;
    cur.sum   += r.margin;
    if (r.margin > 15_000) cur.overCap += 1;
    repAgg.set(repID, cur);
  }

  const byRep: MarginRepRow[] = Array.from(repAgg.entries())
    .map(([adminID, agg]) => ({
      adminID,
      count:        agg.count,
      totalMargin:  Math.round(agg.sum * 100) / 100,
      avgMargin:    Math.round((agg.sum / Math.max(1, agg.count)) * 100) / 100,
      overCapCount: agg.overCap,
    }))
    .sort((a, b) => b.totalMargin - a.totalMargin)
    .slice(0, 20);

  return {
    asOf,
    totalRows:   rows.length,
    totalMargin: Math.round(totalMargin * 100) / 100,
    avgMargin:   Math.round((totalMargin / Math.max(1, rows.length)) * 100) / 100,
    buckets,
    topOverCap,
    topNegative,
    byRep,
  };
}
