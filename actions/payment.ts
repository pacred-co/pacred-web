"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  yuanPaymentSchema,
  type YuanPaymentInput,
} from "@/lib/validators/payment";
import { sendNotification } from "@/lib/notifications";

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
// LIST
// ────────────────────────────────────────────────────────────
export async function listYuanPayments(limit = 50): Promise<ActionResult<YuanPayment[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  const parsed = yuanPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;
  const thb_amount = Math.round(d.yuan_amount * d.exchange_rate * 100) / 100;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // If paying via wallet, verify balance
  if (d.paid_via_wallet) {
    const { data: w } = await supabase
      .from("wallet")
      .select("balance")
      .eq("profile_id", user.id)
      .maybeSingle<{ balance: number }>();
    if (!w || Number(w.balance) < thb_amount) {
      return { ok: false, error: "ยอดเงินในกระเป๋าไม่พอ" };
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
  if (d.paid_via_wallet) {
    await supabase.from("wallet_transactions").insert({
      profile_id:     user.id,
      bucket:         "main",
      amount:         -thb_amount,
      kind:           "yuan_payment",
      status:         "pending",
      reference_type: "yuan_payment",
      reference_id:   created.id,
    });
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
