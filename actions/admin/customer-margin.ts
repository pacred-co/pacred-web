"use server";

/**
 * actions/admin/customer-margin.ts — per-customer margin baseline tracker.
 *
 * Per CEO directive 2026-06-01 (CLAUDE.md PM section):
 *   "pricing profit-cap ≤15k฿/ตู้ + sales quote-comparison tool"
 *   + "ลูกค้าประจำควรได้ราคาดีกว่า cap"
 *
 * This is the CRM-activation half of Margin Monitor — per-customer signal
 * surfaced on /admin/customers/[id] so the sales rep can see at a glance
 * whether THIS customer has been historically over-charged (margin > 15k
 * cap) and should be quoted at a lower margin going forward.
 *
 * Read-only · best-effort · empty result is shown as "ยังไม่เคยมีตู้ส่งสำเร็จ"
 * rather than blowing up the customer page.
 *
 * Per AGENTS.md §0c — every Supabase query destructures `error`.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export type CustomerMarginBucket = "negative" | "0-5k" | "5-10k" | "10-15k" | "15k+";

export type CustomerMarginRecent = {
  fid:               number;
  fdate:             string | null;
  fTrackingChn:      string | null;
  fcabinetnumber:    string | null;
  ftotalprice:       number;
  fcosttotalprice:   number;
  fdiscount:         number;
  margin:            number;
  bucket:            CustomerMarginBucket;
};

export type CustomerMarginSummary = {
  userid:           string;
  totalDelivered:   number;     // count ของตู้ที่ส่งสำเร็จ (fstatus=7)
  totalRevenue:     number;     // sum ftotalprice
  totalMargin:      number;     // sum (price - cost - discount)
  avgMargin:        number;     // mean margin per ตู้
  overCapCount:     number;     // margin > 15k count
  overCapSumMargin: number;     // sum of over-cap margins
  negativeCount:    number;     // margin < 0 count
  negativeSumMargin: number;    // sum of negative margins (= total loss)
  recent:           CustomerMarginRecent[]; // last 10 delivered ตู้
};

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function bucketForMargin(margin: number): CustomerMarginBucket {
  if (margin < 0)       return "negative";
  if (margin < 5000)    return "0-5k";
  if (margin < 10_000)  return "5-10k";
  if (margin <= 15_000) return "10-15k";
  return "15k+";
}

// ────────────────────────────────────────────────────────────────────────
// 1. Main entry
// ────────────────────────────────────────────────────────────────────────

export async function getCustomerMarginSummary(userid: string): Promise<CustomerMarginSummary> {
  const admin = createAdminClient();

  type RawFwd = {
    id: number;
    fdate: string | null;
    ftrackingchn: string | null;
    fcabinetnumber: string | null;
    ftotalprice: number | string | null;
    fcosttotalprice: number | string | null;
    fdiscount: number | string | null;
  };

  // Pull delivered cohort (fstatus='7') for THIS customer · most-recent first.
  // Cap at 1000 — Pacred customers typically have 10-200 lifetime ตู้s; a
  // 1000-row cap is plenty + bounds the loader cost.
  const { data: fwdRaw, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("id, fdate, ftrackingchn, fcabinetnumber, ftotalprice, fcosttotalprice, fdiscount")
    .eq("userid", userid)
    .eq("fstatus", "7")
    .order("fdate", { ascending: false })
    .limit(1000);
  if (fwdErr) {
    console.error("[customer-margin] tb_forwarder query failed", {
      userid, code: fwdErr.code, message: fwdErr.message,
    });
  }
  const fwd = (fwdRaw ?? []) as RawFwd[];

  if (fwd.length === 0) {
    return {
      userid,
      totalDelivered: 0,
      totalRevenue: 0,
      totalMargin: 0,
      avgMargin: 0,
      overCapCount: 0,
      overCapSumMargin: 0,
      negativeCount: 0,
      negativeSumMargin: 0,
      recent: [],
    };
  }

  let totalRevenue = 0;
  let totalMargin = 0;
  let overCapCount = 0;
  let overCapSumMargin = 0;
  let negativeCount = 0;
  let negativeSumMargin = 0;

  const enriched: CustomerMarginRecent[] = fwd.map((r) => {
    const ftotalprice     = Number(r.ftotalprice ?? 0);
    const fcosttotalprice = Number(r.fcosttotalprice ?? 0);
    const fdiscount       = Number(r.fdiscount ?? 0);
    const margin          = ftotalprice - fcosttotalprice - fdiscount;
    totalRevenue += ftotalprice;
    totalMargin  += margin;
    if (margin > 15_000) {
      overCapCount += 1;
      overCapSumMargin += margin;
    }
    if (margin < 0) {
      negativeCount += 1;
      negativeSumMargin += margin;
    }
    return {
      fid:             r.id,
      fdate:           r.fdate,
      fTrackingChn:    r.ftrackingchn,
      fcabinetnumber:  r.fcabinetnumber,
      ftotalprice,
      fcosttotalprice,
      fdiscount,
      margin,
      bucket:          bucketForMargin(margin),
    };
  });

  return {
    userid,
    totalDelivered:   fwd.length,
    totalRevenue:     Math.round(totalRevenue * 100) / 100,
    totalMargin:      Math.round(totalMargin * 100) / 100,
    avgMargin:        Math.round((totalMargin / Math.max(1, fwd.length)) * 100) / 100,
    overCapCount,
    overCapSumMargin: Math.round(overCapSumMargin * 100) / 100,
    negativeCount,
    negativeSumMargin: Math.round(negativeSumMargin * 100) / 100,
    recent:           enriched.slice(0, 10),
  };
}
