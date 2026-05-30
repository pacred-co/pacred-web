"use server";

/**
 * Customer-side wallet mutations against the LEGACY SOT
 * (`tb_wallet` + `tb_wallet_hs`) — ADR-0018 §D-2 rule 1 (customer
 * DEBIT-on-submit). Mirrors the `*-tb.ts` naming convention Tier-A
 * established (precedent: `actions/payment-tb.ts`,
 * `actions/admin/yuan-payments-tb.ts`).
 *
 * Currently home to:
 *   submitWithdrawRequest — the customer "ถอนเงิน" (P0-7) flow.
 *
 * ── Why a NEW file (NOT a refactor of actions/wallet.ts) ───────────
 *
 *   `actions/wallet.ts::createWithdraw` writes the REBUILT
 *   `wallet_transactions` table — empty on prod, so all 8,898 migrated
 *   customers' requests are invisible to admin (audit P0-7 / cust-05).
 *   Pivoting in place would mix the dead rebuilt lane with the live
 *   legacy lane. This file follows the Tier-A pattern; the rebuilt
 *   `createWithdraw` stays a TOMBSTONE for one sprint and retires when
 *   the last reader migrates — mirrors ADR-0018 §D-3 #4.
 *
 * ── Legacy contract (verified against pcs-admin/wallet.php L744-815 +
 *    ADR-0018 §D-2 rule 1 STATUS sub-case) ─────────────────────────
 *
 *   The customer-facing `wallet/withdraw/` create handler is not in the
 *   2026-05-24 legacy extract (the directory's index entry was dropped),
 *   so the contract is taken from the ADR (which WAS verified against the
 *   admin approve/reject branch L744-815) + the schema column comments
 *   (0081 L6135 tb_wallet · L6159 tb_wallet_hs):
 *
 *     1. Pre-check: walletTotal >= amount → else insufficient_balance.
 *     2. INSERT tb_wallet_hs: type='3' (ถอนเงิน), status='1' (pending —
 *        admin must still confirm the bank payout), positive `amount`,
 *        bank fields (depositnamebank = ธนาคารปลายทาง · nameuserbank =
 *        ชื่อบัญชีรับเงินคืน · nouserbank = เลขที่บัญชีโอนเงินคืน),
 *        userid = member_code (PR####), adminid = '' (no admin yet),
 *        adminidcrate = member_code (customer self-initiated).
 *     3. UPDATE tb_wallet.wallettotal -= amount (a "HOLD" — the money
 *        leaves NOW even though status stays '1'). Proof this is
 *        debit-at-submit: the admin REJECT path (L795-815) reads
 *        walletTotal then ADDS the amount back — a refund only makes
 *        sense if the money already left.
 *
 *   Admin approve (1→2) = no balance change (debit already happened).
 *   Admin reject  (1→3) = refund (walletTotal += amount) on the same
 *   tb_wallet row (legacy L807-815 — a balance-bump, NOT a new type='5'
 *   row). Both live in actions/admin/wallet-hs.ts.
 *
 * ── status='1' (NOT '2') — the withdraw carve-out ───────────────────
 *
 *   ADR-0018 §D-2 rule 1 says the yuan-from-wallet (type='6') and
 *   shop-from-wallet (type='2') debits write status='2' (no second admin
 *   step). The customer-withdraw (type='3') is the EXCEPTION: it debits
 *   at submit BUT writes status='1', because the admin must confirm the
 *   bank payout. This is the "debit-hold" model the audit P1-26 named.
 *   So this action is the one place where a tb_wallet debit pairs with a
 *   status='1' tb_wallet_hs row — intentional, per the resolved ADR.
 *
 * ── Partial-failure rollback (Supabase REST has no real txn) ───────
 *
 *   If tb_wallet_hs INSERT succeeds but the tb_wallet UPDATE fails →
 *   DELETE the inserted tb_wallet_hs row (the money never actually left,
 *   and a pending row with no matching debit would let the admin reject
 *   it and over-refund). Mirror of the Tier-A1 recovery pattern.
 *
 * Schema reference: supabase/migrations/0081_pcs_legacy_schema.sql
 *   L6135-6138 (tb_wallet) + L6159-6185 (tb_wallet_hs).
 *
 * tb_wallet_hs type/status legend (0081 L6213 + L6220 + L6227 + L6234):
 *   type='3'        = รายการถอนเงิน
 *   status='1'      = รอดำเนินการ (pending admin bank-payout confirm)
 *   typenew='2'     = คืนเงิน is '2'; withdraw has no dedicated typenew —
 *                     legacy load list keys off `type`, not `typenew`.
 *                     We use typenew='2' (the closest "money-out-of-wallet"
 *                     bucket) to satisfy the NOT-NULL column; the customer
 *                     history tab (load_wallet_hs_withdraw.php) filters
 *                     `WHERE type=3`, so typenew is cosmetic here.
 *   typeservice='1' = ฝากสั่งซื้อ (NOT-NULL default; withdraw is not tied
 *                     to a service — legacy stores '1' as the safe default).
 *
 * Reachability (AGENTS.md §0d): the existing /wallet/withdraw page renders
 * `WithdrawForm` which this action wires (replacing the dead
 * createWithdraw). Customer reaches it via the sidebar "ถอนเงิน" item.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withdrawSchema, type WithdrawInput } from "@/lib/validators/wallet";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import { assertNotImpersonating } from "@/lib/auth/impersonation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { canDebit, computeNewBalance } from "@/lib/payment/wallet-math";

type ActionResult<T = void> =
  | { ok: true; data: T; alreadyDone?: boolean }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// submitWithdrawRequest — customer DEBIT-on-submit + status='1' hold.
// ────────────────────────────────────────────────────────────
/**
 * Customer submits a wallet withdraw request.
 *
 * Debits `tb_wallet.wallettotal` immediately (a hold) + inserts a
 * pending `tb_wallet_hs` row (type='3' status='1'). The admin approve
 * (1→2) pays out the bank transfer with no further balance change; the
 * admin reject (1→3) refunds the held money. See file docblock + the
 * approve/reject functions in actions/admin/wallet-hs.ts.
 */
export async function submitWithdrawRequest(
  input: WithdrawInput,
): Promise<ActionResult<{ id: number; amount: number; new_wallet_balance: number }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = withdrawSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const userData = await getCurrentUserWithProfile();
  if (!userData?.user) return { ok: false, error: "not_signed_in" };
  if (!userData.profile?.member_code) {
    return { ok: false, error: "ยังไม่ได้รับ member_code — กรุณาติดต่อทีมงาน" };
  }
  const userId     = userData.user.id;
  const memberCode = userData.profile.member_code; // PR####
  const amount     = Math.round(d.amount * 100) / 100;

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // ── Step 1 — Read tb_wallet + pre-check (legacy debit-at-submit) ──
  // The pre-check refuses any withdraw that would overdraw. tb_wallet
  // may not exist for a customer who has never deposited (balance=0 →
  // refuse, since amount > 0 by Zod).
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
  if (!canDebit(currentBalance, amount)) {
    return {
      ok: false,
      error: `insufficient_balance: ยอดกระเป๋า ฿${currentBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ไม่พอถอน ฿${amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
    };
  }

  // ── Step 2 — Idempotency: defend against form double-submit ──────
  // The primary protection is the form's disabled-while-pending state.
  // As belt-and-braces, refuse a second IDENTICAL pending withdraw
  // (same userid + amount + type='3' + status='1') created within the
  // last 60s — that's almost certainly a re-fired submit, not a genuine
  // second request for the exact same amount in the same minute.
  const sixtySecAgoIso = new Date(Date.now() - 60_000).toISOString();
  const { data: dup, error: dupErr } = await admin
    .from("tb_wallet_hs")
    .select("id, date")
    .eq("userid", memberCode)
    .eq("type", "3")
    .eq("status", "1")
    .eq("amount", amount)
    .gte("date", sixtySecAgoIso)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: number; date: string | null }>();
  if (dupErr) {
    console.error(`[tb_wallet_hs withdraw idempotency probe] failed`, { code: dupErr.code, message: dupErr.message, userid: memberCode });
    // Probe failure must NOT block a genuine first request; log + proceed.
    // (Worst case a true double-submit slips through — the same risk the
    // legacy carried, and far less harmful than refusing a real withdraw.)
  } else if (dup) {
    return {
      ok: true,
      data: { id: dup.id, amount, new_wallet_balance: currentBalance },
      alreadyDone: true,
    };
  }

  // ── Step 3 — INSERT tb_wallet_hs (type='3', status='1') ──────────
  // tb_wallet_hs is RLS deny-all for non-service-role (0081 L8602) →
  // admin client. amount is POSITIVE; the debit direction is encoded by
  // type='3' (the customer history list renders it as "−" per
  // load_wallet_hs_withdraw.php nameColor='danger').
  const { data: hsRow, error: hsErr } = await admin
    .from("tb_wallet_hs")
    .insert({
      date:            nowIso,
      amount,
      status:          "1",                       // pending — admin confirms bank payout
      type:            "3",                       // ถอนเงิน
      typenew:         "2",                       // NOT-NULL filler (list keys off `type`)
      typeservice:     "1",                       // NOT-NULL default (withdraw is service-agnostic)
      paydeposit:      "0",
      imagesslip:      "",                        // customer uploads ID/bankbook via sales (page terms)
      depositnamebank: d.bank_name,               // ธนาคารปลายทางที่รับเงิน
      nameuserbank:    d.account_name,            // ชื่อบัญชีรับเงินคืน
      nouserbank:      d.account_number,          // เลขที่บัญชีโอนเงินคืน
      note:            d.note ?? "",
      adminid:         "",                        // no admin yet
      adminidupdate:   "",
      session:         "customer-self",
      reforder:        "",                        // withdraw self-references; admin fills on payout
      whno:            "",                        // NOT-NULL — withdraw has no warehouse #
      wusercredit:     "0",
      userid:          memberCode,
      adminidcrate:    memberCode,                // customer self-initiated
    })
    .select("id")
    .single<{ id: number }>();
  if (hsErr || !hsRow) {
    console.error(`[tb_wallet_hs withdraw insert] failed`, { code: hsErr?.code, message: hsErr?.message, userid: memberCode });
    return { ok: false, error: hsErr?.message ?? "insert_failed" };
  }
  const hsId = hsRow.id;

  // ── Step 4 — UPDATE tb_wallet (debit the hold) ───────────────────
  // Read-modify-write. The pre-check guaranteed walletBefore exists for
  // any positive amount (currentBalance < amount → refuse; missing row →
  // balance=0 → refuse). The INSERT-if-missing branch is purely defensive
  // against a race where the row got deleted between SELECT and now
  // (impossible in practice — Pacred doesn't delete wallet rows).
  const newBalance = computeNewBalance(currentBalance, amount);

  if (!walletBefore) {
    const { error: walletInsErr } = await admin
      .from("tb_wallet")
      .insert({ userid: memberCode, wallettotal: -amount });
    if (walletInsErr) {
      // Roll back the pending hs row — the money never left, and leaving
      // the pending row would let an admin reject it and over-refund.
      await admin.from("tb_wallet_hs").delete().eq("id", hsId);
      console.error(`[tb_wallet insert] FAILED post-hs · rolled back hs`, {
        tb_wallet_hs_id: hsId,
        userid:          memberCode,
        amount,
        message:         walletInsErr.message,
      });
      return { ok: false, error: `ถอนเงินไม่สำเร็จ (ตัดยอดล้มเหลว): ${walletInsErr.message}` };
    }
  } else {
    const { error: walletUpdErr } = await admin
      .from("tb_wallet")
      .update({ wallettotal: newBalance })
      .eq("userid", memberCode);
    if (walletUpdErr) {
      await admin.from("tb_wallet_hs").delete().eq("id", hsId);
      console.error(`[tb_wallet update] FAILED post-hs · rolled back hs`, {
        tb_wallet_hs_id: hsId,
        userid:          memberCode,
        amount,
        before:          currentBalance,
        target:          newBalance,
        message:         walletUpdErr.message,
      });
      return { ok: false, error: `ถอนเงินไม่สำเร็จ (ตัดยอดล้มเหลว): ${walletUpdErr.message}` };
    }
  }

  // ── Step 5 — Refresh customer-visible surfaces ───────────────────
  revalidatePath("/wallet");
  revalidatePath("/wallet/withdraw");
  revalidatePath("/wallet/history");

  console.info(`[submitWithdrawRequest] tb_wallet_hs=${hsId} userid=${memberCode} amount=${amount} balance ${currentBalance} → ${newBalance} (hold · status=1)`);

  void sendNotification(userId, notify.walletWithdrawRequested({
    amount,
    txId: String(hsId),
  }));

  return {
    ok: true,
    data: { id: hsId, amount, new_wallet_balance: newBalance },
  };
}
