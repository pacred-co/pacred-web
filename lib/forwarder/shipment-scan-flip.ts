/**
 * computeShipmentFlip — decide whether a warehouse scan completes the WHOLE
 * shipment (and which sibling rows to flip to fstatus='4' / ถึงไทยแล้ว).
 *
 * Owner ภูม 2026-06-18, grounded in the legacy PCS scan handler
 * (`pcs-admin/include/pages/barcode-import/index.php` L167):
 *   `if ($fiAmount >= $fAmount) { UPDATE tb_forwarder SET fStatus=4 ... }`.
 * PCS stores ONE row per order with `fAmount` = the TOTAL box count, so scanning
 * the bare tracking N times counts to the total and flips. Pacred's MOMO model
 * SPLITS a parcel into a bare bill-header (famount = declared total, weight 0) +
 * N box-sibling rows (`-1/N`…`-N/N`, famount 1 each). MOMO labels the BOXES with
 * the bill-header tracking (not the sub-trackings), so the warehouse can only
 * scan the bill-header — and the per-row flip left the sibling rows (the ones
 * the customer sees) stuck. This makes the scan SHIPMENT-aware:
 *
 *   • total   = the carrier-declared box count = max(Σ countable-sibling famount,
 *               the bare bill-header's famount).
 *   • scanned = Σ fi2amount across EVERY row in the shipment group (so scanning
 *               the bill-header, the subs, or any mix all accumulate together).
 *   • when scanned ≥ total → flip EVERY eligible sibling (not just the one
 *               scanned) to '4'.
 *
 * Pure + dependency-light so it unit-tests without a DB. The caller builds the
 * shipment group (siblings sharing baseTracking + userid) and the scan map.
 */

import { filterCountableForwarderRows } from "@/lib/admin/momo-bill-header";

export type ShipmentScanRow = {
  id: number;
  famount: number;
  fstatus: string;
  fcredit?: string | null;
  ftrackingchn: string | null;
  fweight?: number | string | null;
  userid?: string | null;
};

export type ShipmentFlipResult = {
  /** carrier-declared total box count for the whole shipment. */
  total: number;
  /** boxes scanned so far across the whole shipment. */
  scanned: number;
  /** true when scanned ≥ total AND there is ≥1 eligible row to flip. */
  shouldFlip: boolean;
  /** tb_forwarder ids to flip → '4' (physical-axis 1-4, or credit-6). */
  eligibleIds: number[];
};

/** Is this row at a status where a warehouse arrival scan may flip it to '4'? */
function isFlipEligible(r: ShipmentScanRow): boolean {
  const n = Number(r.fstatus);
  // physical journey 1-4 (rescan of an already-4 is idempotent, still listed)
  const physical = Number.isFinite(n) && n >= 1 && n <= 4;
  // juristic credit granted BEFORE arrival writes fstatus='6' on the physical
  // axis (2026-06-14 W1) — the arrival scan must still be able to advance it.
  const creditSix = String(r.fcredit ?? "") === "1" && String(r.fstatus) === "6";
  return physical || creditSix;
}

export function computeShipmentFlip(
  group: ShipmentScanRow[],
  scannedByFid: Map<number, number>,
): ShipmentFlipResult {
  if (group.length === 0) {
    return { total: 0, scanned: 0, shouldFlip: false, eligibleIds: [] };
  }

  // Real boxes = countable siblings (drops the bare zero-weight bill-header).
  const countable = filterCountableForwarderRows(group, {
    tracking: (r) => r.ftrackingchn,
    weight: (r) => Number(r.fweight ?? 0),
    userid: (r) => r.userid ?? "",
  });
  const countableSet = new Set(countable);
  const countableTotal = countable.reduce((s, r) => s + (Number(r.famount) || 0), 0);
  // The dropped bare bill-header carries the carrier-DECLARED total — use it if
  // it is larger (e.g. the carrier hasn't split every box into a sibling yet).
  const headerMax = group
    .filter((r) => !countableSet.has(r))
    .reduce((m, r) => Math.max(m, Number(r.famount) || 0), 0);
  const total = Math.max(countableTotal, headerMax);

  // Scanned = Σ fi2amount over EVERY row in the group (bill-header + subs).
  const scanned = group.reduce((s, r) => s + (scannedByFid.get(r.id) ?? 0), 0);

  const eligibleIds = group.filter(isFlipEligible).map((r) => r.id);

  const shouldFlip = total > 0 && scanned >= total && eligibleIds.length > 0;
  return { total, scanned, shouldFlip, eligibleIds };
}
