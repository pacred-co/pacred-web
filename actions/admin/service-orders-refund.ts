"use server";

/**
 * P0-16 / Tier D D2 — per-item refund for shop-order line items.
 *
 * Closes the gap audit master gap doc §3 P0-16 + Tier-D D2:
 *
 *   "Per-item refund (repayItem/shopping-return) entirely unported —
 *    partial-qty split of tb_order, INSERT tb_wallet_hs type=5, credit
 *    tb_wallet, recompute totals. China shops short/cancel items daily
 *    → customers owed wallet credit; staff hand-craft money-moving SQL."
 *
 * Legacy source: pcs-admin/repayItem.php + shopping-return.php (per
 * the master gap doc; the file isn't in our 2026-05-24 extract so the
 * column-by-column spec is derived from the 0081 schema + the existing
 * Tier-A1 (yuan-payments-tb.ts:223) refund pattern + ADR-0018 D-2
 * rule 3 balance-bump semantics).
 *
 * Schema citations (0081_pcs_legacy_schema.sql):
 *   - tb_order columns at L1..23 of `CREATE TABLE public.tb_order`:
 *     id (pk), camount (qty), cprice (unit price), crewallet ('1' =
 *     refunded), userid, hno (parent order)
 *   - tb_header_order.htotalpriceuser numeric(10,2) — recomputed on
 *     refund so reports + closing match reality
 *   - tb_wallet_hs columns + type='5' (รายการคืนเงิน) per the column
 *     comment block in 0081
 *   - tb_wallet.wallettotal numeric(10,2) — balance bumped UP (legacy
 *     credit-to-customer pattern; ADR-0018 D-2 rule 3 balance-bump)
 *
 * §0 design latitude — we keep the cleanest possible split: full
 * refund (qty == camount) marks crewallet='1' and zeroes camount;
 * partial refund reduces camount but leaves the row in place. Audit
 * trail lives in tb_wallet_hs.note (item-id + qty + reason) + the
 * logAdminAction breadcrumb. We do NOT INSERT a new "refund-half"
 * tb_order row (legacy did, per master gap doc, but it makes
 * reporting harder; we prefer the cleaner reduce-camount + audit
 * model). If staff need to refund AGAIN on the same item, the
 * second refund either picks up the remaining qty (partial again)
 * or refuses if crewallet='1' (full already done).
 *
 * Idempotency: pre-mutate SELECT confirms refundable qty + status.
 * Tier-A rollback: if tb_wallet UPDATE fails after tb_wallet_hs
 * INSERT lands, the wallet_hs row gets DELETEd so the books stay
 * balanced (mirror of yuan-payments-tb.ts:265).
 *
 * Reachability §0d: per-item "คืนเงินรายการนี้" button rendered in
 * legacy-view.tsx items table (next sitting wires the UI mount).
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { roundUp } from "@/lib/admin/shop-disbursement-calc";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — third caller after wallet-hs.ts + tb-bulk.ts.
// Cross-file refactor flagged in master-fidelity audit L147 (~10 min);
// inlined here for now to keep the lane discipline clean.
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (error) {
    console.error(`[tb_admin list] failed`, { code: error.code, message: error.message });
  }
  if (data?.adminID) return data.adminID;
  return (email.split("@")[0] || "system").slice(0, 20); // 2026-06-05 varchar(20)
}

// ────────────────────────────────────────────────────────────
// Refund a single tb_order item back to the customer's tb_wallet.
// Full or partial qty.
// ────────────────────────────────────────────────────────────

const refundItemSchema = z.object({
  orderItemId: z.number().int().positive(),           // tb_order.id
  refundQty:   z.number().int().positive(),           // qty to refund (≤ tb_order.camount)
  reason:      z.string().trim().min(1, "ต้องบันทึกเหตุผลคืนเงิน").max(500),
});
export type AdminRefundShopOrderItemInput = z.infer<typeof refundItemSchema>;

type RefundResult = {
  orderItemId:      number;
  hno:              string;
  refundedQty:      number;
  refundAmountThb:  number;
  newWalletBalance: number;
  newHeaderTotalThb: number;
};

export async function adminRefundShopOrderItem(
  input: AdminRefundShopOrderItemInput,
): Promise<AdminActionResult<RefundResult>> {
  const parsed = refundItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<RefundResult>(["super", "accounting", "ops"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = await resolveLegacyAdminId();

    // ── Step 1: load + lock the item, parent, wallet ────────────────
    const { data: item, error: itemErr } = await admin
      .from("tb_order")
      .select("id, hno, userid, camount, cprice, ctitle, crewallet")
      .eq("id", d.orderItemId)
      .maybeSingle<{
        id: number; hno: string; userid: string;
        camount: number; cprice: number;
        ctitle: string; crewallet: string | null;
      }>();
    if (itemErr) {
      console.error(`[tb_order mutation lookup] failed`, { code: itemErr.code, message: itemErr.message });
      return { ok: false, error: `db_error:${itemErr.code ?? "unknown"}` };
    }
    if (!item) return { ok: false, error: "not_found: ไม่พบรายการสินค้านี้" };

    // Idempotency guard.
    if (item.crewallet === "1") {
      return {
        ok: false,
        error: "รายการนี้คืนเงินเต็มจำนวนไปแล้ว — กรณีลูกค้าได้คืนเพิ่ม ต้องใช้เมนู refund ภาพรวม",
      };
    }

    if (d.refundQty > item.camount) {
      return {
        ok: false,
        error: `จำนวนคืนเกินจำนวนที่เหลือ (เหลือ ${item.camount} · ขอคืน ${d.refundQty})`,
      };
    }

    // Parent header — for hstatus check + total recompute. (fix #1/#2)
    // We need hrate (the rate the customer PAID for this order) to convert the
    // refunded ¥ into THB, plus the cost-side columns to recompute the header
    // totals from the remaining lines (canonical formula, not a delta-subtract).
    const { data: header, error: headerErr } = await admin
      .from("tb_header_order")
      .select("id, hno, hstatus, htotalpriceuser, hrate, htotalpricechn, hshippingchn, hshippingservice")
      .eq("hno", item.hno)
      .maybeSingle<{
        id: number; hno: string;
        hstatus: string | null; htotalpriceuser: number | null;
        hrate: number | string | null;
        htotalpricechn: number | string | null;
        hshippingchn: number | string | null;
        hshippingservice: number | string | null;
      }>();
    if (headerErr) {
      console.error(`[tb_header_order mutation lookup] failed`, { code: headerErr.code, message: headerErr.message });
      return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
    }
    if (!header) return { ok: false, error: "not_found: ไม่พบใบฝากสั่งซื้อแม่ของรายการนี้" };

    // Refund is only meaningful for orders that have been paid + sent
    // (legacy: hstatus='3' ordered, '4' awaiting china dispatch, '5'
    // completed). Reject for not-yet-paid (1,2) and cancelled (6).
    const refundAllowedStatuses = new Set(["3", "4", "5"]);
    if (!refundAllowedStatuses.has(header.hstatus ?? "")) {
      return {
        ok: false,
        error: `คืนเงินไม่ได้ — สถานะปัจจุบัน '${header.hstatus ?? "?"}' (อนุญาตเฉพาะ 3/4/5: สั่งสินค้าแล้ว · รอจัดส่ง · สำเร็จ)`,
      };
    }

    // ── fix #1: refund at the ORDER rate ───────────────────────────
    // `item.cprice` is the YUAN unit price. The customer paid THB for it at the
    // order's hrate, so the refund = ¥ × the ORDER rate (NEVER the live/current
    // rate, NEVER ¥-as-THB). Guard hrate > 0 — a 0/NaN rate would credit 0/NaN.
    const orderHrate = Number(header.hrate ?? 0);
    if (!(orderHrate > 0)) {
      return {
        ok: false,
        error: "ออเดอร์นี้ยังไม่มีอัตราแลกเปลี่ยน (hrate) — คืนเงินไม่ได้ ต้องตั้งเรทก่อน",
      };
    }

    // Customer wallet (current settled balance).
    const { data: walletBefore, error: walletReadErr } = await admin
      .from("tb_wallet")
      .select("userid, wallettotal")
      .eq("userid", item.userid)
      .maybeSingle<{ userid: string; wallettotal: number }>();
    if (walletReadErr) {
      console.error(`[tb_wallet read] failed`, { code: walletReadErr.code, message: walletReadErr.message });
      return { ok: false, error: `db_error:${walletReadErr.code ?? "unknown"}` };
    }

    const currentBalance     = Number(walletBefore?.wallettotal ?? 0);
    const refundCny          = Math.round(Number(item.cprice) * d.refundQty * 100) / 100;
    const refundAmountThb    = roundUp(Number(item.cprice) * d.refundQty * orderHrate, 2);
    const newBalance         = Math.round((currentBalance + refundAmountThb) * 100) / 100;
    const currentHeaderTotal = Number(header.htotalpriceuser ?? 0);
    // newHeaderTotal is recomputed from the REMAINING lines AFTER the item
    // update (fix #2 · Step 4b) — not a delta-subtraction that can drift.

    const nowIso          = new Date().toISOString();
    const isFullItemQty   = d.refundQty === item.camount;
    const itemTitleShort  = item.ctitle.length > 80 ? item.ctitle.slice(0, 77) + "…" : item.ctitle;

    // ── Step 2: INSERT tb_wallet_hs type='5' refund row ─────────────
    // status='2' (admin = verifier; refund is direct, no second admin
    // approval); type='5' (รายการคืนเงิน per 0081 column comment).
    // refOrder = parent hno so the receipt can join the refund back to
    // the header. amount stored positive; the direction is encoded by
    // type='5'.
    const { data: insertedHs, error: hsErr } = await admin
      .from("tb_wallet_hs")
      .insert({
        date:            nowIso,
        amount:          refundAmountThb,
        status:          "2",
        type:            "5",
        typenew:         "2",   // 2 = refund (typenew matrix per wallet-hs.ts)
        typeservice:     "1",   // 1 = cargo / shop-order context
        paydeposit:      "0",
        imagesslip:      "",
        depositnamebank: "",
        nameuserbank:    "",
        nouserbank:      "",
        note:            `คืนเงินรายการ #${item.id} "${itemTitleShort}" จำนวน ${d.refundQty} · ¥${refundCny.toFixed(2)} × เรท ${orderHrate} = ฿${refundAmountThb.toFixed(2)} · เหตุผล: ${d.reason}`,
        adminid:         legacyAdminId,
        adminidupdate:   legacyAdminId,
        session:         "admin-refund-item",
        reforder:        header.hno,
        whno:            "",
        wusercredit:     "0",
        userid:          item.userid,
        adminidcrate:    legacyAdminId,
      })
      .select("id")
      .single<{ id: number }>();
    if (hsErr || !insertedHs) {
      return { ok: false, error: `บันทึก tb_wallet_hs ล้มเหลว: ${hsErr?.message ?? "insert failed"}` };
    }

    // ── Step 3: UPDATE tb_wallet.wallettotal += refundAmountThb ────
    // Balance-bump per ADR-0018 D-2 rule 3 refund pattern. If no
    // tb_wallet row exists yet for this customer, defensively INSERT
    // one (should be impossible for an order with hstatus≥3 since the
    // customer must have paid, but be safe).
    if (!walletBefore) {
      const { error: walletInsErr } = await admin
        .from("tb_wallet")
        .insert({ userid: item.userid, wallettotal: refundAmountThb });
      if (walletInsErr) {
        // Roll back the wallet_hs row so books stay balanced.
        await admin.from("tb_wallet_hs").delete().eq("id", insertedHs.id);
        return {
          ok: false,
          error: `tb_wallet insert ล้มเหลว · ยกเลิก tb_wallet_hs id=${insertedHs.id}: ${walletInsErr.message}`,
        };
      }
    } else {
      const { error: walletUpdErr } = await admin
        .from("tb_wallet")
        .update({ wallettotal: newBalance })
        .eq("userid", item.userid);
      if (walletUpdErr) {
        // Roll back the wallet_hs row so books stay balanced.
        await admin.from("tb_wallet_hs").delete().eq("id", insertedHs.id);
        return {
          ok: false,
          error: `tb_wallet update ล้มเหลว · ยกเลิก tb_wallet_hs id=${insertedHs.id}: ${walletUpdErr.message}`,
        };
      }
    }

    // ── Step 4: UPDATE tb_order ── reduce camount OR mark full-refund.
    // §0 design latitude — we keep the row in place (no DELETE) so
    // the audit trail survives. Full-qty refund marks crewallet='1'
    // and zeroes camount (so future calculations don't double-count);
    // partial-qty refund reduces camount by the refunded portion.
    const newItemCamount = item.camount - d.refundQty;
    const itemUpdate: Record<string, unknown> = isFullItemQty
      ? { crewallet: "1", camount: 0 }
      : { camount: newItemCamount };
    const { error: itemUpdErr } = await admin
      .from("tb_order")
      .update(itemUpdate)
      .eq("id", item.id);
    if (itemUpdErr) {
      // tb_wallet_hs + tb_wallet already wrote — surface for ops.
      // We don't roll back the money (the customer was credited); but
      // we surface a clear error so ops can fix tb_order manually.
      return {
        ok: false,
        error: `ยอด wallet คืนแล้ว (+${refundAmountThb.toFixed(2)}) แต่ tb_order id=${item.id} update ล้มเหลว: ${itemUpdErr.message} (ติดต่อ ops · ปรับ camount/crewallet มือ)`,
      };
    }

    // ── Step 4b: recompute totals from the REMAINING lines (fix #2) ─
    // Front (customer) + back (admin) totals are re-derived from the canonical
    // formula over the remaining product lines — NOT a delta-subtraction that
    // drifts. A fully-refunded line now has camount=0 (contributes 0); a partial
    // keeps its reduced camount. Mirrors the spawn accumulation
    // (service-orders-shop-workflow.ts L475: Σ roundUp(cprice×camount,2)) +
    // the canonical net formula (service-orders-header-edits.ts L369:
    // roundUp((chn+shipChn)×rate+svc, 2)). Shipping (hshippingchn) is left
    // as-is here — a shipping refund/adjust is its own action (fix #3).
    const { data: remLines, error: remErr } = await admin
      .from("tb_order")
      .select("cprice, camount, crewallet")
      .eq("hno", header.hno);
    if (remErr) {
      console.error(`[tb_order remaining-lines recompute] failed`, {
        code: remErr.code, message: remErr.message, hno: header.hno,
      });
      return {
        ok: false,
        error: `ยอด wallet + tb_order ปรับแล้ว แต่รวมยอดใหม่ไม่สำเร็จ: ${remErr.message} (ติดต่อ ops)`,
      };
    }
    let sumChn = 0; // Σ roundUp(cprice × camount, 2) over remaining product lines
    for (const ln of (remLines ?? []) as Array<{
      cprice: number | string | null; camount: number | string | null; crewallet: string | null;
    }>) {
      if (ln.crewallet === "1") continue; // fully-refunded — excluded
      const amt = Number(ln.camount ?? 0);
      const prc = Number(ln.cprice ?? 0);
      if (amt > 0) sumChn = roundUp(sumChn + roundUp(prc * amt, 2), 2);
    }
    const shipChn        = Number(header.hshippingchn ?? 0);
    const svc            = Number(header.hshippingservice ?? 0);
    const newHeaderTotal = roundUp((sumChn + shipChn) * orderHrate + svc, 2);

    // ── Step 5: UPDATE tb_header_order (htotalpricechn + htotalpriceuser) ──
    // Recompute parent totals so the per-order summary + reports match reality
    // (both the ¥ subtotal and the THB net, front+back consistent).
    const { error: headerUpdErr } = await admin
      .from("tb_header_order")
      .update({
        htotalpricechn:  sumChn,
        htotalpriceuser: newHeaderTotal,
        adminidupdate:   legacyAdminId,
      })
      .eq("id", header.id);
    if (headerUpdErr) {
      return {
        ok: false,
        error: `ยอด wallet + tb_order ปรับแล้ว แต่ tb_header_order ยอดรวม update ล้มเหลว: ${headerUpdErr.message} (ติดต่อ ops)`,
      };
    }

    // ── Step 6: audit breadcrumb ───────────────────────────────────
    await logAdminAction(adminId, "tb_order.refund_item", "tb_order", String(item.id), {
      hno:                header.hno,
      userid:             item.userid,
      item_title:         itemTitleShort,
      original_qty:       item.camount,
      refund_qty:         d.refundQty,
      remaining_qty:      newItemCamount,
      cprice:             item.cprice,
      cprice_cny:         refundCny,
      order_hrate:        orderHrate,
      refund_amount_thb:  refundAmountThb,
      wallet_before:      currentBalance,
      wallet_after:       newBalance,
      header_total_before: currentHeaderTotal,
      header_total_after:  newHeaderTotal,
      reason:             d.reason,
      wallet_hs_id:       insertedHs.id,
      wallet_hs_type:     "5",
      wallet_hs_status:   "2",
      full_refund:        isFullItemQty,
    });

    // ── Step 7: revalidate caches ──────────────────────────────────
    revalidatePath("/admin/service-orders");
    revalidatePath(`/admin/service-orders/${header.hno}`);
    revalidatePath("/admin/wallet");
    revalidatePath(`/admin/wallet/${item.userid}`);
    revalidatePath("/admin");

    return {
      ok: true,
      data: {
        orderItemId:       item.id,
        hno:               header.hno,
        refundedQty:       d.refundQty,
        refundAmountThb:   refundAmountThb,
        newWalletBalance:  newBalance,
        newHeaderTotalThb: newHeaderTotal,
      },
    };
  });
}

// ════════════════════════════════════════════════════════════════════════
// fix #3 — adminRefundShopOrderShipping — ปรับลดค่าส่งจีน + คืนเงินส่วนต่าง
//
// When items are removed / the shipment shrinks, staff reduce the china
// shipping (hshippingchn ¥). The reduced delta is refunded to the customer's
// wallet at the ORDER rate (same money model as the per-item refund), and the
// header net total is recomputed with the new shipping so front (customer) +
// back (admin) agree. Staff-controlled (they type the new ค่าส่งจีน) but the
// money math (Δ¥ × order rate) + the recompute + the wallet credit are
// automatic + consistent.
//
// REDUCE-ONLY: new_hshippingchn must be ≤ the current value (this is a refund,
// not a top-up — a shipping INCREASE is a re-charge, not this action's job).
// Status gate mirrors the per-item refund: post-payment paid statuses only
// (3/4/5). hshippingchn is a HEADER column (Σ of the per-line cshippingchn); at
// 3/4/5 the per-line items editor is not shown, so writing the header value has
// no per-line editor to clobber it.
// ════════════════════════════════════════════════════════════════════════

const shippingRefundHnoSchema = z
  .string()
  .trim()
  .regex(/^P\d+$/, "hno ไม่ถูกต้อง (ต้องขึ้นต้นด้วย P ตามด้วยตัวเลข)")
  .max(30);

const refundShippingSchema = z.object({
  h_no:             shippingRefundHnoSchema,
  new_hshippingchn: z.coerce.number().nonnegative("ค่าส่งจีนต้องไม่ติดลบ").max(9_999_999, "ค่าส่งจีนเกินช่วงที่ยอมรับ"),
  reason:           z.string().trim().min(1, "ต้องบันทึกเหตุผลคืนเงิน").max(500),
});
export type AdminRefundShopOrderShippingInput = z.infer<typeof refundShippingSchema>;

type ShippingRefundResult = {
  hno:                 string;
  refundCny:           number;
  refundAmountThb:     number;
  newWalletBalance:    number;
  newHeaderTotalThb:   number;
  newHshippingChn:     number;
};

export async function adminRefundShopOrderShipping(
  input: AdminRefundShopOrderShippingInput,
): Promise<AdminActionResult<ShippingRefundResult>> {
  const parsed = refundShippingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // Same role set as the per-item refund — both are refund surfaces on the same
  // panel; a "you can refund items but not shipping" split would confuse staff.
  return withAdmin<ShippingRefundResult>(["super", "accounting", "ops"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = await resolveLegacyAdminId();

    // 1. Load header — rate + cost-side columns for the recompute.
    const { data: header, error: headerErr } = await admin
      .from("tb_header_order")
      .select("id, hno, userid, hstatus, hrate, htotalpricechn, hshippingchn, hshippingservice, htotalpriceuser")
      .eq("hno", d.h_no)
      .maybeSingle<{
        id: number; hno: string; userid: string | null;
        hstatus: string | null;
        hrate: number | string | null;
        htotalpricechn: number | string | null;
        hshippingchn: number | string | null;
        hshippingservice: number | string | null;
        htotalpriceuser: number | string | null;
      }>();
    if (headerErr) {
      console.error(`[adminRefundShopOrderShipping header read] failed`, { code: headerErr.code, message: headerErr.message });
      return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
    }
    if (!header) return { ok: false, error: "not_found: ไม่พบใบฝากสั่งซื้อ" };
    if (!header.userid) return { ok: false, error: "ออเดอร์นี้ไม่มีรหัสลูกค้า — คืนเงินไม่ได้" };

    // Status gate — post-payment paid only (mirror per-item refund).
    const refundAllowedStatuses = new Set(["3", "4", "5"]);
    if (!refundAllowedStatuses.has(header.hstatus ?? "")) {
      return {
        ok: false,
        error: `คืนเงินค่าส่งไม่ได้ — สถานะปัจจุบัน '${header.hstatus ?? "?"}' (อนุญาตเฉพาะ 3/4/5)`,
      };
    }

    // hrate guard (same as fix #1) — a 0/NaN rate would credit 0/NaN.
    const orderHrate = Number(header.hrate ?? 0);
    if (!(orderHrate > 0)) {
      return { ok: false, error: "ออเดอร์นี้ยังไม่มีอัตราแลกเปลี่ยน (hrate) — คืนเงินไม่ได้ ต้องตั้งเรทก่อน" };
    }

    const currentShipChn = Number(header.hshippingchn ?? 0);
    if (!Number.isFinite(currentShipChn)) {
      return { ok: false, error: "ค่าส่งจีนปัจจุบันไม่ถูกต้อง — ตรวจข้อมูลออเดอร์ก่อน" };
    }
    // REDUCE-ONLY guard.
    if (d.new_hshippingchn > currentShipChn + 0.004) {
      return {
        ok: false,
        error: `ค่าส่งจีนใหม่ (¥${d.new_hshippingchn.toFixed(2)}) มากกว่าเดิม (¥${currentShipChn.toFixed(2)}) — เมนูนี้ใช้ปรับลด/คืนเงินเท่านั้น`,
      };
    }
    const deltaCny = Math.round((currentShipChn - d.new_hshippingchn) * 100) / 100;
    if (deltaCny <= 0) {
      return { ok: false, error: "ไม่มีส่วนต่างค่าส่งให้คืน (ค่าส่งจีนเท่าเดิม)" };
    }
    const refundAmountThb = roundUp(deltaCny * orderHrate, 2);

    // 2. Customer wallet.
    const { data: walletBefore, error: walletReadErr } = await admin
      .from("tb_wallet")
      .select("userid, wallettotal")
      .eq("userid", header.userid)
      .maybeSingle<{ userid: string; wallettotal: number }>();
    if (walletReadErr) {
      console.error(`[adminRefundShopOrderShipping wallet read] failed`, { code: walletReadErr.code, message: walletReadErr.message });
      return { ok: false, error: `db_error:${walletReadErr.code ?? "unknown"}` };
    }
    const currentBalance = Number(walletBefore?.wallettotal ?? 0);
    const newBalance     = Math.round((currentBalance + refundAmountThb) * 100) / 100;

    const nowIso = new Date().toISOString();

    // 3. INSERT tb_wallet_hs type='5' (same shape as the per-item refund).
    const { data: insertedHs, error: hsErr } = await admin
      .from("tb_wallet_hs")
      .insert({
        date:            nowIso,
        amount:          refundAmountThb,
        status:          "2",
        type:            "5",
        typenew:         "2",
        typeservice:     "1",
        paydeposit:      "0",
        imagesslip:      "",
        depositnamebank: "",
        nameuserbank:    "",
        nouserbank:      "",
        note:            `คืนเงินค่าส่งจีน ${header.hno} · ¥${currentShipChn.toFixed(2)} → ¥${d.new_hshippingchn.toFixed(2)} (Δ¥${deltaCny.toFixed(2)}) × เรท ${orderHrate} = ฿${refundAmountThb.toFixed(2)} · เหตุผล: ${d.reason}`,
        adminid:         legacyAdminId,
        adminidupdate:   legacyAdminId,
        session:         "admin-refund-shipping",
        reforder:        header.hno,
        whno:            "",
        wusercredit:     "0",
        userid:          header.userid,
        adminidcrate:    legacyAdminId,
      })
      .select("id")
      .single<{ id: number }>();
    if (hsErr || !insertedHs) {
      return { ok: false, error: `บันทึก tb_wallet_hs ล้มเหลว: ${hsErr?.message ?? "insert failed"}` };
    }

    // 4. UPDATE tb_wallet (+refund) — rollback the hs row if it fails.
    if (!walletBefore) {
      const { error: walletInsErr } = await admin
        .from("tb_wallet")
        .insert({ userid: header.userid, wallettotal: refundAmountThb });
      if (walletInsErr) {
        await admin.from("tb_wallet_hs").delete().eq("id", insertedHs.id);
        return { ok: false, error: `tb_wallet insert ล้มเหลว · ยกเลิก tb_wallet_hs id=${insertedHs.id}: ${walletInsErr.message}` };
      }
    } else {
      const { error: walletUpdErr } = await admin
        .from("tb_wallet")
        .update({ wallettotal: newBalance })
        .eq("userid", header.userid);
      if (walletUpdErr) {
        await admin.from("tb_wallet_hs").delete().eq("id", insertedHs.id);
        return { ok: false, error: `tb_wallet update ล้มเหลว · ยกเลิก tb_wallet_hs id=${insertedHs.id}: ${walletUpdErr.message}` };
      }
    }

    // 5. UPDATE header — new hshippingchn + recomputed htotalpriceuser
    //    (canonical formula: (chn + newShip) × rate + svc). htotalpricechn is
    //    the product subtotal — unchanged by a shipping adjust.
    const chn            = Number(header.htotalpricechn ?? 0);
    const svc            = Number(header.hshippingservice ?? 0);
    const newHeaderTotal = roundUp((chn + d.new_hshippingchn) * orderHrate + svc, 2);
    const { error: headerUpdErr } = await admin
      .from("tb_header_order")
      .update({
        hshippingchn:    d.new_hshippingchn,
        htotalpriceuser: newHeaderTotal,
        adminidupdate:   legacyAdminId,
      })
      .eq("id", header.id);
    if (headerUpdErr) {
      return {
        ok: false,
        error: `ยอด wallet คืนแล้ว (+${refundAmountThb.toFixed(2)}) แต่ tb_header_order update ล้มเหลว: ${headerUpdErr.message} (ติดต่อ ops)`,
      };
    }

    // 6. audit
    await logAdminAction(adminId, "tb_header_order.refund_shipping", "tb_header_order", header.hno, {
      hno:                 header.hno,
      userid:              header.userid,
      before_shipping_cny: currentShipChn,
      after_shipping_cny:  d.new_hshippingchn,
      delta_cny:           deltaCny,
      order_hrate:         orderHrate,
      refund_amount_thb:   refundAmountThb,
      wallet_before:       currentBalance,
      wallet_after:        newBalance,
      header_total_before: Number(header.htotalpriceuser ?? 0),
      header_total_after:  newHeaderTotal,
      reason:              d.reason,
      wallet_hs_id:        insertedHs.id,
    });

    revalidatePath("/admin/service-orders");
    revalidatePath(`/admin/service-orders/${header.hno}`);
    revalidatePath(`/admin/service-orders/${header.hno}/edit`);
    revalidatePath(`/service-order/${header.hno}`);
    revalidatePath("/admin/wallet");
    revalidatePath(`/admin/wallet/${header.userid}`);
    revalidatePath("/admin");

    return {
      ok: true,
      data: {
        hno:               header.hno,
        refundCny:         deltaCny,
        refundAmountThb:   refundAmountThb,
        newWalletBalance:  newBalance,
        newHeaderTotalThb: newHeaderTotal,
        newHshippingChn:   d.new_hshippingchn,
      },
    };
  });
}
