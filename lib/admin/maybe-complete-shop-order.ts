import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countShopArrivals, deriveShopStatus } from "./shop-order-arrivals";
import { splitShopTrackingTokens } from "./shop-order-status-rule";

/**
 * 3-stage RE-DERIVE gate for ฝากสั่งซื้อ multi-shop orders (2026-06-30 · the
 * owner's "สถานะ = pure function ของร้านที่มาถึง" rule, replacing the legacy
 * "flip → 5 once every shop is tracked" one-way latch · shops.php L1525-1580 /
 * L1733-1789).
 *
 * THE bugs this closes:
 *   1. "ใส่ tracking ร้านแรกแล้ว อีก 9 ร้านใส่ไม่ได้" — Pacred flipped the WHOLE
 *      order to '5' on the first tracking; once status≠4 the per-shop inputs
 *      disappeared → the rest of the shops could never be tracked/spawned.
 *   2. P22328 "อีกร้านยังไม่ถึง แต่สถานะออเดอร์ไปสำเร็จ/ถึงโกดังจีนแล้ว" — the
 *      status only ever advanced (4→40→5), never dropped back, so a wrongly-'40'
 *      order stayed '40' even when not all shops had arrived.
 *
 * THE 3-stage rule (a PURE FUNCTION of the per-shop arrival roll-up · STATUS-ONLY):
 *   '4'  รอร้านจีนจัดส่ง   ← otherwise (a shop not shipped / not arrived)
 *   '40' ถึงโกดังจีน        ← ทุกร้านถึงโกดังจีน (fstatus≥2) แต่ยังมีร้านไม่ได้เลขตู้
 *   '5'  สำเร็จ            ← ทุกร้านได้เลขตู้ (fcabinetnumber) / ถึงไทย (fstatus≥4)
 * `deriveShopStatus(summary)` is the SOT (see shop-order-status-rule.ts).
 *
 * RE-DERIVE (two-way inside {4,40}) instead of advance-only:
 *   - current ∈ {4,40} → write deriveShopStatus(summary) if it differs (incl.
 *     40→4 down-correction · 4→40 · 4→5 · 40→5).
 *   - current == '3'   → forward-pull ONLY: write if target ∈ {40,5}; never demote 3.
 *   - current == '5'/'6'/'99' → never touched (forward-only out of completion · cancelled).
 *   - .in("hstatus", …) WHERE guard → idempotent + TOCTOU-safe.
 *
 * Legacy tracking-complete pre-check kept: the order can only settle to '5' once
 * every shop SLOT has a tracking (slotCount===trackingCount) AND every shop is
 * done. If all-tracked but not-all-done it settles to '40' (or stays '4'); if not
 * all-tracked it can still advance to '40' (arrival) but never to '5'.
 *
 * STATUS-ONLY · no money. On the '→5' branch ONLY, the legacy re-stamps
 * hTotalPriceUser from the SAME sell formula (no driver change · shops.php
 * L1562-1565) when recomputeSell:true. The DB trigger (mig 0268) is the
 * systemic SOT that fires from EVERY forwarder write; this TS mirror keeps the
 * in-action result + audit consistent (the trigger corrects any stale read).
 *
 * Best-effort: a caller must NOT let its failure roll back the forwarder spawn.
 *
 * Returns `{ completed, slotCount, trackingCount }` — `completed` is true only
 * when this call wrote hstatus '5' (settled the order).
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
    .limit(10_000);
  if (rowsErr) {
    console.error("[maybeCompleteShopOrder] tb_order list failed", {
      hno, code: rowsErr.code, message: rowsErr.message,
    });
    return { completed: false, slotCount: 0, trackingCount: 0 };
  }

  let slotCount = 0;     // arrID  — shop sub-order slots
  let trackingCount = 0; // arrID2 — trackings entered
  for (const r of rows ?? []) {
    slotCount += splitShopTrackingTokens(r.cshippingnumber).length;
    trackingCount += splitShopTrackingTokens(r.ctrackingnumber).length;
  }

  // 2. Re-derive the order's status as a PURE FUNCTION of the per-shop arrival
  //    roll-up (deriveShopStatus → '4' | '40' | '5'). STATUS-ONLY.
  const summary = await countShopArrivals(admin, hno);
  let target: "4" | "40" | "5" = deriveShopStatus(summary);

  // 2b. Legacy tracking-complete pre-check for SETTLEMENT only: never settle to '5'
  //     unless every shop SLOT has a tracking entered (slotCount===trackingCount,
  //     count>0 · shops.php L1525-1580). If derived '5' but tracking bags aren't
  //     fully entered → downgrade to the arrival level '40' (don't complete prematurely;
  //     the trigger re-derives to '5' once the last shop's tracking + goods land).
  if (target === "5" && (slotCount === 0 || slotCount !== trackingCount)) {
    target = "40";
  }

  // 3. Read the current status — forward-only OUT of completion / cancelled, and a
  //    '3' (สั่งสินค้า·ชำระแล้ว) is only forward-PULLED to {40,5}, never demoted.
  const { data: hdr, error: hdrErr } = await admin
    .from("tb_header_order")
    .select("hstatus")
    .eq("hno", hno)
    .maybeSingle<{ hstatus: string | null }>();
  if (hdrErr) {
    console.error("[maybeCompleteShopOrder] header status read failed", {
      hno, code: hdrErr.code, message: hdrErr.message,
    });
    return { completed: false, slotCount, trackingCount };
  }
  const cur = (hdr?.hstatus ?? "").trim();
  if (cur === "5" || cur === "6" || cur === "99") {
    // already complete / cancelled — never auto-demoted live.
    return { completed: false, slotCount, trackingCount };
  }
  const writable =
    cur === "4" || cur === "40" // {4,40} → any of 4/40/5 (incl. 40→4 down-correct)
    || (cur === "3" && (target === "40" || target === "5")); // 3 → forward pull only
  if (!writable || cur === target) {
    return { completed: false, slotCount, trackingCount };
  }

  // 4. Build the (status-only) re-derive write. On the '→5' branch ONLY, re-stamp
  //    hTotalPriceUser from the SAME sell formula legacy uses on completion
  //    (shops.php L1562-1565). NO sell driver (hRate/htotalpricechn/hshippingchn/
  //    hshippingservice) is touched — a pure re-derive, so a sell-locked order's
  //    total is unchanged. Best-effort: if the header read fails we still attempt
  //    the status-only write.
  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = { hstatus: target, hdateupdate: nowIso };
  if (target === "5") update.hdate5 = nowIso;
  if (opts.legacyAdminId) update.adminidupdate = opts.legacyAdminId;

  if (target === "5" && opts.recomputeSell) {
    const { data: header, error: hErr } = await admin
      .from("tb_header_order")
      .select("htotalpricechn, hshippingchn, hrate, hshippingservice, crate, pricecrate")
      .eq("hno", hno)
      .maybeSingle<{
        htotalpricechn: number | string | null;
        hshippingchn: number | string | null;
        hrate: number | string | null;
        hshippingservice: number | string | null;
        crate: string | null;
        pricecrate: number | string | null;
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
      // ภูม 2026-07-01 — ค่าลังไม้ (¥ · เมื่อ crate="1") เข้าราคารวมสุทธิฝั่งขายด้วย
      // (× เรทขาย). 0 สำหรับออเดอร์เดิม (pricecrate default 0) = ไม่กระทบของเก่า.
      const crateCny = header.crate === "1" ? Number(header.pricecrate ?? 0) : 0;
      const raw = (chn + ship + crateCny) * rate + svc;
      if ([chn, ship, rate, svc, crateCny].every(Number.isFinite) && Number.isFinite(raw) && raw > 0) {
        // round_up(x,2) — CEIL to 2dp (legacy round_up · satang-safe).
        update.htotalpriceuser = Math.ceil(raw * 100 - 1e-9 * Math.max(1, Math.abs(raw * 100))) / 100;
      }
    }
  }

  // 5. Re-derive write — idempotent + TOCTOU-safe via the .in() WHERE on the value
  //    we read. A '3' order is only forward-pulled (guarded `.in(["3"])`); a {4,40}
  //    order accepts any of 4/40/5 (incl. the 40→4 down-correction). Never 5/6/99.
  const guard = cur === "3" ? ["3"] : ["4", "40"];
  const { data: written, error: wErr } = await admin
    .from("tb_header_order")
    .update(update)
    .eq("hno", hno)
    .in("hstatus", guard)
    .select("hno");
  if (wErr) {
    console.error("[maybeCompleteShopOrder] status re-derive write failed", {
      hno, from: cur, to: target, code: wErr.code, message: wErr.message,
    });
    return { completed: false, slotCount, trackingCount };
  }

  const wrote = (written?.length ?? 0) > 0;
  return { completed: wrote && target === "5", slotCount, trackingCount };
}
