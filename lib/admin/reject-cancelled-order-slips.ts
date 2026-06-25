import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * rejectPendingSlipsForCancelledOrder — when a ฝากสั่งซื้อ (shop) or ฝากนำเข้า
 * (forwarder) order is CANCELLED or DELETED, reject its still-pending payment slip
 * in `tb_wallet_hs` so the row LEAVES the dashboard "ชำระเงิน" review queue.
 *
 * Owner ภูม (2026-06-25): พนักงานเทสระบบ → อัพสลิป → รายการเด้งเข้าคิวชำระเงิน →
 * พอกดยกเลิก/ลบออเดอร์ที่เทส รายการสลิปกลับ "ไม่หายไปด้วย" → ค้างให้ตรวจทั้งที่
 * ออเดอร์ถูกยกเลิกแล้ว. Root cause: every cancel/delete path wrote the order
 * (tb_header_order hstatus='6' · tb_forwarder DELETE) but NEVER touched the linked
 * pending slip in tb_wallet_hs → it stayed status='1' forever.
 *
 * The legacy "เติม-แล้วจ่าย" payment makes a slip-bearing TOPUP (type='1') + a PAY
 * (type='2' shop / type='4' forwarder · reforder=<order#> · reforder2=<topup id>),
 * both status='1' (pending). This rejects them so the queue + its badge clear.
 *
 * 💰 MONEY-SAFE: status='1' (pending) = NO money has moved yet (the slip was never
 * approved). Flipping to status='3' (rejected) is exactly adminRejectWalletDeposit's
 * pending-reject behavior = "NO tb_wallet change". It never touches an approved ('2')
 * slip nor the customer's wallet balance — only a row that was waiting for review.
 *
 * 🔗 1:N SAFE: a TOPUP can pay SEVERAL orders (one big deposit → many PAY rows). We
 * reject the PAY row for THIS order, and reject the shared TOPUP only when no other
 * pending PAY still references it — so cancelling one order never clears another
 * live order's slip.
 *
 * Best-effort: never throws. Callers MUST NOT fail the cancel/delete if this errors
 * (the order cancel is the primary action; the slip cleanup is a follow-up).
 */
export async function rejectPendingSlipsForCancelledOrder(
  admin: SupabaseClient,
  orderNo: string | number,
  byId: string,
): Promise<{ rejectedPays: number; rejectedTopups: number }> {
  const ord = String(orderNo).trim();
  if (!ord) return { rejectedPays: 0, rejectedTopups: 0 };

  try {
    // 1. The pending PAY rows for this order (type 2=shop · 4=forwarder).
    const { data: payRows, error: payErr } = await admin
      .from("tb_wallet_hs")
      .select("id, reforder2")
      .eq("reforder", ord)
      .in("type", ["2", "4"])
      .eq("status", "1");
    if (payErr) {
      console.error(`[reject-cancelled-order-slips pay lookup] failed`, { ord, code: payErr.code, message: payErr.message });
      return { rejectedPays: 0, rejectedTopups: 0 };
    }
    const pays = (payRows ?? []) as Array<{ id: number; reforder2: string | number | null }>;
    if (pays.length === 0) return { rejectedPays: 0, rejectedTopups: 0 };

    const payIds = pays.map((p) => p.id);
    const topupIds = [...new Set(pays.map((p) => String(p.reforder2 ?? "").trim()).filter(Boolean))];

    // 2. Reject the PAY rows (status 1→3 · idempotent via .eq("status","1")).
    const { error: payUpdErr } = await admin
      .from("tb_wallet_hs")
      .update({ status: "3", adminidupdate: byId })
      .in("id", payIds)
      .eq("status", "1");
    if (payUpdErr) {
      console.error(`[reject-cancelled-order-slips pay reject] failed`, { ord, code: payUpdErr.code, message: payUpdErr.message });
      return { rejectedPays: 0, rejectedTopups: 0 };
    }

    // 3. Reject each TOPUP only when no OTHER pending PAY still references it
    //    (a shared deposit that still pays a live order must stay in the queue).
    let rejectedTopups = 0;
    for (const tid of topupIds) {
      const { count, error: cntErr } = await admin
        .from("tb_wallet_hs")
        .select("id", { count: "exact", head: true })
        .eq("reforder2", tid)
        .in("type", ["2", "4"])
        .eq("status", "1");
      if (cntErr) {
        console.error(`[reject-cancelled-order-slips topup recount] failed`, { tid, code: cntErr.code });
        continue;
      }
      if ((count ?? 0) > 0) continue; // other live orders still use this topup — keep it.
      const { count: upd } = await admin
        .from("tb_wallet_hs")
        .update({ status: "3", adminidupdate: byId }, { count: "exact" })
        .eq("id", tid)
        .eq("status", "1");
      rejectedTopups += upd ?? 0;
    }

    return { rejectedPays: pays.length, rejectedTopups };
  } catch (e) {
    console.error(`[reject-cancelled-order-slips] unexpected`, { ord, message: (e as Error)?.message });
    return { rejectedPays: 0, rejectedTopups: 0 };
  }
}
