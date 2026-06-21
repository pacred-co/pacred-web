import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Complete the ฝากสั่งซื้อ shop order whose goods have become a ฝากนำเข้า import.
 *
 * Owner 2026-06-22 (the recurring "มี Tracking ฝากนำเข้าแล้ว แต่งานฝากสั่งยังค้าง"
 * complaint): once a shop order's goods reach Pacred's China warehouse AND a
 * linked forwarder import exists (the caller fires this only when the forwarder
 * is at fstatus ≥ 2 = ถึงโกดังจีนแล้ว / beyond), the ฝากสั่งซื้อ has done its job —
 * order from China + reach the China warehouse + hand off to import. So it
 * COMPLETES to tb_header_order.hstatus '5' (สำเร็จ); the import (tb_forwarder)
 * fstatus then carries the tracking forward (ถึงโกดังจีน → กำลังส่งมาไทย → ถึงไทย →
 * ส่งแล้ว), which the customer follows via the "ฝากนำเข้าที่เชื่อมโยง" card on the
 * shop-order detail. Advancing from BOTH '4' (รอร้านจีนจัดส่ง) and '40'
 * (ถึงโกดังจีน · the old intermediate that left orders looking stuck) → '5'.
 *
 * The link is resolved two ways (a MOMO-created forwarder has reforder=""):
 *   1. reforder = hno   — set by the spawn-from-order path (service-orders-spawn).
 *   2. tb_order.ctrackingnumber = the forwarder ftrackingchn → that order's hno
 *      — for forwarders MOMO created from the tracking the shop order recorded.
 *
 * FORWARD-ONLY + idempotent (.in("hstatus",["4","40"]) → 0-row no-op once at
 * 5/6) and status-only (no money). Returns the completed hno, or null (no link /
 * already completed / cancelled / error). Best-effort: a caller must NOT let its
 * failure roll back the forwarder write.
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

  // 2. Forward-only complete — from '4' (รอร้านจีนจัดส่ง) OR '40' (ถึงโกดังจีน) → '5'
  //    (สำเร็จ). The .in(...) guard makes it idempotent (0-row no-op once at 5/6).
  const { data: advRows, error } = await admin
    .from("tb_header_order")
    .update({ hstatus: "5", hdateupdate: nowIso })
    .eq("hno", hno)
    .in("hstatus", ["4", "40"])
    .select("hno");
  if (error) {
    console.error("[advanceLinkedShopOrder] header complete failed", { hno, code: error.code, message: error.message });
    return null;
  }
  return advRows && advRows.length > 0 ? hno : null;
}
