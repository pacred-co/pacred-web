"use server";

// ────────────────────────────────────────────────────────────────────
// U4-2 · Customer-side credit-line actions
// ────────────────────────────────────────────────────────────────────
// One read + one write:
//
//   getMyCredit() — reads v_customer_credit_outstanding (RLS-gated to
//     own row via security_invoker). Returns limit / outstanding /
//     available / terms. Used by the wallet UI to render the credit
//     panel — and to gate the "pay credit from wallet" button.
//
//   customerPayCreditFromWallet({ amount_thb? }) — settles the
//     outstanding (or a partial amount, if provided) using the main
//     wallet bucket. Writes a PAIR of completed rows that share a
//     reference_id (the credit_payment row's id):
//       credit_payment             bucket='credit', amount=+amount_thb
//       wallet_to_credit_transfer  bucket='main',   amount=-amount_thb
//     Idempotent: the 0071 partial-unique index
//     wallet_tx_credit_settlement_uniq prevents the wallet-leg pair
//     from doubling on retry.
// ────────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOwnedProfileId } from "@/lib/auth/owned-write";
import { getWalletAvailableBalance, isWalletOverdrawError } from "@/lib/wallet/balance";
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

// ── getMyCredit ─────────────────────────────────────────────────────
// Reads the customer's own credit-line state through the
// security_invoker view (RLS gates to own row). Returns a zeroed
// state — NOT an error — if the customer isn't enrolled, so the UI
// can render a "ยังไม่มีวงเงินเครดิต" panel cleanly.
export async function getMyCredit(): Promise<ActionResult<CustomerCreditState>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data, error } = await supabase
    .from("v_customer_credit_outstanding")
    .select("credit_limit_thb, credit_terms_days, outstanding_thb, available_credit_thb")
    .eq("profile_id", user.id)
    .maybeSingle<CustomerCreditState>();

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: data ?? {
      credit_limit_thb:     0,
      credit_terms_days:    0,
      outstanding_thb:      0,
      available_credit_thb: 0,
    },
  };
}

// ── customerPayCreditFromWallet ─────────────────────────────────────
// Customer settles their outstanding credit from main wallet. Writes
// a paired credit_payment + wallet_to_credit_transfer with a shared
// reference_id (the credit_payment row id). Idempotent via the 0071
// wallet_tx_credit_settlement_uniq partial index.
//
// amount_thb is OPTIONAL — when omitted, we settle the full
// outstanding. Caller (UI) typically just calls with no arg from a
// "ชำระยอดค้างเครดิต ฿X" confirm dialog. Passing a positive value
// lets a customer partial-pay (e.g. they only have ฿1000 in wallet
// but owe ฿2000) — which is the desired UX per the U4-2 edge-case
// question: "let them pay partial?" — YES.

const payCreditSchema = z.object({
  amount_thb: z.coerce.number().positive().max(10_000_000).optional(),
});
export type CustomerPayCreditInput = z.infer<typeof payCreditSchema>;

type PayCreditData = {
  pair_id:               string;
  amount_paid_thb:       number;
  new_outstanding_thb:   number;
  already_settled:       boolean;
};

export async function customerPayCreditFromWallet(
  input?: CustomerPayCreditInput,
): Promise<ActionResult<PayCreditData>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = payCreditSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const requestedAmount = parsed.data.amount_thb ?? null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // 1) Read current credit state (RLS-gated to own row via view).
  const { data: state, error: stateErr } = await supabase
    .from("v_customer_credit_outstanding")
    .select("credit_limit_thb, outstanding_thb")
    .eq("profile_id", user.id)
    .maybeSingle<{ credit_limit_thb: number; outstanding_thb: number }>();
  if (stateErr) return { ok: false, error: stateErr.message };

  const outstanding = Number(state?.outstanding_thb ?? 0);
  if (outstanding <= 0) {
    return { ok: false, error: "no_outstanding — ไม่มียอดเครดิตค้างชำระ" };
  }

  // Resolve the actual amount we'll settle:
  //   - explicit amount: clamp to outstanding (overpaying credit
  //     makes no sense; we silently cap to what's owed)
  //   - implicit: full outstanding
  const amountToPay = requestedAmount === null
    ? outstanding
    : Math.min(requestedAmount, outstanding);

  if (amountToPay <= 0) {
    return { ok: false, error: "amount_invalid — จำนวนเงินไม่ถูกต้อง" };
  }

  // 2) Pending-aware available-balance check on the main wallet
  //    (mirrors actions/forwarder.ts:payForwarderFromWallet). The
  //    raw wallet.balance is blind to open pending withdraws / yuan
  //    debits (§H-1); we use the same helper as the rest of the
  //    money-out paths. If main balance < requested amount, we DO
  //    NOT silently partial-pay against the available balance — that
  //    would mask "you don't have enough" with a quiet smaller debit.
  //    Edge-case per the U4-2 spec: customer with wallet.balance <
  //    outstanding still wants to pay partial — they must request the
  //    smaller amount explicitly via the input.
  const available = await getWalletAvailableBalance(supabase, user.id);
  if (available === null) {
    return { ok: false, error: "wallet_balance_unavailable — ตรวจสอบยอดเงินไม่สำเร็จ" };
  }
  if (available < amountToPay) {
    return {
      ok: false,
      error: `wallet_insufficient — มี ฿${available.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ต้องการชำระ ฿${amountToPay.toLocaleString("th-TH", { minimumFractionDigits: 2 })}. ระบุยอดชำระบางส่วน หรือเติมเงินก่อน`,
    };
  }

  // 3) Write the pair. Use admin client because the credit-bucket
  //    insert is NOT in the 0007 self-serve insert policy (which only
  //    allows kind='deposit'|'withdraw' on bucket='main'). The
  //    ownership-check above (auth.getUser + view RLS) gates this;
  //    assertOwnedProfileId makes the structural guard un-skippable.
  const admin = createAdminClient();

  //   3a. Insert the credit_payment row FIRST — its id becomes the
  //       pair_id we anchor everything else on. amount is POSITIVE
  //       (a credit on the credit bucket reduces outstanding).
  const { data: paymentRow, error: payErr } = await admin
    .from("wallet_transactions")
    .insert(assertOwnedProfileId(user.id, {
      profile_id:     user.id,
      bucket:         "credit" as const,
      amount:         amountToPay,
      kind:           "credit_payment" as const,
      status:         "completed" as const,
      reference_type: "credit_settlement" as const,
      // reference_id self-set below after we know the id; we leave
      // null on the credit_payment row itself — the index is on the
      // wallet_to_credit_transfer slice, not this side.
      reference_id:   null,
      admin_id:       null,
      note:           `ชำระยอดค้างเครดิต ฿${amountToPay.toLocaleString("th-TH", { minimumFractionDigits: 2 })} (ตัดจาก wallet โดยลูกค้า)`,
    }))
    .select("id")
    .single<{ id: string }>();
  if (payErr) {
    return { ok: false, error: `wallet insert (credit_payment): ${payErr.message}` };
  }
  const pairId = paymentRow.id;

  //   3b. Insert the wallet_to_credit_transfer row — the main-wallet
  //       debit half of the pair. reference_id = pairId so the
  //       partial-unique guard (0071 wallet_tx_credit_settlement_uniq)
  //       can dedupe a retry on this slice. 23505 → re-SELECT the
  //       existing pair + return idempotently.
  const { data: transferRow, error: tfrErr } = await admin
    .from("wallet_transactions")
    .insert(assertOwnedProfileId(user.id, {
      profile_id:     user.id,
      bucket:         "main" as const,
      amount:         -amountToPay,
      kind:           "wallet_to_credit_transfer" as const,
      status:         "completed" as const,
      reference_type: "credit_settlement" as const,
      reference_id:   pairId,
      admin_id:       null,
      note:           `ชำระยอดค้างเครดิต ฿${amountToPay.toLocaleString("th-TH", { minimumFractionDigits: 2 })} (cross-bucket settlement)`,
    }))
    .select("id")
    .single<{ id: string }>();

  if (tfrErr) {
    if (tfrErr.code === "23505" || /duplicate|unique/i.test(tfrErr.message)) {
      // The wallet-leg already exists for this pair_id — a retry of
      // the same logical settlement. Roll back our just-inserted
      // credit_payment row so the outstanding math doesn't double-
      // credit; return the existing pair canonically.
      await admin.from("wallet_transactions").delete().eq("id", pairId);

      const { data: existing } = await admin
        .from("wallet_transactions")
        .select("reference_id")
        .eq("reference_type", "credit_settlement")
        .eq("kind",           "wallet_to_credit_transfer")
        .eq("status",         "completed")
        .eq("profile_id",     user.id)
        .order("created_at",  { ascending: false })
        .limit(1)
        .maybeSingle<{ reference_id: string | null }>();

      const existingPairId = existing?.reference_id ?? pairId;
      return {
        ok: true,
        data: {
          pair_id:              existingPairId,
          amount_paid_thb:      amountToPay,
          new_outstanding_thb:  outstanding,   // unchanged — retry
          already_settled:      true,
        },
      };
    }
    if (isWalletOverdrawError(tfrErr)) {
      // The 0064 hard overdraw guard caught us (concurrent race past
      // the app-layer check). Roll back the credit_payment leg so we
      // don't leave a phantom credit on the customer's account, then
      // surface the standard friendly message.
      await admin.from("wallet_transactions").delete().eq("id", pairId);
      return { ok: false, error: "ยอดเงินในกระเป๋าไม่พอ (รวมรายการที่รออนุมัติ)" };
    }
    // Any other error: roll back credit_payment so we don't leave a
    // phantom outstanding-reduction without the matching main debit.
    await admin.from("wallet_transactions").delete().eq("id", pairId);
    return { ok: false, error: `wallet insert (transfer): ${tfrErr.message}` };
  }

  // 4) Backfill credit_payment.reference_id with pairId so the pair
  //    is queryable both directions. Best-effort: the partial-unique
  //    guard is on the transfer side, so a failure here doesn't
  //    threaten the money invariant.
  await admin
    .from("wallet_transactions")
    .update({ reference_id: pairId })
    .eq("id", pairId);

  // 5) Notify the customer of the successful settlement.
  void sendNotification(user.id, notify.walletTxStatusChanged({
    kind:   "credit_payment",
    status: "completed",
    amount: amountToPay,
    note:   `ชำระยอดค้างเครดิต (เหลือค้าง ฿${(outstanding - amountToPay).toLocaleString("th-TH", { minimumFractionDigits: 2 })})`,
    txId:   transferRow.id,
  }));

  revalidatePath("/wallet/history");
  revalidatePath("/dashboard");

  return {
    ok: true,
    data: {
      pair_id:              pairId,
      amount_paid_thb:      amountToPay,
      new_outstanding_thb:  outstanding - amountToPay,
      already_settled:      false,
    },
  };
}
