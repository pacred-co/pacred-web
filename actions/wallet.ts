"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  depositSchema,
  withdrawSchema,
  type DepositInput,
  type WithdrawInput,
} from "@/lib/validators/wallet";
import { buildPromptPayQrDataUrl } from "@/lib/promptpay";
import { sendNotification } from "@/lib/notifications";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type WalletBalance = {
  balance: number;
  cashback_balance: number;
  credit_balance: number;
};

export type WalletTransaction = {
  id: string;
  bucket: "main" | "cashback" | "credit";
  amount: number;
  kind: string;
  status: "pending" | "completed" | "failed" | "cancelled";
  slip_url: string | null;
  slip_date: string | null;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
  created_at: string;
};

// ────────────────────────────────────────────────────────────
// READ
// ────────────────────────────────────────────────────────────
export async function getWallet(): Promise<ActionResult<WalletBalance>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data, error } = await supabase
    .from("wallet")
    .select("balance, cashback_balance, credit_balance")
    .eq("profile_id", user.id)
    .maybeSingle<WalletBalance>();

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: data ?? { balance: 0, cashback_balance: 0, credit_balance: 0 },
  };
}

export async function listWalletTransactions(
  limit = 50,
): Promise<ActionResult<WalletTransaction[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data, error } = await supabase
    .from("wallet_transactions")
    .select(
      "id, bucket, amount, kind, status, slip_url, slip_date, bank_name, account_name, account_number, reference_type, reference_id, note, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as WalletTransaction[] };
}

// ────────────────────────────────────────────────────────────
// DEPOSIT (PromptPay)
// ────────────────────────────────────────────────────────────
export async function getDepositQr(amountThb: number): Promise<ActionResult<{ dataUrl: string }>> {
  try {
    const dataUrl = await buildPromptPayQrDataUrl(amountThb);
    return { ok: true, data: { dataUrl } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "qr_failed" };
  }
}

export async function createDeposit(
  input: DepositInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = depositSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data: created, error } = await supabase
    .from("wallet_transactions")
    .insert({
      profile_id: user.id,
      bucket:     "main",
      amount:     d.amount,
      kind:       "deposit",
      status:     "pending",
      slip_url:   d.slip_url ?? null,
      slip_date:  d.slip_date ?? null,
      bank_name:  d.bank_name ?? null,
      note:       d.note ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/wallet/history");
  revalidatePath("/wallet/deposit");

  void sendNotification(user.id, {
    category: "wallet",
    severity: "info",
    title:    `ส่งคำขอเติมเงินแล้ว`,
    body:     `จำนวน ฿${d.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} — รอ Pacred ตรวจสลิป`,
    link_href: `/wallet/history`,
    reference_type: "wallet_transaction",
    reference_id:   created.id,
  });

  return { ok: true, data: { id: created.id } };
}

// ────────────────────────────────────────────────────────────
// WITHDRAW
// ────────────────────────────────────────────────────────────
export async function createWithdraw(
  input: WithdrawInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = withdrawSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Front-end shows the live balance, but check again here to give a
  // useful error if the user submitted a stale form.
  const { data: w } = await supabase
    .from("wallet")
    .select("balance")
    .eq("profile_id", user.id)
    .maybeSingle<{ balance: number }>();

  if (!w || Number(w.balance) < d.amount) {
    return { ok: false, error: "ยอดเงินในกระเป๋าไม่พอ" };
  }

  // Negative amount because withdraw is a debit
  const { data: created, error } = await supabase
    .from("wallet_transactions")
    .insert({
      profile_id:     user.id,
      bucket:         "main",
      amount:         -d.amount,
      kind:           "withdraw",
      status:         "pending",
      bank_name:      d.bank_name,
      account_name:   d.account_name,
      account_number: d.account_number,
      note:           d.note ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/wallet/history");
  revalidatePath("/wallet/withdraw");

  void sendNotification(user.id, {
    category: "wallet",
    severity: "info",
    title:    `ส่งคำขอถอนเงินแล้ว`,
    body:     `จำนวน ฿${d.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} — ภายใน 1 วันทำการ`,
    link_href: `/wallet/history`,
    reference_type: "wallet_transaction",
    reference_id:   created.id,
  });

  return { ok: true, data: { id: created.id } };
}

// ────────────────────────────────────────────────────────────
// CANCEL (user cancels own pending deposit/withdraw)
// ────────────────────────────────────────────────────────────
// User-side cancel happens via update from 'pending' → 'cancelled', but
// our RLS update policy only allows pending→pending. So this currently
// requires an admin client. Wire-up deferred to Phase G; for now user
// must contact admin for cancellation.
