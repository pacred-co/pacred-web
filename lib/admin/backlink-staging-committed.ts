/**
 * backlink-staging-committed.ts — stamp staging rows whose tracking is ALREADY
 * live in tb_forwarder (owner 2026-07-20 "อันไหนที่เรามีในระบบแล้ว จะยังมาโชว์
 * อยู่ยังไม่เข้าระบบทำไม").
 *
 * THE BUG CLASS
 * ─────────────
 * ตรวจตู้ (/admin/momo-containers) decides "เข้าระบบแล้ว" from the staging stamp
 * (momo_import_tracks.committed_at). But a tb_forwarder row can exist WITHOUT
 * that stamp ever being written:
 *   - the box-split/absorb engine created the -N/M rows from a base commit
 *     (each box's OWN staging row was never stamped),
 *   - staff added the row manually (momo-add-missing / manual forms),
 *   - the shipment committed as the BARE aggregate while MOMO later re-sent
 *     the box rows into staging (or vice versa).
 * Result: the row shows "ยังไม่เข้าระบบ", select-all keeps picking it, and every
 * commit attempt bounces off the chokepoint with "tracking นี้มีในระบบแล้ว" —
 * ไม่สำเร็จ 37 spam, forever.
 *
 * THE FIX = back-link: match every UNCOMMITTED staging row against the live
 * tb_forwarder rows and stamp it (committed_at + committed_forwarder_id +
 * commit_userid · committed_by=null = ระบบ — same convention as auto-commit).
 * Match precedence (mirrors the commit chokepoint's own family rules +
 * the 2026-07-14 dangling-staging repair, which re-points to base anchors):
 *   1. EXACT   — live ftrackingchn === staging tracking
 *   2. ANCHOR  — staging is a -N/M box row + the live BARE base row exists
 *                (the chokepoint refuses committing the box over the bare;
 *                 box-split will fan the boxes out of the anchor)
 *   3. BARE→BOX — staging is the bare + live -N/M siblings exist
 *                (the chokepoint refuses committing the bare over the boxes)
 * Dup live rows for the same tracking → SKIP + flag (the dup invariant is
 * owned by data-health/reconcile — never guess which row to point at).
 *
 * Consumers:
 *   - runMomoSync pass 3.8 (best-effort heal — every sync round, ~5 min)
 *   - scripts/backlink-staging-committed-2026-07-20.ts (one-off sweep · dry-run)
 *   - data-health check `staging_unstamped_live` (standing invariant)
 *
 * NOT "server-only" on purpose (same as data-health/checks.ts): no secret here —
 * the caller supplies the service-role client so the tsx CLI can run it.
 *
 * 100% metadata writes — touches ONLY momo_import_tracks stamp columns; NEVER
 * writes tb_forwarder. Idempotent (`WHERE committed_at IS NULL` re-guard).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { baseOf, suffixOf } from "@/lib/integrations/momo-web/split-box-rows-plan";

/** Staging rows dead statuses on the live side — a cancelled forwarder must not
 *  claim a staging row (re-commit after cancel is legitimate). */
const DEAD_FSTATUS = new Set(["", "0", "99"]);

export type StagingLite = { id: string; tracking: string };
export type LiveLite = { id: number; tracking: string; fstatus: string; userid: string };

export type BacklinkMatch = {
  stagingId: string;
  tracking: string;
  fid: number;
  userid: string;
  kind: "exact" | "anchor" | "bare_to_box";
};

export type BacklinkPlan = {
  matches: BacklinkMatch[];
  /** trackings skipped because >1 live row matched (dup — never guess) */
  dupSkipped: string[];
};

/**
 * PURE matcher — unit-testable. `live` = NON-cancelled tb_forwarder rows.
 */
export function planStagingBacklinks(staging: StagingLite[], live: LiveLite[]): BacklinkPlan {
  const liveExact = new Map<string, LiveLite[]>();
  const liveByBase = new Map<string, LiveLite[]>();
  for (const r of live) {
    const t = r.tracking.trim();
    if (!t || DEAD_FSTATUS.has(r.fstatus)) continue;
    liveExact.set(t, [...(liveExact.get(t) ?? []), r]);
    const b = baseOf(t);
    liveByBase.set(b, [...(liveByBase.get(b) ?? []), r]);
  }

  const matches: BacklinkMatch[] = [];
  const dupSkipped: string[] = [];

  for (const s of staging) {
    const t = s.tracking.trim();
    if (!t) continue;
    const base = baseOf(t);

    // 1. EXACT
    const exact = liveExact.get(t);
    if (exact && exact.length > 0) {
      if (exact.length > 1) { dupSkipped.push(t); continue; }
      matches.push({ stagingId: s.id, tracking: t, fid: exact[0].id, userid: exact[0].userid, kind: "exact" });
      continue;
    }

    // 2. ANCHOR — staging is a box row, the live bare base exists
    if (t !== base) {
      const anchor = liveExact.get(base);
      if (anchor && anchor.length > 0) {
        if (anchor.length > 1) { dupSkipped.push(t); continue; }
        matches.push({ stagingId: s.id, tracking: t, fid: anchor[0].id, userid: anchor[0].userid, kind: "anchor" });
        continue;
      }
    }

    // 3. BARE→BOX — staging is the bare, live suffixed siblings exist
    if (t === base) {
      const sibs = (liveByBase.get(base) ?? []).filter((r) => r.tracking.trim() !== base);
      if (sibs.length > 0) {
        const lowest = [...sibs].sort((a, b) => suffixOf(a.tracking) - suffixOf(b.tracking))[0];
        matches.push({ stagingId: s.id, tracking: t, fid: lowest.id, userid: lowest.userid, kind: "bare_to_box" });
        continue;
      }
    }
  }

  return { matches, dupSkipped };
}

export type BacklinkResult = {
  scannedStaging: number;
  matches: BacklinkMatch[];
  dupSkipped: string[];
  stamped: number;
  errors: string[];
};

/**
 * Load uncommitted staging + live forwarders, plan, and (when apply) stamp.
 * Best-effort per row — one failed UPDATE never aborts the rest.
 */
export async function backlinkStagingCommitted(
  admin: SupabaseClient,
  opts: { apply: boolean },
): Promise<BacklinkResult> {
  // uncommitted staging rows (paged)
  const staging: StagingLite[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("momo_import_tracks")
      .select("id, momo_tracking_no")
      .is("committed_at", null)
      .range(from, from + 999);
    if (error) throw new Error(`momo_import_tracks scan: ${error.code} ${error.message}`);
    for (const r of (data ?? []) as Array<{ id: string; momo_tracking_no: string | null }>) {
      if (r.momo_tracking_no) staging.push({ id: String(r.id), tracking: String(r.momo_tracking_no) });
    }
    if ((data ?? []).length < 1000) break;
  }
  if (staging.length === 0) return { scannedStaging: 0, matches: [], dupSkipped: [], stamped: 0, errors: [] };

  // live forwarders (paged — the table is small; same posture as data-health)
  const live: LiveLite[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus, userid")
      .range(from, from + 999);
    if (error) throw new Error(`tb_forwarder scan: ${error.code} ${error.message}`);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      live.push({
        id: Number(r.id),
        tracking: String(r.ftrackingchn ?? ""),
        fstatus: String(r.fstatus ?? "").trim(),
        userid: String(r.userid ?? "").trim(),
      });
    }
    if ((data ?? []).length < 1000) break;
  }

  const plan = planStagingBacklinks(staging, live);
  const errors: string[] = [];
  let stamped = 0;

  if (opts.apply) {
    const nowIso = new Date().toISOString();
    for (const m of plan.matches) {
      const { error, data } = await admin
        .from("momo_import_tracks")
        .update({
          committed_at: nowIso,
          committed_by: null, // null = ระบบ (same convention as auto-commit)
          commit_userid: m.userid || null,
          committed_forwarder_id: m.fid,
          updated_at: nowIso,
        })
        .eq("id", m.stagingId)
        .is("committed_at", null) // idempotent re-guard (a concurrent commit wins)
        .select("id");
      if (error) errors.push(`${m.tracking}: ${error.message}`);
      else if ((data ?? []).length > 0) stamped += 1;
    }
  }

  return { scannedStaging: staging.length, matches: plan.matches, dupSkipped: plan.dupSkipped, stamped, errors };
}
