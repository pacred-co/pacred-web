/**
 * ระบบแนะนำ (vehicle recommendation) — faithful port of legacy
 * `pcs-admin/include/pages/forwarder-driver/call.php` L23-31.
 *
 * The legacy driver-assign page shows "ระบบแนะนำ : <รถ>" in the footer next to
 * the น้ำหนัก / ปริมาตร totals. As the admin ticks/unticks delivery groups, an
 * AJAX call (call.php) recomputes the recommended VEHICLE from the SUMMED total
 * weight (kg) + total volume (CBM) of the ticked forwarder rows and returns the
 * exact Thai label below. This is a PURE FUNCTION — we port it client-side so
 * the recommendation updates instantly on every tick (no round-trip).
 *
 * Legacy rule (EXACT · both weight AND volume must fit a tier · first match wins):
 *   fWeight ≤ 1800  AND  fVolume ≤ 6   → 'รถกระบะ'
 *   fWeight ≤ 3500  AND  fVolume ≤ 12  → '6 ล้อเล็ก'
 *   fWeight ≤ 5000  AND  fVolume ≤ 30  → '6 ล้อใหญ่'
 *   else                              → 'มากกว่ารถที่กำหนด'
 * Nothing ticked → '-' (legacy default: $direction = NULL, span renders '-').
 */

/** The default shown when nothing is ticked (legacy `<span id="direction">-</span>`). */
export const VEHICLE_RECOMMENDATION_EMPTY = "-";

/**
 * Recommend a delivery vehicle from the selection's total weight (kg) + volume (CBM).
 * Faithful to legacy call.php — both weight AND volume must fit a tier, first match wins.
 *
 * @param totalWeightKg  summed fWeight of the ticked rows (kg)
 * @param totalVolumeCbm summed fVolume of the ticked rows (CBM)
 * @param hasSelection   whether any row is ticked; when false returns '-' (legacy default)
 */
export function recommendVehicle(
  totalWeightKg: number,
  totalVolumeCbm: number,
  hasSelection: boolean,
): string {
  if (!hasSelection) return VEHICLE_RECOMMENDATION_EMPTY;
  const w = totalWeightKg;
  const v = totalVolumeCbm;
  if (w <= 1800 && v <= 6) return "รถกระบะ";
  if (w <= 3500 && v <= 12) return "6 ล้อเล็ก";
  if (w <= 5000 && v <= 30) return "6 ล้อใหญ่";
  return "มากกว่ารถที่กำหนด";
}
