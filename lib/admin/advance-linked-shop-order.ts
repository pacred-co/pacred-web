import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countShopArrivals } from "./shop-order-arrivals";

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
  forwarder: {
    reforder: string | null | undefined;
    ftrackingchn: string | null | undefined;
    // owner 2026-06-26 — two-stage: ถึงโกดังจีน(fstatus=2, ไม่มีเลขตู้)→40 ·
    // ได้เลขตู้/fstatus≥3→5. The DB trigger (mig 0216) is the systemic SOT that
    // fires from EVERY path; these are passed best-effort so the in-action
    // result + audit match (the trigger corrects any stale-data drift).
    fcabinetnumber?: string | null;
    fstatus?: string | null;
  },
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

  // 2. Multi-shop gate (ภูม 2026-06-30 · mirrors mig-0232 trigger). Don't flip on
  //    the SINGLE triggering forwarder — roll up EVERY shop of the order:
  //    - ทุกร้าน done (เลขตู้/fstatus≥3) → '5' สำเร็จ (from 4/40)
  //    - ทุกร้าน arrived China (fstatus≥2) แต่ยังไม่ done → '40' ถึงโกดังจีน (from 4)
  //    - ยังมีร้านที่ขาด → ไม่ flip (คง รอร้านจีนจัดส่ง) — กันสถานะ "สำเร็จ" ก่อนของถึงครบ.
  //    Idempotent (.in/.eq guard → 0-row no-op once past).
  const summary = await countShopArrivals(admin, hno);
  if (!summary.allArrived && !summary.allDone) return null; // a shop still missing
  const toFive = summary.allDone;

  const q = admin.from("tb_header_order").update(
    toFive ? { hstatus: "5", hdateupdate: nowIso } : { hstatus: "40", hdateupdate: nowIso },
  ).eq("hno", hno);
  const { data: advRows, error } = await (toFive
    ? q.in("hstatus", ["4", "40"])
    : q.eq("hstatus", "4")
  ).select("hno");
  if (error) {
    console.error("[advanceLinkedShopOrder] header advance failed", { hno, toFive, code: error.code, message: error.message });
    return null;
  }
  return advRows && advRows.length > 0 ? hno : null;
}
