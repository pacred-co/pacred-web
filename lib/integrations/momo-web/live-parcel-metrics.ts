/**
 * MOMO Live parcel metrics — PURE derivations (no DB · no "server-only").
 *
 * WHY THIS EXISTS (owner/พี่ป๊อป 2026-07-01 · money-critical)
 * ──────────────────────────────────────────────────────────
 * MOMO's OWN web (momocargo.com) reports each parcel's weight/CBM/dimensions
 * PER-PIECE and a separate `quantity` (จำนวนชิ้น). MOMO's web DISPLAY shows the
 * TOTAL = per-piece × quantity. VERIFIED against the live master account
 * 2026-07-01 for tracking 1782113771: raw kg=20 · qty=10 → MOMO shows 200 kg;
 * siblings -3 (kg=38 · qty=2 → 76) and -4 (kg=196 · qty=7 → 1372) match too.
 *
 * ⚠️ This is the OPPOSITE of the PARTNER import/track feed, where `kg`/`cbm`
 * are already the tracking-total (each split parcel is its own `track_details`
 * row that gets summed — see lib/admin/momo-raw-helpers.ts
 * aggregateTrackDetailMetrics). Do NOT reuse extractMetricsFromMomoRaw for the
 * Live scrape: that would store the per-PIECE figure and undercharge ~×qty.
 *
 * tb_forwarder holds ONE row per BASE tracking carrying the whole-tracking
 * AGGREGATE (VERIFIED on prod: row 1782544029 has famount=9 = Σ of the split
 * quantities 1+5+1+1+1, and fweight is the Σ of the split totals). So to fill a
 * tb_forwarder row from the Live boards we must:
 *   1. compute each Live parcel's TOTAL (per-piece × quantity), and
 *   2. AGGREGATE those totals by BASE tracking (sum across "-i/n" split siblings)
 *      — because tb_forwarder's single row is that base-tracking aggregate.
 *
 * READ-ONLY / no side effects. Unit-tested in live-parcel-metrics.test.ts.
 *
 * @see lib/integrations/momo-web/client.ts        — the (per-piece) scrape shape
 * @see lib/integrations/momo-web/propagate-live-data.ts — the fill-when-empty writer
 * @see lib/admin/momo-raw-helpers.ts               — the partner-feed (already-total) sibling
 */

import type { MomoLiveParcel } from "./types";

/** A parcel's TOTAL metrics for the money math = per-piece × quantity. */
export type ParcelTotals = {
  /** TOTAL weight (kg) = weightKg-per-piece × quantity. */
  weightKg: number;
  /** TOTAL volume (คิว/CBM) = cbm-per-piece × quantity. */
  cbm: number;
  /** จำนวนชิ้น — the pieces count (min 1). */
  quantity: number;
};

/**
 * Strip a MOMO "-i/n" (or "-i") split-suffix → the BASE tracking. Identical
 * convention to lib/admin/momo-raw-helpers.ts baseTrackingOf: strips a NUMERIC
 * split-suffix ONLY (`-3` or `-1/3`); a legit hyphenated tracking like
 * "CBX260620-SEA07" is left intact (SEA isn't digits).
 */
export function baseTrackingOf(tracking: string): string {
  return tracking.trim().replace(/-\d+(\/\d+)?$/, "");
}

/** Coerce to a finite non-negative number; anything else → 0. */
function nn(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Pieces count from a parcel — floored at 1 (a parcel is at least one piece). */
function piecesOf(p: MomoLiveParcel): number {
  const q = Math.round(Number(p.quantity));
  return Number.isFinite(q) && q > 0 ? q : 1;
}

/**
 * The TOTAL metrics for ONE Live parcel — per-piece × quantity. This is the
 * number MOMO's web SHOWS and the number tb_forwarder stores; the raw scrape
 * value is per-piece and MUST be multiplied out.
 */
export function parcelTotals(p: MomoLiveParcel): ParcelTotals {
  const qty = piecesOf(p);
  return {
    weightKg: nn(p.weightKg) * qty,
    cbm: nn(p.cbm) * qty,
    quantity: qty,
  };
}

/** The aggregate for a whole base tracking (summed across its split siblings). */
export type AggregatedLiveMetrics = {
  /** BASE tracking these totals belong to. */
  baseTracking: string;
  /** Σ TOTAL weight (kg) across every split sibling. */
  weightKg: number;
  /** Σ TOTAL volume (คิว) across every split sibling. */
  cbm: number;
  /** Σ pieces across every split sibling (= tb_forwarder famount). */
  quantity: number;
  /** How many Live parcels rolled into this aggregate (1 = no split). */
  parcelCount: number;
};

/**
 * Aggregate Live parcels into whole-tracking totals keyed by BASE tracking.
 *
 * Each parcel's TOTAL (per-piece × qty) is summed across all its "-i/n" split
 * siblings, because tb_forwarder holds ONE row per base tracking = that whole
 * aggregate. Blank trackings are skipped. Returns a Map keyed by base tracking.
 *
 * Example (VERIFIED on prod, tracking 1782544029):
 *   base(kg9·q1)=9 + -2(kg50·q5)=250 + -3(kg18·q1)=18 + -4(kg11·q1)=11 + -5(kg17.5·q1)=17.5
 *   → weightKg 305.5 · quantity 9 (=Σ qty 1+5+1+1+1) — matches tb_forwarder famount=9.
 */
export function aggregateLiveMetricsByBase(
  parcels: readonly MomoLiveParcel[],
): Map<string, AggregatedLiveMetrics> {
  const byBase = new Map<string, AggregatedLiveMetrics>();
  for (const p of parcels) {
    const tracking = (p.tracking ?? "").trim();
    if (!tracking) continue;
    const base = baseTrackingOf(tracking);
    const t = parcelTotals(p);
    const prev = byBase.get(base);
    if (prev) {
      prev.weightKg += t.weightKg;
      prev.cbm += t.cbm;
      prev.quantity += t.quantity;
      prev.parcelCount += 1;
    } else {
      byBase.set(base, {
        baseTracking: base,
        weightKg: t.weightKg,
        cbm: t.cbm,
        quantity: t.quantity,
        parcelCount: 1,
      });
    }
  }
  return byBase;
}

/**
 * Aggregate Live parcels keyed by their EXACT tracking ("-i/n" kept) — each entry
 * is that ONE parcel's totals (per-piece × qty; a rare duplicate exact tracking sums).
 *
 * 🔴 WHY (owner 2026-07-20 · the PR179 1783582423 fanout): since the BOX-SPLIT model
 * (2026-07-02) a base can hold N SIBLING tb_forwarder rows — one per "-i/n" — so a
 * SPLIT-FAMILY row must be filled from ITS OWN parcel's totals, never the base
 * aggregate. Filling every sibling with `aggregateLiveMetricsByBase` wrote the
 * whole-shipment Σ (116 กล่อง · 2,007.28 kg) onto all 22 rows → Σ ตู้บวม ~22×.
 * The base aggregate remains correct ONLY for a single-row family.
 */
export function aggregateLiveMetricsByExact(
  parcels: readonly MomoLiveParcel[],
): Map<string, AggregatedLiveMetrics> {
  const byExact = new Map<string, AggregatedLiveMetrics>();
  for (const p of parcels) {
    const tracking = (p.tracking ?? "").trim();
    if (!tracking) continue;
    const t = parcelTotals(p);
    const prev = byExact.get(tracking);
    if (prev) {
      prev.weightKg += t.weightKg;
      prev.cbm += t.cbm;
      prev.quantity += t.quantity;
      prev.parcelCount += 1;
    } else {
      byExact.set(tracking, {
        baseTracking: baseTrackingOf(tracking),
        weightKg: t.weightKg,
        cbm: t.cbm,
        quantity: t.quantity,
        parcelCount: 1,
      });
    }
  }
  return byExact;
}

/** The outcome of deciding whether to fill a tb_forwarder row's metrics. */
export type MetricFillDecision = {
  /** True → write the Live totals (the row's weight AND volume are both empty). */
  fill: boolean;
  /**
   * True → the row already has a non-zero weight/volume that DIFFERS from the
   * Live total beyond tolerance. We do NOT overwrite (แต้ม packing-list stays
   * authoritative) — the caller flags it for a human to reconcile.
   */
  mismatch: boolean;
};

/**
 * Decide the fill/flag for one tb_forwarder row given the Live aggregate.
 *
 * FILL-WHEN-EMPTY ONLY (money-safe, same rule as the partner-feed metric
 * back-fill in propagate.ts):
 *   - Fill ONLY when BOTH the current weight AND volume are empty/zero (the row
 *     was committed before it was measured) AND the Live total has a real weight.
 *   - NEVER overwrite an existing non-zero value (a staff/warehouse edit or an
 *     already-billed figure). If the existing value DIFFERS materially from the
 *     Live total → mismatch=true so the caller can flag it (แต้ม is authoritative
 *     for the final verify) — but still no overwrite.
 *
 * @param currentWeight tb_forwarder.fweight (may be null / 0 / a real value)
 * @param currentVolume tb_forwarder.fvolume
 * @param liveWeight    Σ TOTAL weight from the Live aggregate
 * @param liveVolume    Σ TOTAL volume from the Live aggregate
 * @param relTolerance  relative tolerance for the mismatch check (default 2%)
 */
export function decideMetricFill(
  currentWeight: number | null | undefined,
  currentVolume: number | null | undefined,
  liveWeight: number,
  liveVolume: number,
  relTolerance = 0.02,
): MetricFillDecision {
  const curW = Number(currentWeight ?? 0);
  const curV = Number(currentVolume ?? 0);
  const hasWeight = Number.isFinite(curW) && curW > 0;
  const hasVolume = Number.isFinite(curV) && curV > 0;
  const liveHasWeight = Number.isFinite(liveWeight) && liveWeight > 0;

  // Empty row + a real Live weight → fill. (We gate on weight; a legit parcel
  // always has weight. Volume can be 0 for a flat/oversize item — still fill it.)
  if (!hasWeight && !hasVolume) {
    return { fill: liveHasWeight, mismatch: false };
  }

  // Row already has a value → never overwrite. Flag if it differs materially so
  // a human reconciles against แต้ม (the authoritative packing list).
  const mismatch =
    (hasWeight && liveHasWeight && relDiff(curW, liveWeight) > relTolerance) ||
    (hasVolume && liveVolume > 0 && relDiff(curV, liveVolume) > relTolerance);
  return { fill: false, mismatch };
}

/** Relative difference |a-b| / max(|a|,|b|); 0 when both are 0. */
function relDiff(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom === 0) return 0;
  return Math.abs(a - b) / denom;
}
