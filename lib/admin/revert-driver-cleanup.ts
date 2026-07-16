import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { maybeAutoCompleteDriverBatch } from "./driver-batch-complete";

/**
 * B2 (owner 2026-07-16 "ยกเลิกงาน/เอกสารแล้วสถานะต้องถอยเป็นเส้นตรง"): when a
 * forwarder order is REVERTED เตรียมส่ง(6) → รอชำระ(5) (a bill/receipt/pay was
 * unwound), any driver-stop it still carries must be reconciled too — else the
 * order sits back at รอชำระ while a phantom stop keeps it in a driver run
 * (pending-dispatch/loadAssignedFids would hide it, มอบงานคนขับ shows a stop for
 * an unpaid order · the exact "ข้อมูลไม่เจอ/ไม่ถูกต้อง" the owner flagged).
 *
 * Driver-stop states (tb_forwarder_driver_item.fdistatus): '' / null = ยังไม่ขึ้นรถ ·
 * '1' = กำลังส่ง (en route) · '2' = ส่งสำเร็จ · '3' = ไม่สำเร็จ.
 *
 *   assertNoDriverEnRoute — REFUSE a revert while a driver is actively delivering
 *     ('1'): un-collecting money mid-delivery would strand the run. The caller must
 *     recall the driver / remove the stop first. (fdistatus='2' delivered ⇒ the order
 *     is fstatus '7' and the ≥7 guard already refuses upstream.)
 *   removeOpenDriverStops — DELETE the not-yet-dispatched stops ('' / null) so the
 *     reverted order cleanly re-enters the dispatch queue when it's re-billed +
 *     re-settled; auto-completes any batch left empty. Mirrors removeItemFromBatch.
 *
 * Both are best-effort helpers the reverse actions call; a read failure never
 * blocks the money-safe status flip (the caller already committed the reverse).
 */

export async function assertNoDriverEnRoute(
  admin: SupabaseClient,
  fids: number[],
): Promise<{ ok: true } | { ok: false; enRouteFids: number[] }> {
  if (fids.length === 0) return { ok: true };
  const { data, error } = await admin
    .from("tb_forwarder_driver_item")
    .select("fid")
    .in("fid", fids)
    .eq("fdistatus", "1");
  if (error) {
    console.error("[assertNoDriverEnRoute] read failed", { code: error.code, message: error.message });
    return { ok: true }; // fail-open on a read error — never block a money-safe reverse
  }
  const enRouteFids = Array.from(new Set((data ?? []).map((r) => (r as { fid: number }).fid)));
  return enRouteFids.length > 0 ? { ok: false, enRouteFids } : { ok: true };
}

export async function removeOpenDriverStops(
  admin: SupabaseClient,
  fids: number[],
): Promise<{ removed: number; batchesTouched: number[] }> {
  if (fids.length === 0) return { removed: 0, batchesTouched: [] };
  // Find the not-yet-dispatched stops for these orders.
  const { data: openItems, error: readErr } = await admin
    .from("tb_forwarder_driver_item")
    .select("id, fdid, fid, fdistatus")
    .in("fid", fids)
    .or("fdistatus.eq.,fdistatus.is.null");
  if (readErr) {
    console.error("[removeOpenDriverStops] read failed", { code: readErr.code, message: readErr.message });
    return { removed: 0, batchesTouched: [] };
  }
  const items = (openItems ?? []) as Array<{ id: number; fdid: number; fid: number; fdistatus: string | null }>;
  if (items.length === 0) return { removed: 0, batchesTouched: [] };

  const ids = items.map((i) => i.id);
  const { error: delErr } = await admin
    .from("tb_forwarder_driver_item")
    .delete()
    .in("id", ids)
    .or("fdistatus.eq.,fdistatus.is.null"); // TOCTOU: never delete a stop that just went en-route/delivered
  if (delErr) {
    console.error("[removeOpenDriverStops] delete failed", { code: delErr.code, message: delErr.message });
    return { removed: 0, batchesTouched: [] };
  }
  // Auto-complete any batch that was left with no open stop.
  const batches = Array.from(new Set(items.map((i) => i.fdid)));
  for (const fdid of batches) {
    await maybeAutoCompleteDriverBatch(admin, fdid);
  }
  return { removed: ids.length, batchesTouched: batches };
}
