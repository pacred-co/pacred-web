/**
 * Pure status-gate helpers for the admin ฝากสั่งซื้อ line-edit Server
 * Actions in actions/admin/service-orders-line-edits.ts.
 *
 * Lives OUTSIDE the "use server" module because Next 16 forbids non-
 * async-function exports from "use server" files (caught at build,
 * silent at typecheck — see AGENTS.md §11). Keeping the helpers here
 * lets the test file import + lock them down without round-tripping
 * the DB.
 *
 * Legacy doesn't always gate explicitly (the admin UI hid the input
 * pre-quote). Pacred actions are reachable by direct URL POST + by
 * other admin lanes, so we enforce server-side.
 *
 * Task #228 (2026-06-09):
 *   E3.5  cshippingnumber typo-fix     → lineEditStatusGate     (3,4,5)
 *   E3.14 cpriceupdate per-line ¥      → lineEditStatusGate     (3,4,5)
 *   E3.17 ctrackingnumber per-row fix  → trackingEditStatusGate (4,5)
 *
 * Status '6' (cancelled) and '1'/'2' (pre-quote — items are still in
 * `ShopItemsEditor`, this is the post-quote "fix typo" path) are
 * always rejected.
 */

export type StatusGateResult = { ok: true } | { ok: false; error: string };

/**
 * Allow status IN {3,4,40,5}. Reject {1,2,6,null}. Used by E3.5 + E3.14.
 * "40" = ถึงโกดังจีน (owner 2026-06-16) is post-arrival, between 4 and 5 — the
 * line is still editable there.
 */
export function lineEditStatusGate(hstatus: string | null | undefined): StatusGateResult {
  const s = (hstatus ?? "").trim();
  if (s === "6") return { ok: false, error: "ออเดอร์ยกเลิกแล้ว — แก้ไม่ได้" };
  if (s === "3" || s === "4" || s === "40" || s === "5") return { ok: true };
  return {
    ok: false,
    error: `สถานะออเดอร์ปัจจุบัน (${s || "?"}) ยังไม่อนุญาตให้แก้ไขค่านี้ (ต้องอยู่ในสถานะ "สั่งสินค้าแล้ว" 3-5)`,
  };
}

/**
 * Allow status IN {4,40,5}. Used by E3.17 ctracking typo-fix (after Mark-Ordered).
 * "40" = ถึงโกดังจีน is between 4 and 5 — tracking is still editable there.
 */
export function trackingEditStatusGate(hstatus: string | null | undefined): StatusGateResult {
  const s = (hstatus ?? "").trim();
  if (s === "6") return { ok: false, error: "ออเดอร์ยกเลิกแล้ว — แก้ไม่ได้" };
  if (s === "4" || s === "40" || s === "5") return { ok: true };
  return {
    ok: false,
    error: `สถานะออเดอร์ปัจจุบัน (${s || "?"}) ยังไม่อนุญาตให้แก้เลข tracking (ต้อง "รอร้านจีนจัดส่ง" 4-5)`,
  };
}
