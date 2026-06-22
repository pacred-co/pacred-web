/**
 * lib/admin/driver-batch-complete.ts — auto-complete a driver batch
 * (`tb_forwarder_driver.fdstatus` 1 → 2) when every stop is delivered.
 *
 * THE BUG this closes (ภูม 2026-06-23): a driver delivered every parcel in a
 * run (each item fdistatus='2', forwarder fstatus='7'), but the BATCH header
 * stayed "กำลังดำเนินการ" (fdstatus='1') forever — staff had to flip it by
 * hand. The legacy NEVER required that: forwarder-driver-w.php:959-968 (driver
 * mobile) AND forwarder-driver.php:1416-1424 (admin) BOTH recount the batch on
 * every delivery and auto-close it when all stops are done:
 *
 *   SELECT f.ID FROM tb_forwarder f
 *     LEFT JOIN tb_forwarder_driver_item fdi ON f.ID = fdi.fID
 *    WHERE f.fPhotoEnd <> '' AND fdi.fdID = '$ID2';   -- delivered (has photo)
 *   if (countFIDAll == countFID)                       -- all stops delivered
 *     UPDATE tb_forwarder_driver SET fdStatus='2' WHERE ID='$ID2';
 *
 * Legacy uses `fPhotoEnd<>''` as the delivered signal because it MANDATES a
 * photo. Pacred lets a driver/warehouse deliver photo-optionally, so we use
 * the authoritative per-item flag `fdistatus='2'` instead (an item is always
 * '2' once delivered, photo or not) — same rule, more robust.
 *
 * Faithful scope: complete ('2') ONLY when ALL stops are delivered. A run with
 * a failed stop ('3') stays '1' (matching legacy — it only auto-closes the
 * all-delivered case; the deadline-expiry sweep handles abandoned runs → '3').
 *
 * Server-only. Best-effort: the caller's delivery already succeeded; a failure
 * here is logged, never thrown (don't roll back a real delivery over a 2nd-tier
 * status roll-up).
 */

import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Re-evaluate one batch and flip it สำเร็จ ('2') if every stop is delivered.
 *
 * @param admin    service-role client (createAdminClient())
 * @param batchId  tb_forwarder_driver.id
 * @returns true if the batch was just completed by this call
 */
export async function maybeAutoCompleteDriverBatch(
  admin: AdminClient,
  batchId: number,
): Promise<boolean> {
  if (!Number.isFinite(batchId) || batchId <= 0) return false;

  const { data: items, error } = await admin
    .from("tb_forwarder_driver_item")
    .select("fdistatus")
    .eq("fdid", batchId);
  if (error) {
    console.error("[driver-batch-complete] item read failed", {
      batchId,
      code: error.code,
      message: error.message,
    });
    return false;
  }
  // No items (e.g. all removed) → nothing to complete.
  if (!items || items.length === 0) return false;

  // Legacy rule: all stops delivered.
  const allDelivered = (items as { fdistatus: string | null }[]).every(
    (it) => (it.fdistatus ?? "") === "2",
  );
  if (!allDelivered) return false;

  // Flip 1 → 2. Guard .eq('fdstatus','1') so we never stomp a run that was
  // manually closed / re-opened between the read and here (TOCTOU-safe +
  // idempotent — a re-call on an already-'2' run no-ops).
  const { data: updated, error: updErr } = await admin
    .from("tb_forwarder_driver")
    .update({ fdstatus: "2" })
    .eq("id", batchId)
    .eq("fdstatus", "1")
    .select("id");
  if (updErr) {
    console.error("[driver-batch-complete] batch update failed", {
      batchId,
      code: updErr.code,
      message: updErr.message,
    });
    return false;
  }
  return (updated ?? []).length > 0;
}
