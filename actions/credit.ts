"use server";

// ────────────────────────────────────────────────────────────────────
// Customer-side credit-line actions · ADR-0023 (legacy-SOT repoint)
// ────────────────────────────────────────────────────────────────────
// SOT (ADR-0023 D-1): the credit-line is the LEGACY pair
//   limit       = tb_users.userCreditValue   (camelCase · per userID)
//   outstanding = tb_credit.creditvalue      (lowercase  · per userid; missing row = 0)
//   available   = limit − outstanding        (computed; never stored)
// The rebuilt model (v_customer_credit_outstanding · wallet_transactions
// bucket='credit' · profiles.credit_limit) was EMPTY on prod (0 rows) while
// 24 real customers carry a tb_credit.creditvalue>0 → they saw ฿0 here.
// This repoints both reads onto the live legacy columns the grant
// (adminMarkForwarderCredit) + settle (wallet-hs.ts decrement) already use.
//
//   getMyCredit() — read limit/outstanding/available from the legacy
//     columns (resolved by member_code, the tb_*.userid join key). Used
//     by wallet-credit/page.tsx + the /wallet/history credit panel.
//
//   customerPayCreditFromWallet({ amount_thb? }) — standalone wallet→credit
//     paydown (ADR-0023 D-4a). Debits tb_wallet.wallettotal + INSERTs a
//     tb_wallet_hs settle row (wusercredit='1' so it lands in the credit
//     tab) + decrements tb_credit.creditvalue (UPSERT, clamp ≥0). Money-safe
//     per ADR-0018: pending-aware balance pre-check, rollback on partial
//     failure (PostgREST has no real tx — the action owns the rollback).
// ────────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { bustCustomerChrome } from "@/lib/cache/revalidate-chrome";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWalletAvailableBalance } from "@/lib/wallet/balance";
import { calcForwarderOutstanding } from "@/lib/forwarder/outstanding";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import { assertNotImpersonating } from "@/lib/auth/impersonation";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type CustomerCreditState = {
  credit_limit_thb:      number;
  credit_terms_days:     number;
  outstanding_thb:       number;
  available_credit_thb:  number;
};

// ADR-0023 D-5 #2 — the tb_wallet_hs.type for a standalone credit paydown.
// The legacy NEVER had this flow, so there is no exact precedent. The
// credit-history tab (wallet-credit/page.tsx) filters purely on
// wusercredit='1' and colours the row by `type`: type 1 or 5 → green/"+",
// everything else → red/"−" — so the credit tab surfaces this row REGARDLESS
// of `type` (it is wusercredit-keyed, not type-keyed). A paydown is a wallet
// DEBIT, so it reads red (not 1/5).
// ⚠️ Verified against prod 2026-06-01: types 1-7 are ALL in use and each maps
// to a /wallet tab — in particular type='3' is the WITHDRAWAL tab
// (wallet/page.tsx:233 `rowsWithdraw = r.type === "3"`, 641 real legacy rows),
// so tagging a paydown '3' would make it masquerade as a customer withdrawal.
// type='8' is unused across all ~104k tb_wallet_hs rows and appears in NONE of
// the /wallet add/payment/withdraw filters → it surfaces ONLY in the dedicated
// credit tab (its correct home). The customer-facing `note` carries the
// "ชำระยอดค้างเครดิต" description. INTRODUCED convention, not a legacy value.
const CREDIT_PAYDOWN_HS_TYPE = "8" as const;

// ── resolveMemberCode ───────────────────────────────────────────────
// tb_users / tb_credit / tb_wallet all key on `userid` = the customer's
// PR-code (profiles.member_code), NOT the auth uuid. Resolve it once.
async function resolveMemberCode(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("member_code")
    .eq("id", userId)
    .maybeSingle<{ member_code: string | null }>();
  if (error) {
    console.error(`[profiles member_code lookup] failed`, { code: error.code, message: error.message, profile_id: userId });
    return null;
  }
  return data?.member_code ?? null;
}

// ── getMyCredit ─────────────────────────────────────────────────────
// ADR-0023 D-3: read the LIVE legacy columns by member_code (the same
// join key wallet-credit/page.tsx uses). Returns a zeroed state — NOT an
// error — when the customer has no credit line (limit 0) so the UI renders
// a "ยังไม่มีวงเงินเครดิต" panel cleanly.
//
// credit_terms_days: there is NO legacy global terms-days column (the due
// date lives per-order on tb_forwarder.fcreditdate). Per ADR-0023 D-5 #1
// we return 0 (the panel drops the chip when 0) rather than invent a value.
export async function getMyCredit(): Promise<ActionResult<CustomerCreditState>> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[auth.getUser] failed`, { code: authErr.code, message: authErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  const memberCode = await resolveMemberCode(user.id);
  if (memberCode === null) {
    // member_code lookup FAILED (read error) → fail safe.
    return { ok: false, error: "member_code_lookup_failed" };
  }
  if (memberCode === "") {
    // Brand-new account mid-signup with no PR-code yet → no legacy credit
    // row can exist. Return a zeroed state (not an error).
    return {
      ok: true,
      data: { credit_limit_thb: 0, credit_terms_days: 0, outstanding_thb: 0, available_credit_thb: 0 },
    };
  }

  const admin = createAdminClient();
  const [limitRes, creditRes] = await Promise.all([
    // tb_users.userCreditValue (camelCase) — the per-customer cap.
    admin
      .from("tb_users")
      .select("userCreditValue")
      .eq("userID", memberCode)
      .maybeSingle<{ userCreditValue: number | string | null }>(),
    // tb_credit.creditvalue (lowercase) — current outstanding (missing ⇒ 0).
    admin
      .from("tb_credit")
      .select("creditvalue")
      .eq("userid", memberCode)
      .maybeSingle<{ creditvalue: number | string | null }>(),
  ]);

  if (limitRes.error) {
    console.error(`[tb_users credit read] failed`, { code: limitRes.error.code, message: limitRes.error.message, userid: memberCode });
    return { ok: false, error: limitRes.error.message };
  }
  if (creditRes.error) {
    console.error(`[tb_credit read] failed`, { code: creditRes.error.code, message: creditRes.error.message, userid: memberCode });
    return { ok: false, error: creditRes.error.message };
  }

  const limit       = Number(limitRes.data?.userCreditValue ?? 0);
  const outstanding = Number(creditRes.data?.creditvalue ?? 0);

  return {
    ok: true,
    data: {
      credit_limit_thb:     limit,
      credit_terms_days:    0,                    // ADR-0023 D-5 #1 — no legacy global terms-days
      outstanding_thb:      outstanding,
      available_credit_thb: Math.round((limit - outstanding) * 100) / 100,
    },
  };
}

// ── customerPayCreditFromWallet ─────────────────────────────────────
// ADR-0023 D-4a: standalone wallet→credit paydown on the LEGACY columns.
//   1. pending-aware available-balance pre-check (getWalletAvailableBalance)
//   2. INSERT tb_wallet_hs settle row (wusercredit='1', debit type)
//   3. UPDATE tb_wallet.wallettotal −= amount
//   4. CLEAR fcredit on the orders this paydown settles (oldest-first, fully-
//      covered only) so Σ(per-order outstanding over fcredit='1') stays in
//      lock-step with the running balance — the AR-drift fix (mirror of the
//      admin pure-wallet settle pay-user.ts L584 / legacy pay-users.php L469)
//   5. UPSERT tb_credit.creditvalue −= amount (clamp ≥0)
// Rollback discipline (PostgREST has no real tx): if a later step fails we
// undo the earlier ones — including re-setting any fcredit flips back to '1' —
// so we never leave a half-state (balance debited but creditvalue/fcredit
// unchanged, or vice-versa). A half-state is worse than the dead state we are
// closing.
//
// amount_thb OPTIONAL — omitted = settle full outstanding; a positive value
// lets a customer partial-pay (e.g. ฿1000 in wallet but ฿2000 owed). An
// explicit amount is clamped to outstanding (overpaying credit is meaningless).

const payCreditSchema = z.object({
  amount_thb: z.coerce.number().positive().max(10_000_000).optional(),
});
export type CustomerPayCreditInput = z.infer<typeof payCreditSchema>;

type PayCreditData = {
  hs_id:                 number;
  amount_paid_thb:       number;
  new_outstanding_thb:   number;
  already_settled:       boolean;
};

export async function customerPayCreditFromWallet(
  input?: CustomerPayCreditInput,
): Promise<ActionResult<PayCreditData>> {
  // Impersonation is read-only — refuse customer-facing money mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = payCreditSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const requestedAmount = parsed.data.amount_thb ?? null;

  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[auth.getUser] failed`, { code: authErr.code, message: authErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  const memberCode = await resolveMemberCode(user.id);
  if (!memberCode) {
    return { ok: false, error: "no_member_code — บัญชียังไม่มีรหัสลูกค้า" };
  }

  const admin = createAdminClient();

  // 1) Read current outstanding (tb_credit · missing ⇒ 0).
  const { data: creditRow, error: creditReadErr } = await admin
    .from("tb_credit")
    .select("creditvalue")
    .eq("userid", memberCode)
    .maybeSingle<{ creditvalue: number | string | null }>();
  if (creditReadErr) {
    console.error(`[tb_credit read] failed`, { code: creditReadErr.code, message: creditReadErr.message, userid: memberCode });
    return { ok: false, error: creditReadErr.message };
  }
  const outstanding = Number(creditRow?.creditvalue ?? 0);
  if (outstanding <= 0) {
    return { ok: false, error: "no_outstanding — ไม่มียอดเครดิตค้างชำระ" };
  }

  // Resolve the settle amount: explicit (clamped to outstanding) or full.
  const amountToPay = requestedAmount === null
    ? outstanding
    : Math.min(requestedAmount, outstanding);
  if (amountToPay <= 0) {
    return { ok: false, error: "amount_invalid — จำนวนเงินไม่ถูกต้อง" };
  }

  // 2) Pending-aware available-balance check on the main wallet (same helper
  //    every money-out path uses — blind raw balance would mask open pending
  //    withdraws/yuan debits). We do NOT silently partial-pay against the
  //    available balance; the customer must request a smaller amount.
  const available = await getWalletAvailableBalance(supabase, user.id);
  if (available === null) {
    return { ok: false, error: "wallet_balance_unavailable — ตรวจสอบยอดเงินไม่สำเร็จ" };
  }
  if (available < amountToPay) {
    return {
      ok: false,
      error: `wallet_insufficient — มี ฿${available.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ต้องการชำระ ฿${amountToPay.toLocaleString("th-TH", { minimumFractionDigits: 2 })}. ระบุยอดชำระบางส่วนก่อน`,
    };
  }

  // 3) Read the wallet balance for the read-modify-write debit.
  const { data: walletBefore, error: walletReadErr } = await admin
    .from("tb_wallet")
    .select("userid, wallettotal")
    .eq("userid", memberCode)
    .maybeSingle<{ userid: string; wallettotal: number | string | null }>();
  if (walletReadErr) {
    console.error(`[tb_wallet read] failed`, { code: walletReadErr.code, message: walletReadErr.message, userid: memberCode });
    return { ok: false, error: walletReadErr.message };
  }
  const currentBalance = Number(walletBefore?.wallettotal ?? 0);
  // Defensive re-check against the settled balance (available already
  // accounts for pending overhang; this guards the raw debit too).
  if (currentBalance < amountToPay) {
    return {
      ok: false,
      error: `wallet_insufficient — ยอดกระเป๋า ฿${currentBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ไม่พอชำระ ฿${amountToPay.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
    };
  }

  const nowIso = new Date().toISOString();
  const noteText = `ชำระยอดค้างเครดิตจากกระเป๋า ฿${amountToPay.toLocaleString("th-TH", { minimumFractionDigits: 2 })} (customer-self)`;

  // 4) INSERT tb_wallet_hs settle row FIRST — wusercredit='1' lands it in the
  //    credit-history tab; CREDIT_PAYDOWN_HS_TYPE renders it as a red debit.
  //    status='2' (approved) per ADR-0018 D-2 (customer-initiated debit is
  //    auto-approved — the movement is real). amount POSITIVE (direction is
  //    encoded by type, per the legacy schema convention). reforder backfilled
  //    to its own id below for a stable receipt reference.
  const { data: hsRow, error: hsInsErr } = await admin
    .from("tb_wallet_hs")
    .insert({
      date:            nowIso,
      amount:          amountToPay,
      status:          "2",
      type:            CREDIT_PAYDOWN_HS_TYPE,
      typenew:         "",                        // NOT NULL on prod — no legacy sub-type for a paydown
      typeservice:     "",                        // NOT NULL on prod — no legacy service-class for a paydown
      paydeposit:      "1",                       // paid-from-wallet
      imagesslip:      "",
      depositnamebank: "",
      nameuserbank:    "",
      nouserbank:      "",
      note:            noteText,
      adminid:         "",
      adminidupdate:   "",
      session:         "customer-self",
      reforder:        "",                        // backfilled to its own id below
      whno:            "",
      wusercredit:     "1",                       // → credit-history tab
      userid:          memberCode,
      adminidcrate:    memberCode,                // customer self-initiated
    })
    .select("id")
    .single<{ id: number }>();
  if (hsInsErr || !hsRow) {
    console.error(`[tb_wallet_hs insert] failed`, { code: hsInsErr?.code, message: hsInsErr?.message, userid: memberCode });
    return { ok: false, error: hsInsErr?.message ?? "wallet_hs_insert_failed" };
  }
  const hsId = hsRow.id;

  // Backfill reforder = own id (best-effort; the row already exists as the
  // movement receipt — a failure here doesn't threaten the money invariant).
  await admin.from("tb_wallet_hs").update({ reforder: String(hsId) }).eq("id", hsId);

  // 5) UPDATE tb_wallet.wallettotal −= amount. On failure, roll back the hs
  //    row so we don't leave a phantom receipt for a debit that never happened.
  const newBalance = Math.round((currentBalance - amountToPay) * 100) / 100;
  const walletUpd = walletBefore
    ? await admin.from("tb_wallet").update({ wallettotal: newBalance }).eq("userid", memberCode)
    : await admin.from("tb_wallet").insert({ userid: memberCode, wallettotal: newBalance });
  if (walletUpd.error) {
    await admin.from("tb_wallet_hs").delete().eq("id", hsId);
    console.error(`[tb_wallet debit] failed — rolled back hs row`, { code: walletUpd.error.code, message: walletUpd.error.message, userid: memberCode, hsId });
    return { ok: false, error: `wallet_debit_failed (ยกเลิกรายการแล้ว): ${walletUpd.error.message}` };
  }

  // 5b) Clear `fcredit` on the orders this paydown settles — OLDEST-FIRST,
  //     fully-covered orders only. This is the AR-drift fix: previously the
  //     wallet was debited + tb_credit.creditvalue decremented, but the settled
  //     orders kept fcredit='1', so tb_credit.creditvalue (the running balance)
  //     drifted from Σ(per-order outstanding over fcredit='1') — exactly what
  //     reset-credit-forwarder.php (the legacy SOT) recomputes.
  //
  //     Mirror of the admin pure-wallet credit-settle path (pay-user.ts L584 ·
  //     legacy pay-users.php L469): UPDATE tb_forwarder SET fCredit='',
  //     fDateAdminStatus=NOW WHERE fCredit='1'. The eq("fcredit","1") guard
  //     makes each flip idempotent + TOCTOU-safe (a concurrent admin settle of
  //     the same order = 0 rows matched = harmless no-op, no double-effect).
  //
  //     ⚠️ No EXACT legacy precedent for the allocation: legacy credit settle is
  //     order-SELECTED (admin/customer ticks specific fIDs in pay-users.php),
  //     never amount-driven. This customer wallet→credit paydown is amount-driven
  //     (the UI has no per-order picker), so oldest-first (fcreditdate ASC) is
  //     the sensible default — the same ordering qa-credit-overdue.ts uses to
  //     chase the oldest credit. Partial-pay leaves the uncovered remainder
  //     fcredit='1' (never partially-clears an order).
  const { data: creditOrders, error: creditOrdersErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, ftotalprice, ftransportprice, fpriceupdate, fshippingservice, pricecrate, ftransportpricechnthb, priceother, fdiscount, fusercompany",
    )
    .eq("userid", memberCode)
    .eq("fcredit", "1")
    .order("fcreditdate", { ascending: true })
    .order("id", { ascending: true }); // stable tie-break for equal/null fcreditdate
  if (creditOrdersErr) {
    // Roll back wallet debit + hs row — the credit decrement hasn't run yet.
    if (walletBefore) {
      await admin.from("tb_wallet").update({ wallettotal: currentBalance }).eq("userid", memberCode);
    } else {
      await admin.from("tb_wallet").delete().eq("userid", memberCode);
    }
    await admin.from("tb_wallet_hs").delete().eq("id", hsId);
    console.error(`[tb_forwarder credit-orders read] failed — rolled back wallet + hs`, { code: creditOrdersErr.code, message: creditOrdersErr.message, userid: memberCode, hsId });
    return { ok: false, error: `credit_orders_read_failed (ยกเลิกรายการแล้ว): ${creditOrdersErr.message}` };
  }

  // Walk oldest→newest, accumulating each order's outstanding via the SAME
  // canonical formula (incl. the juristic 1%). Clear an order only when it is
  // fully covered by the remaining amount paid; stop at the first order that
  // would overflow (partial settles leave the rest fcredit='1').
  const clearedFids: number[] = [];
  let remaining = amountToPay;
  for (const ord of (creditOrders ?? []) as Array<
    Parameters<typeof calcForwarderOutstanding>[0] & { id: number }
  >) {
    const due = calcForwarderOutstanding(ord);
    if (due <= 0) continue;            // nothing owed (over-discounted) → skip
    if (due > remaining + 1e-9) break; // can't fully cover this order → stop
    const { error: flipErr } = await admin
      .from("tb_forwarder")
      .update({ fcredit: "", fdateadminstatus: nowIso })
      .eq("id", ord.id)
      .eq("userid", memberCode)
      .eq("fcredit", "1");
    if (flipErr) {
      // Roll back EVERYTHING: the already-cleared fcredit flips, the wallet
      // debit, and the hs row — no half-state.
      for (const fid of clearedFids) {
        await admin.from("tb_forwarder").update({ fcredit: "1", fdateadminstatus: nowIso }).eq("id", fid).eq("userid", memberCode);
      }
      if (walletBefore) {
        await admin.from("tb_wallet").update({ wallettotal: currentBalance }).eq("userid", memberCode);
      } else {
        await admin.from("tb_wallet").delete().eq("userid", memberCode);
      }
      await admin.from("tb_wallet_hs").delete().eq("id", hsId);
      console.error(`[tb_forwarder fcredit clear] failed — rolled back fcredit flips + wallet + hs`, { code: flipErr.code, message: flipErr.message, userid: memberCode, hsId, fid: ord.id, clearedFids });
      return { ok: false, error: `fcredit_clear_failed (ยกเลิกรายการแล้ว): ${flipErr.message}` };
    }
    clearedFids.push(ord.id);
    remaining = Math.round((remaining - due) * 100) / 100;
    if (remaining <= 0) break;
  }

  // 6) Decrement tb_credit.creditvalue (UPSERT · clamp ≥0). On failure, roll
  //    back the fcredit flips, the wallet debit, and the hs row — the customer
  //    keeps their money and we keep the books consistent.
  const newOutstanding = Math.max(0, Math.round((outstanding - amountToPay) * 100) / 100);
  const creditUpd = creditRow
    ? await admin.from("tb_credit").update({ creditvalue: newOutstanding }).eq("userid", memberCode)
    : await admin.from("tb_credit").insert({ userid: memberCode, creditvalue: newOutstanding });
  if (creditUpd.error) {
    // rollback fcredit flips + wallet debit + hs row
    for (const fid of clearedFids) {
      await admin.from("tb_forwarder").update({ fcredit: "1", fdateadminstatus: nowIso }).eq("id", fid).eq("userid", memberCode);
    }
    if (walletBefore) {
      await admin.from("tb_wallet").update({ wallettotal: currentBalance }).eq("userid", memberCode);
    } else {
      await admin.from("tb_wallet").delete().eq("userid", memberCode);
    }
    await admin.from("tb_wallet_hs").delete().eq("id", hsId);
    console.error(`[tb_credit decrement] failed — rolled back fcredit flips + wallet + hs`, { code: creditUpd.error.code, message: creditUpd.error.message, userid: memberCode, hsId, clearedFids });
    return { ok: false, error: `credit_decrement_failed (ยกเลิกรายการแล้ว): ${creditUpd.error.message}` };
  }

  // 7) Notify + refresh surfaces.
  void sendNotification(user.id, notify.walletTxStatusChanged({
    kind:   "credit_payment",
    status: "completed",
    amount: amountToPay,
    note:   `ชำระยอดค้างเครดิต (เหลือค้าง ฿${newOutstanding.toLocaleString("th-TH", { minimumFractionDigits: 2 })})`,
    txId:   String(hsId),
  }));

  console.info(`[customerPayCreditFromWallet] userid=${memberCode} paid=${amountToPay} balance ${currentBalance} → ${newBalance} outstanding ${outstanding} → ${newOutstanding} hs=${hsId} clearedFcredit=[${clearedFids.join(",")}]`);

  revalidatePath("/wallet-credit");
  revalidatePath("/wallet/history");
  revalidatePath("/wallet");
  revalidatePath("/dashboard");
  // Wallet balance was debited to pay down credit → purge the chrome cache so
  // the header/sidebar wallet badge reflects the new balance immediately.
  bustCustomerChrome();

  return {
    ok: true,
    data: {
      hs_id:               hsId,
      amount_paid_thb:     amountToPay,
      new_outstanding_thb: newOutstanding,
      already_settled:     false,
    },
  };
}
