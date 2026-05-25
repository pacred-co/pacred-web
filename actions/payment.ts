"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOwnedProfileId } from "@/lib/auth/owned-write";
import {
  yuanPaymentSchema,
  type YuanPaymentInput,
} from "@/lib/validators/payment";
import { sendNotification } from "@/lib/notifications";
import { getWalletAvailableBalance } from "@/lib/wallet/balance";
import { assertNotImpersonating } from "@/lib/auth/impersonation";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type YuanPayment = {
  id: string;
  profile_id: string;
  channel: "alipay" | "wechat" | "bank";
  recipient_detail: string;
  yuan_amount: number;
  exchange_rate: number;
  thb_amount: number;
  slip_url: string | null;
  id_doc_url: string | null;
  paid_via_wallet: boolean;
  status: "pending" | "processing" | "completed" | "failed" | "refunded";
  executed_at: string | null;
  created_at: string;
};

// ────────────────────────────────────────────────────────────
// RATE — current CNY→THB exchange rate
// ────────────────────────────────────────────────────────────
// For Phase D Pacred will read from tb_settings (singleton config),
// but until that migration lands, we read from env so admin can set
// it without a DB write. Falls back to 5.00 (sane-ish dev default).
export async function getCurrentYuanRate(): Promise<{ rate: number; updated_at: string }> {
  const envRate = Number(process.env.NEXT_PUBLIC_YUAN_RATE ?? "5.00");
  return {
    rate: Number.isFinite(envRate) && envRate > 0 ? envRate : 5.0,
    updated_at: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────
// READ ONE — used by /service-payment/[id] detail page (U4-3b)
// ────────────────────────────────────────────────────────────
export async function getYuanPayment(id: string): Promise<ActionResult<YuanPayment>> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // RLS scopes to profile_id = auth.uid() automatically — but explicit
  // for clarity + defence in depth if RLS ever regresses.
  const { data, error } = await supabase
    .from("yuan_payments")
    .select(
      "id, profile_id, channel, recipient_detail, yuan_amount, exchange_rate, thb_amount, slip_url, id_doc_url, paid_via_wallet, status, executed_at, created_at",
    )
    .eq("id", id)
    .eq("profile_id", user.id)
    .maybeSingle<YuanPayment>();
  if (error) return { ok: false, error: error.message };
  if (dataErr) {
    console.error(`[supabase mutation lookup] failed`, { code: dataErr.code, message: dataErr.message });
    return { ok: false, error: `db_error:${dataErr.code ?? "unknown"}` };
  }
  if (!data) return { ok: false, error: "not_found" };
  return { ok: true, data };
}

// ────────────────────────────────────────────────────────────
// LIST
// ────────────────────────────────────────────────────────────
export async function listYuanPayments(limit = 50): Promise<ActionResult<YuanPayment[]>> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data, error } = await supabase
    .from("yuan_payments")
    .select(
      "id, profile_id, channel, recipient_detail, yuan_amount, exchange_rate, thb_amount, slip_url, id_doc_url, paid_via_wallet, status, executed_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as YuanPayment[] };
}

// ────────────────────────────────────────────────────────────
// CREATE
// ────────────────────────────────────────────────────────────
export async function createYuanPayment(
  input: YuanPaymentInput,
): Promise<ActionResult<{ id: string; thb_amount: number }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = yuanPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;
  const thb_amount = Math.round(d.yuan_amount * d.exchange_rate * 100) / 100;

  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  // If paying via wallet, verify the PENDING-AWARE available balance — not
  // the raw wallet.balance, which (0007 trigger) ignores this customer's
  // other not-yet-approved debits. Stacked pending wallet-paid transfers
  // would otherwise each pass yet aggregate-overdraw on admin approval
  // (gap-customer.md §H-1). Migration 0064's trigger is the hard backstop.
  if (d.paid_via_wallet) {
    const available = await getWalletAvailableBalance(supabase, user.id);
    if (available === null) {
      return { ok: false, error: "ไม่สามารถตรวจสอบยอดเงินได้ กรุณาลองใหม่อีกครั้ง" };
    }
    if (available < thb_amount) {
      return { ok: false, error: "ยอดเงินในกระเป๋าไม่พอ (รวมรายการที่รออนุมัติ)" };
    }
  } else if (!d.slip_url) {
    return { ok: false, error: "กรุณาแนบสลิปโอนเงิน" };
  }

  const { data: created, error } = await supabase
    .from("yuan_payments")
    .insert({
      profile_id:       user.id,
      channel:          d.channel,
      recipient_detail: d.recipient_detail,
      yuan_amount:      d.yuan_amount,
      exchange_rate:    d.exchange_rate,
      thb_amount,
      slip_url:         d.slip_url ?? null,
      id_doc_url:       d.id_doc_url ?? null,
      paid_via_wallet:  d.paid_via_wallet ?? false,
      status:           "pending",
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  // If wallet-paid, write a pending debit to the ledger. Status stays
  // pending; admin flips both rows to completed atomically in Phase G.
  //
  // P0-2: this MUST use the admin client. The RLS INSERT policy
  // wallet_tx_insert_self_serve (migration 0007) only permits self-serve
  // inserts with kind in ('deposit','withdraw') — a kind='yuan_payment'
  // insert from the user-scoped client is silently rejected by RLS, so
  // the customer's wallet would never be debited. The ownership check is
  // satisfied above (profile_id = the authenticated user.id). We also
  // CHECK the insert error now — a failed money insert must fail the
  // whole action and roll back the orphan yuan_payments row.
  if (d.paid_via_wallet) {
    const admin = createAdminClient();
    // W-1/S-2: assertOwnedProfileId makes the ownership check
    // un-skippable — a future edit that sets profile_id from an
    // untrusted input throws here instead of debiting another wallet.
    const { error: walletErr } = await admin.from("wallet_transactions").insert(
      assertOwnedProfileId(user.id, {
        profile_id:     user.id,
        bucket:         "main",
        amount:         -thb_amount,
        kind:           "yuan_payment",
        status:         "pending",
        reference_type: "yuan_payment",
        reference_id:   created.id,
      }),
    );
    if (walletErr) {
      // Roll back the orphan yuan_payments row so the customer is not
      // shown success for a transfer the wallet was never reserved for.
      await admin.from("yuan_payments").delete().eq("id", created.id);
      return { ok: false, error: `wallet_debit_failed: ${walletErr.message}` };
    }
  }

  revalidatePath("/service-payment");

  void sendNotification(user.id, {
    category: "yuan_payment",
    severity: "info",
    title:    `ฝากโอนหยวนสำเร็จ`,
    body:     `¥${d.yuan_amount.toFixed(2)} = ฿${thb_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
    link_href: `/service-payment`,
    reference_type: "yuan_payment",
    reference_id:   created.id,
  });

  return { ok: true, data: { id: created.id, thb_amount } };
}
