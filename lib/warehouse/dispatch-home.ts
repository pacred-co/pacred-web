/**
 * Warehouse-employee (โกดังไทย / จ่ายของ) home — the counts behind the handheld
 * launcher at `/admin/warehouse/home`.
 *
 * Faithful to the legacy PCS warehouse-staff home (index.php, warehouse role):
 * four tappable summary cards + a mobile bottom tab-bar. Each number is a REAL
 * `tb_*` count (§0f — badges must be exact), READ-ONLY, best-effort (a sub-query
 * failure yields 0, never throws → the home never 500s for a warehouse worker).
 *
 *   ประวัติการจัดงานรถ  = every driver batch ever created            (tb_forwarder_driver)
 *   งานส่งของไม่สำเร็จ  = delivery stops marked ส่งไม่ได้ (fdistatus='3')
 *   มอบงานคนขับรถ      = ready-to-assign, not yet on an open batch  (countPendingDispatch SOT)
 *   ส่งงานหน้าโกดัง     = self-pickup ready at the warehouse front   (fstatus='6' · fshipby='PCS')
 *   หมายเลขตู้ (badge)  = distinct active containers                 (tb_forwarder.fcabinetnumber)
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { countPendingDispatch } from "@/lib/admin/pending-dispatch";

export type WarehouseDispatchHome = {
  /** ประวัติการจัดงานรถ — total driver batches ever created. */
  batchHistory: number;
  /** งานส่งของไม่สำเร็จ — delivery stops marked "ส่งไม่ได้" (fdistatus='3'). */
  failedDelivery: number;
  /** มอบงานคนขับรถ — forwarders ready to assign, not on an open batch. */
  assignDriver: number;
  /** ส่งงานหน้าโกดัง — self-pickup parcels waiting at the warehouse front. */
  selfPickup: number;
  /** หมายเลขตู้ — parcels with a container assigned (bottom-bar badge). */
  containers: number;
};

const EMPTY: WarehouseDispatchHome = {
  batchHistory: 0,
  failedDelivery: 0,
  assignDriver: 0,
  selfPickup: 0,
  containers: 0,
};

export async function loadWarehouseDispatchHome(): Promise<WarehouseDispatchHome> {
  const admin = createAdminClient();

  /** head+count helper → returns the row count (0 on error). */
  async function headCount(build: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
    try {
      const { count, error } = await build();
      if (error) {
        console.error("[loadWarehouseDispatchHome] count failed", error);
        return 0;
      }
      return count ?? 0;
    } catch (e) {
      console.error("[loadWarehouseDispatchHome] count threw", e);
      return 0;
    }
  }

  const [assignDriver, batchHistory, failedDelivery, selfPickup, containers] = await Promise.all([
    // มอบงานคนขับรถ — the single SOT so this == the sidebar badge == /admin/drivers banner (§0f).
    countPendingDispatch(admin).catch(() => 0),
    // ประวัติการจัดงานรถ — every batch ever.
    headCount(() =>
      admin.from("tb_forwarder_driver").select("id", { count: "exact", head: true }),
    ),
    // งานส่งของไม่สำเร็จ — stops marked ส่งไม่ได้.
    headCount(() =>
      admin
        .from("tb_forwarder_driver_item")
        .select("id", { count: "exact", head: true })
        .eq("fdistatus", "3"),
    ),
    // ส่งงานหน้าโกดัง — self-pickup (รับเองโกดัง) ready to hand over.
    headCount(() =>
      admin
        .from("tb_forwarder")
        .select("id", { count: "exact", head: true })
        .eq("fstatus", "6")
        .eq("fshipby", "PCS"),
    ),
    // หมายเลขตู้ — parcels with a container assigned (cheap head-count, NOT a
    // 20k-row distinct scan → no perf regression on this often-loaded home §0f).
    headCount(() =>
      admin
        .from("tb_forwarder")
        .select("id", { count: "exact", head: true })
        .not("fcabinetnumber", "is", null)
        .neq("fcabinetnumber", "")
        .neq("fcabinetnumber", "0"),
    ),
  ]);

  return { ...EMPTY, assignDriver, batchHistory, failedDelivery, selfPickup, containers };
}
