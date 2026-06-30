import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countShopArrivals, deriveShopStatus } from "./shop-order-arrivals";

/**
 * RE-DERIVE the ฝากสั่งซื้อ shop order whose linked forwarder just changed state.
 *
 * Owner 2026-06-22 (the recurring "มี Tracking ฝากนำเข้าแล้ว แต่งานฝากสั่งยังค้าง")
 * + 2026-06-30 (the 3-stage rule · P22328): the shop order's status is a PURE
 * FUNCTION of its shops' arrivals — รอร้านจีนจัดส่ง '4' → ถึงโกดังจีน '40' → สำเร็จ
 * '5' — recomputed on EVERY forwarder write, two-way inside {4,40} (so a
 * wrongly-'40' order drops back to '4' when not-all-arrived), forward-only out of
 * '5'. The import (tb_forwarder) fstatus then carries the tracking forward, which
 * the customer follows via the "ฝากนำเข้าที่เชื่อมโยง" card on the shop-order detail.
 *
 * The link is resolved two ways (a MOMO-created forwarder has reforder=""):
 *   1. reforder = hno   — set by the spawn-from-order path (service-orders-spawn).
 *   2. tb_order.ctrackingnumber = the forwarder ftrackingchn → that order's hno
 *      — for forwarders MOMO created from the tracking the shop order recorded.
 *
 * Re-derive (status-only · no money):
 *   - current ∈ {4,40} → write deriveShopStatus(summary) if it differs (4→40,
 *     40→4 down-correct, 4→5, 40→5).
 *   - current == '3'   → forward-pull ONLY (write if target ∈ {40,5}); never demote 3.
 *   - current == '5'/'6'/'99' → never touched (forward-only out of completion · cancelled).
 *   - .in() WHERE guard on the read value → idempotent + TOCTOU-safe.
 *
 * This TS mirror keeps the in-action result + audit consistent; the DB trigger
 * (mig 0234/0235) is the systemic SOT that corrects any stale read. Returns the
 * hno when this call wrote a new status, else null. Best-effort: a caller must
 * NOT let its failure roll back the forwarder write.
 */
export async function advanceLinkedShopOrder(
  admin: SupabaseClient,
  forwarder: {
    reforder: string | null | undefined;
    ftrackingchn: string | null | undefined;
    // owner 2026-06-26 — 3-stage: ถึงโกดังจีน(fstatus=2, ไม่มีเลขตู้)→40 ·
    // เลขตู้/fstatus≥4→5. The DB trigger (mig 0234/0235) is the systemic SOT that
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

  // 2. Re-derive the 3-stage status as a PURE FUNCTION of EVERY shop of the order
  //    (deriveShopStatus → '4' | '40' | '5'). Don't flip on the SINGLE triggering
  //    forwarder. (owner: "อีกร้านยังไม่ถึง แต่สถานะออเดอร์ไปสำเร็จ/ถึงโกดังจีนแล้ว".)
  const summary = await countShopArrivals(admin, hno);
  const target = deriveShopStatus(summary);

  // 3. Read current status — forward-only out of 5/6/99; '3' only forward-pulled.
  const { data: hdr, error: hdrErr } = await admin
    .from("tb_header_order")
    .select("hstatus")
    .eq("hno", hno)
    .maybeSingle<{ hstatus: string | null }>();
  if (hdrErr) {
    console.error("[advanceLinkedShopOrder] header status read failed", { hno, code: hdrErr.code, message: hdrErr.message });
    return null;
  }
  const cur = (hdr?.hstatus ?? "").trim();
  if (cur === "5" || cur === "6" || cur === "99") return null; // forward-only / cancelled
  const writable =
    cur === "4" || cur === "40" // {4,40} → any of 4/40/5 (incl. 40→4 down-correct)
    || (cur === "3" && (target === "40" || target === "5")); // 3 → forward pull only
  if (!writable || cur === target) return null;

  // 4. Re-derive write — idempotent + TOCTOU-safe via the .in() WHERE on the read value.
  const guard = cur === "3" ? ["3"] : ["4", "40"];
  const update: Record<string, unknown> = { hstatus: target, hdateupdate: nowIso };
  if (target === "5") update.hdate5 = nowIso;
  const { data: advRows, error } = await admin
    .from("tb_header_order")
    .update(update)
    .eq("hno", hno)
    .in("hstatus", guard)
    .select("hno");
  if (error) {
    console.error("[advanceLinkedShopOrder] header re-derive failed", { hno, from: cur, to: target, code: error.code, message: error.message });
    return null;
  }
  return advRows && advRows.length > 0 ? hno : null;
}
