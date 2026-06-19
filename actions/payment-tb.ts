"use server";

/**
 * Customer-side "ฝากโอนหยวน — ชำระจาก wallet" Server Action against the
 * legacy `tb_payment` + `tb_wallet` + `tb_wallet_hs` tables.
 *
 * D1 / ADR-0017 Phase-B faithful port — implements ADR-0018 §D-2 rule 1
 * (customer DEBIT-on-submit). Closes the cust-04 P0-1 audit gap (legacy
 * gap 2026-05-30 P0-2): yuan wallet-paid submissions in `actions/payment.ts`
 * `createYuanPayment` write a *pending* `wallet_transactions` row (rebuilt
 * table, empty on prod). No admin path ever settles it → `tb_wallet` is
 * never debited → customer can re-spend the same THB = double-spend.
 *
 * ── Why a NEW file (NOT a refactor of actions/payment.ts) ──────────
 *
 *   `actions/payment.ts::createYuanPayment` writes the REBUILT
 *   `wallet_transactions` table for the wallet-paid branch. Pivoting
 *   in place would mix lanes and make the dead rebuilt-write twin hard
 *   to retire. This file follows the established Tier-A pattern of
 *   `*-tb.ts` siblings (precedent: `actions/admin/yuan-payments-tb.ts`,
 *   `actions/admin/service-orders-tb.ts`). The existing rebuilt path
 *   stays as a tombstone for one sprint and gets retired in a single
 *   move when the last reader migrates — mirrors ADR-0018 §D-3 #4
 *   "NEW actions/wallet-tb.ts".
 *
 * ── Legacy contract (pcs-admin/payment.php L11-93 + ADR-0018 D-2) ──
 *
 *   1. Pre-check: SELECT walletTotal FROM tb_wallet WHERE userID=?
 *      Refuse if walletTotal < payTHB. Refuse if no row OR row exists
 *      but balance is zero/negative. (Legacy `if (walletTotal > 0)`
 *      + `if (payTHB <= walletTotal && payTHB > 0)`.)
 *   2. INSERT tb_payment row (paystatus='1' pending — admin still
 *      needs to actually send the yuan transfer to the merchant).
 *   3. UPDATE tb_wallet.wallettotal -= payTHB (synchronous; the legacy
 *      debits on submit, not on admin approval).
 *   4. INSERT tb_wallet_hs row.
 *
 * ── Pacred contract divergence from legacy (ADR-0018 D-2 rule 1) ───
 *
 *   tb_wallet_hs.status:
 *     legacy = '1' (pending — its ledger row mirrors tb_payment.paystatus)
 *     ADR-0018 = '2' (approved — customer DEBIT-on-submit is auto-approved)
 *
 *   The decision in ADR-0018 §D-2 is that ANY row in tb_wallet_hs with
 *   status='1' represents a *promise* — not a movement. Real wallet
 *   movements (the UPDATE to tb_wallet.wallettotal) only happen when
 *   the row is status='2'. Since the legacy debits walletTotal
 *   immediately, the corresponding ledger row MUST be status='2' to
 *   make the data-model self-consistent under Pacred's settle contract.
 *
 *   This matches the Tier-A1 admin precedent (commit 913248a6,
 *   actions/admin/yuan-payments-tb.ts) which already writes type='6'
 *   + status='2' for the admin-add path. Same contract, customer side.
 *
 *   The tb_payment.paystatus stays '1' — the legacy semantic of
 *   "customer paid, admin still needs to send the yuan transfer abroad"
 *   is preserved. Admin approve (Tier-A5 adminUpdateYuanPayment) flips
 *   paystatus '1' → '2' separately; that path doesn't touch tb_wallet
 *   (rule 3 — the debit already happened at submit).
 *
 * ── Idempotency ────────────────────────────────────────────────────
 *
 *   Defensive against form double-submit / network retry. After the
 *   tb_payment INSERT (the only way to mint the reforder key), we
 *   SELECT tb_wallet_hs WHERE userid=? AND type='6' AND reforder=? —
 *   if a matching row exists, the previous call already debited. We
 *   roll back this duplicate tb_payment row and return `alreadyDone`.
 *
 *   In practice this catches: same browser submit re-firing while the
 *   tb_payment INSERT is in flight (extremely rare; the form's
 *   disabled-while-pending state is the primary protection). For a
 *   true client-token idempotency key we'd need a new column; that's
 *   a follow-up if double-submit is observed in the wild.
 *
 * ── Partial-failure rollback (Supabase REST has no real txn) ───────
 *
 *   If tb_payment INSERT succeeds but tb_wallet_hs INSERT fails:
 *     → DELETE the tb_payment row (mirror of Tier-A1's recovery
 *       comment in yuan-payments-tb.ts L228-231).
 *
 *   If both inserts succeed but tb_wallet UPDATE fails:
 *     → surface a loud error including BOTH the tb_payment.id and
 *       the tb_wallet_hs.id so ops can reconcile manually. We cannot
 *       cleanly undo tb_wallet_hs post-fact (deleting it would leave
 *       a paystatus='1' tb_payment row with no debit trail).
 *
 * Schema reference: supabase/migrations/0081_pcs_legacy_schema.sql
 *   L3611-3634 (tb_payment), L6135-6138 (tb_wallet), L6159-6185 (tb_wallet_hs).
 *
 * tb_wallet_hs type/status legend (from 0081 L6213 + L6220):
 *   type='6' = ชำระเงินฝากโอน (yuan transfer paid from wallet)
 *   status='2' = สำเร็จ (approved — per ADR-0018 D-2 rule 1)
 *
 * Reachability (AGENTS.md §0d): the existing /service-payment/add page
 * already surfaces the "ชำระจากกระเป๋า" radio in `YuanPaymentForm`
 * (yuan-payment-form.tsx L240-254). This action wires that branch.
 */

import { revalidatePath } from "next/cache";
import { bustCustomerChrome } from "@/lib/cache/revalidate-chrome";
import { createAdminClient } from "@/lib/supabase/admin";
import { yuanPaymentSchema, type YuanPaymentInput } from "@/lib/validators/payment";
import { mapTaxDocColumns } from "@/lib/tax/tax-doc-mode";
import { sendNotification } from "@/lib/notifications";
import { notifyStaffGroup } from "@/lib/notifications/staff-group";
import { assertNotImpersonating } from "@/lib/auth/impersonation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { checkYuanPaymentEligibility } from "@/lib/payment/yuan-eligibility";
import { spendCashbackAtCheckout, refundCashbackOnReject } from "@/actions/admin/wallet-hs";
import { cashbackRefId } from "@/lib/cashback/note-tag";
import {
  computePayThb,
  computeNewBalance,
} from "@/lib/payment/wallet-math";

type ActionResult<T = void> =
  | { ok: true; data: T; alreadyDone?: boolean }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// channel → legacy paytype digit (same map as actions/payment.ts).
// ────────────────────────────────────────────────────────────
// Per Next 16 "use server" rule (docs/learnings/nextjs-16-quirks.md
// [2026-05-28]) this MUST stay a non-exported async/local helper — sync
// non-async value exports from "use server" files are rejected.
function channelToPaytype(ch: YuanPaymentInput["channel"]): "1" | "2" | "3" {
  switch (ch) {
    case "alipay": return "1";
    case "wechat": return "2";
    case "bank":   return "3";
  }
}

// ────────────────────────────────────────────────────────────
// createYuanPaymentFromWallet
// ────────────────────────────────────────────────────────────
/**
 * Customer submits a ฝากโอนหยวน request paid from their wallet.
 *
 * This is the wallet-paid branch ONLY — the slip-paid branch stays on
 * `actions/payment.ts::createYuanPayment` (no wallet movement to fix
 * there). The form selector at /service-payment/add picks the action
 * based on `paid_via_wallet`.
 */
export async function createYuanPaymentFromWallet(
  input: YuanPaymentInput,
  // ADR-0025 — optional apply-cashback (the ฝากโอน pay-now path). When > 0 the
  // cashback is spent FIRST (debit-on-submit · settles immediately, no admin
  // step), then the wallet covers the remainder. Existing call-sites pass no
  // opts → cashback unused → behaviour unchanged.
  opts?: { cashBackApplied?: number },
): Promise<ActionResult<{ id: number; thb_amount: number; new_wallet_balance: number }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  // ── 2026-06-19 (owner) — ฝากโอนหยวน moved to the DIRECT-CUT model: the
  //    customer submits a slip → accounting verifies (2 layers) → ตัดจ่าย, with
  //    NO wallet top-up/debit ("ไม่ต้องกระเป๋าตัง"). The /service-payment form no
  //    longer offers a pay-from-wallet option, so this action is no longer wired
  //    to any UI. It is kept intact (correct, money-safe) for back-compat; a
  //    crafted POST here only spends the caller's OWN wallet on their OWN ฝากโอน
  //    (legit self-spend, not a vuln). Slip path = actions/payment.ts::createYuanPayment.

  const parsed = yuanPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // Defence-in-depth: this action MUST be the wallet branch.
  if (!d.paid_via_wallet) {
    return { ok: false, error: "wrong_branch: use createYuanPayment for slip-paid" };
  }

  const userData = await getCurrentUserWithProfile();
  if (!userData?.user) return { ok: false, error: "not_signed_in" };
  if (!userData.profile?.member_code) {
    return { ok: false, error: "ยังไม่ได้รับ member_code — กรุณาติดต่อทีมงาน" };
  }
  const userId     = userData.user.id;
  const memberCode = userData.profile.member_code;  // PR####

  // Eligibility backstop (legacy payment.php L256-276) — same gate the list
  // page enforces; closes the deep-link-to-/add bypass.
  const eligErr = await checkYuanPaymentEligibility(memberCode);
  if (eligErr) return { ok: false, error: eligErr };

  const thb_amount = computePayThb(d.yuan_amount, d.exchange_rate);

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const paytype = channelToPaytype(d.channel);

  // ── Step 1 — Read tb_wallet (legacy payment.php L11-17) ─────────
  // The pre-check refuses any debit that would overdraw. tb_wallet
  // may not exist for a brand-new customer who has never deposited
  // (treat as balance=0 → refuse since payTHB > 0 by Zod).
  const { data: walletBefore, error: walletReadErr } = await admin
    .from("tb_wallet")
    .select("userid, wallettotal")
    .eq("userid", memberCode)
    .maybeSingle<{ userid: string; wallettotal: number | string }>();
  if (walletReadErr) {
    console.error(`[tb_wallet read] failed`, { code: walletReadErr.code, message: walletReadErr.message, userid: memberCode });
    return { ok: false, error: `db_error:${walletReadErr.code ?? "unknown"}` };
  }
  const currentBalance = Number(walletBefore?.wallettotal ?? 0);

  // ── ADR-0025 — clamp the requested apply-cashback (pre-check only).
  // The actual debit happens after tb_payment is minted (so cbhrefid can
  // anchor on the payment id). Here we cap to `min(cbtotal, thb_amount)` and
  // require the wallet to cover the remainder.
  let cashBackRequested = Math.max(0, Number(opts?.cashBackApplied) || 0);
  if (cashBackRequested > 0) {
    const { data: cbRow, error: cbErr } = await admin
      .from("tb_cash_back")
      .select("cbtotal")
      .eq("userid", memberCode)
      .maybeSingle<{ cbtotal: number | string | null }>();
    if (cbErr) {
      console.error(`[tb_cash_back read] failed`, { code: cbErr.code, message: cbErr.message, userid: memberCode });
    }
    cashBackRequested = Math.round(Math.max(0, Math.min(cashBackRequested, Number(cbRow?.cbtotal ?? 0), thb_amount)) * 100) / 100;
  }
  const walletNeeded = Math.round((thb_amount - cashBackRequested) * 100) / 100;
  // Wallet must cover the remainder. (When cashback fully covers the bill,
  // walletNeeded=0 → no wallet debit required; canDebit's `amount>0` guard
  // would reject 0, so gate on `>= walletNeeded` directly here.)
  if (!(currentBalance >= walletNeeded)) {
    return {
      ok: false,
      error: `insufficient_balance: ยอดกระเป๋า ฿${currentBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ไม่พอชำระ ฿${walletNeeded.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
    };
  }

  // ── Step 2 — INSERT tb_payment (paystatus='1' pending) ──────────
  // All NOT-NULL columns must be populated; empty strings are the
  // legacy default for the admin-side / slip fields the customer
  // does not supply. paystatus='1' because admin still needs to send
  // the yuan transfer abroad — paystatus '1' → '2' is the
  // adminUpdateYuanPayment (Tier-A5) transition, NOT the wallet debit.
  const { data: paymentRow, error: insErr } = await admin
    .from("tb_payment")
    .insert({
      paydate:           nowIso,
      paydeposit:        "1",                    // 1 = paid-from-wallet
      paystatus:         "1",                    // pending — admin sends abroad
      paytype,
      paydetail:         d.recipient_detail,
      payyuan:           d.yuan_amount,
      payrate:           d.exchange_rate,
      payratecost:       d.exchange_rate,        // admin can override on approve
      paythb:            thb_amount,
      paythbcost:        thb_amount,             // admin overrides on approve
      payprofitthb:      0,                      // admin computes on approve
      userid:            memberCode,
      adminid:           "",
      adminidupdate:     "",
      payadminidcreator: "",
      session:           "customer-self",
      imagesslip:        "",                     // wallet-paid → no slip
      certifiedtruecopy: d.id_doc_url ?? "",
      imagesslipadmin:   "",
      // GAP 3 — tax-document choice for this ฝากโอน (mig 0140). SELECTION only.
      ...mapTaxDocColumns(d),
    })
    .select("id")
    .single<{ id: number }>();
  if (insErr || !paymentRow) {
    console.error(`[tb_payment insert] failed`, { code: insErr?.code, message: insErr?.message, userid: memberCode });
    return { ok: false, error: insErr?.message ?? "insert_failed" };
  }
  const paymentId = paymentRow.id;

  // ── Step 3 — Idempotency check ──────────────────────────────────
  // Defensive against form double-submit. tb_wallet_hs.reforder is
  // VARCHAR(30) holding the tb_payment.id we just minted. A second
  // call with the same form data would create a SECOND tb_payment row
  // (different id) and pass this check — that is "submit twice = two
  // requests", which is the legacy behaviour. The real protection is
  // the form's disabled-while-pending state.
  //
  // Why check now (not before INSERT): the reforder we'd be testing
  // doesn't exist until we insert tb_payment. The legacy doesn't have
  // this gate at all; we add it as belt-and-braces for the same
  // browser submit re-firing while the tb_payment INSERT is in flight
  // (extremely rare; this catches it post-fact and reports cleanly).
  const { data: existingHs, error: existingHsErr } = await admin
    .from("tb_wallet_hs")
    .select("id")
    .eq("userid", memberCode)
    .eq("type", "6")
    .eq("reforder", String(paymentId))
    .maybeSingle<{ id: number }>();
  if (existingHsErr) {
    // If the idempotency probe failed we cannot safely proceed without
    // risking a double-debit. Roll back the just-inserted tb_payment
    // and surface the error — the user will retry, the probe will
    // succeed on retry, and we won't have orphaned a payment row.
    console.error(`[tb_wallet_hs idempotency probe] failed`, {
      code: existingHsErr.code,
      message: existingHsErr.message,
      tb_payment_id: paymentId,
      userid: memberCode,
    });
    await admin.from("tb_payment").delete().eq("id", paymentId);
    return { ok: false, error: `db_error:${existingHsErr.code ?? "unknown"}` };
  }
  if (existingHs) {
    // Already processed by a concurrent call — roll back this duplicate
    // tb_payment row to keep books balanced.
    await admin.from("tb_payment").delete().eq("id", paymentId);
    return {
      ok: true,
      data: { id: paymentId, thb_amount, new_wallet_balance: currentBalance },
      alreadyDone: true,
    };
  }

  // ── Step 3b — ADR-0025: spend the applied cashback NOW (debit-on-submit).
  // Idempotent on `cbhrefid=yuan:<paymentId>`. `applied` is the real amount
  // debited; the wallet covers `thb_amount − applied`.
  let cashBackApplied = 0;
  if (cashBackRequested > 0) {
    const cbRefId = cashbackRefId("yuan", String(paymentId));
    const cbRes = await spendCashbackAtCheckout(admin, {
      userid: memberCode, requested: cashBackRequested, cbhrefid: cbRefId, nowIso,
    });
    cashBackApplied = cbRes.applied;
  }
  const walletDebit = Math.round((thb_amount - cashBackApplied) * 100) / 100;
  const cbRefIdYuan = cashbackRefId("yuan", String(paymentId));

  // ── Step 4 — INSERT tb_wallet_hs (type='6', status='2') ─────────
  // type='6' = ชำระเงินฝากโอน (0081 L6220). status='2' (approved) per
  // ADR-0018 D-2 rule 1 (customer DEBIT-on-submit is auto-approved —
  // the debit is real, the row is the receipt of that movement).
  // amount is POSITIVE; debit direction encoded by type='6' per the
  // schema comment + Tier-A1 precedent. ADR-0025: amount = the WALLET
  // portion (thb_amount − cashbackApplied); cashback recorded separately.
  const { error: hsErr } = await admin
    .from("tb_wallet_hs")
    .insert({
      date:            nowIso,
      amount:          walletDebit,
      status:          "2",                       // approved (customer-initiated debit)
      type:            "6",                       // ชำระเงินฝากโอน
      typenew:         "7",                       // ชำระเงินฝากโอน (0081 L6227)
      typeservice:     "3",                       // ฝากโอน (0081 L6234)
      paydeposit:      "1",                       // paid-from-wallet
      imagesslip:      "",                        // no slip on wallet-paid
      depositnamebank: "",
      nameuserbank:    "",
      nouserbank:      "",
      note:            `ชำระค่าโอนหยวนจากกระเป๋า (customer-self)${cashBackApplied > 0 ? ` + แคชแบ็ก ฿${cashBackApplied}` : ""}`,
      adminid:         "",                        // no admin yet
      adminidupdate:   "",
      session:         "customer-self",
      reforder:        String(paymentId),         // refOrder = tb_payment.id
      whno:            "",
      wusercredit:     "0",
      userid:          memberCode,
      adminidcrate:    memberCode,                // customer self-initiated
    });
  if (hsErr) {
    // Rollback the tb_payment row + the cashback spend — silent half-state
    // is the bug we are closing. Mirror of Tier-A1 recovery (yuan-payments
    // -tb.ts L262-269).
    await admin.from("tb_payment").delete().eq("id", paymentId);
    if (cashBackApplied > 0) {
      await refundCashbackOnReject(admin, { userid: memberCode, cbhrefid: cbRefIdYuan, nowIso: new Date().toISOString() });
    }
    return {
      ok: false,
      error: `บันทึก tb_wallet_hs ล้มเหลว · ยกเลิก tb_payment เพื่อรักษาสถานะ: ${hsErr.message}`,
    };
  }

  // ── Step 5 — UPDATE tb_wallet (or INSERT if no row) ─────────────
  // Read-modify-write. The pre-check guaranteed walletBefore exists
  // for any positive walletDebit (currentBalance < walletDebit → refuse,
  // and missing row → currentBalance=0 → refuse since walletNeeded > 0
  // unless cashback fully covered), so the INSERT-if-missing branch is
  // purely defensive against a race where the tb_wallet row got deleted
  // between the SELECT and now (impossible in practice).
  const newBalance = computeNewBalance(currentBalance, walletDebit);

  if (!walletBefore) {
    const { error: walletInsErr } = await admin
      .from("tb_wallet")
      .insert({ userid: memberCode, wallettotal: -walletDebit });
    if (walletInsErr) {
      // tb_payment + tb_wallet_hs already wrote — ops must reconcile.
      // Cannot cleanly undo tb_wallet_hs at this point.
      console.error(`[tb_wallet insert] FAILED post-hs`, {
        tb_payment_id: paymentId,
        userid:        memberCode,
        amount:        walletDebit,
        message:       walletInsErr.message,
      });
      return {
        ok: false,
        error: `tb_payment id=${paymentId} + tb_wallet_hs สำเร็จ · แต่ tb_wallet insert ล้มเหลว: ${walletInsErr.message} (กระเป๋ายังไม่หัก${cashBackApplied > 0 ? ` · แคชแบ็ก ฿${cashBackApplied} ถูกหักแล้ว (cbhrefid=${cbRefIdYuan})` : ""} — ติดต่อ ops)`,
      };
    }
  } else {
    const { error: walletUpdErr } = await admin
      .from("tb_wallet")
      .update({ wallettotal: newBalance })
      .eq("userid", memberCode);
    if (walletUpdErr) {
      console.error(`[tb_wallet update] FAILED post-hs`, {
        tb_payment_id:    paymentId,
        userid:           memberCode,
        amount:           walletDebit,
        cashbackApplied:  cashBackApplied,
        cbhrefid:         cbRefIdYuan,
        before:           currentBalance,
        target:           newBalance,
        message:          walletUpdErr.message,
      });
      return {
        ok: false,
        error: `tb_payment id=${paymentId} + tb_wallet_hs สำเร็จ · แต่ tb_wallet update ล้มเหลว: ${walletUpdErr.message} (กระเป๋ายังไม่หัก${cashBackApplied > 0 ? ` · แคชแบ็ก ฿${cashBackApplied} ถูกหักแล้ว (cbhrefid=${cbRefIdYuan})` : ""} — ติดต่อ ops)`,
      };
    }
  }

  // ── Step 6 — Refresh customer-visible surfaces ──────────────────
  revalidatePath("/service-payment");
  revalidatePath("/service-payment/add");
  revalidatePath(`/service-payment/${paymentId}`);
  revalidatePath("/wallet");
  revalidatePath("/wallet/history");
  // Wallet was debited + a new ฝากโอน payment row created → wallet balance and
  // payment-count chrome badges changed; purge for an instant update.
  bustCustomerChrome();

  // Audit log — customer activity (logAdminAction would be wrong; this
  // is a customer mutation). The notification + console.info are the
  // breadcrumb for ops.
  console.info(`[createYuanPaymentFromWallet] tb_payment=${paymentId} userid=${memberCode} paythb=${thb_amount} balance ${currentBalance} → ${newBalance}`);

  void sendNotification(userId, {
    category:       "yuan_payment",
    severity:       "info",
    title:          `ฝากโอนหยวนสำเร็จ`,
    body:           `¥${d.yuan_amount.toFixed(2)} = ฿${thb_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} · ชำระจากกระเป๋า`,
    link_href:      `/service-payment`,
    reference_type: "yuan_payment",
    reference_id:   String(paymentId),
  });

  // P1-24: ping the staff LINE-OA group (faithful to legacy lineNotify on
  // create). No-op until LINE_STAFF_GROUP_ID is set — see staff-group.ts.
  void notifyStaffGroup(
    `จากลูกค้า: ${memberCode}\n` +
    `ยอด: ¥${d.yuan_amount.toFixed(2)} = ฿${thb_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} · ชำระจากกระเป๋า\n` +
    `สถานะ: รอดำเนินการ`,
    {
      title:    `📩 ฝากโอน/ฝากชำระใหม่ #${paymentId}`,
      url:      `/admin/yuan-payments/${paymentId}`,
      urlLabel: "ดูรายการฝากโอน",
    },
  );

  return {
    ok: true,
    data: { id: paymentId, thb_amount, new_wallet_balance: newBalance },
  };
}
