import "server-only";

/**
 * MOMO Live → tb_forwarder.fcabinetnumber (เลขตู้) + fdatecontainerclose (วันปิดตู้)
 * fill writer (owner ภูม 2026-07-02). The 4th best-effort pass of
 * propagateMomoLiveStatusAndData (after STATUS, DATA, and per-box detail).
 *
 * WHY THIS EXISTS
 * ──────────────
 * MOMO's own web shows the REAL container (e.g. `GZS260626-1`) in "ตู้สินค้า" AND
 * the close date, but tb_forwarder rows still carry a routing-BATCH placeholder
 * (`PR20260624-SEA01`) — and sometimes NO เลขตู้ + NO วันปิดตู้ at all — because the
 * commit path wrote `container_batch_no ?? momo_container_no` and the real
 * container_batch_no was null when the container hadn't closed yet. MOMO already
 * HAS both in the Live scrape (`MomoLiveParcel.containerName` + its status_date) —
 * this fills them so report-cnt groups by the real เลขตู้ and shows วันปิดตู้.
 *
 * The container + close date PAIR UP (same MOMO container-close event): we set
 * fdatecontainerclose ONLY together with a real container, and only from the
 * parcel's own status_date (prepare_export → exported · closeDateFromParcel).
 *
 * 💰 MONEY-SAFETY — fcabinetnumber drives report-cnt GROUPING; fdatecontainerclose
 *    is a date column report-cnt filters by. Neither is a bill amount.
 *   - FILL-WHEN-EMPTY-OR-PLACEHOLDER only (cabinet): write ONLY when the row's
 *     current cabinet is empty OR a routing-batch placeholder. NEVER overwrite an
 *     existing REAL container (แต้ม/staff/commit authoritative).
 *   - FILL-WHEN-EMPTY only (close date): write fdatecontainerclose ONLY when the
 *     row has none (null / "0000-00-00"). NEVER overwrite an existing date.
 *   - WRITE ONLY a REAL container (GZS/GZE/GZA…) — never a routing-batch or sack.
 *   - SKIP BILLED rows (fstatus 5/6/7) — a report-cnt regroup on a billed row is
 *     risky. Defence #1 = the read filter; defence #2 = the WHERE `.in('fstatus', …)`.
 *   - TOCTOU-safe UPDATE (`.eq('id', id)` + a WHERE that requires the cabinet
 *     still be empty/placeholder AND still not billed) → a row that raced into a
 *     real cabinet or into billing between read + write updates 0 rows. Idempotent.
 *   - adminidupdate marker = 'sys-live' (≤10 chars · tb_forwarder.adminidupdate is
 *     varchar(10)). Does NOT touch fweight/fvolume/any price/status.
 *   - best-effort per row; a failing row is skipped, not fatal.
 *
 * @see lib/integrations/momo-web/live-cabinet-plan.ts   — the pure fill + close-date decisions
 * @see lib/integrations/momo-web/propagate-live-data.ts — the caller (shares the scrape)
 * @see lib/integrations/momo-web/live-parcel-metrics.ts — baseTrackingOf (shared suffix rule)
 * @see lib/admin/commit-momo-row-core.ts                — how commit formats fDateContainerClose
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MomoLiveParcel } from "./types";
import { baseTrackingOf } from "./live-parcel-metrics";
import { decideCabinetFill, isRealContainerCode, closeDateFromParcel } from "./live-cabinet-plan";

/** fstatus codes IN or THROUGH billing — a cabinet fill must NEVER regroup these. */
const BILLED_FSTATUS = new Set(["5", "6", "7"]);
/** The fstatus codes a cabinet fill MAY write to (everything not billed). */
const FILLABLE_FSTATUS: string[] = ["1", "2", "3", "4"];

export type LiveCabinetFillResult = {
  /** Distinct BASE trackings that carried a REAL Live container. */
  baseTrackingsWithContainer: number;
  /** tb_forwarder rows matched by tracking (exact OR base). */
  matched: number;
  /** Rows whose fcabinetnumber was filled with the real container. */
  filled: number;
  /** Rows whose fdatecontainerclose (วันปิดตู้) was filled (paired with the container). */
  closeDateFilled: number;
  /** Rows skipped because they were already billed (fstatus 5/6/7). */
  skippedBilled: number;
  /** Rows skipped because they already had a REAL container (never overwritten). */
  skippedHasReal: number;
  /** Per-item errors. Best-effort: an error never aborts the whole run. */
  errors: Array<{ scope: string; message: string }>;
};

export function emptyCabinetFillResult(): LiveCabinetFillResult {
  return {
    baseTrackingsWithContainer: 0,
    matched: 0,
    filled: 0,
    closeDateFilled: 0,
    skippedBilled: 0,
    skippedHasReal: 0,
    errors: [],
  };
}

type ForwarderCabinetRow = {
  id: number;
  ftrackingchn: string | null;
  fstatus: string | null;
  fcabinetnumber: string | null;
  fdatecontainerclose: string | null;
};

/** The REAL container + its close date resolved for a base tracking. */
type BaseContainerInfo = {
  container: string;
  /** วันปิดตู้ from the parcel's status_date (prepare_export→exported); null if not yet closed on MOMO. */
  closeDate: string | null;
};

/**
 * PURE — pick the REAL container + its close date per BASE tracking from a set of
 * Live parcels.
 *
 * A base tracking's boxes all share one container, so we take the FIRST real
 * container seen for that base (the split boxes never disagree on the ตู้). Only
 * REAL containers (GZS/GZE/GZA) are kept; a parcel whose containerName is a
 * routing-batch/sack/empty is ignored. The close date is read from the SAME parcel
 * that supplied the container (its status_date · prepare_export→exported); if that
 * parcel's status_date has no close phase yet, we scan the base's other split
 * siblings for one (they share the container, so any sibling's close phase applies).
 * Returns Map<baseTracking, {container, closeDate}>.
 */
export function realContainerByBase(
  parcels: readonly MomoLiveParcel[],
): Map<string, BaseContainerInfo> {
  const byBase = new Map<string, BaseContainerInfo>();
  for (const p of parcels) {
    const tracking = (p.tracking ?? "").trim();
    if (!tracking) continue;
    const container = (p.containerName ?? "").trim();
    if (!isRealContainerCode(container)) continue;
    const base = baseTrackingOf(tracking);
    const closeDate = closeDateFromParcel(p);
    const prev = byBase.get(base);
    if (!prev) {
      byBase.set(base, { container, closeDate });
    } else if (!prev.closeDate && closeDate) {
      // keep the first real container, but adopt a close date from a sibling
      // that has one (they share the container/close event).
      prev.closeDate = closeDate;
    }
  }
  return byBase;
}

/**
 * Fill tb_forwarder.fcabinetnumber from the REAL Live container, for the rows
 * matched by an already-collected set of Live parcels (the same boards the STATUS
 * + DATA passes fetched — one MOMO login serves all).
 *
 * Matching mirrors the DATA fill: look up tb_forwarder by BOTH the base keys AND
 * the exact trackings (a few rows store the "-i/n" suffix), reduce each row's
 * ftrackingchn to its base, and resolve the container from realContainerByBase.
 */
export async function fillLiveCabinetForParcels(
  admin: SupabaseClient,
  parcels: readonly MomoLiveParcel[],
  result: LiveCabinetFillResult = emptyCabinetFillResult(),
): Promise<LiveCabinetFillResult> {
  const infoByBase = realContainerByBase(parcels);
  result.baseTrackingsWithContainer = infoByBase.size;
  if (infoByBase.size === 0) return result;

  // Look up on BOTH the base keys AND every exact tracking we saw (some rows are
  // stored under the suffixed exact form).
  const exactTrackings = new Set<string>();
  for (const p of parcels) {
    const t = (p.tracking ?? "").trim();
    if (t) exactTrackings.add(t);
  }
  const lookupKeys = Array.from(
    new Set<string>([...infoByBase.keys(), ...exactTrackings]),
  );

  // Batch lookup (chunked IN). One row can be found via multiple keys → dedupe by id.
  const rowsById = new Map<number, ForwarderCabinetRow>();
  const CHUNK = 200;
  for (let i = 0; i < lookupKeys.length; i += CHUNK) {
    const slice = lookupKeys.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus, fcabinetnumber, fdatecontainerclose")
      .in("ftrackingchn", slice);
    if (error) {
      console.error("[fillLiveCabinet] tb_forwarder lookup failed", {
        code: error.code,
        message: error.message,
      });
      result.errors.push({ scope: "lookup", message: `${error.code} ${error.message}` });
      continue;
    }
    for (const row of (data ?? []) as unknown as ForwarderCabinetRow[]) {
      rowsById.set(row.id, row);
    }
  }
  result.matched = rowsById.size;

  for (const row of rowsById.values()) {
    const rowTracking = (row.ftrackingchn ?? "").trim();
    if (!rowTracking) continue;
    const base = baseTrackingOf(rowTracking);
    const info = infoByBase.get(base);
    if (!info) continue; // matched by exact key but base rolled up elsewhere — skip

    // SKIP BILLED (defence #1 · the WHERE guard below is defence #2).
    if (BILLED_FSTATUS.has(row.fstatus ?? "")) {
      result.skippedBilled += 1;
      continue;
    }

    const cabinetDecision = decideCabinetFill(row.fcabinetnumber, info.container);

    // The close date PAIRS with the real container: fill it when the row has no
    // valid วันปิดตู้ yet AND MOMO gave us one. NEVER overwrite an existing date.
    // fdatecontainerclose is a `timestamp` column → PostgREST returns an ISO string
    // or null (never the "0000-00-00" MySQL sentinel), but keep the sentinel guard
    // as belt-and-braces in case an env still carries a legacy string value.
    const curClose = (row.fdatecontainerclose ?? "").trim();
    const hasCloseDate =
      curClose !== "" && curClose !== "0000-00-00" && curClose !== "0000-00-00 00:00:00";
    const willFillCloseDate = !hasCloseDate && !!info.closeDate;

    // Nothing to do for this row → account for it + skip.
    if (!cabinetDecision.fill && !willFillCloseDate) {
      if (cabinetDecision.reason === "current_is_real") result.skippedHasReal += 1;
      continue;
    }

    // Build the fill payload (each field independently fill-when-empty).
    const update: Record<string, string> = { adminidupdate: "sys-live" };
    if (cabinetDecision.fill) update.fcabinetnumber = info.container;
    if (willFillCloseDate && info.closeDate) update.fdatecontainerclose = info.closeDate;

    // TOCTOU-safe fill — the WHERE guard depends on WHAT we're writing so a raced
    // fresher writer never gets clobbered, and `.in('fstatus', FILLABLE)` blocks a
    // row that raced into billing between read + write. A raced row updates 0 rows →
    // skipped (not an error). Idempotent on re-run (fill-when-empty re-reads the
    // now-filled values → both flags false).
    let q = admin
      .from("tb_forwarder")
      .update(update)
      .eq("id", row.id)
      .in("fstatus", FILLABLE_FSTATUS);
    if (cabinetDecision.fill) {
      // We're (re)writing the cabinet — it must still be empty OR a routing-batch
      // placeholder (NOT a real GZS/GZE/GZA that arrived between read + write). A
      // real container is `GZ%`.
      q = q.not("fcabinetnumber", "ilike", "GZ%");
    } else {
      // Close-date-only fill on a row that ALREADY carries the real container: the
      // cabinet must still equal exactly what we matched (so we don't stamp a date
      // onto a container that changed under us), and the date must still be empty.
      // fdatecontainerclose is a `timestamp` column — "empty" is NULL (the commit
      // path writes NULL via cleanDate, never the "0000-00-00" MySQL sentinel), so
      // guard on IS NULL (comparing the timestamp to the "0000-00-00" string would
      // be a Postgres cast error).
      q = q.eq("fcabinetnumber", info.container).is("fdatecontainerclose", null);
    }
    const { data: updRows, error: updErr } = await q.select("id");
    if (updErr) {
      console.error("[fillLiveCabinet] update failed", {
        forwarderId: row.id,
        base,
        container: info.container,
        code: updErr.code,
        message: updErr.message,
      });
      result.errors.push({ scope: `forwarder:${row.id}`, message: `${updErr.code} ${updErr.message}` });
      continue;
    }
    if (!updRows || updRows.length === 0) {
      // raced (got a real cabinet / entered billing / got a date) between read +
      // write → skip.
      continue;
    }
    if (cabinetDecision.fill) result.filled += 1;
    if (willFillCloseDate) result.closeDateFilled += 1;
  }

  return result;
}
