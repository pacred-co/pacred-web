"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, type AdminActionResult } from "./common";

/**
 * U2-5: bulk multi-line tracking search.
 *
 * Per chat audit W-9 + Part U U2-5 — port of legacy
 * `forwarder-search-muti.php?fTracking=xxxx%0D%0Ayyyy`. Staff paste a
 * batch of tracking numbers (one per line) from suppliers / carriers
 * / WeChat batch ingest and want to know which Pacred forwarder each
 * belongs to.
 *
 * Search surfaces (LIVE legacy tb_* tables — admin-readable via admin client):
 *   - tb_forwarder.ftrackingchn          (China-leg tracking)
 *   - tb_forwarder.ftrackingth           (TH last-mile tracking)
 *   - tb_forwarder_item.producttracking  (per-item tracking)
 *
 * 2026-06-14 §0e DEAD-READ fix (forwarder-fidelity audit): this action
 * previously queried the rebuilt Pacred-native twins `forwarders` /
 * `forwarder_items` (0 rows in prod) → every real parcel returned "ไม่พบ".
 * Repointed to the live tb_* tables the legacy forwarder-search-muti.php
 * itself searches. The forwarder display number IS its tb_forwarder.id
 * (the route /admin/forwarders/[fNo] uses id as fNo); the recipient
 * name/phone live on the forwarder row (faddress*), and `userid` IS the
 * PR member code — so no extra join to tb_users is needed.
 *
 * Returns one row per input tracking + found-context. Multiple matches
 * for one tracking number → multiple result rows (rare; usually 1:1).
 *
 * Limit: up to 200 tracking numbers per request to avoid abuse + DB
 * round-trip explosion. Staff bulk-paste rarely exceeds 50.
 */

const searchSchema = z.object({
  // Newline-separated tracking numbers; whitespace tolerated.
  raw_input: z.string().trim().min(1).max(20_000),
});
export type BulkTrackingSearchInput = z.infer<typeof searchSchema>;

export type TrackingMatch = {
  tracking:        string;
  found_in:        "tracking_chn" | "tracking_th" | "item_tracking";
  forwarder_id:    string;
  f_no:            string;
  status:          string;
  total_price:     number;
  customer_name:   string;
  customer_phone:  string | null;
  customer_member: string | null;
  /** When matched on item, the item product_name for context. */
  item_name:       string | null;
};

export type BulkSearchResult = {
  /** One per input tracking number — preserves entry order. */
  rows: Array<{
    tracking: string;
    matches:  TrackingMatch[];
  }>;
  /** Tracking numbers with zero matches — surfaced separately for action. */
  unmatched: string[];
  /** Total unique tracking numbers searched (after dedup + clean). */
  searched: number;
};

const MAX_TRACKING = 200;

export async function adminBulkTrackingSearch(
  input: BulkTrackingSearchInput,
): Promise<AdminActionResult<BulkSearchResult>> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  // Parse + clean: split on any whitespace/newline/comma; strip empties +
  // dedup while preserving first-seen order.
  const tokens = parsed.data.raw_input
    .split(/[\r\n,;\t ]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (tokens.length === 0) return { ok: false, error: "no_tracking_numbers" };

  const seen = new Set<string>();
  const trackings: string[] = [];
  for (const t of tokens) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    trackings.push(t);
    if (trackings.length >= MAX_TRACKING) break;
  }
  // tb_forwarder.ftrackingth defaults to "-" for MOMO-committed rows; never
  // let a stray "-" token fan out to every placeholder row.
  const thTrackings = trackings.filter((t) => t !== "-");

  return withAdmin(["super", "ops", "accounting"], async () => {
    const admin = createAdminClient();

    type FwdRow = {
      id:               number;
      userid:           string | null;
      fstatus:          string | null;
      ftrackingchn:     string | null;
      ftrackingth:      string | null;
      ftotalprice:      number | string | null;
      faddressname:     string | null;
      faddresslastname: string | null;
      faddresstel:      string | null;
    };
    const FWD_COLS =
      "id, userid, fstatus, ftrackingchn, ftrackingth, ftotalprice, faddressname, faddresslastname, faddresstel";

    // Three parallel IN(...) queries over the live tb_* tables.
    const [chnRes, thRes, itemRes] = await Promise.all([
      admin.from("tb_forwarder").select(FWD_COLS).in("ftrackingchn", trackings),
      thTrackings.length === 0
        ? Promise.resolve({ data: [] as FwdRow[], error: null })
        : admin.from("tb_forwarder").select(FWD_COLS).in("ftrackingth", thTrackings),
      admin
        .from("tb_forwarder_item")
        .select("fid, productname, producttracking")
        .in("producttracking", trackings),
    ]);

    if (chnRes.error) {
      console.error(`[adminBulkTrackingSearch chn] failed`, { message: chnRes.error.message });
      return { ok: false, error: `ค้นหาไม่สำเร็จ: ${chnRes.error.message}` };
    }

    const chnHits = (chnRes.data ?? []) as FwdRow[];
    const thHits  = (thRes.data ?? []) as FwdRow[];
    type ItemRow = { fid: number; productname: string | null; producttracking: string | null };
    const itemHits = (itemRes.data ?? []) as ItemRow[];

    // tb_forwarder_item has no declared PostgREST FK to embed — resolve each
    // matched item's parent forwarder in one IN query.
    const itemFids = Array.from(new Set(itemHits.map((it) => it.fid).filter((v): v is number => v != null)));
    const fwdByFid = new Map<number, FwdRow>();
    if (itemFids.length > 0) {
      const { data: parents, error: parentsErr } = await admin.from("tb_forwarder").select(FWD_COLS).in("id", itemFids);
      if (parentsErr) {
        console.error(`[adminBulkTrackingSearch item-parents] failed`, { message: parentsErr.message });
        return { ok: false, error: `ค้นหาไม่สำเร็จ: ${parentsErr.message}` };
      }
      for (const f of (parents ?? []) as FwdRow[]) fwdByFid.set(f.id, f);
    }

    const matchesByTracking = new Map<string, TrackingMatch[]>();
    function add(t: string, m: TrackingMatch): void {
      const key = t.toLowerCase();
      const arr = matchesByTracking.get(key) ?? [];
      arr.push(m);
      matchesByTracking.set(key, arr);
    }
    function recipient(f: FwdRow): string {
      return `${f.faddressname ?? ""} ${f.faddresslastname ?? ""}`.trim() || "—";
    }
    function fwdMatch(f: FwdRow, tracking: string, found_in: TrackingMatch["found_in"], item_name: string | null): TrackingMatch {
      return {
        tracking,
        found_in,
        forwarder_id:    String(f.id),
        f_no:            String(f.id),
        status:          f.fstatus ?? "",
        total_price:     Number(f.ftotalprice ?? 0),
        customer_name:   recipient(f),
        customer_phone:  f.faddresstel ?? null,
        customer_member: f.userid ?? null,
        item_name,
      };
    }

    for (const r of chnHits) add(r.ftrackingchn ?? "", fwdMatch(r, r.ftrackingchn ?? "", "tracking_chn", null));
    for (const r of thHits)  add(r.ftrackingth  ?? "", fwdMatch(r, r.ftrackingth  ?? "", "tracking_th",  null));
    for (const it of itemHits) {
      const fwd = fwdByFid.get(it.fid);
      if (!fwd) continue;
      add(it.producttracking ?? "", fwdMatch(fwd, it.producttracking ?? "", "item_tracking", it.productname ?? null));
    }

    const rows = trackings.map((t) => ({
      tracking: t,
      matches:  matchesByTracking.get(t.toLowerCase()) ?? [],
    }));
    const unmatched = rows.filter((r) => r.matches.length === 0).map((r) => r.tracking);

    return {
      ok: true,
      data: {
        rows,
        unmatched,
        searched: trackings.length,
      },
    };
  });
}
