import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Advance the ฝากสั่งซื้อ shop order linked to a forwarder that reached the china
 * warehouse or beyond — tb_header_order.hstatus '4' (รอร้านจีนจัดส่ง) → '40'
 * (ถึงโกดังจีน · migration 0185). This is the fix for the recurring "ของถึงโกดังจีน
 * แล้ว แต่สถานะฝากสั่งยังค้างที่รอร้านจีน" bug.
 *
 * The link is resolved two ways (a MOMO-created forwarder has reforder=""):
 *   1. reforder = hno   — set by the spawn-from-order path (service-orders-spawn).
 *   2. tb_order.ctrackingnumber = the forwarder ftrackingchn → that order's hno
 *      — for forwarders MOMO created from the tracking the shop order recorded.
 *
 * FORWARD-ONLY + idempotent (.eq("hstatus","4") → 0-row no-op on 40/5/6) and
 * status-only (no money). Returns the advanced hno, or null (no link / already
 * advanced / error). Best-effort: a caller must NOT let its failure roll back
 * the forwarder write.
 */
export async function advanceLinkedShopOrder(
  admin: SupabaseClient,
  forwarder: { reforder: string | null | undefined; ftrackingchn: string | null | undefined },
  nowIso: string,
): Promise<string | null> {
  // 1. Resolve the linked shop-order hno — reforder first, else by tracking.
  let hno = (forwarder.reforder ?? "").trim();
  if (!hno) {
    const tracking = (forwarder.ftrackingchn ?? "").trim();
    if (!tracking) return null;
    const { data: oRow, error: oErr } = await admin
      .from("tb_order")
      .select("hno")
      .eq("ctrackingnumber", tracking)
      .neq("hno", "")
      .limit(1)
      .maybeSingle<{ hno: string | null }>();
    if (oErr) {
      console.error("[advanceLinkedShopOrder] tb_order lookup failed", { tracking, code: oErr.code, message: oErr.message });
      return null;
    }
    hno = (oRow?.hno ?? "").trim();
  }
  if (!hno) return null;

  // 2. Forward-only advance.
  const { data: advRows, error } = await admin
    .from("tb_header_order")
    .update({ hstatus: "40", hdateupdate: nowIso })
    .eq("hno", hno)
    .eq("hstatus", "4")
    .select("hno");
  if (error) {
    console.error("[advanceLinkedShopOrder] header update failed", { hno, code: error.code, message: error.message });
    return null;
  }
  return advRows && advRows.length > 0 ? hno : null;
}
