"use server";

/**
 * P0-19 — Admin pay-on-behalf (จ่ายแทนลูกค้า) — shop-order leg.
 *
 * Faithful port of the sufficient-balance branch of legacy
 * `pcs-admin/pay-users.php` `paymentOrder` handler (L4-200). A staff member
 * takes a phone/LINE customer's wallet payment for their unpaid ฝากสั่ง
 * orders: debit `tb_wallet`, write the `tb_wallet_hs` settled ledger row
 * (type='2'), flip `tb_header_order.hStatus` 2→3, notify the customer.
 *
 * This is the ADMIN twin of the customer-self `payServiceOrderFromWallet`
 * (actions/service-order.ts) — SAME ADR-0018 wallet contract + SAME price
 * helper (`computeShopOrderDebitTotal`), so a given order debits the exact
 * same THB whether the customer self-pays or staff pays on their behalf.
 * The only differences: any customer (no member_code self-pin), multi-order
 * loop, and `adminid`/`adminidcrate` = the acting staff's legacy slug
 * (legacy pay-users.php L65 wrote `adminIDCrate=$adminID`).
 *
 * SCHEMA CASING (verified): `tb_users` + `tb_admin` = camelCase (userID /
 * userName / adminID / adminEmail); `tb_wallet` / `tb_wallet_hs` /
 * `tb_header_order` = lowercase (userid / wallettotal / hno / hstatus).
 *
 * SCOPE (Phase 1 — shop orders): `adminPayOrdersOnBehalf` ports the shop
 * `paymentOrder` leg (hStatus 2→3).
 *
 * SCOPE (Phase 2 — forwarder leg, THIS extension): `adminPayForwardersOnBehalf`
 * ports the sufficient-balance branch of the `paymentForwarderNew` handler
 * (pay-users.php L202-500), debiting `tb_wallet` for unpaid ฝากนำเข้า rows
 * (fStatus='5' OR fCredit='1') and flipping `tb_forwarder.fStatus` 5→6. SAME
 * debit/idempotency/rollback pattern as the shop leg; the pricing (incl. PCSF
 * เหมาๆ ฿50 + corporate 1%) is factored into the pure helper
 * `lib/forwarder/forwarder-debit-total.ts` so the money math is tested.
 *
 * SCOPE (Phase 3 — slip-top-up-and-pay, THIS extension):
 * `adminPayOrdersWithTopUp` + `adminPayForwardersWithTopUp` port the
 * INSUFFICIENT-balance branches (shop pay-users.php L85-191; forwarder
 * "no-wallet-money" path #1 L342-433). When the customer can't cover the
 * selected total, staff upload a bank-transfer slip → the action writes a
 * PENDING top-up deposit (`tb_wallet_hs` type='1' status='1', with the slip
 * + `paydeposit='1'`), then per-item PENDING pay rows linking `refOrder2=whID`,
 * a `tb_wallet_paydeposit(whID,itemId)` bridge per item, and flips the item
 * status forward. The money is NOT settled here — the deposit awaits admin
 * approval via `adminApproveWalletDeposit` (actions/admin/wallet-hs.ts), which
 * is the exact mirror image that cascades these linked rows to status='2'
 * (or `adminRejectWalletDeposit` which reverts + refunds). See the BALANCE
 * MOVEMENT contract block above each Phase-3 action for the line-by-line cite.
 */

import { revalidatePath } from "next/cache";
import { MAO_FLAT_FEE } from "@/lib/forwarder/mao-fee";
import { bustAdminChrome } from "@/lib/cache/revalidate-chrome";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { resolveProfileIdsForLegacyUserids } from "@/lib/auth/tb-users-resolver";
import { computeShopOrderDebitTotal } from "@/lib/service-order/debit-total";
import {
  computeForwarderDebitBatch,
  type ForwarderDebitRow,
  type ForwarderCollectBreakdown,
} from "@/lib/forwarder/forwarder-debit-total";
import { uploadToBucket } from "@/lib/storage/upload";
import { autoIssueReceiptOnPaymentLand } from "@/lib/admin/auto-issue-receipt";
import { logger } from "@/lib/logger";
import { BANK } from "@/components/seo/site";

// Destination bank stamped on every slip-top-up deposit row (shop
// pay-users.php L103 + forwarder L360/L578). 2026-06-01 brand swap (owner GO):
// points at the Pacred account (components/seo/site.ts BANK) instead of the
// legacy PCS `064-174-3836`. Format kept identical ("KBANK-<acct>"), matching
// the customer-self deposit path in actions/wallet.ts so admin- and
// customer-created deposit rows record the same account.
const PAYUSER_DEPOSIT_NAMEBANK = `KBANK-${BANK.accountNumber}`;

// The exact tb_forwarder pricing columns the debit helper reads (lowercase =
// PostgREST casing, verified against actions/admin/forwarders-bulk.ts +
// lib/forwarder/outstanding.ts). Kept as one constant so the SELECT and the
// helper stay in lock-step.
const FORWARDER_PRICE_COLS =
  "id, fshipby, fcabinetnumber, paymethod, ftotalprice, ftransportprice, fpriceupdate, fshippingservice, pricecrate, ftransportpricechnthb, priceother, fdiscount" as const;

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — local copy (same pattern as service-orders.ts L29
// + 8 other admin actions; the dup is a known consolidation TODO). Maps the
// acting Pacred admin's auth email → legacy `tb_admin.adminID` for the
// audit columns (adminid / adminidcrate). Fallback: raw email → "system".
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[pay-user.resolveLegacyAdminId auth.getUser] failed`, {
      code: authErr.code, message: authErr.message,
    });
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
    console.error(`[pay-user.resolveLegacyAdminId tb_admin lookup] failed`, {
      code: error.code, message: error.message,
    });
  }
  return data?.adminID ?? email;
}

// ════════════════════════════════════════════════════════════
// CONTEXT LOADER — customer + wallet balance + unpaid shop orders
// (mirrors pay-users.php getUserID.php + getWallet.php + getListPay.php)
// ════════════════════════════════════════════════════════════

export type PayUserUnpaidOrder = {
  hno: string;
  price_thb: number;
  hdatepayment: string | null;
};

export type PayUserForwarder = {
  fid: string;
  price_thb: number;
  ftracking: string | null;
  fstatus: string | null;
  /** true if this row reached the list via fCredit='1' (not fStatus='5'). */
  is_credit: boolean;
  /** Itemised "what is this charge" breakdown (owner 2026-06-19: แจงรายละเอียดค่า). */
  breakdown: ForwarderCollectBreakdown;
};

export type PayUserContext = {
  user: { userid: string; name: string; tel: string | null };
  wallet_balance: number;
  orders: PayUserUnpaidOrder[];
  /** Phase 2 — unpaid ฝากนำเข้า rows (fStatus='5' OR fCredit='1'). */
  forwarders: PayUserForwarder[];
  /** true if a tb_corporate row exists (drives the 1% allowance preview). */
  is_corporate: boolean;
};

export async function getPayUserContext(
  userCode: string,
): Promise<AdminActionResult<PayUserContext>> {
  return withAdmin(undefined, async () => {
    const code = (userCode ?? "").trim().toUpperCase();
    if (!code) return { ok: false, error: "กรุณากรอกรหัสลูกค้า" };

    const admin = createAdminClient();

    // 1. customer (tb_users — camelCase)
    const { data: u, error: uErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel")
      .eq("userID", code)
      .maybeSingle<{
        userID: string;
        userName: string | null;
        userLastName: string | null;
        userTel: string | null;
      }>();
    if (uErr) {
      console.error(`[getPayUserContext tb_users] failed`, { code: uErr.code, message: uErr.message, userid: code });
      return { ok: false, error: `db_error:${uErr.code ?? "unknown"}` };
    }
    if (!u) return { ok: false, error: `ไม่พบลูกค้า ${code}` };

    // 2. wallet (tb_wallet — lowercase)
    const { data: w, error: wErr } = await admin
      .from("tb_wallet")
      .select("wallettotal")
      .eq("userid", code)
      .maybeSingle<{ wallettotal: number | string | null }>();
    if (wErr) {
      console.error(`[getPayUserContext tb_wallet] failed`, { code: wErr.code, message: wErr.message, userid: code });
      return { ok: false, error: `db_error:${wErr.code ?? "unknown"}` };
    }

    // 3. unpaid shop orders (tb_header_order hstatus='2' AND hdatepayment>now —
    //    legacy pay-users.php getListPay.php L16; expired-quote orders excluded).
    const nowIso = new Date().toISOString();
    const { data: rows, error: oErr } = await admin
      .from("tb_header_order")
      .select("hno, hstatus, htotalpriceuser, htotalpricechn, hshippingchn, hshippingservice, hrate, hdatepayment")
      .eq("userid", code)
      .eq("hstatus", "2")
      .gt("hdatepayment", nowIso)
      .order("hdatepayment", { ascending: true })
      .limit(200);
    if (oErr) {
      console.error(`[getPayUserContext tb_header_order] failed`, { code: oErr.code, message: oErr.message, userid: code });
      return { ok: false, error: `db_error:${oErr.code ?? "unknown"}` };
    }

    const orders: PayUserUnpaidOrder[] = (rows ?? [])
      .map((r) => ({
        hno: String((r as { hno: string }).hno),
        price_thb: computeShopOrderDebitTotal(r as Parameters<typeof computeShopOrderDebitTotal>[0]),
        hdatepayment: (r as { hdatepayment: string | null }).hdatepayment,
      }))
      .filter((o) => Number.isFinite(o.price_thb) && o.price_thb > 0);

    // 4. corporate flag (tb_corporate — lowercase) — drives the 1% allowance.
    //    Legacy pay-users.php L255: corporate=1 if a tb_corporate row exists.
    const { data: corpRow, error: corpErr } = await admin
      .from("tb_corporate")
      .select("id")
      .eq("userid", code)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (corpErr) {
      console.error(`[getPayUserContext tb_corporate] failed`, { code: corpErr.code, message: corpErr.message, userid: code });
      return { ok: false, error: `db_error:${corpErr.code ?? "unknown"}` };
    }
    const isCorporate = corpRow != null;

    // 5. unpaid forwarders (tb_forwarder fStatus='5' OR fCredit='1' —
    //    legacy pay-users.php L316). We fetch the eligibility set (status 5 +
    //    credit 1) then compute the batch debit prices via the pure helper so
    //    the displayed amount == the amount adminPayForwardersOnBehalf debits.
    const { data: fRows, error: fErr } = await admin
      .from("tb_forwarder")
      .select(`${FORWARDER_PRICE_COLS}, ftrackingchn, fstatus, fcredit`)
      .eq("userid", code)
      .or("fstatus.eq.5,fcredit.eq.1")
      .order("id", { ascending: true })
      .limit(300);
    if (fErr) {
      console.error(`[getPayUserContext tb_forwarder] failed`, { code: fErr.code, message: fErr.message, userid: code });
      return { ok: false, error: `db_error:${fErr.code ?? "unknown"}` };
    }

    const fEligible = (fRows ?? []) as Array<
      ForwarderDebitRow & { ftrackingchn: string | null; fstatus: string | null; fcredit: string | null }
    >;
    const fBatch = computeForwarderDebitBatch(fEligible, { userId: code, isCorporate });
    const lineById = new Map(fBatch.lines.map((l) => [l.id, l]));

    const forwarders: PayUserForwarder[] = fEligible
      .map((r) => {
        const line = lineById.get(String(r.id));
        return {
          fid: String(r.id),
          price_thb: line?.price_thb ?? NaN,
          ftracking: r.ftrackingchn,
          fstatus: r.fstatus,
          is_credit: (r.fcredit ?? "").trim() === "1",
          breakdown: line?.breakdown ?? { freight: 0, otherCharges: 0, discount: 0, maoFee: 0, wht1pct: 0, total: NaN },
        };
      })
      .filter((f) => Number.isFinite(f.price_thb) && f.price_thb > 0);

    return {
      ok: true,
      data: {
        user: {
          userid: u.userID,
          name: [u.userName, u.userLastName].filter(Boolean).join(" ").trim() || u.userID,
          tel: u.userTel,
        },
        wallet_balance: Number(w?.wallettotal ?? 0),
        orders,
        forwarders,
        is_corporate: isCorporate,
      },
    };
  });
}

// ════════════════════════════════════════════════════════════
// PAY ACTION — debit wallet for the selected orders, on behalf
// ════════════════════════════════════════════════════════════

const paySchema = z.object({
  userId: z.string().trim().min(1).max(20),
  hNos: z.array(z.string().trim().min(1).max(100)).min(1).max(100),
});

export type PayOnBehalfResult = {
  paid: string[];
  skipped: { hno: string; reason: string }[];
  total_debited: number;
};

export async function adminPayOrdersOnBehalf(
  input: unknown,
): Promise<AdminActionResult<PayOnBehalfResult>> {
  return withAdmin(undefined, async () => {
    const parsed = paySchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
    }
    const userId = parsed.data.userId.toUpperCase();
    const hNos = Array.from(new Set(parsed.data.hNos)); // de-dup
    const admin = createAdminClient();
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

    // best-effort profile_id for customer notify (legacy fired lineNotifyShops)
    let profileId: string | null = null;
    try {
      const map = await resolveProfileIdsForLegacyUserids([userId]);
      profileId = map.get(userId) ?? null;
    } catch (e) {
      console.error(`[adminPayOrdersOnBehalf resolveProfileId] failed`, { userId, e: String(e) });
    }

    const paid: string[] = [];
    const skipped: { hno: string; reason: string }[] = [];
    let totalDebited = 0;

    // Per-order loop — balance re-read each iteration (legacy L51) so a
    // multi-order batch stops cleanly when the wallet runs dry.
    for (const hno of hNos) {
      const nowIso = new Date().toISOString();

      // 1. load order (ownership-gated to userId)
      const { data: header, error: hErr } = await admin
        .from("tb_header_order")
        .select("id, hno, hstatus, htotalpriceuser, htotalpricechn, hshippingchn, hshippingservice, hrate")
        .eq("userid", userId)
        .eq("hno", hno)
        .maybeSingle<{
          id: number;
          hno: string;
          hstatus: string | null;
          htotalpriceuser: number | string | null;
          htotalpricechn: number | string | null;
          hshippingchn: number | string | null;
          hshippingservice: number | string | null;
          hrate: number | string | null;
        }>();
      if (hErr) { skipped.push({ hno, reason: `db_error:${hErr.code ?? "unknown"}` }); continue; }
      if (!header) { skipped.push({ hno, reason: "ไม่พบออเดอร์ของลูกค้ารายนี้" }); continue; }

      const st = (header.hstatus ?? "").trim();
      if (st === "3" || st === "4" || st === "5") { skipped.push({ hno, reason: "ชำระเงินแล้ว" }); continue; }
      if (st !== "2") { skipped.push({ hno, reason: "ออเดอร์ยังไม่พร้อมชำระ (ต้องอยู่สถานะ รอชำระเงิน)" }); continue; }

      const price = computeShopOrderDebitTotal(header);
      if (!Number.isFinite(price) || price <= 0) { skipped.push({ hno, reason: "ราคาออเดอร์ไม่ถูกต้อง" }); continue; }

      // 2. idempotency probe (legacy pay-users.php L13 double-pay guard)
      const { data: existHs, error: exErr } = await admin
        .from("tb_wallet_hs")
        .select("id")
        .eq("userid", userId)
        .eq("type", "2")
        .eq("reforder", hno)
        .eq("status", "2")
        .limit(1)
        .maybeSingle<{ id: number }>();
      if (exErr) { skipped.push({ hno, reason: `db_error:${exErr.code ?? "unknown"}` }); continue; }
      if (existHs) {
        // already debited — nudge header forward if it stalled at 2
        await admin
          .from("tb_header_order")
          .update({ hstatus: "3", hdate3: nowIso, hdateupdate: nowIso, paydeposit: "1" })
          .eq("id", header.id)
          .eq("hstatus", "2");
        skipped.push({ hno, reason: "ชำระไปแล้วก่อนหน้า (idempotent)" });
        continue;
      }

      // 3. balance pre-check (re-read per order)
      const { data: wallet, error: wErr } = await admin
        .from("tb_wallet")
        .select("wallettotal")
        .eq("userid", userId)
        .maybeSingle<{ wallettotal: number | string | null }>();
      if (wErr) { skipped.push({ hno, reason: `db_error:${wErr.code ?? "unknown"}` }); continue; }
      const balance = Number(wallet?.wallettotal ?? 0);
      if (!(balance >= price)) {
        skipped.push({ hno, reason: `ยอดเงินไม่พอ (มี ฿${balance.toFixed(2)} ต้อง ฿${price.toFixed(2)})` });
        // Per-order shortfall: skip here. The whole-batch slip-top-up path
        // (legacy shop L85-191) is handled by adminPayOrdersWithTopUp below —
        // the UI routes to it when the wallet can't cover the selected total.
        continue;
      }

      // 4. INSERT tb_wallet_hs (admin twin of A1 — adminid/adminidcrate = staff slug)
      const { data: hsRow, error: hsErr } = await admin
        .from("tb_wallet_hs")
        .insert({
          date:            nowIso,
          amount:          price,
          status:          "2",                 // settled (admin debit is final)
          type:            "2",                 // ชำระเงินฝากสั่ง
          typenew:         "3",
          typeservice:     "1",
          paydeposit:      "1",
          imagesslip:      "",
          depositnamebank: "WALLET",
          nameuserbank:    "",
          nouserbank:      "",
          note:            `ชำระเงินฝากสั่ง #${hno} (เจ้าหน้าที่ตัดจากกระเป๋าเงินแทนลูกค้า)`,
          adminid:         legacyAdminId,
          adminidupdate:   legacyAdminId,
          session:         "admin-pay-onbehalf",
          reforder:        hno,
          whno:            "",
          wusercredit:     "0",
          userid:          userId,
          adminidcrate:    legacyAdminId,       // legacy pay-users.php L65
        })
        .select("id")
        .single<{ id: number }>();
      if (hsErr || !hsRow) {
        skipped.push({ hno, reason: `บันทึก tb_wallet_hs ล้มเหลว: ${hsErr?.message ?? "no row"}` });
        continue;
      }

      // 5. debit tb_wallet (rollback the hs row on failure — keep books balanced)
      const newBalance = Math.round((balance - price) * 100) / 100;
      const { error: wuErr } = await admin
        .from("tb_wallet")
        .update({ wallettotal: newBalance })
        .eq("userid", userId);
      if (wuErr) {
        await admin.from("tb_wallet_hs").delete().eq("id", hsRow.id);
        skipped.push({ hno, reason: `หักยอดกระเป๋าล้มเหลว · ยกเลิกรายการ: ${wuErr.message}` });
        continue;
      }

      // 6. flip header 2 → 3 (post-debit failure surfaces LOUD; no auto-rollback)
      const { error: oErr } = await admin
        .from("tb_header_order")
        .update({ hstatus: "3", hdate3: nowIso, hdateupdate: nowIso, paydeposit: "1" })
        .eq("id", header.id);
      if (oErr) {
        console.error(`[adminPayOrdersOnBehalf status flip FAILED post-debit]`, {
          code: oErr.code, message: oErr.message, hno, userId, tb_wallet_hs_id: hsRow.id, amount: price,
        });
        skipped.push({ hno, reason: `หักเงินสำเร็จแต่อัพเดทสถานะล้มเหลว (กระเป๋าถูกหัก ฿${price} · tb_wallet_hs=${hsRow.id}) — ติดต่อทีมงาน` });
        continue;
      }

      paid.push(hno);
      totalDebited += price;

      if (profileId) {
        void sendNotification(profileId, {
          category:       "order",
          severity:       "success",
          title:          `ชำระค่าฝากสั่งสำเร็จ ${hno}`,
          body:           `฿${price.toLocaleString("th-TH", { minimumFractionDigits: 2 })} · เจ้าหน้าที่ตัดจากกระเป๋าเงินให้`,
          link_href:      `/service-order/${hno}`,
          reference_type: "service_order",
          reference_id:   String(header.id),
        });
      }
    }

    revalidatePath("/admin/wallet/pay-user");
    revalidatePath("/admin/service-orders");

    if (paid.length === 0) {
      return {
        ok: false,
        error: skipped.length ? skipped.map((s) => `${s.hno}: ${s.reason}`).join(" · ") : "ไม่มีรายการที่ชำระได้",
      };
    }
    // Paid on behalf → wallet debited + orders moved 2→3; refresh the admin
    // sidebar/wallet-total badges immediately.
    bustAdminChrome();
    return { ok: true, data: { paid, skipped, total_debited: Math.round(totalDebited * 100) / 100 } };
  });
}

// ════════════════════════════════════════════════════════════
// PAY ACTION (Phase 2) — debit wallet for the selected ฝากนำเข้า
// (forwarder) rows, on behalf. Faithful port of the sufficient-balance
// branch of pay-users.php `paymentForwarderNew` (L202-500).
// ════════════════════════════════════════════════════════════

const payForwarderSchema = z.object({
  userId: z.string().trim().min(1).max(20),
  fIds: z.array(z.string().trim().min(1).max(20)).min(1).max(100),
});

export type PayForwardersOnBehalfResult = {
  paid: string[];
  skipped: { fid: string; reason: string }[];
  total_debited: number;
};

export async function adminPayForwardersOnBehalf(
  input: unknown,
): Promise<AdminActionResult<PayForwardersOnBehalfResult>> {
  return withAdmin(undefined, async () => {
    const parsed = payForwarderSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
    }
    const userId = parsed.data.userId.toUpperCase();
    // de-dup + drop non-numeric (tb_forwarder.id is bigint; legacy keys IN(ids))
    const fIds = Array.from(new Set(parsed.data.fIds)).filter((x) => /^\d+$/.test(x));
    if (fIds.length === 0) return { ok: false, error: "ไม่มีรายการฝากนำเข้าที่ถูกต้อง" };

    const admin = createAdminClient();
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

    // best-effort profile_id for customer notify (legacy fired lineNotifyForwarder)
    let profileId: string | null = null;
    try {
      const map = await resolveProfileIdsForLegacyUserids([userId]);
      profileId = map.get(userId) ?? null;
    } catch (e) {
      console.error(`[adminPayForwardersOnBehalf resolveProfileId] failed`, { userId, e: String(e) });
    }

    // corporate flag (legacy L255) — gates the per-row 1% allowance.
    const { data: corpRow, error: corpErr } = await admin
      .from("tb_corporate")
      .select("id")
      .eq("userid", userId)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (corpErr) {
      console.error(`[adminPayForwardersOnBehalf tb_corporate] failed`, { code: corpErr.code, message: corpErr.message, userId });
      return { ok: false, error: `db_error:${corpErr.code ?? "unknown"}` };
    }
    const isCorporate = corpRow != null;

    // ── AUTHORITATIVE batch — compute prices on EXACTLY the selected rows
    // (legacy `WHERE … AND ID IN ('$ids')`, L316). Pricing depends on the
    // selection (corporate ≥฿1000 gate + PCSF-first ฿50), so this is the
    // source of truth — NOT the context-loader's full-set preview. Order by
    // id ASC so the "first PCSF" row is deterministic + matches legacy DB order.
    const { data: eligibleRaw, error: eligErr } = await admin
      .from("tb_forwarder")
      // ftrackingchn → computeForwarderDebitBatch anchors the เหมาๆ fee to the base
      // tracking (once per shipment) even across separate pay actions (2026-06-23).
      .select(`${FORWARDER_PRICE_COLS}, ftrackingchn, fcredit`)
      .eq("userid", userId)
      .in("id", fIds.map(Number))
      .or("fstatus.eq.5,fcredit.eq.1")
      .order("id", { ascending: true });
    if (eligErr) {
      console.error(`[adminPayForwardersOnBehalf eligibility] failed`, { code: eligErr.code, message: eligErr.message, userId });
      return { ok: false, error: `db_error:${eligErr.code ?? "unknown"}` };
    }
    const eligible = (eligibleRaw ?? []) as Array<ForwarderDebitRow & { fcredit: string | null }>;
    if (eligible.length === 0) return { ok: false, error: "ไม่พบรายการฝากนำเข้าที่พร้อมชำระของลูกค้ารายนี้" };

    const batch = computeForwarderDebitBatch(eligible, { userId, isCorporate });
    const priceById = new Map(batch.lines.map((l) => [l.id, l.price_thb]));
    const creditById = new Map(eligible.map((r) => [String(r.id), (r.fcredit ?? "").trim() === "1"]));
    // legacy stamps fUserCompany='1' on EVERY settled row when the batch
    // corporate discount fired, else '' (L399/L401/L457/L459).
    const fUserCompanyValue = batch.applyCorporateDiscount ? "1" : "";

    const paid: string[] = [];
    const skipped: { fid: string; reason: string }[] = [];
    let totalDebited = 0;

    // Per-row loop — balance re-read each iteration (legacy re-reads walletTotal
    // L478 before each debit) so a multi-row batch stops cleanly when dry.
    for (const fid of fIds) {
      const nowIso = new Date().toISOString();

      const price = priceById.get(fid);
      const isCredit = creditById.get(fid) ?? false;
      const isPcsfFix = batch.pcsfTransportFixId === fid;

      // row not in the eligible/priced set → not payable
      if (price === undefined) { skipped.push({ fid, reason: "ไม่อยู่สถานะพร้อมชำระ (ต้อง fStatus=5 หรือ fCredit=1)" }); continue; }
      if (!Number.isFinite(price) || price <= 0) { skipped.push({ fid, reason: "ราคารายการไม่ถูกต้อง" }); continue; }

      // 1. idempotency probe — legacy L212 dup-guard:
      //    tb_wallet_hs WHERE userID AND (typeNew='5' OR typeNew='6')
      //    AND status=2 AND refOrder IN (ids). We probe per-row by reforder.
      const { data: existHs, error: exErr } = await admin
        .from("tb_wallet_hs")
        .select("id")
        .eq("userid", userId)
        .in("typenew", ["5", "6"])
        .eq("status", "2")
        .eq("reforder", fid)
        .limit(1)
        .maybeSingle<{ id: number }>();
      if (exErr) { skipped.push({ fid, reason: `db_error:${exErr.code ?? "unknown"}` }); continue; }
      if (existHs) {
        // already debited — nudge forwarder forward if it stalled at 5.
        // Match the pure-wallet flip (legacy L467/L469) — no paydeposit
        // (path #2 creates no tb_wallet_paydeposit link row).
        const fwdPatch: Record<string, unknown> = isCredit
          ? { fcredit: "", fdateadminstatus: nowIso }
          : { fstatus: "6", fdateadminstatus: nowIso, fdatestatus6: nowIso };
        await admin.from("tb_forwarder").update(fwdPatch).eq("id", Number(fid)).eq("userid", userId);
        skipped.push({ fid, reason: "ชำระไปแล้วก่อนหน้า (idempotent)" });
        continue;
      }

      // 2. balance pre-check (re-read per row)
      const { data: wallet, error: wErr } = await admin
        .from("tb_wallet")
        .select("wallettotal")
        .eq("userid", userId)
        .maybeSingle<{ wallettotal: number | string | null }>();
      if (wErr) { skipped.push({ fid, reason: `db_error:${wErr.code ?? "unknown"}` }); continue; }
      const balance = Number(wallet?.wallettotal ?? 0);
      if (!(balance >= price)) {
        skipped.push({ fid, reason: `ยอดเงินไม่พอ (มี ฿${balance.toFixed(2)} ต้อง ฿${price.toFixed(2)})` });
        // Per-row shortfall: skip here. The whole-batch slip-top-up path
        // (legacy forwarder path #1 L342-433) is handled by
        // adminPayForwardersWithTopUp below — the UI routes to it when the
        // wallet can't cover the selected total.
        continue;
      }

      // 3. PCSF first-item — mutate tb_forwarder.fTransportPrice=50 BEFORE the
      //    ledger/status writes (faithful L388/L446). This is a side-effect the
      //    legacy commits inside the pay path; the reject path in wallet-hs.ts
      //    (isPCSF50 branch) reverses it, so the contract expects it here.
      if (isPcsfFix) {
        const { error: pcsfErr } = await admin
          .from("tb_forwarder")
          .update({ ftransportprice: MAO_FLAT_FEE })
          .eq("id", Number(fid))
          .eq("userid", userId);
        if (pcsfErr) {
          console.error(`[adminPayForwardersOnBehalf PCSF ftransportprice=50] failed`, { code: pcsfErr.code, message: pcsfErr.message, fid });
          skipped.push({ fid, reason: `ตั้งค่าค่าขนส่ง PCSF ล้มเหลว: ${pcsfErr.message}` });
          continue;
        }
      }

      // 4. INSERT tb_wallet_hs — legacy L463-464:
      //    type='4' · status='2' (settled) · typeNew='6' · typeService='2' ·
      //    refOrder=fID · adminIDCrate=$adminID.
      const { data: hsRow, error: hsErr } = await admin
        .from("tb_wallet_hs")
        .insert({
          date:            nowIso,
          amount:          price,
          status:          "2",                 // settled (admin debit is final)
          type:            "4",                 // ชำระเงินฝากนำเข้า
          typenew:         "6",
          typeservice:     "2",                 // 2 = forwarder/freight
          paydeposit:      "1",
          imagesslip:      "",
          depositnamebank: "WALLET",
          nameuserbank:    "",
          nouserbank:      "",
          note:            `ชำระค่าฝากนำเข้า #${fid} (เจ้าหน้าที่ตัดจากกระเป๋าเงินแทนลูกค้า)`,
          adminid:         legacyAdminId,
          adminidupdate:   legacyAdminId,
          session:         "admin-pay-onbehalf",
          reforder:        fid,
          whno:            "",
          wusercredit:     isCredit ? "1" : "0",
          userid:          userId,
          adminidcrate:    legacyAdminId,       // legacy L464/L405
        })
        .select("id")
        .single<{ id: number }>();
      if (hsErr || !hsRow) {
        skipped.push({ fid, reason: `บันทึก tb_wallet_hs ล้มเหลว: ${hsErr?.message ?? "no row"}` });
        continue;
      }

      // 5. debit tb_wallet (rollback the hs row on failure — keep books balanced)
      const newBalance = Math.round((balance - price) * 100) / 100;
      const { error: wuErr } = await admin
        .from("tb_wallet")
        .update({ wallettotal: newBalance })
        .eq("userid", userId);
      if (wuErr) {
        await admin.from("tb_wallet_hs").delete().eq("id", hsRow.id);
        skipped.push({ fid, reason: `หักยอดกระเป๋าล้มเหลว · ยกเลิกรายการ: ${wuErr.message}` });
        continue;
      }

      // 6. flip tb_forwarder 5 → 6 (or credit variant) — the pure-wallet
      //    sufficient-balance branch. Legacy L467/L469 (path #2):
      //    standard: fStatus='6', fDateAdminStatus, fDateStatus6, fUserCompany.
      //    credit:   fCredit='', fDateAdminStatus, fUserCompany (NO fStatus flip,
      //              NO fDateStatus6 — credit rows settle without the 6 stamp).
      //    NOTE: path #2 does NOT set paydeposit (only the slip-top-up paths
      //    #1/#3 do, L408/L633, because they create a tb_wallet_paydeposit
      //    link row — which path #2 does not). We match that faithfully.
      const fwdPatch: Record<string, unknown> = isCredit
        ? { fcredit: "", fdateadminstatus: nowIso, fusercompany: fUserCompanyValue }
        : { fstatus: "6", fdateadminstatus: nowIso, fdatestatus6: nowIso, fusercompany: fUserCompanyValue };
      const { error: fErr2 } = await admin
        .from("tb_forwarder")
        .update(fwdPatch)
        .eq("id", Number(fid));
      if (fErr2) {
        console.error(`[adminPayForwardersOnBehalf status flip FAILED post-debit]`, {
          code: fErr2.code, message: fErr2.message, fid, userId, tb_wallet_hs_id: hsRow.id, amount: price,
        });
        skipped.push({ fid, reason: `หักเงินสำเร็จแต่อัพเดทสถานะล้มเหลว (กระเป๋าถูกหัก ฿${price} · tb_wallet_hs=${hsRow.id}) — ติดต่อทีมงาน` });
        continue;
      }

      paid.push(fid);
      totalDebited += price;

      // P0 mark-paid symmetry — mint the auto-receipt for this paid forwarder
      // so the wallet-pay-on-behalf path ALSO produces a receipt (the slip-
      // approve paths in wallet-trans.ts / tb-bulk.ts already do via the same
      // helper). Without this, staff who settle a phone customer's ฝากนำเข้า
      // straight from the wallet left NO tb_receipt behind — the audit-of-record
      // for money already taken. Mirrors the autoIssueReceiptOnPaymentLand call
      // shape from wallet-trans.ts (~L297): best-effort + logged — a receipt
      // failure must NOT roll back the settled wallet leg (money already moved).
      // dateSlip = now (a wallet pay-on-behalf settles instantly; there is no
      // bank-slip date on this path).
      {
        const fidNum = Number(fid);
        const r = await autoIssueReceiptOnPaymentLand(admin, {
          userid: userId,
          fids:   [fidNum],
          dateSlip: new Date(),
          source: "pay-user.onbehalf",
        });
        if (!r.ok && !r.alreadyIssued) {
          logger.warn("pay-user", "auto-receipt failed (non-fatal · money already moved)", {
            fid: fidNum, userId, tb_wallet_hs_id: hsRow.id, error: r.error,
          });
        }
        if (r.ok) {
          revalidatePath(`/admin/accounting/forwarder-invoice/${r.data.receiptId}`);
          revalidatePath(`/service-import/${fidNum}/invoice`);
        }
      }

      if (profileId) {
        void sendNotification(profileId, {
          category:       "forwarder",
          severity:       "success",
          title:          `ชำระค่าฝากนำเข้าสำเร็จ #${fid}`,
          body:           `฿${price.toLocaleString("th-TH", { minimumFractionDigits: 2 })} · เจ้าหน้าที่ตัดจากกระเป๋าเงินให้`,
          link_href:      `/shipments`,
          reference_type: "forwarder",
          reference_id:   fid,
        });
      }
    }

    revalidatePath("/admin/wallet/pay-user");
    revalidatePath("/admin/forwarders");

    if (paid.length === 0) {
      return {
        ok: false,
        error: skipped.length ? skipped.map((s) => `${s.fid}: ${s.reason}`).join(" · ") : "ไม่มีรายการที่ชำระได้",
      };
    }
    // Paid on behalf → wallet debited + forwarders moved out of รอชำระเงิน;
    // refresh the admin sidebar/wallet-total badges immediately.
    bustAdminChrome();
    return { ok: true, data: { paid, skipped, total_debited: Math.round(totalDebited * 100) / 100 } };
  });
}

// ════════════════════════════════════════════════════════════════════════
// PHASE 3 — SLIP-TOP-UP-AND-PAY (insufficient-balance branches)
// ════════════════════════════════════════════════════════════════════════
//
// ── THE BALANCE-MOVEMENT CONTRACT (mirrored EXACTLY — real money) ─────────
//
// These two actions handle the case where the wallet can't cover the
// selected total. Legacy splits this into two branches per service:
//
//   SHOP (pay-users.php L85-191 — the `else` after L39
//   `if($walletTotal>=$pricePayAll)`):
//     • Requires `!empty($_POST['amount']) && !empty($_FILES['imagesSlip'])`
//       (L86) — staff types a top-up amount + uploads a slip.
//     • Guard L107-109: `$walletTotalTmp = $walletTotal + $amount`; proceed
//       only if `$walletTotalTmp > $pricePayAll` OR exactly covers
//       (`bcsub == 0`). i.e. old-balance + new-slip must clear the bill.
//     • L111 `$walletTotalU = $walletTotal` captures the OLD balance.
//     • L113 `if($walletTotalU != 0) UPDATE tb_wallet SET walletTotal=0` —
//       ███ THE WALLET IS ZEROED ███ (the existing balance is consumed into
//       the payment). If old balance was already 0, no UPDATE.
//     • L117-118 INSERT top-up `tb_wallet_hs`: type='1' status='1' (PENDING)
//       amount=$amount(slip) imagesSlip paydeposit='1' depositNameBank.
//     • L132-133 (ONLY inside `walletTotalU != 0`) INSERT `tb_wallet_hs`
//       type='7' status='1' amount=$walletTotalU refOrder=$whID — ███ the
//       type='7' row RECORDS the old balance that was zeroed ███. This is
//       what `adminRejectWalletDeposit` SUMs to refund (wallet-hs.ts
//       L1237-1246). On a 0 old-balance there is NO type='7' row → refund=0.
//     • L162-163 per-order pay rows: type='2' status='1' refOrder=$hNo
//       refOrder2=$whID.  (NO immediate wallet debit for the slip portion —
//       it's pending until the deposit is approved.)
//     • L166 flip header hStatus='3' paydeposit='1' hDate3=NOW().
//     • L173-174 `tb_wallet_paydeposit(whID,$hNo)` bridge per order.
//
//   FORWARDER (pay-users.php path #1 L342-433 — the
//   `if($userTotalWalletForm==0)` branch, "ไม่มีเงินเลย เติมพร้อมรายการนี้"):
//     • CRITICAL: L291 `$walletTotal=0;` (hard reset) + L340
//       `$userTotalWalletForm = 0;` ("ไม่ให้ใช้เงินจากกระเป๋าแล้ว") — this
//       path FORCES the wallet contribution to 0; the customer pays the
//       WHOLE bill with the new slip.  ███ THE WALLET IS NEVER READ OR
//       DEBITED in path #1 ███, and there is NO type='7' row (nothing was
//       taken from the wallet → nothing to refund on reject).
//     • Requires `!empty($_FILES['imagesSlip'])` (L344) — slip only; the
//       top-up amount IS the bill (`$amount = $pricePayAll`, L361).
//     • L364-365 INSERT top-up `tb_wallet_hs`: type='1' status='1' (PENDING)
//       amount=$pricePayAll imagesSlip paydeposit='1' typeNew='6'
//       typeService='2' depositNameBank.
//     • L386-389 PCSF first-item side-effect: UPDATE tb_forwarder
//       fTransportPrice=50 (same as the sufficient path).
//     • L404-405 per-row pay rows: type='4' status='1' refOrder=$ID
//       refOrder2=$whID typeNew='6' typeService='2'.
//     • L408/L410 flip tb_forwarder: standard fStatus='6' paydeposit='1';
//       credit fCredit='' paydeposit='1' (no fStatus flip). fUserCompany
//       '1' when corporate-discount fired else ''.
//     • L417-418 `tb_wallet_paydeposit(whID,$ID)` bridge per row.
//
// WHY status='1' EVERYWHERE: unlike the sufficient-balance path (status='2',
// settled, wallet debited NOW), the slip-top-up path leaves EVERYTHING
// pending — the deposit + the pay rows are status='1' and reconcile only
// when accounting approves the slip. `adminApproveWalletDeposit` (wallet-hs.ts
// L396) reads `tb_wallet_paydeposit WHERE whid=<topup.id>`, flips each
// sibling pay row (reforder=item · type='2'/'4' · reforder2=topup.id ·
// status='1') to status='2' AND the type='7' sibling rows (reforder=topup.id ·
// type='7') to status='2' — NO extra wallet credit (the net was already
// captured). The reject mirror reverts + refunds the SUM of type='7' rows.
// So the rows we write here MUST match that reader's shape exactly (verified
// field-by-field against wallet-hs.ts: the cascade keys on reforder + type +
// status + reforder2 ONLY — typenew is non-load-bearing on the shop pay row).
//
// ── tb_wallet_paydeposit bridge ──
// One row per paid item: (whid = the top-up deposit's tb_wallet_hs.id,
// hno = the order hNo / forwarder ID). This is the join the approve/reject
// cascade walks. We insert it AFTER the status flip succeeds (legacy L173 /
// L417 insert it inside the success branch).

const SLIP_AMOUNT_TOLERANCE = 0.01; // satang-level float slack on the "covers" check

// Shared slip upload — returns the bucket filename or a Thai error.
async function uploadPayUserSlip(
  slipFile: File,
  userId: string,
): Promise<{ ok: true; filename: string } | { ok: false; error: string }> {
  const up = await uploadToBucket(slipFile, "slips", `admin/pay-user/${userId}`);
  if (!up.ok) return { ok: false, error: up.error };
  return { ok: true, filename: up.filename };
}

// ── PHASE 3 · SHOP — top-up-and-pay ───────────────────────────────────────

const payWithTopUpSchema = z.object({
  userId: z.string().trim().min(1).max(20),
  hNos: z.array(z.string().trim().min(1).max(100)).min(1).max(100),
  // The bank-transfer amount the staff typed (the slip's value). Must be a
  // positive number; legacy reads `$_POST['amount']` (shop L104).
  topUpAmount: z.number().positive(),
});

export type PayWithTopUpResult = {
  /** the PENDING top-up deposit row id (tb_wallet_hs.id) — review at /admin/wallet/<id>. */
  topupWalletHsId: number;
  /** items that got a pending pay-row + status flip + paydeposit bridge. */
  paid: string[];
  skipped: { hno: string; reason: string }[];
  /** = the top-up deposit amount (the slip value), pending approval. NOT debited yet. */
  topup_amount: number;
  /** the OLD wallet balance that was consumed into the payment (zeroed). 0 if it was already 0. */
  wallet_consumed: number;
};

/**
 * Phase 3 — shop orders, insufficient balance + slip top-up.
 *
 * Faithful port of pay-users.php L85-191. Writes a PENDING top-up deposit
 * (with the slip), per-order PENDING pay rows linked via refOrder2=whID +
 * a tb_wallet_paydeposit bridge, zeroes the existing wallet balance into a
 * type='7' tracking row, and flips each order hStatus 2→3. Nothing settles
 * until accounting approves the deposit (adminApproveWalletDeposit).
 */
export async function adminPayOrdersWithTopUp(
  input: unknown,
  slipFile?: File | null,
): Promise<AdminActionResult<PayWithTopUpResult>> {
  return withAdmin(undefined, async () => {
    const parsed = payWithTopUpSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
    }
    if (!slipFile || !(slipFile instanceof File)) {
      return { ok: false, error: "กรุณาแนบสลิปการโอนเงิน" }; // legacy L86/L190 'eInput'
    }
    const userId = parsed.data.userId.toUpperCase();
    const hNos = Array.from(new Set(parsed.data.hNos));
    const topUpAmount = Math.round(parsed.data.topUpAmount * 100) / 100;
    const admin = createAdminClient();
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);
    const nowIso = new Date().toISOString();

    // 0. customer must exist (legacy L20-24 'ePass')
    const { data: u, error: uErr } = await admin
      .from("tb_users")
      .select("userID")
      .eq("userID", userId)
      .maybeSingle<{ userID: string }>();
    if (uErr) {
      console.error(`[adminPayOrdersWithTopUp tb_users] failed`, { code: uErr.code, message: uErr.message, userId });
      return { ok: false, error: `db_error:${uErr.code ?? "unknown"}` };
    }
    if (!u) return { ok: false, error: `ไม่พบลูกค้า ${userId}` };

    // 1. idempotency — legacy L13: any already-SETTLED pay row for these
    //    orders means the batch was paid → bail (legacy shows 'eSQL').
    const { data: settled, error: settledErr } = await admin
      .from("tb_wallet_hs")
      .select("reforder")
      .eq("userid", userId)
      .eq("type", "2")
      .eq("status", "2")
      .in("reforder", hNos)
      .limit(1);
    if (settledErr) {
      console.error(`[adminPayOrdersWithTopUp idempotency] failed`, { code: settledErr.code, message: settledErr.message, userId });
      return { ok: false, error: `db_error:${settledErr.code ?? "unknown"}` };
    }
    if (settled && settled.length > 0) {
      return { ok: false, error: "มีออเดอร์ที่ชำระไปแล้วในชุดนี้ — ยกเลิก (โปรดรีเฟรช)" };
    }

    // 2. load the payable orders (legacy L153: hStatus='2' AND hDatePayment>NOW).
    const { data: rows, error: oErr } = await admin
      .from("tb_header_order")
      .select("id, hno, hstatus, htotalpriceuser, htotalpricechn, hshippingchn, hshippingservice, hrate, hdatepayment")
      .eq("userid", userId)
      .eq("hstatus", "2")
      .gt("hdatepayment", nowIso)
      .in("hno", hNos)
      .order("hdatepayment", { ascending: true });
    if (oErr) {
      console.error(`[adminPayOrdersWithTopUp tb_header_order] failed`, { code: oErr.code, message: oErr.message, userId });
      return { ok: false, error: `db_error:${oErr.code ?? "unknown"}` };
    }
    type HeaderRow = {
      id: number; hno: string; hstatus: string | null;
      htotalpriceuser: number | string | null; htotalpricechn: number | string | null;
      hshippingchn: number | string | null; hshippingservice: number | string | null;
      hrate: number | string | null; hdatepayment: string | null;
    };
    const payable = (rows ?? []) as unknown as HeaderRow[];
    if (payable.length === 0) return { ok: false, error: "ไม่พบออเดอร์ที่พร้อมชำระของลูกค้ารายนี้" };

    const priced = payable
      .map((h) => ({ hno: String(h.hno), price: computeShopOrderDebitTotal(h) }))
      .filter((p) => Number.isFinite(p.price) && p.price > 0);
    const pricePayAll = Math.round(priced.reduce((s, p) => s + p.price, 0) * 100) / 100;
    if (pricePayAll <= 0) return { ok: false, error: "ราคารวมของออเดอร์ไม่ถูกต้อง" };

    // 3. read OLD wallet balance (legacy L34-37 $walletTotal).
    const { data: w, error: wErr } = await admin
      .from("tb_wallet")
      .select("wallettotal")
      .eq("userid", userId)
      .maybeSingle<{ wallettotal: number | string | null }>();
    if (wErr) {
      console.error(`[adminPayOrdersWithTopUp tb_wallet read] failed`, { code: wErr.code, message: wErr.message, userId });
      return { ok: false, error: `db_error:${wErr.code ?? "unknown"}` };
    }
    const oldBalance = Math.round(Number(w?.wallettotal ?? 0) * 100) / 100;

    // 4. COVERAGE GUARD — legacy L107-109: old-balance + new-slip must clear
    //    the bill (> OR exactly ==). Only here should staff be on this path
    //    (the sufficient path handles balance>=bill on its own).
    const combined = Math.round((oldBalance + topUpAmount) * 100) / 100;
    if (!(combined > pricePayAll || Math.abs(combined - pricePayAll) <= SLIP_AMOUNT_TOLERANCE)) {
      return {
        ok: false,
        error: `ยอดเติม + ยอดในกระเป๋าไม่พอ — รวม ฿${combined.toFixed(2)} ต้องชำระ ฿${pricePayAll.toFixed(2)}`,
      };
    }

    // 5. upload slip BEFORE writing the deposit (legacy renames first, moves
    //    file after insert; we upload first so the filename is real).
    const slip = await uploadPayUserSlip(slipFile, userId);
    if (!slip.ok) return { ok: false, error: slip.error };

    // 6. ZERO the existing wallet (legacy L113) — only if non-zero.
    if (oldBalance !== 0) {
      const { error: zeroErr } = await admin
        .from("tb_wallet")
        .update({ wallettotal: 0 })
        .eq("userid", userId);
      if (zeroErr) {
        console.error(`[adminPayOrdersWithTopUp zero wallet] failed`, { code: zeroErr.code, message: zeroErr.message, userId });
        return { ok: false, error: `หักยอดกระเป๋าเดิมล้มเหลว: ${zeroErr.message}` };
      }
    }

    // 7. INSERT the PENDING top-up deposit (legacy L117-118). amount = slip
    //    value · type='1' · status='1' · paydeposit='1' · imagesSlip.
    const { data: topup, error: topErr } = await admin
      .from("tb_wallet_hs")
      .insert({
        date:            nowIso,
        amount:          topUpAmount,
        status:          "1",                 // PENDING — awaits admin approval
        type:            "1",                 // ชำระเงิน (deposit)
        typenew:         "1",
        typeservice:     "1",
        paydeposit:      "1",
        imagesslip:      slip.filename,
        depositnamebank: PAYUSER_DEPOSIT_NAMEBANK,
        nameuserbank:    "",
        nouserbank:      "",
        note:            `ชำระเงินพร้อมชำระฝากสั่ง (เจ้าหน้าที่ทำรายการแทนลูกค้า)`,
        adminid:         legacyAdminId,
        adminidupdate:   legacyAdminId,
        session:         "admin-pay-onbehalf-topup",
        reforder:        "",
        whno:            "",
        wusercredit:     "0",
        userid:          userId,
        adminidcrate:    legacyAdminId,
      })
      .select("id")
      .single<{ id: number }>();
    if (topErr || !topup) {
      // rollback the wallet-zero so we don't lose the customer's balance.
      // Capture the restore error — never tell the user "คืนยอดแล้ว" if the
      // restore itself silently failed (balance would stay zeroed = money lost).
      let restored = true;
      if (oldBalance !== 0) {
        const { error: rbErr } = await admin
          .from("tb_wallet").update({ wallettotal: oldBalance }).eq("userid", userId);
        if (rbErr) {
          restored = false;
          console.error(`[adminPayOrdersWithTopUp rollback restore] FAILED — balance left zeroed`, { code: rbErr.code, message: rbErr.message, userId, oldBalance });
        }
      }
      console.error(`[adminPayOrdersWithTopUp insert topup] failed`, { code: topErr?.code, message: topErr?.message, userId });
      return {
        ok: false,
        error: restored
          ? `บันทึกรายการชำระเงินล้มเหลว · คืนยอดกระเป๋าแล้ว: ${topErr?.message ?? "no row"}`
          : `บันทึกรายการชำระเงินล้มเหลว · ⚠️ คืนยอดกระเป๋าไม่สำเร็จ (ยอดเดิม=${oldBalance}) — แจ้งแอดมินด่วน: ${topErr?.message ?? "no row"}`,
      };
    }
    const whID = topup.id;

    // 8. record the consumed OLD balance as a type='7' tracking row (legacy
    //    L132-133) — ONLY when old balance > 0. This is the refund anchor on
    //    reject (wallet-hs.ts SUMs type='7' WHERE reforder=whID).
    if (oldBalance !== 0) {
      const { error: t7Err } = await admin
        .from("tb_wallet_hs")
        .insert({
          date:         nowIso,
          amount:       oldBalance,
          status:       "1",                  // PENDING (settles/voids with the deposit)
          type:         "7",                  // wallet-consumed tracking
          typenew:      "1",                  // NOT NULL
          typeservice:  "1",                  // NOT NULL
          paydeposit:   "0",
          imagesslip:   "",
          note:         `ยอดกระเป๋าเดิมที่ใช้ชำระ (อ้างอิงเติม #${whID})`,
          adminid:      legacyAdminId,
          adminidupdate: legacyAdminId,
          session:      "admin-pay-onbehalf-topup",
          reforder:     String(whID),         // legacy refOrder=$whID (varchar col)
          whno:         "",                   // NOT NULL
          wusercredit:  "0",                  // NOT NULL
          userid:       userId,               // NOT NULL
          adminidcrate: legacyAdminId,        // NOT NULL
        });
      if (t7Err) {
        // Non-fatal to the pay flow, but loud — the refund anchor is missing.
        console.error(`[adminPayOrdersWithTopUp insert type7] FAILED — refund anchor missing`, {
          code: t7Err.code, message: t7Err.message, userId, whID, oldBalance,
        });
      }
    }

    // 9. per-order: PENDING pay row + status flip + paydeposit bridge.
    const paid: string[] = [];
    const skipped: { hno: string; reason: string }[] = [];

    let profileId: string | null = null;
    try {
      const map = await resolveProfileIdsForLegacyUserids([userId]);
      profileId = map.get(userId) ?? null;
    } catch (e) {
      console.error(`[adminPayOrdersWithTopUp resolveProfileId] failed`, { userId, e: String(e) });
    }

    for (const p of priced) {
      const header = payable.find((h) => String(h.hno) === p.hno);
      if (!header) { skipped.push({ hno: p.hno, reason: "ออเดอร์หายไประหว่างทำรายการ" }); continue; }

      // pay row — legacy L162-163: type='2' status='1' refOrder=hNo
      // refOrder2=whID. (This is exactly what adminApproveWalletDeposit's
      // sibling-flip matches on: reforder + type='2' + status='1' + reforder2.)
      const { error: payErr } = await admin
        .from("tb_wallet_hs")
        .insert({
          date:            nowIso,
          amount:          p.price,
          status:          "1",               // PENDING (settles on deposit approve)
          type:            "2",               // ชำระเงินฝากสั่ง
          typenew:         "3",
          typeservice:     "1",
          paydeposit:      "1",
          imagesslip:      "",
          depositnamebank: "",
          note:            `ชำระฝากสั่ง #${p.hno} (เติม-แล้วจ่าย · รออนุมัติสลิป)`,
          adminid:         legacyAdminId,
          adminidupdate:   legacyAdminId,
          session:         "admin-pay-onbehalf-topup",
          reforder:        p.hno,
          reforder2:       whID,              // legacy refOrder2=$whID (reforder2 is bigint)
          whno:            "",
          wusercredit:     "0",
          userid:          userId,
          adminidcrate:    legacyAdminId,
        });
      if (payErr) {
        console.error(`[adminPayOrdersWithTopUp pay row] failed`, { code: payErr.code, message: payErr.message, hno: p.hno });
        skipped.push({ hno: p.hno, reason: `บันทึกรายการชำระล้มเหลว: ${payErr.message}` });
        continue;
      }

      // flip header 2→3 (legacy L166: hStatus='3' paydeposit='1' hDate3=NOW).
      const { error: hUpdErr } = await admin
        .from("tb_header_order")
        .update({ hstatus: "3", hdate3: nowIso, hdateupdate: nowIso, paydeposit: "1" })
        .eq("id", header.id)
        .eq("hstatus", "2");
      if (hUpdErr) {
        console.error(`[adminPayOrdersWithTopUp header flip] failed`, { code: hUpdErr.code, message: hUpdErr.message, hno: p.hno, whID });
        skipped.push({ hno: p.hno, reason: `อัพเดทสถานะออเดอร์ล้มเหลว (รายการชำระบันทึกแล้ว · เติม #${whID})` });
        continue;
      }

      // bridge row (legacy L173-174: tb_wallet_paydeposit(whID, hNo)).
      const { error: bridgeErr } = await admin
        .from("tb_wallet_paydeposit")
        .insert({ whid: whID, hno: p.hno });
      if (bridgeErr) {
        console.error(`[adminPayOrdersWithTopUp bridge] failed`, { code: bridgeErr.code, message: bridgeErr.message, hno: p.hno, whID });
        // bridge missing = approve cascade won't reach this order. Loud.
        skipped.push({ hno: p.hno, reason: `เชื่อมรายการเติม-จ่ายล้มเหลว (เติม #${whID}) — แจ้งทีมบัญชี` });
        continue;
      }

      paid.push(p.hno);
    }

    if (profileId) {
      void sendNotification(profileId, {
        category:       "order",
        severity:       "info",
        title:          `รับเรื่องชำระค่าฝากสั่ง (รออนุมัติสลิป)`,
        body:           `เจ้าหน้าที่ทำรายการเติม-จ่ายให้ ${paid.length} รายการ · รอตรวจสอบสลิป`,
        link_href:      `/wallet/history`,
        reference_type: "wallet_transaction",
        reference_id:   String(whID),
      });
    }

    revalidatePath("/admin/wallet/pay-user");
    revalidatePath("/admin/service-orders");
    revalidatePath(`/admin/wallet/${whID}`);
    revalidatePath("/admin/wallet");
    // The top-up credit landed (+ orders paid) → wallet totals + order queues
    // changed; refresh the admin sidebar/wallet-total badges immediately.
    bustAdminChrome();

    if (paid.length === 0) {
      return {
        ok: false,
        error: `ชำระเงินบันทึกแล้ว (เติม #${whID}) แต่ไม่มีออเดอร์ที่ทำรายการได้: ${skipped.map((s) => `${s.hno}: ${s.reason}`).join(" · ")}`,
      };
    }
    return {
      ok: true,
      data: {
        topupWalletHsId: whID,
        paid,
        skipped,
        topup_amount: topUpAmount,
        wallet_consumed: oldBalance,
      },
    };
  });
}

// ── PHASE 3 · FORWARDER — top-up-and-pay (path #1: zero wallet) ────────────

const payForwardersWithTopUpSchema = z.object({
  userId: z.string().trim().min(1).max(20),
  fIds: z.array(z.string().trim().min(1).max(20)).min(1).max(100),
});

export type PayForwardersWithTopUpResult = {
  topupWalletHsId: number;
  paid: string[];
  skipped: { fid: string; reason: string }[];
  /** = the bill total (= top-up deposit amount), pending approval. Wallet was NOT touched (path #1). */
  topup_amount: number;
};

/**
 * Phase 3 — forwarders, insufficient balance + slip top-up (path #1).
 *
 * Faithful port of pay-users.php path #1 (L342-433, the
 * `if($userTotalWalletForm==0)` branch). The wallet is NOT read or debited
 * — the customer pays the WHOLE bill with the new slip. Writes a PENDING
 * top-up deposit (amount = bill total) + per-row PENDING pay rows
 * (refOrder2=whID) + a tb_wallet_paydeposit bridge per row + flips
 * tb_forwarder 5→6 (or credit variant). Nothing settles until accounting
 * approves the deposit. There is NO type='7' tracking row (nothing taken
 * from the wallet → reject refund = 0).
 *
 * The top-up amount is the AUTHORITATIVE batch total from
 * computeForwarderDebitBatch on the selected rows — staff don't type an
 * amount (legacy L361 `$amount = $pricePayAll`), so the slip must cover the
 * computed bill exactly.
 */
export async function adminPayForwardersWithTopUp(
  input: unknown,
  slipFile?: File | null,
): Promise<AdminActionResult<PayForwardersWithTopUpResult>> {
  return withAdmin(undefined, async () => {
    const parsed = payForwardersWithTopUpSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
    }
    if (!slipFile || !(slipFile instanceof File)) {
      return { ok: false, error: "กรุณาแนบสลิปการโอนเงิน" }; // legacy L431 'eSlip'
    }
    const userId = parsed.data.userId.toUpperCase();
    const fIds = Array.from(new Set(parsed.data.fIds)).filter((x) => /^\d+$/.test(x));
    if (fIds.length === 0) return { ok: false, error: "ไม่มีรายการฝากนำเข้าที่ถูกต้อง" };

    const admin = createAdminClient();
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);
    const nowIso = new Date().toISOString();

    // 0. customer must exist.
    const { data: u, error: uErr } = await admin
      .from("tb_users")
      .select("userID")
      .eq("userID", userId)
      .maybeSingle<{ userID: string }>();
    if (uErr) {
      console.error(`[adminPayForwardersWithTopUp tb_users] failed`, { code: uErr.code, message: uErr.message, userId });
      return { ok: false, error: `db_error:${uErr.code ?? "unknown"}` };
    }
    if (!u) return { ok: false, error: `ไม่พบลูกค้า ${userId}` };

    // 1. idempotency — legacy L212: any already-SETTLED forwarder pay row for
    //    these IDs (typeNew 5/6, status=2) means the batch was paid → bail.
    const { data: settled, error: settledErr } = await admin
      .from("tb_wallet_hs")
      .select("reforder")
      .eq("userid", userId)
      .in("typenew", ["5", "6"])
      .eq("status", "2")
      .in("reforder", fIds)
      .limit(1);
    if (settledErr) {
      console.error(`[adminPayForwardersWithTopUp idempotency] failed`, { code: settledErr.code, message: settledErr.message, userId });
      return { ok: false, error: `db_error:${settledErr.code ?? "unknown"}` };
    }
    if (settled && settled.length > 0) {
      return { ok: false, error: "มีรายการที่ชำระไปแล้วในชุดนี้ — ยกเลิก (โปรดรีเฟรช)" };
    }

    // 2. corporate flag (legacy L255) — gates the per-row 1% allowance.
    const { data: corpRow, error: corpErr } = await admin
      .from("tb_corporate")
      .select("id")
      .eq("userid", userId)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (corpErr) {
      console.error(`[adminPayForwardersWithTopUp tb_corporate] failed`, { code: corpErr.code, message: corpErr.message, userId });
      return { ok: false, error: `db_error:${corpErr.code ?? "unknown"}` };
    }
    const isCorporate = corpRow != null;

    // 3. AUTHORITATIVE batch — price the selected rows (legacy L316/L380).
    const { data: eligibleRaw, error: eligErr } = await admin
      .from("tb_forwarder")
      // ftrackingchn → computeForwarderDebitBatch anchors the เหมาๆ fee to the base
      // tracking (once per shipment) even across separate pay actions (2026-06-23).
      .select(`${FORWARDER_PRICE_COLS}, ftrackingchn, fcredit`)
      .eq("userid", userId)
      .in("id", fIds.map(Number))
      .or("fstatus.eq.5,fcredit.eq.1")
      .order("id", { ascending: true });
    if (eligErr) {
      console.error(`[adminPayForwardersWithTopUp eligibility] failed`, { code: eligErr.code, message: eligErr.message, userId });
      return { ok: false, error: `db_error:${eligErr.code ?? "unknown"}` };
    }
    const eligible = (eligibleRaw ?? []) as Array<ForwarderDebitRow & { fcredit: string | null }>;
    if (eligible.length === 0) return { ok: false, error: "ไม่พบรายการฝากนำเข้าที่พร้อมชำระของลูกค้ารายนี้" };

    const batch = computeForwarderDebitBatch(eligible, { userId, isCorporate });
    const priceById = new Map(batch.lines.map((l) => [l.id, l.price_thb]));
    const creditById = new Map(eligible.map((r) => [String(r.id), (r.fcredit ?? "").trim() === "1"]));
    const fUserCompanyValue = batch.applyCorporateDiscount ? "1" : "";
    const pricePayAll = Math.round(batch.total_thb * 100) / 100;
    if (pricePayAll <= 0) return { ok: false, error: "ราคารวมของรายการไม่ถูกต้อง" };

    // 4. upload slip BEFORE the deposit.
    const slip = await uploadPayUserSlip(slipFile, userId);
    if (!slip.ok) return { ok: false, error: slip.error };

    // 5. PCSF first-item side-effect (legacy L386-389) — set fTransportPrice=50
    //    on the first PCSF-zero row BEFORE the ledger/status writes, exactly as
    //    the sufficient path does. Mirrors the reject reversal in wallet-hs.ts
    //    (isPCSF50 branch → ftransportprice=0).
    if (batch.pcsfTransportFixId) {
      const { error: pcsfErr } = await admin
        .from("tb_forwarder")
        .update({ ftransportprice: MAO_FLAT_FEE })
        .eq("id", Number(batch.pcsfTransportFixId))
        .eq("userid", userId);
      if (pcsfErr) {
        console.error(`[adminPayForwardersWithTopUp PCSF ftransportprice=50] failed`, { code: pcsfErr.code, message: pcsfErr.message, fid: batch.pcsfTransportFixId });
        return { ok: false, error: `ตั้งค่าค่าขนส่ง PCSF ล้มเหลว: ${pcsfErr.message}` };
      }
    }

    // 6. INSERT the PENDING top-up deposit (legacy L364-365). amount = the
    //    AUTHORITATIVE bill total · type='1' status='1' paydeposit='1'
    //    typeNew='6' typeService='2'.
    const { data: topup, error: topErr } = await admin
      .from("tb_wallet_hs")
      .insert({
        date:            nowIso,
        amount:          pricePayAll,
        status:          "1",                 // PENDING
        type:            "1",                 // ชำระเงิน
        typenew:         "6",                 // legacy L365 typeNew='6'
        typeservice:     "2",                 // legacy L365 typeService='2' (forwarder)
        paydeposit:      "1",
        imagesslip:      slip.filename,
        depositnamebank: PAYUSER_DEPOSIT_NAMEBANK,
        nameuserbank:    "",
        nouserbank:      "",
        note:            `ชำระเงินพร้อมชำระฝากนำเข้า (เจ้าหน้าที่ทำรายการแทนลูกค้า)`,
        adminid:         legacyAdminId,
        adminidupdate:   legacyAdminId,
        session:         "admin-pay-onbehalf-topup",
        reforder:        "",
        whno:            "",
        wusercredit:     "0",
        userid:          userId,
        adminidcrate:    legacyAdminId,
      })
      .select("id")
      .single<{ id: number }>();
    if (topErr || !topup) {
      // rollback the PCSF side-effect so the row isn't left at 50 with no pay.
      if (batch.pcsfTransportFixId) {
        await admin.from("tb_forwarder").update({ ftransportprice: 0 }).eq("id", Number(batch.pcsfTransportFixId)).eq("userid", userId);
      }
      console.error(`[adminPayForwardersWithTopUp insert topup] failed`, { code: topErr?.code, message: topErr?.message, userId });
      return { ok: false, error: `บันทึกรายการชำระเงินล้มเหลว: ${topErr?.message ?? "no row"}` };
    }
    const whID = topup.id;

    // NOTE: path #1 writes NO type='7' row — the wallet is never touched
    // (legacy L291/L340 force the wallet contribution to 0). reject refund = 0.

    // 7. per-row: PENDING pay row + status flip + paydeposit bridge.
    const paid: string[] = [];
    const skipped: { fid: string; reason: string }[] = [];

    let profileId: string | null = null;
    try {
      const map = await resolveProfileIdsForLegacyUserids([userId]);
      profileId = map.get(userId) ?? null;
    } catch (e) {
      console.error(`[adminPayForwardersWithTopUp resolveProfileId] failed`, { userId, e: String(e) });
    }

    for (const fid of fIds) {
      const price = priceById.get(fid);
      const isCredit = creditById.get(fid) ?? false;
      if (price === undefined) { skipped.push({ fid, reason: "ไม่อยู่สถานะพร้อมชำระ" }); continue; }
      if (!Number.isFinite(price) || price <= 0) { skipped.push({ fid, reason: "ราคารายการไม่ถูกต้อง" }); continue; }

      // pay row — legacy L404-405: type='4' status='1' refOrder=ID
      // refOrder2=whID typeService='2' typeNew='6'. (Matches the approve
      // cascade's sibling-flip: reforder + type='4' + status='1' + reforder2.)
      const { error: payErr } = await admin
        .from("tb_wallet_hs")
        .insert({
          date:            nowIso,
          amount:          price,
          status:          "1",               // PENDING
          type:            "4",               // ชำระเงินฝากนำเข้า
          typenew:         "6",
          typeservice:     "2",
          paydeposit:      "1",
          imagesslip:      "",
          depositnamebank: "",
          note:            `ชำระฝากนำเข้า #${fid} (เติม-แล้วจ่าย · รออนุมัติสลิป)`,
          adminid:         legacyAdminId,
          adminidupdate:   legacyAdminId,
          session:         "admin-pay-onbehalf-topup",
          reforder:        fid,
          reforder2:       whID,              // legacy refOrder2=$whID (reforder2 is bigint)
          whno:            "",
          wusercredit:     isCredit ? "1" : "0",
          userid:          userId,
          adminidcrate:    legacyAdminId,
        });
      if (payErr) {
        console.error(`[adminPayForwardersWithTopUp pay row] failed`, { code: payErr.code, message: payErr.message, fid });
        skipped.push({ fid, reason: `บันทึกรายการชำระล้มเหลว: ${payErr.message}` });
        continue;
      }

      // flip forwarder 5→6 (or credit variant) — legacy L408/L410. Path #1
      // (slip top-up) DOES set paydeposit='1' (it created a bridge row).
      const fwdPatch: Record<string, unknown> = isCredit
        ? { fcredit: "", paydeposit: "1", fdateadminstatus: nowIso, fusercompany: fUserCompanyValue }
        : { fstatus: "6", paydeposit: "1", fdateadminstatus: nowIso, fdatestatus6: nowIso, fusercompany: fUserCompanyValue };
      const { error: fUpdErr } = await admin
        .from("tb_forwarder")
        .update(fwdPatch)
        .eq("id", Number(fid))
        .eq("userid", userId);
      if (fUpdErr) {
        console.error(`[adminPayForwardersWithTopUp forwarder flip] failed`, { code: fUpdErr.code, message: fUpdErr.message, fid, whID });
        skipped.push({ fid, reason: `อัพเดทสถานะรายการล้มเหลว (รายการชำระบันทึกแล้ว · เติม #${whID})` });
        continue;
      }

      // bridge row (legacy L417-418: tb_wallet_paydeposit(whID, ID)).
      const { error: bridgeErr } = await admin
        .from("tb_wallet_paydeposit")
        .insert({ whid: whID, hno: fid });
      if (bridgeErr) {
        console.error(`[adminPayForwardersWithTopUp bridge] failed`, { code: bridgeErr.code, message: bridgeErr.message, fid, whID });
        skipped.push({ fid, reason: `เชื่อมรายการเติม-จ่ายล้มเหลว (เติม #${whID}) — แจ้งทีมบัญชี` });
        continue;
      }

      paid.push(fid);
    }

    if (profileId) {
      void sendNotification(profileId, {
        category:       "forwarder",
        severity:       "info",
        title:          `รับเรื่องชำระค่าฝากนำเข้า (รออนุมัติสลิป)`,
        body:           `เจ้าหน้าที่ทำรายการเติม-จ่ายให้ ${paid.length} รายการ · รอตรวจสอบสลิป`,
        link_href:      `/wallet/history`,
        reference_type: "wallet_transaction",
        reference_id:   String(whID),
      });
    }

    revalidatePath("/admin/wallet/pay-user");
    revalidatePath("/admin/forwarders");
    revalidatePath(`/admin/wallet/${whID}`);
    revalidatePath("/admin/wallet");
    // The top-up credit landed (+ forwarders paid) → wallet totals + forwarder
    // queues changed; refresh the admin sidebar/wallet-total badges immediately.
    bustAdminChrome();

    if (paid.length === 0) {
      return {
        ok: false,
        error: `ชำระเงินบันทึกแล้ว (เติม #${whID}) แต่ไม่มีรายการที่ทำได้: ${skipped.map((s) => `${s.fid}: ${s.reason}`).join(" · ")}`,
      };
    }
    return {
      ok: true,
      data: {
        topupWalletHsId: whID,
        paid,
        skipped,
        topup_amount: pricePayAll,
      },
    };
  });
}
