/**
 * Pending-dispatch alert — the "รอจัดรถ (ยังไม่มอบงานคนขับ)" queue.
 *
 * Owner 2026-06-19: *"สั่งงานคนขับรถ auto · รอไว้ขึ้นแจ้งเตือน · รอโกดังหรือแพลนนิ่งไปเฟิมบันทึก"*.
 * The dispatch creation stays a HUMAN confirm-save (/admin/drivers/new →
 * createDriverBatch) — this only AUTO-SURFACES that there is new work to assign,
 * so warehouse/planning don't have to poll.
 *
 * A forwarder is "pending dispatch" when it is fstatus='6' (เตรียมส่ง · ชำระแล้ว ·
 * ready to ship) AND `paydeposit <> '1'` (NOT a settled-credit row — legacy
 * forwarder-driver.php gates the assignable list on `(paydeposit<>1 OR paydeposit
 * IS NULL) AND fStatus='6'`; drivers/new applies the same `paydeposit !== '1'`)
 * AND it is NOT already in an OPEN driver batch (an existing tb_forwarder_driver_item
 * with fdistatus ''/1 = ยังไม่ขึ้นรถ/กำลังส่ง). This is the SINGLE source of truth for
 * "งานรอจัดรถ" — the /admin/drivers banner, the sidebar "มอบงานคนขับ" badge, AND the
 * logistics-board card all route through it so the three numbers always agree (§0f).
 *
 * READ-ONLY · no writes · best-effort (a sub-query failure yields 0/empty, never throws).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PendingDispatchRow = { id: number };

/**
 * Returns the count of forwarders ready to dispatch but not yet assigned to an
 * open driver batch. Pass an already-loaded set of fstatus='6' ids to avoid a
 * re-query when the caller already has the pipeline rows (logistics-board), or
 * omit to let it resolve them itself (drivers list).
 */
export async function countPendingDispatch(
  admin: SupabaseClient,
  readyForwarderIds?: number[],
): Promise<number> {
  let readyIds = readyForwarderIds;
  if (!readyIds) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, paydeposit")
      .eq("fstatus", "6")
      .limit(5000);
    if (error) {
      console.error("[countPendingDispatch] ready read failed", { code: error.code, message: error.message });
      return 0;
    }
    // Exclude settled-credit rows (paydeposit='1') — they're fstatus='6' but NOT
    // assignable (legacy + drivers/new both drop them). Keep null/''/'0'.
    readyIds = (data ?? [])
      .filter((r) => (r as { paydeposit: string | null }).paydeposit !== "1")
      .map((r) => (r as { id: number }).id);
  }
  if (readyIds.length === 0) return 0;

  const assigned = await loadAssignedFids(admin, readyIds);
  return readyIds.filter((id) => !assigned.has(id)).length;
}

/** The set of forwarder ids already in an OPEN driver batch (item fdistatus ''/1/null). */
export async function loadAssignedFids(
  admin: SupabaseClient,
  candidateIds: number[],
): Promise<Set<number>> {
  if (candidateIds.length === 0) return new Set();
  const { data, error } = await admin
    .from("tb_forwarder_driver_item")
    .select("fid")
    .in("fid", candidateIds)
    .or("fdistatus.eq.,fdistatus.eq.1,fdistatus.is.null");
  if (error) {
    console.error("[loadAssignedFids] open driver-item read failed", { code: error.code, message: error.message });
    return new Set();
  }
  return new Set((data ?? []).map((r) => (r as { fid: number }).fid));
}
