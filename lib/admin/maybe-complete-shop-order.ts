import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Legacy "all-shops-done" completion gate for ฝากสั่งซื้อ (shops.php
 * L1525-1580 / L1733-1789 · the END of BOTH saveTarcking + arrSaveTarcking
 * handlers).
 *
 * THE bug this fixes (owner: "ใส่ tracking ร้านแรกแล้ว อีก 9 ร้านใส่ไม่ได้"):
 * Pacred replaced legacy's per-shop incremental "spawn-then-conditionally-
 * complete" with a single all-at-once button that flipped the WHOLE order to
 * status 5 on the FIRST press. Once status≠4 the tracking inputs + spawn UI
 * disappear → the remaining shops can never get tracking entered or spawned.
 *
 * Legacy NEVER flips to 5 until the LAST shop's tracking lands. The gate it
 * uses (faithfully reproduced here):
 *   arrID  = every non-empty cShippingNumber token (comma-split) across all
 *            tb_order rows of hNo  — the count of shop sub-order SLOTS.
 *   arrID2 = every non-empty cTrackingNumber token (comma-split) across all
 *            tb_order rows of hNo  — the count of trackings ENTERED.
 *   flip → '5' ONLY if  count(arrID) === count(arrID2)  &&  count > 0.
 * Otherwise the order STAYS at 4 and the per-shop forms re-render.
 *
 * On Pacred's normalized one-slot-per-shop data this degrades exactly to
 * "every shop has a tracking" (one cShippingNumber token + one cTrackingNumber
 * token per shop) — identical end-state to legacy, no behaviour change.
 *
 * STATUS-ONLY · no money is touched here. When the gate fires, the legacy
 * re-stamps hTotalPriceUser from the SAME sell formula (no driver change) —
 * the caller passes recomputeSell:true to do that (shops.php L1562-1565). The
 * DB trigger (mig 0215/0216) is a SEPARATE milestone (goods physically reached
 * the China warehouse) and is unaffected — a spawned forwarder sits at
 * fstatus='1' so the trigger does not auto-complete; this gate is the
 * "all shops have tracking + spawned" milestone.
 *
 * FORWARD-ONLY + idempotent: the UPDATE is gated `.eq("hstatus","4")` so it is
 * a no-op once the order is past 4 (40 / 5 / 6). Best-effort: a caller must NOT
 * let its failure roll back the forwarder spawn.
 *
 * Returns `{ completed, slotCount, trackingCount }` — `completed` is true only
 * when this call flipped 4 → 5.
 */
export async function maybeCompleteShopOrder(
  admin: SupabaseClient,
  hNo: string,
  opts: { recomputeSell?: boolean; legacyAdminId?: string } = {},
): Promise<{ completed: boolean; slotCount: number; trackingCount: number }> {
  const hno = (hNo ?? "").trim();
  if (!hno) return { completed: false, slotCount: 0, trackingCount: 0 };

  // 1. Pull the per-shop slot + tracking bags for every line of the order.
  const { data: rows, error: rowsErr } = await admin
    .from("tb_order")
    .select("cshippingnumber, ctrackingnumber")
    .eq("hno", hno)
    .limit(500);
  if (rowsErr) {
    console.error("[maybeCompleteShopOrder] tb_order list failed", {
      hno, code: rowsErr.code, message: rowsErr.message,
    });
    return { completed: false, slotCount: 0, trackingCount: 0 };
  }

  const splitTokens = (v: string | null | undefined): string[] =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  let slotCount = 0;     // arrID  — shop sub-order slots
  let trackingCount = 0; // arrID2 — trackings entered
  for (const r of rows ?? []) {
    slotCount += splitTokens(r.cshippingnumber).length;
    trackingCount += splitTokens(r.ctrackingnumber).length;
  }

  // 2. The legacy gate — flip only when every slot has a tracking.
  if (slotCount === 0 || slotCount !== trackingCount) {
    return { completed: false, slotCount, trackingCount };
  }

  // 3. Build the (forward-only) flip. When recomputeSell, re-stamp
  //    hTotalPriceUser from the SAME sell formula legacy uses on completion
  //    (shops.php L1562-1565). NO sell driver (hRate/htotalpricechn/
  //    hshippingchn/hshippingservice) is touched — this is a pure re-derive,
  //    so a sell-locked order's total is unchanged. Best-effort: if the header
  //    read fails we still attempt the status-only flip.
  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = { hstatus: "5", hdate5: nowIso, hdateupdate: nowIso };
  if (opts.legacyAdminId) update.adminidupdate = opts.legacyAdminId;

  if (opts.recomputeSell) {
    const { data: header, error: hErr } = await admin
      .from("tb_header_order")
      .select("htotalpricechn, hshippingchn, hrate, hshippingservice")
      .eq("hno", hno)
      .maybeSingle<{
        htotalpricechn: number | string | null;
        hshippingchn: number | string | null;
        hrate: number | string | null;
        hshippingservice: number | string | null;
      }>();
    if (hErr) {
      console.error("[maybeCompleteShopOrder] header read for sell recompute failed", {
        hno, code: hErr.code, message: hErr.message,
      });
    } else if (header) {
      const chn = Number(header.htotalpricechn ?? 0);
      const ship = Number(header.hshippingchn ?? 0);
      const rate = Number(header.hrate ?? 0);
      const svc = Number(header.hshippingservice ?? 0);
      const raw = (chn + ship) * rate + svc;
      if ([chn, ship, rate, svc].every(Number.isFinite) && Number.isFinite(raw) && raw > 0) {
        // round_up(x,2) — CEIL to 2dp (legacy round_up · satang-safe).
        update.htotalpriceuser = Math.ceil(raw * 100 - 1e-9 * Math.max(1, Math.abs(raw * 100))) / 100;
      }
    }
  }

  const { data: flipped, error: flipErr } = await admin
    .from("tb_header_order")
    .update(update)
    .eq("hno", hno)
    .eq("hstatus", "4") // forward-only · idempotent (no-op once past 4)
    .select("hno");
  if (flipErr) {
    console.error("[maybeCompleteShopOrder] 4→5 flip failed", {
      hno, code: flipErr.code, message: flipErr.message,
    });
    return { completed: false, slotCount, trackingCount };
  }

  return { completed: (flipped?.length ?? 0) > 0, slotCount, trackingCount };
}
