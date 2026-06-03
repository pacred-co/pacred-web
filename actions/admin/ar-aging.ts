"use server";

/**
 * actions/admin/ar-aging.ts — AR-aging (ลูกหนี้ค้างชำระ) reader for the
 * accounting cockpit (per `docs/briefs/poom-wave-2026-06-01.md` §4).
 *
 * What "outstanding" means in Pacred (the brief's classification):
 *   • tb_forwarder.fstatus='5'  → "รอชำระเงิน" · ~457 rows currently active
 *     (the brief's "cash in the door" — customers who got their goods
 *     priced + ready to invoice but haven't paid yet).
 *   • Issue date for ageing = `fdate` (forwarder creation date — when the
 *     customer first saw the line item). The legacy `fdatestatus5` column
 *     would be more accurate (when status entered "5"), but that may be
 *     null for older records; fall back to fdate as the safe default.
 *   • Amount outstanding = (ftotalprice − fdiscount) — the legacy invoice
 *     total before any wallet settlement.
 *
 * Aging buckets (Thai accounting standard):
 *   0-30   · 30-60 · 60-90 · 90+ days
 *
 * READ-ONLY · no writes anywhere. Brief §4: "Coordinate with เดฟ
 * (reads his tb_wallet_hs, no write collision)." This MVP doesn't even
 * read tb_wallet_hs — it uses tb_forwarder.fstatus alone as the
 * outstanding indicator (the legacy money-of-record signal). Reconciling
 * tb_receipt issued vs tb_wallet_hs paid as a more-precise "actual unpaid"
 * computation is a Phase-2 enhancement that requires the รวมหนี้ logic
 * (which receipts cover which forwarders) — defer until we have an audit
 * trail there.
 *
 * Rep attribution via `tb_sales_report.sradminidsale` (joined by fid).
 *
 * Per AGENTS.md §0c — every Supabase query destructures `error`.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export type AgingBucket = "0-30" | "30-60" | "60-90" | "90+";

// 2026-06-02 (Next-16 quirk · docs/learnings/nextjs-16-quirks.md):
// `"use server"` files reject ALL non-async-function value exports — even
// a typed const array crashes at module-evaluation time with "A 'use server'
// file can only export async functions, found object." Keep this array
// internal to the module; AgingBucket type covers the public surface.
const AGING_BUCKETS_INTERNAL: AgingBucket[] = ["0-30", "30-60", "60-90", "90+"];

export type AgingBucketStats = {
  bucket:        AgingBucket;
  count:         number;
  sumOutstanding:number;
};

export type CustomerAgingRow = {
  userid:        string;
  customerName:  string | null;
  count:         number;
  oldestDays:    number;
  sumOutstanding:number;
  byBucket:      Record<AgingBucket, number>;
};

export type RepAgingRow = {
  adminID:       string;
  repName:       string | null;
  count:         number;
  sumOutstanding:number;
};

export type AgingReport = {
  asOf:           string;                       // ISO date the report was computed
  totalRows:      number;
  totalSum:       number;
  buckets:        AgingBucketStats[];            // 4 entries (in order)
  topCustomers:   CustomerAgingRow[];            // top 20 by outstanding
  topReps:        RepAgingRow[];                 // top 10 by outstanding
};

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function bucketForDays(days: number): AgingBucket {
  if (days <= 30)  return "0-30";
  if (days <= 60)  return "30-60";
  if (days <= 90)  return "60-90";
  return "90+";
}

function daysBetween(asOfMs: number, isoDate: string | null | undefined): number {
  if (!isoDate) return 0;
  const t = new Date(isoDate).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((asOfMs - t) / 86_400_000));
}

// ────────────────────────────────────────────────────────────────────────
// 1. getForwarderAgingReport — the MVP cockpit
// ────────────────────────────────────────────────────────────────────────

/**
 * Compute aging buckets over `tb_forwarder.fstatus='5'` (the "รอชำระเงิน"
 * cohort the brief's master plan names as "cash in the door"). Returns a
 * single report object the cockpit page renders in one round-trip.
 *
 * Pure-read; no side effects.
 */
export async function getForwarderAgingReport(): Promise<AgingReport> {
  const admin = createAdminClient();
  const asOfMs = Date.now();
  const asOf = new Date(asOfMs).toISOString();

  // ── 1. Load the outstanding cohort ──
  //
  // Pull JUST the columns we need for ageing + per-row aggregation.
  // No row limit — at the brief's snapshot this is ~457 rows; we keep
  // a high safety cap in case the cohort grows.
  type ForwardRow = {
    id:            number;
    userid:        string | null;
    fdate:         string | null;
    fdatestatus5:  string | null;
    ftotalprice:   number | string | null;
    fdiscount:     number | string | null;
  };
  const { data: rowsRaw, error: rowsErr } = await admin
    .from("tb_forwarder")
    .select("id, userid, fdate, fdatestatus5, ftotalprice, fdiscount")
    .eq("fstatus", "5")
    .limit(5000);
  if (rowsErr) {
    console.error("[ar-aging tb_forwarder] failed", { code: rowsErr.code, message: rowsErr.message });
  }
  const rows = (rowsRaw ?? []) as unknown as ForwardRow[];

  // ── 2. Per-row aging (compute once, reuse for all rollups) ──
  type Enriched = {
    id:           number;
    userid:       string;
    sinceDays:    number;
    bucket:       AgingBucket;
    outstanding:  number;
  };
  const enriched: Enriched[] = rows.map((r) => {
    // Prefer fdatestatus5 (when status entered '5'). Fall back to fdate.
    const since = r.fdatestatus5 ?? r.fdate;
    const sinceDays = daysBetween(asOfMs, since);
    const total = Number(r.ftotalprice ?? 0);
    const disc  = Number(r.fdiscount   ?? 0);
    const outstanding = Math.max(0, total - disc);
    return {
      id:          r.id,
      userid:      r.userid ?? "",
      sinceDays,
      bucket:      bucketForDays(sinceDays),
      outstanding,
    };
  });

  // ── 3. Bucket aggregation ──
  const bucketAgg: Record<AgingBucket, { count: number; sum: number }> = {
    "0-30":  { count: 0, sum: 0 },
    "30-60": { count: 0, sum: 0 },
    "60-90": { count: 0, sum: 0 },
    "90+":   { count: 0, sum: 0 },
  };
  for (const e of enriched) {
    bucketAgg[e.bucket].count += 1;
    bucketAgg[e.bucket].sum   += e.outstanding;
  }
  const buckets: AgingBucketStats[] = AGING_BUCKETS_INTERNAL.map((b) => ({
    bucket:         b,
    count:          bucketAgg[b].count,
    sumOutstanding: Math.round(bucketAgg[b].sum * 100) / 100,
  }));

  // ── 4. Per-customer rollup ──
  const customerAgg = new Map<string, {
    count: number; sum: number; oldest: number;
    byBucket: Record<AgingBucket, number>;
  }>();
  for (const e of enriched) {
    if (!e.userid) continue;
    const cur = customerAgg.get(e.userid) ?? {
      count: 0, sum: 0, oldest: 0,
      byBucket: { "0-30": 0, "30-60": 0, "60-90": 0, "90+": 0 },
    };
    cur.count  += 1;
    cur.sum    += e.outstanding;
    cur.oldest  = Math.max(cur.oldest, e.sinceDays);
    cur.byBucket[e.bucket] += e.outstanding;
    customerAgg.set(e.userid, cur);
  }

  // Hydrate customer names — tb_users (camelCase per php-port-patterns.md).
  const userIds = Array.from(customerAgg.keys());
  type UserRow = { userID: string; userName: string | null; userLastName: string | null; userCompany: string | null };
  let userByID = new Map<string, UserRow>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userCompany")
      .in("userID", userIds);
    if (usersErr) {
      console.error("[ar-aging tb_users] failed", { code: usersErr.code, message: usersErr.message });
    }
    userByID = new Map(((usersRaw ?? []) as unknown as UserRow[]).map((u) => [u.userID, u]));
  }

  const topCustomers: CustomerAgingRow[] = Array.from(customerAgg.entries())
    .map(([userid, agg]) => {
      const u = userByID.get(userid);
      const name = u?.userCompany?.trim()
        || [u?.userName, u?.userLastName].filter(Boolean).join(" ").trim()
        || null;
      return {
        userid,
        customerName:   name,
        count:          agg.count,
        oldestDays:     agg.oldest,
        sumOutstanding: Math.round(agg.sum * 100) / 100,
        byBucket: {
          "0-30":  Math.round(agg.byBucket["0-30"]  * 100) / 100,
          "30-60": Math.round(agg.byBucket["30-60"] * 100) / 100,
          "60-90": Math.round(agg.byBucket["60-90"] * 100) / 100,
          "90+":   Math.round(agg.byBucket["90+"]   * 100) / 100,
        },
      };
    })
    .sort((a, b) => b.sumOutstanding - a.sumOutstanding)
    .slice(0, 20);

  // ── 5. Per-rep rollup (via tb_sales_report.sradminidsale) ──
  //
  // tb_sales_report links a forwarder fid → the rep who closed the sale.
  // It's the brief's canonical rep-attribution table (17,027 rows). We
  // join only over the OUTSTANDING fids — a single IN query is enough.
  const outstandingFIds = enriched.map((e) => e.id);
  type SrRow = { fid: number; sradminidsale: string };
  const srByFid = new Map<number, string>();
  if (outstandingFIds.length > 0) {
    const { data: srRaw, error: srErr } = await admin
      .from("tb_sales_report")
      .select("fid, sradminidsale")
      .in("fid", outstandingFIds);
    if (srErr) {
      console.error("[ar-aging tb_sales_report] failed", { code: srErr.code, message: srErr.message });
    }
    for (const r of ((srRaw ?? []) as unknown as SrRow[])) {
      // First-write-wins (a forwarder shouldn't appear in tb_sales_report
      // twice; if it does, take the earliest attribution).
      if (!srByFid.has(r.fid)) srByFid.set(r.fid, r.sradminidsale);
    }
  }

  const repAgg = new Map<string, { count: number; sum: number }>();
  for (const e of enriched) {
    const repID = srByFid.get(e.id);
    if (!repID) continue; // forwarder without rep attribution → skip
    const cur = repAgg.get(repID) ?? { count: 0, sum: 0 };
    cur.count += 1;
    cur.sum   += e.outstanding;
    repAgg.set(repID, cur);
  }

  // Hydrate rep names — tb_admin (camelCase per php-port-patterns.md).
  const repIDs = Array.from(repAgg.keys());
  type AdminRow = { adminID: string; adminFirstName: string | null; adminLastName: string | null };
  let adminByID = new Map<string, AdminRow>();
  if (repIDs.length > 0) {
    const { data: adminsRaw, error: adminsErr } = await admin
      .from("tb_admin")
      .select("adminID, adminFirstName, adminLastName")
      .in("adminID", repIDs);
    if (adminsErr) {
      console.error("[ar-aging tb_admin] failed", { code: adminsErr.code, message: adminsErr.message });
    }
    adminByID = new Map(((adminsRaw ?? []) as unknown as AdminRow[]).map((a) => [a.adminID, a]));
  }

  const topReps: RepAgingRow[] = Array.from(repAgg.entries())
    .map(([adminID, agg]) => {
      const a = adminByID.get(adminID);
      const name = a ? [a.adminFirstName, a.adminLastName].filter(Boolean).join(" ").trim() : "";
      return {
        adminID,
        repName:        name || null,
        count:          agg.count,
        sumOutstanding: Math.round(agg.sum * 100) / 100,
      };
    })
    .sort((a, b) => b.sumOutstanding - a.sumOutstanding)
    .slice(0, 10);

  const totalSum = enriched.reduce((s, e) => s + e.outstanding, 0);
  return {
    asOf,
    totalRows: enriched.length,
    totalSum:  Math.round(totalSum * 100) / 100,
    buckets,
    topCustomers,
    topReps,
  };
}
