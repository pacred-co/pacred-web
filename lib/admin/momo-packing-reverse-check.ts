import { baseTrackingOf } from "@/lib/admin/momo-raw-helpers";

/**
 * Reverse-check: which packing-list trackings are ABSENT from the MOMO API
 * staging (`momo_import_tracks`). This is the exact gap พี่ป๊อป wants surfaced
 * — "บางแทร็กในระบบ MOMO ก็ไม่มี แต่ดันมามีใน Packing list" — the packing list
 * (the physical warehouse count) carries a parcel the API feed dropped.
 *
 * Pure + testable. Match by BASE tracking (strip the "-N" / "-N/M" suffix) on
 * BOTH sides, so a split child in one source still matches its base/sibling in
 * the other (the same base-matching the reconcile uses).
 */
export type ReverseCheck = {
  checked: number;    // distinct packing base-trackings examined
  present: number;    // found in the API staging
  missing: string[];  // packing base-trackings NOT in the API staging (capped)
};

const MISSING_CAP = 500;

export function computeReverseCheck(
  packingTrackings: readonly (string | null | undefined)[],
  apiTrackings: readonly (string | null | undefined)[],
): ReverseCheck {
  const apiBases = new Set<string>();
  for (const t of apiTrackings) {
    const b = baseTrackingOf(t ?? "");
    if (b) apiBases.add(b);
  }
  const seen = new Set<string>();
  const missing: string[] = [];
  let checked = 0;
  let present = 0;
  for (const t of packingTrackings) {
    const b = baseTrackingOf(t ?? "");
    if (!b || seen.has(b)) continue;
    seen.add(b);
    checked += 1;
    if (apiBases.has(b)) present += 1;
    else if (missing.length < MISSING_CAP) missing.push(b);
  }
  return { checked, present, missing };
}
