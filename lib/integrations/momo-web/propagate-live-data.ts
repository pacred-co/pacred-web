import "server-only";

/**
 * MOMO Live → tb_forwarder DATA (weight / CBM / dims / pieces) fill (owner/พี่ป๊อป
 * 2026-07-01). The COMPANION to the STATUS propagate (propagate-live-status.ts).
 *
 * WHY THIS EXISTS
 * ──────────────
 * MOMO's PARTNER token (`import/track`) DROPS a parcel once it advances past
 * "ออกจากโกดังจีน" → tb_forwarder is left MISSING น้ำหนัก/คิว/ขนาด/จำนวนชิ้น for those
 * rows. MOMO's OWN web (momocargo.com master account · lib/integrations/momo-web/
 * client.ts) STILL HAS the full measurement. This module fills tb_forwarder's
 * missing measurements from the Live boards.
 *
 * 💰 MONEY-SAFETY (weight/คิว feed the SELL price — be conservative)
 * ─────────────────────────────────────────────────────────────────
 *   - TOTAL not per-piece: the Live scrape reports PER-PIECE kg/cbm; MOMO's web
 *     (and tb_forwarder) hold the TOTAL = per-piece × quantity. We aggregate the
 *     per-piece totals by BASE tracking (Σ across "-i/n" split siblings) because
 *     tb_forwarder holds ONE row per base tracking = that whole aggregate.
 *     (VERIFIED against the live master account + prod DB 2026-07-01.)
 *   - FILL-WHEN-EMPTY ONLY: write fweight/fvolume/dims/famount ONLY when the
 *     row's current value is empty/0. NEVER overwrite a non-zero value (a
 *     staff/warehouse edit or an already-billed figure).
 *   - SKIP BILLED ROWS: never touch a row whose fstatus is in {'5','6','7'}
 *     (รอชำระ/เตรียมส่ง/ส่งแล้ว) — those are in/through billing. Also skipped by
 *     the WHERE guard (`.in('fstatus', BEHIND_BILLING)`) so a row that raced into
 *     billing between read + write updates 0 rows (TOCTOU-safe · idempotent).
 *   - FLAG, DON'T OVERWRITE, on mismatch: when the row already has a non-zero
 *     value that DIFFERS from the Live total, we do NOT overwrite (แต้ม/iTAM
 *     packing-list stays authoritative for the final verify) — we count it as a
 *     flagged mismatch for a human to reconcile.
 *   - best-effort per row; a failing row is skipped, not fatal.
 *
 * @see lib/integrations/momo-web/live-parcel-metrics.ts — the pure per-piece→total math
 * @see lib/integrations/momo-web/propagate-live-status.ts — the STATUS sibling (shares the fetch)
 * @see lib/integrations/momo-isolated/propagate.ts        — the partner-feed metric back-fill
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MomoLiveParcel } from "./types";
import {
  aggregateLiveMetricsByBase,
  baseTrackingOf,
  decideMetricFill,
  type AggregatedLiveMetrics,
} from "./live-parcel-metrics";
import {
  collectLiveBoardParcels,
  propagateBoardParcels,
  type LiveStatusPropagationResult,
} from "./propagate-live-status";

/**
 * fstatus codes that are IN or THROUGH billing — a data-fill must NEVER touch
 * these rows. '4' (ถึงไทย) is NOT here: a scan-arrived row can still legitimately
 * be missing its MOMO measurement, and filling it (when empty) helps billing
 * that hasn't happened yet. The BILLING gate starts at '5' (รอชำระ).
 */
const BILLED_FSTATUS = new Set(["5", "6", "7"]);
/** The fstatus codes a data-fill MAY write to (everything not billed). */
const FILLABLE_FSTATUS: string[] = ["1", "2", "3", "4"];

export type LiveDataFillResult = {
  /** Distinct BASE trackings seen across the Live parcels. */
  baseTrackingsSeen: number;
  /** tb_forwarder rows matched by tracking (exact OR base). */
  matched: number;
  /** Rows whose measurements were filled (were empty → wrote the Live total). */
  filled: number;
  /** Rows skipped because they were already billed (fstatus 5/6/7). */
  skippedBilled: number;
  /** Rows skipped because they already had a value (non-empty, matched-fresh). */
  skippedHasValue: number;
  /**
   * Rows whose existing non-zero value DIFFERED from the Live total beyond
   * tolerance → NOT overwritten, flagged for a human to reconcile against แต้ม.
   */
  flaggedMismatch: number;
  /** Per-mismatch detail (tracking · what we have vs what MOMO shows). */
  mismatches: Array<{
    forwarderId: number;
    tracking: string;
    currentWeight: number;
    currentVolume: number;
    liveWeight: number;
    liveVolume: number;
  }>;
  /** Per-item errors. Best-effort: an error never aborts the whole run. */
  errors: Array<{ scope: string; message: string }>;
};

export function emptyDataFillResult(): LiveDataFillResult {
  return {
    baseTrackingsSeen: 0,
    matched: 0,
    filled: 0,
    skippedBilled: 0,
    skippedHasValue: 0,
    flaggedMismatch: 0,
    mismatches: [],
    errors: [],
  };
}

type ForwarderMetricRow = {
  id: number;
  ftrackingchn: string | null;
  fstatus: string | null;
  fweight: number | null;
  fvolume: number | null;
  fwidth: number | null;
  flength: number | null;
  fheight: number | null;
  famount: number | null;
};

/** Round to 2dp (weight/dims — tb_forwarder numeric(14,2)). */
function r2(n: number): number {
  return Number(n.toFixed(2));
}
/** Round to 6dp (fvolume — tb_forwarder numeric(14,6) since mig 0192). */
function r6(n: number): number {
  return Number(n.toFixed(6));
}

/**
 * Fill tb_forwarder measurements from an already-collected set of Live parcels
 * (the same boards the STATUS propagate fetched — one MOMO login serves both).
 *
 * Matching: a tb_forwarder row is looked up by BASE tracking (the whole-tracking
 * aggregate). We collect both the EXACT ftrackingchn values and their BASE forms
 * so a row stored under the base ("1782544029") OR under a suffixed exact form is
 * found; the write always uses the base aggregate.
 */
export async function fillLiveDataForParcels(
  admin: SupabaseClient,
  parcels: readonly MomoLiveParcel[],
  result: LiveDataFillResult = emptyDataFillResult(),
): Promise<LiveDataFillResult> {
  const byBase = aggregateLiveMetricsByBase(parcels);
  result.baseTrackingsSeen = byBase.size;
  if (byBase.size === 0) return result;

  // We must find tb_forwarder rows whether they store the base tracking OR a
  // suffixed exact tracking. Look up on BOTH: every base key + the exact
  // trackings we saw. (dims come from the FIRST split parcel per base — a
  // reasonable representative; the money fields weight/cbm are the aggregate.)
  const exactTrackings = new Set<string>();
  const dimsByBase = new Map<string, { width: number; length: number; height: number }>();
  for (const p of parcels) {
    const t = (p.tracking ?? "").trim();
    if (!t) continue;
    exactTrackings.add(t);
    const base = baseTrackingOf(t);
    if (!dimsByBase.has(base)) {
      dimsByBase.set(base, {
        width: Number(p.width) || 0,
        length: Number(p.length) || 0,
        height: Number(p.height) || 0,
      });
    }
  }
  const lookupKeys = Array.from(new Set<string>([...byBase.keys(), ...exactTrackings]));

  // Batch lookup (chunked IN). One row can be found via multiple keys → dedupe by id.
  const rowsById = new Map<number, ForwarderMetricRow>();
  const CHUNK = 200;
  for (let i = 0; i < lookupKeys.length; i += CHUNK) {
    const slice = lookupKeys.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus, fweight, fvolume, fwidth, flength, fheight, famount")
      .in("ftrackingchn", slice);
    if (error) {
      console.error("[fillLiveData] tb_forwarder lookup failed", { code: error.code, message: error.message });
      result.errors.push({ scope: "lookup", message: `${error.code} ${error.message}` });
      continue;
    }
    for (const row of (data ?? []) as unknown as ForwarderMetricRow[]) {
      rowsById.set(row.id, row);
    }
  }
  result.matched = rowsById.size;

  for (const row of rowsById.values()) {
    // Resolve the aggregate for THIS row: its ftrackingchn may be the base
    // ("1782544029") or a suffixed exact ("1782544029-2"); reduce to base.
    const rowTracking = (row.ftrackingchn ?? "").trim();
    if (!rowTracking) continue;
    const base = baseTrackingOf(rowTracking);
    const agg: AggregatedLiveMetrics | undefined = byBase.get(base);
    if (!agg) continue; // matched by exact key but its base rolled up elsewhere — skip

    // SKIP BILLED (defence #1 · the WHERE guard below is defence #2).
    if (BILLED_FSTATUS.has(row.fstatus ?? "")) {
      result.skippedBilled += 1;
      continue;
    }

    const decision = decideMetricFill(row.fweight, row.fvolume, agg.weightKg, agg.cbm);
    if (decision.mismatch) {
      result.flaggedMismatch += 1;
      result.mismatches.push({
        forwarderId: row.id,
        tracking: base,
        currentWeight: Number(row.fweight ?? 0),
        currentVolume: Number(row.fvolume ?? 0),
        liveWeight: r2(agg.weightKg),
        liveVolume: r6(agg.cbm),
      });
    }
    if (!decision.fill) {
      if (!decision.mismatch) result.skippedHasValue += 1;
      continue;
    }

    // Build the fill payload. Weight/volume/pieces = the base aggregate — ADDITIVE,
    // so money-correct: คิวรวม/น้ำหนักรวม = Σ across the split boxes, and the price
    // uses คิวรวม (fvolume), not the per-box ก×ย×ส.
    const update: Record<string, number> = {
      fweight: r2(agg.weightKg),
      fvolume: r6(agg.cbm),
    };
    if (agg.quantity > 0 && !(Number(row.famount ?? 0) > 0)) {
      update.famount = agg.quantity;
    }
    // ก×ย×ส (dims) are NOT additive (owner/ภูม 2026-07-01): a multi-box tracking's
    // boxes have DIFFERENT sizes (e.g. 204×61×80 vs 194×125×166 vs 190×115×110) —
    // merging them into ONE ก×ย×ส is meaningless. So fill dims ONLY for a SINGLE-parcel
    // tracking (parcelCount===1 = one real box); for a multi-box tracking leave ก×ย×ส
    // BLANK (the per-box dims live on the MOMO Live board breakdown). คิวรวม already
    // carries the total volume for pricing, so the row is money-complete without a
    // (misleading) merged dim.
    const dims = agg.parcelCount === 1 ? dimsByBase.get(base) : undefined;
    if (dims) {
      const hasNoDims =
        !(Number(row.fwidth ?? 0) > 0) &&
        !(Number(row.flength ?? 0) > 0) &&
        !(Number(row.fheight ?? 0) > 0);
      if (hasNoDims && (dims.width > 0 || dims.length > 0 || dims.height > 0)) {
        update.fwidth = r2(dims.width);
        update.flength = r2(dims.length);
        update.fheight = r2(dims.height);
      }
    }

    // TOCTOU-safe fill: only when STILL empty (fweight null OR 0) AND STILL not
    // billed. `.or('fweight.is.null,fweight.eq.0')` + `.in('fstatus', FILLABLE)`
    // → a row that got a weight OR raced into billing between read + write
    // updates 0 rows. Idempotent on re-run.
    const { data: updRows, error: updErr } = await admin
      .from("tb_forwarder")
      .update(update)
      .eq("id", row.id)
      .in("fstatus", FILLABLE_FSTATUS)
      .or("fweight.is.null,fweight.eq.0")
      .select("id");
    if (updErr) {
      console.error("[fillLiveData] update failed", {
        forwarderId: row.id,
        tracking: base,
        code: updErr.code,
        message: updErr.message,
      });
      result.errors.push({ scope: `forwarder:${row.id}`, message: `${updErr.code} ${updErr.message}` });
      continue;
    }
    if (!updRows || updRows.length === 0) {
      // raced (got a weight / entered billing) between read + write → skip.
      result.skippedHasValue += 1;
      continue;
    }
    result.filled += 1;
  }

  return result;
}

/** Combined result of one "propagate status + fill data" run over the Live boards. */
export type LiveStatusAndDataResult = {
  status: LiveStatusPropagationResult;
  data: LiveDataFillResult;
};

/**
 * Scrape the MOMO Live boards ONCE (server-side auto-login) and run BOTH passes:
 *   1. STATUS propagate — advance matched tb_forwarder.fstatus forward-only (China-side).
 *   2. DATA fill        — fill missing fweight/fvolume/dims/famount (fill-when-empty).
 *
 * Sharing the fetched boards means only ONE MOMO login per run (MOMO is single-
 * session). The DATA fill is independent + best-effort — its failure never rolls
 * back the STATUS writes (they already landed). This is what the /live button and
 * the sync cron call so a single click / cycle both advances status AND fills data.
 *
 * @param admin a service-role Supabase client (bypasses RLS · server-only)
 */
export async function propagateMomoLiveStatusAndData(
  admin: SupabaseClient,
  sizePerBoard = 500,
): Promise<LiveStatusAndDataResult> {
  // ── fetch ALL China-side boards ONCE ──
  const statusResult = {
    boardsFetched: 0,
    parcelsSeen: 0,
    matched: 0,
    advanced: 0,
    noopFresh: 0,
    shopOrdersAdvanced: 0,
    boards: [] as LiveStatusPropagationResult["boards"],
    errors: [] as LiveStatusPropagationResult["errors"],
  } as LiveStatusPropagationResult;
  const boardParcels = await collectLiveBoardParcels(statusResult, sizePerBoard);

  // ── pass 1: STATUS (forward-only, status-only) ──
  await propagateBoardParcels(admin, boardParcels, statusResult);

  // ── pass 2: DATA fill (fill-when-empty, TOTAL, skip billed). Best-effort:
  //    a data-fill failure must NEVER undo the status writes above. ──
  const dataResult = emptyDataFillResult();
  try {
    const parcels = boardParcels.map((bp) => bp.parcel);
    await fillLiveDataForParcels(admin, parcels, dataResult);
  } catch (e) {
    console.error("[propagateMomoLiveStatusAndData] data-fill threw", e);
    dataResult.errors.push({ scope: "data-fill", message: e instanceof Error ? e.message : "unknown" });
  }

  return { status: statusResult, data: dataResult };
}
