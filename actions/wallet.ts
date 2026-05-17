"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  depositSchema,
  withdrawSchema,
  type DepositInput,
  type WithdrawInput,
} from "@/lib/validators/wallet";
import { buildPromptPayQrDataUrl, PromptPayConfigError } from "@/lib/promptpay";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import { validateStoredFile } from "@/lib/file-validation";
import { getWalletAvailableBalance, isWalletOverdrawError } from "@/lib/wallet/balance";
import { assertNotImpersonating } from "@/lib/auth/impersonation";

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
    // Forward stable error codes so the UI can render a localised message
    // instead of the raw server message (OWASP A05 / 2026-05-16 audit P1).
    if (e instanceof PromptPayConfigError) {
      return { ok: false, error: e.code };
    }
    return { ok: false, error: "qr_failed" };
  }
}

export async function createDeposit(
  input: DepositInput,
): Promise<ActionResult<{ id: string }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = depositSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Server-side slip validation — guard against spoofed MIME / oversized
  // / path traversal. Client already validated for UX, but never trust client.
  if (d.slip_url) {
    if (!d.slip_url.startsWith(`${user.id}/`)) {
      return { ok: false, error: "slip_path_mismatch" };
    }
    const check = await validateStoredFile("slips", d.slip_url, ["image", "pdf"]);
    if (!check.ok) {
      return { ok: false, error: `slip_invalid:${check.error}` };
    }
  }

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

  void sendNotification(user.id, notify.walletDepositRequested({
    amount: d.amount,
    txId:   created.id,
  }));

  return { ok: true, data: { id: created.id } };
}

// ────────────────────────────────────────────────────────────
// WITHDRAW
// ────────────────────────────────────────────────────────────
export async function createWithdraw(
  input: WithdrawInput,
): Promise<ActionResult<{ id: string }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = withdrawSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Check the PENDING-AWARE available balance, not the raw wallet.balance.
  // wallet.balance (0007 trigger) sums only completed rows, so it ignores
  // this customer's other not-yet-approved withdraw / yuan debits. Without
  // this, stacked pending requests each pass yet aggregate-overdraw once an
  // admin approves them all (gap-customer.md §H-1). Migration 0064's trigger
  // is the hard DB backstop; this is the friendly-error fast path.
  const available = await getWalletAvailableBalance(supabase, user.id);
  if (available === null) {
    return { ok: false, error: "ไม่สามารถตรวจสอบยอดเงินได้ กรุณาลองใหม่อีกครั้ง" };
  }
  if (available < d.amount) {
    return { ok: false, error: "ยอดเงินในกระเป๋าไม่พอ (รวมรายการที่รออนุมัติ)" };
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

  if (error) {
    // Lost a race past the check above, or a direct-RLS insert — the 0064
    // overdraw-guard trigger rejected it. Surface the same friendly message.
    if (isWalletOverdrawError(error)) {
      return { ok: false, error: "ยอดเงินในกระเป๋าไม่พอ (รวมรายการที่รออนุมัติ)" };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/wallet/history");
  revalidatePath("/wallet/withdraw");

  void sendNotification(user.id, notify.walletWithdrawRequested({
    amount: d.amount,
    txId:   created.id,
  }));

  return { ok: true, data: { id: created.id } };
}

// ────────────────────────────────────────────────────────────
// CANCEL (user cancels own pending deposit/withdraw)
// ────────────────────────────────────────────────────────────
// User-side cancel: RLS update policy in 0007 only allows pending→pending
// (status flips are admin-only). So this action uses the admin client
// AFTER auth + ownership verification + status guard. Audited via
// admin_audit_log with admin_id=NULL + customer_initiated=true (mirrors
// the customer-self-serve refund pattern in actions/refunds.ts).
//
// What it does:
// - Auth-check (customer must be signed in)
// - Read row via the user-scoped client (RLS verifies ownership)
// - Refuse if not pending OR not deposit/withdraw OR already terminal
// - Flip status='cancelled' via admin client
// - Notify customer
// - Audit log
//
// Why it matters (gap-customer H-3): today a customer who typo'd an
// amount has to call admin. With this, cancel + redo themselves in 1 click.

import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const cancelPendingSchema = z.object({
  tx_id: z.string().uuid(),
});
export type CustomerCancelPendingInput = z.infer<typeof cancelPendingSchema>;

export async function customerCancelPendingWalletTx(
  input: CustomerCancelPendingInput,
): Promise<ActionResult<{ tx_id: string }>> {
  // G-4 — impersonation is read-only.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = cancelPendingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // RLS-scoped read = ownership verification. Returns null if not owned
  // (customer can't even see other users' rows).
  const { data: existing } = await supabase
    .from("wallet_transactions")
    .select("id, kind, status, amount, profile_id")
    .eq("id", parsed.data.tx_id)
    .maybeSingle<{ id: string; kind: string; status: string; amount: number; profile_id: string }>();

  if (!existing)                             return { ok: false, error: "ไม่พบรายการ" };
  if (existing.profile_id !== user.id)       return { ok: false, error: "ไม่ใช่รายการของคุณ" };
  if (existing.status !== "pending")         return { ok: false, error: `ยกเลิกไม่ได้ — สถานะปัจจุบัน: ${existing.status}` };
  if (!["deposit","withdraw"].includes(existing.kind))
    return { ok: false, error: "ยกเลิกได้เฉพาะรายการฝาก/ถอน" };

  // Flip status via admin client (RLS user-policy blocks status changes).
  const admin = createAdminClient();
  const { error: updErr } = await admin
    .from("wallet_transactions")
    .update({
      status: "cancelled",
      note:   "ยกเลิกโดยลูกค้า (self-cancel)",
    })
    .eq("id", existing.id)
    .eq("status", "pending");    // race-guard: admin must not have just approved
  if (updErr) return { ok: false, error: `ยกเลิกไม่สำเร็จ: ${updErr.message}` };

  // Audit (customer-initiated cancel — admin_id = user.id per the same
  // pattern in actions/refunds.ts customerCreateRefundRequest).
  await admin.from("admin_audit_log").insert({
    admin_id:    user.id,
    action:      "wallet_tx.customer_cancel",
    target_type: "wallet_transaction",
    target_id:   existing.id,
    payload:     {
      kind:                 existing.kind,
      amount:               existing.amount,
      customer_initiated:   true,
      customer_profile_id:  user.id,
    },
  });

  void sendNotification(user.id, notify.walletTxStatusChanged({
    kind:   existing.kind,
    status: "cancelled",
    amount: Number(existing.amount),
    note:   "ยกเลิกโดยลูกค้า",
    txId:   existing.id,
  }));

  revalidatePath("/wallet/history");
  return { ok: true, data: { tx_id: existing.id } };
}
