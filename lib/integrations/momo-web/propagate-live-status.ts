import "server-only";

/**
 * MOMO Live → tb_forwarder STATUS propagation (owner/ภูม 2026-07-01).
 *
 * WHY THIS EXISTS
 * ──────────────
 * MOMO's PARTNER token (`import/track`, used by the momo-isolated sync) only reports
 * status up to "ออกจากโกดังจีน/exported" and then DROPS the parcel — so tb_forwarder.fstatus
 * freezes for many rows even after MOMO's own web already knows the parcel is further
 * along. MOMO's OWN web (momocargo.com, master account · lib/integrations/momo-web/
 * client.ts) sees EVERY parcel in EVERY status board WITH the member code. MOMO is the
 * source-of-truth for STATUS, so this module scrapes the Live boards and advances the
 * matched tb_forwarder rows toward the MOMO-Live status. (แต้ม/iTAM stays only for the
 * weight/CBM verification lane — see advance-departed-containers.ts.)
 *
 * SAFETY — STATUS-ONLY · FORWARD-ONLY · TOCTOU-safe · best-effort
 * ──────────────────────────────────────────────────────────────
 *   - Writes ONLY: fstatus + the matching fdatestatusN (only when empty) +
 *     adminidupdate='sys-live'. NEVER money / wallet / commission / cabinet /
 *     weight / price / dispatch / userid.
 *   - FORWARD-ONLY: advances a row ONLY when the MOMO-Live board status is STRICTLY
 *     newer than the row's current fstatus (isForwardAdvance). The UPDATE WHERE carries
 *     `.in('fstatus', <codes strictly behind the target>)`, so a row that raced forward
 *     between read and write updates 0 rows — never demoted, idempotent on re-run.
 *   - best-effort per row + per board (a failing board/row is skipped, not fatal); the
 *     linked ฝากสั่งซื้อ is re-derived best-effort (same helper the partner-feed cron uses).
 *
 * @see lib/integrations/momo-web/client.ts        — the (server-side, auto-login) scrape
 * @see lib/integrations/momo-web/live-status-plan.ts — the pure map + forward-only rules
 * @see lib/integrations/momo-isolated/propagate.ts   — the partner-feed sibling
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { advanceLinkedShopOrder } from "@/lib/admin/advance-linked-shop-order";
import {
  fetchMomoLiveList,
  type MomoLiveParcel,
} from "./client";
import { type MomoLiveStatus } from "./types";
import {
  liveStatusToFstatus,
  fstatusRank,
  isForwardAdvance,
  fdateColumnForFstatus,
  FSTATUS_RANK,
  PROPAGATABLE_LIVE_STATUSES,
} from "./live-status-plan";

/** The set of fstatus codes whose rank is STRICTLY BEHIND `target` — the forward-only
 *  WHERE guard set. Any row currently at one of these can advance to `target`; a row at
 *  or beyond `target` is excluded (so the UPDATE can never demote). */
function fstatusCodesBehind(target: string): string[] {
  const t = fstatusRank(target);
  return Object.keys(FSTATUS_RANK).filter((code) => FSTATUS_RANK[code] < t);
}

export type LiveStatusPropagationResult = {
  /** How many MOMO Live boards were fetched (best-effort; a failed board still counts as attempted). */
  boardsFetched:  number;
  /** Distinct parcels seen across all boards (deduped by tracking, newest-board-wins). */
  parcelsSeen:    number;
  /** tb_forwarder rows matched by tracking. */
  matched:        number;
  /** Rows actually advanced (fstatus moved strictly forward). */
  advanced:       number;
  /** Rows matched whose MOMO status was NOT newer → left untouched (already at/ahead). */
  noopFresh:      number;
  /** Of `advanced`: how many also had a linked ฝากสั่งซื้อ re-derived. */
  shopOrdersAdvanced: number;
  /** Per-board parcel counts (for the dry-run printout + logging). */
  boards:         Array<{ board: MomoLiveStatus; fstatus: string; parcels: number }>;
  /** Per-item errors. Best-effort: an error never aborts the whole run. */
  errors:         Array<{ scope: string; message: string }>;
};

function emptyResult(): LiveStatusPropagationResult {
  return {
    boardsFetched: 0,
    parcelsSeen: 0,
    matched: 0,
    advanced: 0,
    noopFresh: 0,
    shopOrdersAdvanced: 0,
    boards: [],
    errors: [],
  };
}

/** One MOMO Live parcel tagged with the board (status) it was returned from. */
type BoardParcel = { board: MomoLiveStatus; targetFstatus: string; parcel: MomoLiveParcel };

/**
 * Fetch every propagatable MOMO Live board and return the parcels tagged with the
 * board they came from (the authoritative status signal). Deduped by tracking with
 * NEWEST-board-wins (a parcel appearing in both `sending_thai` and `done` keeps `done`).
 * Best-effort per board — a failing board is recorded in `errors` and skipped.
 *
 * Injectable `fetchList` for the unit test / a caller that already holds a board.
 */
export async function collectLiveBoardParcels(
  result: LiveStatusPropagationResult,
  sizePerBoard = 500,
  fetchList: (status: MomoLiveStatus, size: number) => Promise<MomoLiveParcel[]> = fetchMomoLiveList,
): Promise<BoardParcel[]> {
  // Highest rank wins on dedupe → walk boards and keep the max-rank sighting per tracking.
  const byTracking = new Map<string, BoardParcel>();
  for (const board of PROPAGATABLE_LIVE_STATUSES) {
    const targetFstatus = liveStatusToFstatus(board);
    if (!targetFstatus) continue; // defensive — PROPAGATABLE already filters
    let parcels: MomoLiveParcel[] = [];
    try {
      parcels = await fetchList(board, sizePerBoard);
      result.boardsFetched += 1;
    } catch (e) {
      result.errors.push({
        scope: `board:${board}`,
        message: e instanceof Error ? e.message : "fetch failed",
      });
      continue;
    }
    result.boards.push({ board, fstatus: targetFstatus, parcels: parcels.length });
    for (const p of parcels) {
      const tracking = p.tracking.trim();
      if (!tracking) continue;
      const prev = byTracking.get(tracking);
      // newest-board-wins: keep the sighting whose target fstatus is the furthest along.
      if (!prev || fstatusRank(targetFstatus) > fstatusRank(prev.targetFstatus)) {
        byTracking.set(tracking, { board, targetFstatus, parcel: p });
      }
    }
  }
  result.parcelsSeen = byTracking.size;
  return Array.from(byTracking.values());
}

type ForwarderHit = {
  id:           number;
  ftrackingchn: string | null;
  fstatus:      string | null;
  fdatestatus2: string | null;
  fdatestatus3: string | null;
  fdatetothai:  string | null;
  fdatestatus6: string | null;
  fdatestatus7: string | null;
  reforder:     string | null;
  fcabinetnumber: string | null;
};

/**
 * Advance tb_forwarder rows from an already-collected set of board-tagged parcels.
 * Split out from the fetch so the /live "propagate what's on screen" action can reuse
 * the human's already-fetched board WITHOUT a second MOMO login.
 */
export async function propagateBoardParcels(
  admin: SupabaseClient,
  boardParcels: BoardParcel[],
  result: LiveStatusPropagationResult,
): Promise<LiveStatusPropagationResult> {
  if (boardParcels.length === 0) return result;

  // Batch-lookup tb_forwarder by ftrackingchn IN (...). Chunk to keep the IN list sane.
  const targetByTracking = new Map<string, string>();
  for (const bp of boardParcels) {
    const t = bp.parcel.tracking.trim();
    if (!t) continue;
    // newest-board-wins already applied in collect; keep the same here for direct callers.
    const prev = targetByTracking.get(t);
    if (!prev || fstatusRank(bp.targetFstatus) > fstatusRank(prev)) {
      targetByTracking.set(t, bp.targetFstatus);
    }
  }
  const trackings = Array.from(targetByTracking.keys());

  const forwardersByTracking = new Map<string, ForwarderHit[]>();
  const CHUNK = 200;
  for (let i = 0; i < trackings.length; i += CHUNK) {
    const slice = trackings.slice(i, i + CHUNK);
    const { data: rows, error: lookupErr } = await admin
      .from("tb_forwarder")
      .select(
        "id, ftrackingchn, fstatus, fdatestatus2, fdatestatus3, fdatetothai, fdatestatus6, fdatestatus7, reforder, fcabinetnumber",
      )
      .in("ftrackingchn", slice);
    if (lookupErr) {
      console.error("[propagateLiveStatus] tb_forwarder lookup failed", {
        code: lookupErr.code,
        message: lookupErr.message,
      });
      result.errors.push({ scope: "lookup", message: `${lookupErr.code} ${lookupErr.message}` });
      continue;
    }
    for (const row of (rows ?? []) as unknown as ForwarderHit[]) {
      const key = row.ftrackingchn ?? "";
      if (!key) continue;
      const list = forwardersByTracking.get(key) ?? [];
      list.push(row);
      forwardersByTracking.set(key, list);
    }
  }
  result.matched = Array.from(forwardersByTracking.values()).reduce((n, l) => n + l.length, 0);

  const today = new Date().toISOString().slice(0, 10);

  for (const [tracking, targetFstatus] of targetByTracking) {
    const hits = forwardersByTracking.get(tracking);
    if (!hits || hits.length === 0) continue;

    for (const f of hits) {
      // FORWARD-ONLY: only advance when MOMO's board status is strictly newer.
      if (!isForwardAdvance(f.fstatus, targetFstatus)) {
        result.noopFresh += 1;
        continue;
      }

      // STATUS-ONLY write. Stamp the destination fdatestatusN only when it's empty
      // (never overwrite a real stamp). adminidupdate = the audit marker. NOTHING else.
      const update: Record<string, unknown> = {
        fstatus: targetFstatus,
        adminidupdate: "sys-live",
      };
      const dateCol = fdateColumnForFstatus(targetFstatus);
      if (dateCol) {
        const cur = (f as unknown as Record<string, string | null>)[dateCol];
        const hasStamp = !!cur && cur !== "0000-00-00";
        if (!hasStamp) update[dateCol] = today;
      }

      // TOCTOU-safe forward-only guard: only rows whose current fstatus is STRICTLY
      // BEHIND the target can match. A row that raced to target-or-beyond updates 0 rows.
      const behind = fstatusCodesBehind(targetFstatus);
      if (behind.length === 0) {
        // target is rank '1' or unknown → nothing is legitimately behind it → skip.
        result.noopFresh += 1;
        continue;
      }
      const { data: updRows, error: updErr } = await admin
        .from("tb_forwarder")
        .update(update)
        .eq("id", f.id)
        .in("fstatus", behind)
        .select("id");
      if (updErr) {
        console.error("[propagateLiveStatus] update failed", {
          forwarderId: f.id,
          tracking,
          target: targetFstatus,
          code: updErr.code,
          message: updErr.message,
        });
        result.errors.push({ scope: `forwarder:${f.id}`, message: `${updErr.code} ${updErr.message}` });
        continue;
      }
      if (!updRows || updRows.length === 0) {
        // raced past the target between read + write → not an error, just skip.
        result.noopFresh += 1;
        continue;
      }
      result.advanced += 1;

      // Best-effort: re-derive the linked ฝากสั่งซื้อ (reforder OR by China tracking) so a
      // linked order stays consistent. Its failure must NEVER roll back the status write.
      try {
        const advanced = await advanceLinkedShopOrder(
          admin,
          {
            reforder: f.reforder,
            ftrackingchn: f.ftrackingchn,
            fcabinetnumber: f.fcabinetnumber,
            fstatus: targetFstatus,
          },
          today,
        );
        if (advanced) result.shopOrdersAdvanced += 1;
      } catch (e) {
        console.error("[propagateLiveStatus] advanceLinkedShopOrder threw", {
          forwarderId: f.id,
          tracking,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return result;
}

/**
 * Full run: scrape every MOMO Live board (server-side auto-login) → advance matched
 * tb_forwarder rows forward-only. This is what the sync cron calls (step 3.7) and the
 * standalone dry-run script mirrors.
 *
 * @param admin a service-role Supabase client (bypasses RLS · server-only)
 */
export async function propagateMomoLiveStatus(
  admin: SupabaseClient,
  sizePerBoard = 500,
): Promise<LiveStatusPropagationResult> {
  const result = emptyResult();
  const boardParcels = await collectLiveBoardParcels(result, sizePerBoard);
  return propagateBoardParcels(admin, boardParcels, result);
}
