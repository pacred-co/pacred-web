"use server";

/**
 * actions/admin/forwarder-tran-th.ts — Read-only reader for the legacy
 * TH-transport grouping flow (per `docs/briefs/poom-wave-2026-06-01.md` §6).
 *
 * Purpose: legacy `forwarder-action.php` lets admin select N delivered
 * forwarders + bundle them into one TH-transport batch (ใบจัดส่งในไทย —
 * "a single truck delivers these to customers"). Result tables:
 *
 *   • tb_forwarder_tran_th_h  (296 batches) — header: id · date · adminidcreate
 *   • tb_forwarder_tran_th_sub (643 items)  — link: id · ftthhid (→header) ·
 *                                              fid (→tb_forwarder.id)
 *
 * Brief §6: "No Pacred writer. Customer-side display exists at
 * `(protected)/service-import/[fNo]/page.tsx`; admin has nothing."
 *
 * MVP scope here = READ-ONLY (list + detail) — surface the 296 historical
 * batches + the 643 included forwarders so accounting/dispatch staff can
 * see what's already been bundled. The CREATE-BATCH writer is intentionally
 * deferred to a separate sitting — though money-neutral (no debit), it
 * needs a multi-row selector UI + dedup-guard (a forwarder can be in only
 * one TH-transport batch).
 *
 * Per AGENTS.md §0c: every Supabase query destructures `error`.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export type TranThHeaderRow = {
  id:              number;
  date:            string | null;
  adminidcreate:   string;
  itemCount:       number;
};

export type TranThListResult = {
  rows:        TranThHeaderRow[];
  totalCount:  number;
  totalItems:  number;
};

export type TranThItemRow = {
  id:              number;
  fid:             number;
  forwarder: {
    fid:                  string | null;   // legacy doc id
    fdetail:              string | null;
    ftrackingchn:         string | null;
    ftrackingth:          string | null;
    faddressname:         string | null;
    faddresslastname:     string | null;
    faddressprovince:     string | null;
    faddresstel:          string | null;
    fstatus:              string | null;
    fdate:                string | null;
    famount:              number;
    fweight:              number;
    fvolume:              number;
  } | null;
};

export type TranThDetail = {
  header: TranThHeaderRow;
  items:  TranThItemRow[];
  totals: {
    itemCount:    number;
    totalWeight:  number;
    totalVolume:  number;
    totalBoxes:   number;
  };
};

// ────────────────────────────────────────────────────────────────────────
// 1. LIST
// ────────────────────────────────────────────────────────────────────────

export async function getTranThList(opts: {
  dateFrom?: string;
  dateTo?:   string;
  adminID?:  string;
  limit?:    number;
}): Promise<TranThListResult> {
  const admin = createAdminClient();

  // ── Headers ──
  let q = admin
    .from("tb_forwarder_tran_th_h")
    .select("id, date, adminidcreate")
    .order("date", { ascending: false })
    .limit(opts.limit ?? 300);

  if (opts.dateFrom) q = q.gte("date", `${opts.dateFrom}T00:00:00`);
  if (opts.dateTo)   q = q.lte("date", `${opts.dateTo}T23:59:59`);
  if (opts.adminID)  q = q.eq("adminidcreate", opts.adminID);

  const { data: headRaw, error: headErr } = await q;
  if (headErr) {
    console.error("[tb_forwarder_tran_th_h list] failed", { code: headErr.code, message: headErr.message });
  }
  type HRow = { id: number; date: string | null; adminidcreate: string };
  const headers = (headRaw ?? []) as unknown as HRow[];

  // ── Item counts per header — batched lookup ──
  const ids = headers.map((h) => h.id);
  type SubCountRow = { ftthhid: number };
  const itemsPerHeader = new Map<number, number>();
  let totalItems = 0;
  if (ids.length > 0) {
    const { data: subRaw, error: subErr } = await admin
      .from("tb_forwarder_tran_th_sub")
      .select("ftthhid")
      .in("ftthhid", ids);
    if (subErr) {
      console.error("[tb_forwarder_tran_th_sub count] failed", { code: subErr.code, message: subErr.message });
    }
    for (const r of ((subRaw ?? []) as unknown as SubCountRow[])) {
      itemsPerHeader.set(r.ftthhid, (itemsPerHeader.get(r.ftthhid) ?? 0) + 1);
      totalItems += 1;
    }
  }

  const rows: TranThHeaderRow[] = headers.map((h) => ({
    id:             h.id,
    date:           h.date,
    adminidcreate:  h.adminidcreate,
    itemCount:      itemsPerHeader.get(h.id) ?? 0,
  }));

  // ── Total count (separate query for accurate "ทั้งหมด" tally) ──
  const { count: totalCount, error: countErr } = await admin
    .from("tb_forwarder_tran_th_h")
    .select("id", { count: "exact", head: true });
  if (countErr) {
    console.error("[tb_forwarder_tran_th_h count] failed", { code: countErr.code, message: countErr.message });
  }

  return {
    rows,
    totalCount: totalCount ?? rows.length,
    totalItems,
  };
}

// ────────────────────────────────────────────────────────────────────────
// 2. DETAIL
// ────────────────────────────────────────────────────────────────────────

export async function getTranThDetail(id: number): Promise<TranThDetail | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const admin = createAdminClient();

  // ── Header ──
  const { data: headRaw, error: headErr } = await admin
    .from("tb_forwarder_tran_th_h")
    .select("id, date, adminidcreate")
    .eq("id", id)
    .maybeSingle();
  if (headErr) {
    console.error("[tb_forwarder_tran_th_h detail] failed", { code: headErr.code, message: headErr.message });
    return null;
  }
  if (!headRaw) return null;
  type HRow = { id: number; date: string | null; adminidcreate: string };
  const h = headRaw as HRow;

  // ── Sub rows → fids ──
  const { data: subRaw, error: subErr } = await admin
    .from("tb_forwarder_tran_th_sub")
    .select("id, fid")
    .eq("ftthhid", id);
  if (subErr) {
    console.error("[tb_forwarder_tran_th_sub detail] failed", { code: subErr.code, message: subErr.message });
  }
  type SubRow = { id: number; fid: number };
  const subs = (subRaw ?? []) as unknown as SubRow[];
  const fIds = Array.from(new Set(subs.map((s) => s.fid)));

  // ── Hydrate tb_forwarder for shipment metadata ──
  type FwdRow = {
    id: number;
    fid: string | null;
    fdetail: string | null;
    ftrackingchn: string | null;
    ftrackingth: string | null;
    faddressname: string | null;
    faddresslastname: string | null;
    faddressprovince: string | null;
    faddresstel: string | null;
    fstatus: string | null;
    fdate: string | null;
    famount: number | string | null;
    fweight: number | string | null;
    fvolume: number | string | null;
  };
  let fwdById = new Map<number, FwdRow>();
  if (fIds.length > 0) {
    const { data: fwdRaw, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select(
        "id, fid, fdetail, ftrackingchn, ftrackingth, faddressname, faddresslastname, " +
        "faddressprovince, faddresstel, fstatus, fdate, famount, fweight, fvolume",
      )
      .in("id", fIds);
    if (fwdErr) {
      console.error("[tb_forwarder tran-th batch] failed", { code: fwdErr.code, message: fwdErr.message });
    }
    fwdById = new Map(((fwdRaw ?? []) as unknown as FwdRow[]).map((f) => [f.id, f]));
  }

  const items: TranThItemRow[] = subs.map((s) => {
    const f = fwdById.get(s.fid);
    return {
      id:  s.id,
      fid: s.fid,
      forwarder: f
        ? {
            fid:               f.fid,
            fdetail:           f.fdetail,
            ftrackingchn:      f.ftrackingchn,
            ftrackingth:       f.ftrackingth,
            faddressname:      f.faddressname,
            faddresslastname:  f.faddresslastname,
            faddressprovince:  f.faddressprovince,
            faddresstel:       f.faddresstel,
            fstatus:           f.fstatus,
            fdate:             f.fdate,
            famount:           Number(f.famount ?? 0),
            fweight:           Number(f.fweight ?? 0),
            fvolume:           Number(f.fvolume ?? 0),
          }
        : null,
    };
  });

  // Totals
  let totalWeight = 0;
  let totalVolume = 0;
  let totalBoxes  = 0;
  for (const it of items) {
    if (!it.forwarder) continue;
    totalWeight += it.forwarder.fweight;
    totalVolume += it.forwarder.fvolume;
    totalBoxes  += it.forwarder.famount;
  }

  return {
    header: {
      id:             h.id,
      date:           h.date,
      adminidcreate:  h.adminidcreate,
      itemCount:      items.length,
    },
    items,
    totals: {
      itemCount:   items.length,
      totalWeight: Math.round(totalWeight * 100) / 100,
      totalVolume: Math.round(totalVolume * 100000) / 100000,
      totalBoxes,
    },
  };
}
