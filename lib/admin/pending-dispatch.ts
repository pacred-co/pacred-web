/**
 * Pending-dispatch alert — the "รอจัดรถ (ยังไม่มอบงานคนขับ)" queue.
 *
 * Owner 2026-06-19: *"สั่งงานคนขับรถ auto · รอไว้ขึ้นแจ้งเตือน · รอโกดังหรือแพลนนิ่งไปเฟิมบันทึก"*.
 * The dispatch creation stays a HUMAN confirm-save (/admin/drivers/new →
 * createDriverBatch) — this only AUTO-SURFACES that there is new work to assign,
 * so warehouse/planning don't have to poll.
 *
 * A forwarder is "pending dispatch" when it is fstatus='6' (เตรียมส่ง · ชำระแล้ว ·
 * ready to ship) AND it is NOT already in an OPEN driver batch (an existing
 * tb_forwarder_driver_item with fdistatus ''/1 = ยังไม่ขึ้นรถ/กำลังส่ง). The plain
 * `driverItems` sidebar badge counts ALL fstatus='6' (incl. already-assigned), so
 * this is the accurate "new work" count.
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
      .select("id")
      .eq("fstatus", "6")
      .limit(5000);
    if (error) {
      console.error("[countPendingDispatch] ready read failed", { code: error.code, message: error.message });
      return 0;
    }
    readyIds = (data ?? []).map((r) => (r as { id: number }).id);
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
