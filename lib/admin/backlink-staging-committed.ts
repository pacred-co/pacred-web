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
 * 🔴 VALUE-COVERAGE GUARD (owner 2026-07-20 · the "กล่องหาย" incident): rules 2/3
 * additionally require the LIVE family's Σ fweight to COVER the STAGING family's
 * Σ weight (within tolerance). The 2026-07-20 sweep stamped 8 genuinely-
 * UNCOMMITTED boxes onto proper-split family rows whose value did NOT include
 * them → the boxes vanished from the import queue and were never billed
 * (PR208/PR179/PR079×2/PR050/PR622/PR10366/PR9820 · healed by
 * scripts/heal-short-box-2026-07-20.ts). A stamp is a claim that the value is
 * already in the system — rules 2/3 must PROVE it, not assume the box-split
 * will fan it out. When the live family is short → leave UNCOMMITTED (visible
 * in the ตรวจตู้ queue = the truth) and report it as `uncovered`.
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

export type StagingLite = {
  id: string;
  tracking: string;
  /** staging weight_kg — the row's total weight. Feeds the family value-coverage
   *  guard; when absent/0 the row contributes 0 to the staging Σ (fail-quiet in
   *  the safe direction: an under-stated staging Σ can only make coverage EASIER
   *  for legit aggregates, and a 0-weight box carries no bill value to lose). */
  weightKg?: number;
  /** true when this staging row is ALREADY committed — such rows are not
   *  re-matched but DO count toward the family's staging Σ (value context). */
  committed?: boolean;
};
export type LiveLite = {
  id: number;
  tracking: string;
  fstatus: string;
  userid: string;
  /** live fweight — feeds the family value-coverage guard. */
  fweight?: number;
};

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
  /** trackings NOT stamped because the live family's value does not cover the
   *  staging family's Σ — the box is genuinely missing from the system and must
   *  stay visible in the import queue (owner 2026-07-20 "กล่องหาย"). */
  uncovered: string[];
};

/** Live family Σ must reach staging family Σ within 2% or 0.5 kg. */
function familyCovered(liveWt: number, stagingWt: number): boolean {
  if (stagingWt <= 0) return true; // no weight signal → nothing provable to lose
  return liveWt + Math.max(0.5, stagingWt * 0.02) >= stagingWt;
}

/**
 * The staging family's TRUE Σ weight per base — with the AGGREGATE-HEADER rule:
 * MOMO sometimes stages BOTH the bare (carrying the whole-shipment total) AND the
 * "-N/M" box rows → a naive Σ double-counts (519218029029: bare 36.5 + boxes 36.5
 * = 73 vs the real 36.5). Discriminator (same as the proper-split rule): when the
 * bare's weight ≈ Σ(suffixed) within tolerance the bare is a HEADER → dropped;
 * otherwise (proper-split · bare = box #1's own weight) it counts. A coincidental
 * match under-states the truth → fail-quiet in the safe direction (no false red).
 * Shared by the backlink value-coverage guard + data-health shipment_short_a_box.
 */
export function stagingFamilyWeights(
  rows: ReadonlyArray<{ tracking: string; weightKg?: number }>,
): Map<string, number> {
  const bareWt = new Map<string, number>();
  const suffWt = new Map<string, number>();
  for (const r of rows) {
    const t = r.tracking.trim();
    if (!t) continue;
    const b = baseOf(t);
    const w = Number(r.weightKg) || 0;
    if (t === b) bareWt.set(b, (bareWt.get(b) ?? 0) + w);
    else suffWt.set(b, (suffWt.get(b) ?? 0) + w);
  }
  const out = new Map<string, number>();
  for (const b of new Set([...bareWt.keys(), ...suffWt.keys()])) {
    const bare = bareWt.get(b) ?? 0;
    const suff = suffWt.get(b) ?? 0;
    const bareIsHeader =
      bare > 0 && suff > 0 && Math.abs(bare - suff) <= Math.max(0.5, suff * 0.02);
    out.set(b, bareIsHeader ? suff : bare + suff);
  }
  return out;
}

/**
 * PURE matcher — unit-testable. `live` = NON-cancelled tb_forwarder rows.
 * `staging` should include COMMITTED rows too (committed:true) — they are never
 * re-matched but their weight feeds the family value-coverage guard.
 */
export function planStagingBacklinks(staging: StagingLite[], live: LiveLite[]): BacklinkPlan {
  const liveExact = new Map<string, LiveLite[]>();
  const liveByBase = new Map<string, LiveLite[]>();
  const liveWtByBase = new Map<string, number>();
  for (const r of live) {
    const t = r.tracking.trim();
    if (!t || DEAD_FSTATUS.has(r.fstatus)) continue;
    liveExact.set(t, [...(liveExact.get(t) ?? []), r]);
    const b = baseOf(t);
    liveByBase.set(b, [...(liveByBase.get(b) ?? []), r]);
    liveWtByBase.set(b, (liveWtByBase.get(b) ?? 0) + (Number(r.fweight) || 0));
  }
  const stagingWtByBase = stagingFamilyWeights(staging);

  const matches: BacklinkMatch[] = [];
  const dupSkipped: string[] = [];
  const uncovered: string[] = [];

  for (const s of staging) {
    if (s.committed) continue; // value-context only — never re-stamped
    const t = s.tracking.trim();
    if (!t) continue;
    const base = baseOf(t);

    // 1. EXACT — the row IS this staging row's own; no coverage question.
    const exact = liveExact.get(t);
    if (exact && exact.length > 0) {
      if (exact.length > 1) { dupSkipped.push(t); continue; }
      matches.push({ stagingId: s.id, tracking: t, fid: exact[0].id, userid: exact[0].userid, kind: "exact" });
      continue;
    }

    // 🔴 rules 2/3 stamp a staging row onto a DIFFERENT row — legitimate ONLY when
    // the live family already carries the staging family's value (an aggregate
    // anchor / an absorbed residue). A proper-split family that is short this
    // box's weight must keep the row VISIBLE in the queue (never stamped).
    const covered = familyCovered(liveWtByBase.get(base) ?? 0, stagingWtByBase.get(base) ?? 0);

    // 2. ANCHOR — staging is a box row, the live bare base exists
    if (t !== base) {
      const anchor = liveExact.get(base);
      if (anchor && anchor.length > 0) {
        if (anchor.length > 1) { dupSkipped.push(t); continue; }
        if (!covered) { uncovered.push(t); continue; }
        matches.push({ stagingId: s.id, tracking: t, fid: anchor[0].id, userid: anchor[0].userid, kind: "anchor" });
        continue;
      }
    }

    // 3. BARE→BOX — staging is the bare, live suffixed siblings exist
    if (t === base) {
      const sibs = (liveByBase.get(base) ?? []).filter((r) => r.tracking.trim() !== base);
      if (sibs.length > 0) {
        if (!covered) { uncovered.push(t); continue; }
        const lowest = [...sibs].sort((a, b) => suffixOf(a.tracking) - suffixOf(b.tracking))[0];
        matches.push({ stagingId: s.id, tracking: t, fid: lowest.id, userid: lowest.userid, kind: "bare_to_box" });
        continue;
      }
    }
  }

  return { matches, dupSkipped, uncovered };
}

export type BacklinkResult = {
  scannedStaging: number;
  matches: BacklinkMatch[];
  dupSkipped: string[];
  /** boxes NOT stamped — their value is missing from the live family (stay in the queue). */
  uncovered: string[];
  stamped: number;
  errors: string[];
};

/**
 * Load staging (ALL rows — committed ones feed the family value context) + live
 * forwarders, plan, and (when apply) stamp. Best-effort per row.
 */
export async function backlinkStagingCommitted(
  admin: SupabaseClient,
  opts: { apply: boolean },
): Promise<BacklinkResult> {
  // ALL staging rows (paged) — committed rows count toward the family Σ but are
  // never re-stamped (the pure planner skips them).
  const staging: StagingLite[] = [];
  let uncommittedCount = 0;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("momo_import_tracks")
      .select("id, momo_tracking_no, weight_kg, committed_at")
      .range(from, from + 999);
    if (error) throw new Error(`momo_import_tracks scan: ${error.code} ${error.message}`);
    for (const r of (data ?? []) as Array<{ id: string; momo_tracking_no: string | null; weight_kg: number | string | null; committed_at: string | null }>) {
      if (!r.momo_tracking_no) continue;
      const committed = r.committed_at != null;
      if (!committed) uncommittedCount += 1;
      staging.push({
        id: String(r.id),
        tracking: String(r.momo_tracking_no),
        weightKg: Number(r.weight_kg) || 0,
        committed,
      });
    }
    if ((data ?? []).length < 1000) break;
  }
  if (uncommittedCount === 0) return { scannedStaging: 0, matches: [], dupSkipped: [], uncovered: [], stamped: 0, errors: [] };

  // live forwarders (paged — the table is small; same posture as data-health)
  const live: LiveLite[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus, userid, fweight")
      .range(from, from + 999);
    if (error) throw new Error(`tb_forwarder scan: ${error.code} ${error.message}`);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      live.push({
        id: Number(r.id),
        tracking: String(r.ftrackingchn ?? ""),
        fstatus: String(r.fstatus ?? "").trim(),
        userid: String(r.userid ?? "").trim(),
        fweight: Number(r.fweight) || 0,
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

  return {
    scannedStaging: uncommittedCount,
    matches: plan.matches,
    dupSkipped: plan.dupSkipped,
    uncovered: plan.uncovered,
    stamped,
    errors,
  };
}
