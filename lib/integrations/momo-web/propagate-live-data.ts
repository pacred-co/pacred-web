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
import { fillMomoBoxDetails, type BoxDetailFillResult } from "./box-detail";
import {
  fillLiveCabinetForParcels,
  emptyCabinetFillResult,
  type LiveCabinetFillResult,
} from "./live-cabinet";
import {
  splitAggregatedMomoBoxRows,
  findMultiBoxBases,
  emptyBoxSplitResult,
  type BoxSplitResult,
} from "./split-box-rows";

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
  /** Rows whose display count (famount) was re-synced to MOMO's real quantity (money-safe). */
  syncedAmount: number;
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
    syncedAmount: 0,
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

    // ── จำนวน (famount) SYNC — keep the count MATCHING MOMO (owner/ภูม 2026-07-08:
    //    "แค่ดึงมาให้ตรงมันก็จบ") ─────────────────────────────────────────────────────
    // The weight/คิว fill below is FILL-WHEN-EMPTY (แต้ม stays authoritative for the money
    // basis), but famount is DISPLAY-ONLY — it is in NO bill/outstanding/debit formula (the
    // folded famountcount='1' marker is what tells the bill NOT to multiply by it), so a
    // stale count can be corrected to MOMO's real quantity WITHOUT moving a single baht.
    // Confirmed prod: 52186 was committed with famount=1 while MOMO reports quantity=2 →
    // detail showed "1 กล่อง" forever (the fill-when-empty guard never re-touched it).
    // Sync ONLY a SINGLE-parcel tracking (parcelCount===1 · NOT a multi-box split whose
    // siblings carry their own per-box count) that is the BARE base row (rowTracking===base,
    // so a split sibling is never clobbered) and unbilled (guarded above). The .in(fstatus)
    // WHERE keeps it TOCTOU-safe against a race into billing.
    if (
      agg.parcelCount === 1 &&
      rowTracking === base &&
      agg.quantity > 0 &&
      Math.round(Number(row.famount ?? 0)) !== agg.quantity
    ) {
      const { error: amtErr } = await admin
        .from("tb_forwarder")
        .update({ famount: agg.quantity })
        .eq("id", row.id)
        .in("fstatus", FILLABLE_FSTATUS);
      if (amtErr) {
        console.error("[propagate famount-sync] failed", { code: amtErr.code, message: amtErr.message, id: row.id });
      } else {
        result.syncedAmount = (result.syncedAmount ?? 0) + 1;
      }
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

// ── PENDING STAGING fill (momo_import_tracks) — the /admin/momo-containers "ดึง Live"
//    use case: MOMO API dropped/withheld a pending tracking's weight/คิว (รอชั่ง) but
//    MOMO's web still has it. Fill the STAGING row so the eventual commit values the
//    bill from the right number. Twin of fillLiveDataForParcels (which fills the
//    COMMITTED tb_forwarder rows); this one fills the ones NOT yet imported. ─────────
export type LiveStagingFillResult = {
  /** Pending momo_import_tracks rows matched by tracking (exact OR base). */
  matched: number;
  /** Pending rows whose empty weight/คิว/จำนวน were filled from the Live total. */
  filled: number;
  /** Pending rows skipped because they already had a value. */
  skippedHasValue: number;
  errors: Array<{ scope: string; message: string }>;
};

export function emptyStagingFillResult(): LiveStagingFillResult {
  return { matched: 0, filled: 0, skippedHasValue: 0, errors: [] };
}

type StagingMetricRow = {
  id: string;
  momo_tracking_no: string | null;
  weight_kg: number | null;
  cbm: number | null;
  quantity: number | null;
};

/**
 * Fill PENDING momo_import_tracks staging rows from the SAME Live parcels.
 *
 * 🔒 MONEY-SAFETY (same envelope as updateMomoImportTrackFields):
 *   - PENDING ONLY (`.is('committed_at', null)`): a committed row is a billable
 *     tb_forwarder row handled by fillLiveDataForParcels — never touched here.
 *   - FILL-WHEN-EMPTY: write weight_kg/cbm/quantity ONLY when currently 0/null;
 *     never overwrite a non-zero value (a staff edit or a good API value).
 *   - TOTAL by base tracking (Σ across "-i/n" splits) = the SAME basis
 *     commitMomoRowCore values the bill from at import time.
 *   - best-effort per row; a failing row is skipped, not fatal.
 */
export async function fillPendingStagingFromLive(
  admin: SupabaseClient,
  parcels: readonly MomoLiveParcel[],
  result: LiveStagingFillResult = emptyStagingFillResult(),
): Promise<LiveStagingFillResult> {
  const byBase = aggregateLiveMetricsByBase(parcels);
  if (byBase.size === 0) return result;

  // Pending staging rows may store momo_tracking_no as a base OR a suffixed exact
  // form → look up on BOTH (mirror fillLiveDataForParcels).
  const exactTrackings = new Set<string>();
  for (const p of parcels) {
    const t = (p.tracking ?? "").trim();
    if (t) exactTrackings.add(t);
  }
  const lookupKeys = Array.from(new Set<string>([...byBase.keys(), ...exactTrackings]));

  const rowsById = new Map<string, StagingMetricRow>();
  const CHUNK = 200;
  for (let i = 0; i < lookupKeys.length; i += CHUNK) {
    const slice = lookupKeys.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("momo_import_tracks")
      .select("id, momo_tracking_no, weight_kg, cbm, quantity")
      .in("momo_tracking_no", slice)
      .is("committed_at", null);
    if (error) {
      console.error("[fillPendingStaging] lookup failed", { code: error.code, message: error.message });
      result.errors.push({ scope: "lookup", message: `${error.code} ${error.message}` });
      continue;
    }
    for (const row of (data ?? []) as unknown as StagingMetricRow[]) rowsById.set(row.id, row);
  }
  result.matched = rowsById.size;

  for (const row of rowsById.values()) {
    const base = baseTrackingOf((row.momo_tracking_no ?? "").trim());
    const agg = byBase.get(base);
    if (!agg) continue;

    // FILL-WHEN-EMPTY per field (never overwrite a staff edit / good API value).
    const update: Record<string, number> = {};
    if (!(Number(row.weight_kg ?? 0) > 0) && agg.weightKg > 0) update.weight_kg = r2(agg.weightKg);
    if (!(Number(row.cbm ?? 0) > 0) && agg.cbm > 0) update.cbm = r6(agg.cbm);
    if (!(Number(row.quantity ?? 0) > 0) && agg.quantity > 0) update.quantity = agg.quantity;
    if (Object.keys(update).length === 0) {
      result.skippedHasValue += 1;
      continue;
    }

    // TOCTOU-safe: only while STILL pending (a race into commit → 0 rows → skip).
    const { data: updRows, error: updErr } = await admin
      .from("momo_import_tracks")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("committed_at", null)
      .select("id");
    if (updErr) {
      console.error("[fillPendingStaging] update failed", { id: row.id, code: updErr.code, message: updErr.message });
      result.errors.push({ scope: `staging:${row.id}`, message: `${updErr.code} ${updErr.message}` });
      continue;
    }
    if (!updRows || updRows.length === 0) continue; // raced into commit
    result.filled += 1;
  }

  return result;
}

/** Combined result of one "propagate status + fill data" run over the Live boards. */
export type LiveStatusAndDataResult = {
  status: LiveStatusPropagationResult;
  data: LiveDataFillResult;
  /** Per-box dimension detail written into momo_box_detail (display-only · best-effort). */
  boxDetail: BoxDetailFillResult;
  /** Real เลขตู้ (fcabinetnumber) filled from the Live container (fill-when-placeholder · best-effort). */
  cabinet: LiveCabinetFillResult;
  /** Box-split → sibling rows: an aggregate tb_forwarder row (famount=N · boxes in
   *  momo_box_detail) split into N sibling rows (one per box · matches MOMO's "-i/n").
   *  Money-neutral guard (unbilled · unpriced · Σ preserved) · idempotent · best-effort. */
  boxSplit: BoxSplitResult;
  /** PENDING momo_import_tracks rows filled from Live (the "ดึง Live" staging fill · best-effort). */
  staging: LiveStagingFillResult;
};

/**
 * Scrape the MOMO Live boards ONCE (server-side auto-login) and run ALL passes:
 *   1. STATUS propagate — advance matched tb_forwarder.fstatus forward-only (China-side).
 *   2. DATA fill        — fill missing fweight/fvolume/dims/famount (fill-when-empty).
 *   3. PER-BOX detail   — persist each split box's real dims into momo_box_detail.
 *   4. CABINET fill     — fill tb_forwarder.fcabinetnumber with the REAL Live container
 *                         (GZS/GZE/GZA) when the row's cabinet is empty or a routing-batch
 *                         placeholder (fill-when-placeholder · never overwrites a real ตู้).
 *   5. BOX-SPLIT        — split an aggregate row (famount=N · boxes in momo_box_detail)
 *                         into N sibling rows (one per box · matches MOMO's "-i/n").
 *                         Money-neutral guard + idempotent (see split-box-rows.ts).
 *
 * Sharing the fetched boards means only ONE MOMO login per run (MOMO is single-
 * session). Passes 2-4 are independent + best-effort — a failure never rolls back
 * the STATUS writes (they already landed). This is what the /live button and the
 * sync cron / commit call so a single click / cycle advances status AND fills data
 * AND fills the real เลขตู้.
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
  const parcels = boardParcels.map((bp) => bp.parcel);
  const dataResult = emptyDataFillResult();
  try {
    await fillLiveDataForParcels(admin, parcels, dataResult);
  } catch (e) {
    console.error("[propagateMomoLiveStatusAndData] data-fill threw", e);
    dataResult.errors.push({ scope: "data-fill", message: e instanceof Error ? e.message : "unknown" });
  }

  // ── pass 3: PER-BOX detail (momo_box_detail · display-only · best-effort). A
  //    multi-box tracking's ก×ย×ส can't live on the single tb_forwarder row, so
  //    we persist each split box's real dims here for the report + editor views.
  //    NEVER touches tb_forwarder / any money path; a failure is non-fatal. ──
  const boxDetailResult: BoxDetailFillResult = { boxesSeen: 0, upserted: 0, errors: [] };
  try {
    await fillMomoBoxDetails(admin, parcels, boxDetailResult);
  } catch (e) {
    console.error("[propagateMomoLiveStatusAndData] box-detail threw", e);
    boxDetailResult.errors.push({ scope: "box-detail", message: e instanceof Error ? e.message : "unknown" });
  }

  // ── pass 4: CABINET fill (tb_forwarder.fcabinetnumber ← the REAL Live container).
  //    MOMO's web already knows the real เลขตู้ (GZS/GZE/GZA); fill it when the row
  //    still carries a routing-batch placeholder / is empty. NEVER overwrites a real
  //    container, SKIPS billed rows, TOCTOU-safe. best-effort: a failure here must
  //    NEVER undo the status/data/box writes above. ──
  const cabinetResult = emptyCabinetFillResult();
  try {
    await fillLiveCabinetForParcels(admin, parcels, cabinetResult);
  } catch (e) {
    console.error("[propagateMomoLiveStatusAndData] cabinet-fill threw", e);
    cabinetResult.errors.push({ scope: "cabinet-fill", message: e instanceof Error ? e.message : "unknown" });
  }

  // ── pass 5: BOX-SPLIT → sibling rows (owner/ภูม 2026-07-02 · allowPriced owner 2026-07-13).
  //    Runs AFTER pass 3 so the per-box dims are already refreshed in momo_box_detail (a
  //    stale box detail Σ that no longer matches the aggregate is skipped by the guard, so
  //    the refresh must land first). For a base tracking MOMO split into N boxes, turn the
  //    ONE aggregate tb_forwarder row into N sibling rows (one per box · matches MOMO's
  //    "-i/n") so the warehouse can scan EACH box + money is itemised per box.
  //    allowPriced=true: also split a PRICED-but-UNBILLED aggregate (an auto-priced MOMO
  //    row · a re-valued backfill row) — money-NEUTRAL by construction (planBoxRowSplit
  //    preserves Σ ftotalprice to the satang · drift>0.005 skips). Still NEVER touches a
  //    BILLED row (fstatus 5/6/7 · the .in() WHERE + plan guard). IDEMPOTENT (already-split
  //    base skipped). Billing groups by base tracking → N siblings = ONE customer bill.
  //    Uses the multi-box bases SEEN on this scrape. best-effort — a failure NEVER undoes
  //    the status/data/box/cabinet writes above. ──
  const boxSplitResult = emptyBoxSplitResult();
  try {
    const scrapedBases = parcels
      .map((p) => baseTrackingOf((p.tracking ?? "").trim()))
      .filter(Boolean);
    // 🔴 ROOT-FIX (2026-07-14): union the CURRENT-scrape bases with the DURABLE
    // multi-box bases in momo_box_detail — a shipment that advanced off MOMO's boards
    // (no longer in scrapedBases) but was never split (stranded aggregate) still gets
    // picked up here. The split re-guards each base (billed/already-split/Σ drift), so
    // the wider set is safe; it only closes the "ยังเกิดอีก" gap.
    const durableBases = await findMultiBoxBases(admin);
    const allBases = Array.from(new Set([...scrapedBases, ...durableBases]));
    await splitAggregatedMomoBoxRows(admin, allBases, boxSplitResult, { allowPriced: true });
  } catch (e) {
    console.error("[propagateMomoLiveStatusAndData] box-split threw", e);
    boxSplitResult.errors.push({ scope: "box-split", message: e instanceof Error ? e.message : "unknown" });
  }

  // ── pass 6: PENDING STAGING fill (momo_import_tracks · the "ดึง Live" fix · owner/ภูม
  //    2026-07-14). Fill weight/คิว/จำนวน on rows NOT yet imported (fill-when-empty ·
  //    pending-only) so a "รอชั่ง" staging row gets MOMO's real measurement BEFORE the
  //    staff imports it — the /admin/momo-containers preview promised this. best-effort:
  //    a failure NEVER undoes the passes above. ──
  const stagingResult = emptyStagingFillResult();
  try {
    await fillPendingStagingFromLive(admin, parcels, stagingResult);
  } catch (e) {
    console.error("[propagateMomoLiveStatusAndData] staging-fill threw", e);
    stagingResult.errors.push({ scope: "staging-fill", message: e instanceof Error ? e.message : "unknown" });
  }

  return {
    status: statusResult,
    data: dataResult,
    boxDetail: boxDetailResult,
    cabinet: cabinetResult,
    boxSplit: boxSplitResult,
    staging: stagingResult,
  };
}
