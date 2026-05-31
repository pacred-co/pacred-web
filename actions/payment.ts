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
import { notifyStaffGroup } from "@/lib/notifications/staff-group";
import { getWalletAvailableBalance } from "@/lib/wallet/balance";
import { assertNotImpersonating } from "@/lib/auth/impersonation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// LANE: legacy `tb_payment` (D1 / ADR-0017 Phase-B faithful port).
// ────────────────────────────────────────────────────────────
// F2 fix (2026-05-29): the customer create + read used the rebuilt
// `yuan_payments` table while the customer LIST + admin LIST + admin
// detail read `tb_payment`. Customers could submit but the row was
// never visible anywhere — broken loop. This file now writes + reads
// `tb_payment` end-to-end so the legacy lane is the single source of
// truth (matches actions/admin/yuan-payments-tb.ts admin-side INSERT
// pattern + the /admin/yuan-payments + /service-payment list reads).
//
// Schema reference: supabase/migrations/0081_pcs_legacy_schema.sql
//   L3611-3634 (tb_payment). Verified-prod columns:
//   id (bigint · sequence) · paydate · paydeposit ('1'/'0') ·
//   paystatus ('1' pending / '2' approved / '3' rejected) ·
//   paytype ('1' Alipay / '2' Wechat / '3' Union / '4' USDT) ·
//   paydetail · payyuan · payrate · payratecost · paythb ·
//   paythbcost · payprofitthb · paydateadmin · userid (PR####) ·
//   adminid · adminidupdate · payadminidcreator · paylockdate ·
//   session · imagesslip · certifiedtruecopy · imagesslipadmin.
// Most string columns are NOT NULL — defaults are "" not null.

export type YuanPayment = {
  id: number;                        // tb_payment.id (bigint)
  userid: string;                    // tb_payment.userid (PR####)
  channel: "alipay" | "wechat" | "bank";  // mapped FROM paytype
  recipient_detail: string;
  yuan_amount: number;
  exchange_rate: number;
  thb_amount: number;
  slip_url: string | null;
  paid_via_wallet: boolean;
  status: "pending" | "completed" | "failed";  // mapped FROM paystatus
  paydateadmin: string | null;       // admin approval click time
  created_at: string;                // mapped FROM paydate
};

// Zod input → legacy `paytype` digit.
function channelToPaytype(ch: YuanPaymentInput["channel"]): "1" | "2" | "3" {
  switch (ch) {
    case "alipay": return "1";
    case "wechat": return "2";
    case "bank":   return "3";  // legacy "Union" slot — closest match for bank-transfer
  }
}

// Legacy `paytype` digit → Zod channel (for reads).
function paytypeToChannel(pt: string | null): "alipay" | "wechat" | "bank" {
  switch (pt) {
    case "1": return "alipay";
    case "2": return "wechat";
    case "3": return "bank";
    case "4": return "bank";   // USDT — fold into "bank" for the UI badge map
    default:  return "alipay";
  }
}

// Legacy `paystatus` digit → friendly status.
function paystatusToStatus(ps: string | null): "pending" | "completed" | "failed" {
  switch (ps) {
    case "2": return "completed";
    case "3": return "failed";
    case "1":
    default:  return "pending";
  }
}

// ────────────────────────────────────────────────────────────
// RATE — current CNY→THB exchange rate (ฝากชำระ — yuan transfer)
// ────────────────────────────────────────────────────────────
// Tier A6 fix (2026-05-29): now reads `tb_settings.rpdefault` (the singleton
// config row id=1). This matches legacy `pcs-admin/payment.php` L129-132 + the
// admin /admin/yuan-payments/new page. Accounting can change the rate live via
// /admin/settings/legacy-rates without a Vercel rebuild.
//
// Legacy field semantics (from `pcs-admin/settings.php`):
//   • rpDefault → เรทฝากชำระสินค้า (yuan transfer · THIS surface)
//   • rsDefault → เรทฝากสั่งสินค้า (shop yuan-rate · used by /cart, /search)
//   • rgDefault → unused in legacy (schema-only)
//   • hRateCostDefault → cost-rate for admin approval form (margin calc)
//
// Fallback chain (most → least authoritative):
//   1. tb_settings.rpdefault (canonical · admin-editable · LIVE)
//   2. process.env.NEXT_PUBLIC_YUAN_RATE (legacy env · LOGGED AS WARN — should
//      never be hit in prod; if it is, the DB read failed)
//   3. 5.00 (sane dev default; matches legacy hardcoded fallback)
export async function getCurrentYuanRate(): Promise<{ rate: number; updated_at: string }> {
  // Try the DB first (the authoritative source).
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tb_settings")
      .select("rpdefault")
      .eq("id", 1)
      .maybeSingle<{ rpdefault: number | string | null }>();

    if (error) {
      console.error("[getCurrentYuanRate] tb_settings.rpdefault read failed", {
        code: error.code,
        message: error.message,
      });
    } else if (data?.rpdefault != null) {
      const rate = Number(data.rpdefault);
      if (Number.isFinite(rate) && rate > 0) {
        return { rate, updated_at: new Date().toISOString() };
      }
      console.warn(
        "[getCurrentYuanRate] tb_settings.rpdefault is present but invalid · falling back to env",
        { raw: data.rpdefault },
      );
    } else {
      console.warn(
        "[getCurrentYuanRate] tb_settings row id=1 missing rpdefault · falling back to env",
      );
    }
  } catch (e) {
    console.error("[getCurrentYuanRate] tb_settings read threw — falling back to env", e);
  }

  // Fallback: the legacy env. Log WARN so prod alerts fire — the DB should
  // always be the source of truth; an env hit means tb_settings is unreachable
  // or the row was deleted. Either way, accounting will not see their live edits.
  const envRate = Number(process.env.NEXT_PUBLIC_YUAN_RATE ?? "5.00");
  const finalRate = Number.isFinite(envRate) && envRate > 0 ? envRate : 5.0;
  console.warn(
    "[getCurrentYuanRate] using ENV fallback (NEXT_PUBLIC_YUAN_RATE) — should always read from DB · investigate tb_settings access",
    { envRate, finalRate },
  );
  return {
    rate: finalRate,
    updated_at: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────
// READ ONE — used by /service-payment/[id] detail page (U4-3b)
// ────────────────────────────────────────────────────────────
// `id` is the legacy tb_payment.id (a positive integer arriving as a
// string from the URL). We resolve the auth user's member_code via the
// profile + scope the lookup to `userid = member_code` so a customer
// can only read their OWN row (the legacy `tb_*` schema is service_role
// RLS-locked so the admin client is the only way to read it).
export async function getYuanPayment(id: string): Promise<ActionResult<YuanPayment>> {
  const userData = await getCurrentUserWithProfile();
  if (!userData?.user) return { ok: false, error: "not_signed_in" };
  if (!userData.profile?.member_code) return { ok: false, error: "no_member_code" };

  const rowId = Number(id);
  if (!Number.isFinite(rowId) || rowId <= 0) return { ok: false, error: "invalid_id" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_payment")
    .select(
      "id, paydate, paystatus, paytype, paydetail, payyuan, payrate, paythb, paydeposit, paydateadmin, userid, imagesslip",
    )
    .eq("id", rowId)
    .eq("userid", userData.profile.member_code)
    .maybeSingle<{
      id: number;
      paydate: string | null;
      paystatus: string | null;
      paytype: string | null;
      paydetail: string | null;
      payyuan: number | string | null;
      payrate: number | string | null;
      paythb: number | string | null;
      paydeposit: string | null;
      paydateadmin: string | null;
      userid: string;
      imagesslip: string | null;
    }>();
  if (error) {
    console.error(`[tb_payment lookup] failed`, { code: error.code, message: error.message });
    return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
  }
  if (!data) return { ok: false, error: "not_found" };

  return {
    ok: true,
    data: {
      id:               data.id,
      userid:           data.userid,
      channel:          paytypeToChannel(data.paytype),
      recipient_detail: data.paydetail ?? "",
      yuan_amount:      Number(data.payyuan ?? 0),
      exchange_rate:    Number(data.payrate ?? 0),
      thb_amount:       Number(data.paythb ?? 0),
      slip_url:         data.imagesslip || null,
      paid_via_wallet:  data.paydeposit === "1",
      status:           paystatusToStatus(data.paystatus),
      paydateadmin:     data.paydateadmin,
      created_at:       data.paydate ?? new Date().toISOString(),
    },
  };
}

// ────────────────────────────────────────────────────────────
// LIST
// ────────────────────────────────────────────────────────────
export async function listYuanPayments(limit = 50): Promise<ActionResult<YuanPayment[]>> {
  const userData = await getCurrentUserWithProfile();
  if (!userData?.user) return { ok: false, error: "not_signed_in" };
  if (!userData.profile?.member_code) return { ok: false, error: "no_member_code" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_payment")
    .select(
      "id, paydate, paystatus, paytype, paydetail, payyuan, payrate, paythb, paydeposit, paydateadmin, userid, imagesslip",
    )
    .eq("userid", userData.profile.member_code)
    .order("paydate", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[tb_payment list] failed`, { code: error.code, message: error.message });
    return { ok: false, error: error.message };
  }
  const rows = (data ?? []) as {
    id: number;
    paydate: string | null;
    paystatus: string | null;
    paytype: string | null;
    paydetail: string | null;
    payyuan: number | string | null;
    payrate: number | string | null;
    paythb: number | string | null;
    paydeposit: string | null;
    paydateadmin: string | null;
    userid: string;
    imagesslip: string | null;
  }[];
  return {
    ok: true,
    data: rows.map((r) => ({
      id:               r.id,
      userid:           r.userid,
      channel:          paytypeToChannel(r.paytype),
      recipient_detail: r.paydetail ?? "",
      yuan_amount:      Number(r.payyuan ?? 0),
      exchange_rate:    Number(r.payrate ?? 0),
      thb_amount:       Number(r.paythb ?? 0),
      slip_url:         r.imagesslip || null,
      paid_via_wallet:  r.paydeposit === "1",
      status:           paystatusToStatus(r.paystatus),
      paydateadmin:     r.paydateadmin,
      created_at:       r.paydate ?? new Date().toISOString(),
    })),
  };
}

// ────────────────────────────────────────────────────────────
// CREATE
// ────────────────────────────────────────────────────────────
// Customer submits a ฝากโอนหยวน request. INSERTs into the legacy
// `tb_payment` table with paystatus='1' (รอตรวจสอบ) so it shows up in
// the /admin/yuan-payments รอตรวจ tab + the customer's own list.
//
// Preserved behaviour from the pre-fix version:
//   • Zod parse with bounded exchange rate (lib/validators/payment.ts)
//   • THB total = round(yuan × rate, 2)
//   • paid_via_wallet → pending-aware wallet-balance precheck via
//     getWalletAvailableBalance (migration 0064 hard backstop trigger
//     still catches over-debit on admin approval)
//   • !paid_via_wallet && !slip_url → "กรุณาแนบสลิปโอนเงิน"
//   • On paid_via_wallet=true → wallet_transactions debit insert
//     (kind='yuan_payment' status='pending'). RLS forces admin client
//     because the user-scoped INSERT policy only allows deposit/withdraw.
//   • On wallet insert failure → DELETE the orphan tb_payment row so
//     the customer doesn't see "success" for an un-reserved transfer.
//   • G-4 impersonation refusal (read-only impersonation).
//   • W-1 / S-2 assertOwnedProfileId on the wallet_transactions insert.
//
// Field mapping (Zod input → tb_payment columns):
//   channel "alipay"/"wechat"/"bank"  → paytype '1'/'2'/'3'
//   recipient_detail                   → paydetail
//   yuan_amount                        → payyuan
//   exchange_rate                      → payrate (+ payratecost = same)
//   computed thb_amount                → paythb (+ paythbcost = same,
//                                         payprofitthb = 0)
//   paid_via_wallet                    → paydeposit '1'/'0'
//   slip_url                           → imagesslip
//   id_doc_url                         → certifiedtruecopy
//   "1" (always for customer create)   → paystatus
//   profile.member_code                → userid
//   now()                              → paydate (paydateadmin stays
//                                         null until admin approves)
//   ""                                 → adminid / adminidupdate /
//                                         payadminidcreator / session /
//                                         imagesslipadmin (NOT NULL
//                                         columns — empty strings, not
//                                         nulls, matching the legacy
//                                         schema)
export async function createYuanPayment(
  input: YuanPaymentInput,
): Promise<ActionResult<{ id: number; thb_amount: number }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = yuanPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;
  const thb_amount = Math.round(d.yuan_amount * d.exchange_rate * 100) / 100;

  const userData = await getCurrentUserWithProfile();
  if (!userData?.user) return { ok: false, error: "not_signed_in" };
  if (!userData.profile?.member_code) {
    return { ok: false, error: "ยังไม่ได้รับ member_code — กรุณาติดต่อทีมงาน" };
  }
  const userId      = userData.user.id;
  const memberCode  = userData.profile.member_code;

  // If paying via wallet, verify the PENDING-AWARE available balance — not
  // the raw wallet.balance, which (0007 trigger) ignores this customer's
  // other not-yet-approved debits. Stacked pending wallet-paid transfers
  // would otherwise each pass yet aggregate-overdraw on admin approval
  // (gap-customer.md §H-1). Migration 0064's trigger is the hard backstop.
  const supabase = await createClient();
  if (d.paid_via_wallet) {
    const available = await getWalletAvailableBalance(supabase, userId);
    if (available === null) {
      return { ok: false, error: "ไม่สามารถตรวจสอบยอดเงินได้ กรุณาลองใหม่อีกครั้ง" };
    }
    if (available < thb_amount) {
      return { ok: false, error: "ยอดเงินในกระเป๋าไม่พอ (รวมรายการที่รออนุมัติ)" };
    }
  } else if (!d.slip_url) {
    return { ok: false, error: "กรุณาแนบสลิปโอนเงิน" };
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const paytype = channelToPaytype(d.channel);

  const { data: created, error } = await admin
    .from("tb_payment")
    .insert({
      paydate:           nowIso,
      paydeposit:        d.paid_via_wallet ? "1" : "0",
      paystatus:         "1",                              // pending
      paytype,
      paydetail:         d.recipient_detail,
      payyuan:           d.yuan_amount,
      payrate:           d.exchange_rate,
      payratecost:       d.exchange_rate,                  // admin can override on approval
      paythb:            thb_amount,
      paythbcost:        thb_amount,
      payprofitthb:      0,
      userid:            memberCode,
      adminid:           "",
      adminidupdate:     "",
      payadminidcreator: "",
      session:           "customer-self",
      imagesslip:        d.slip_url ?? "",
      certifiedtruecopy: d.id_doc_url ?? "",
      imagesslipadmin:   "",
    })
    .select("id")
    .single<{ id: number }>();

  if (error || !created) {
    console.error(`[tb_payment insert] failed`, { code: error?.code, message: error?.message });
    return { ok: false, error: error?.message ?? "insert_failed" };
  }

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
  // whole action and roll back the orphan tb_payment row.
  if (d.paid_via_wallet) {
    // W-1/S-2: assertOwnedProfileId makes the ownership check
    // un-skippable — a future edit that sets profile_id from an
    // untrusted input throws here instead of debiting another wallet.
    const { error: walletErr } = await admin.from("wallet_transactions").insert(
      assertOwnedProfileId(userId, {
        profile_id:     userId,
        bucket:         "main",
        amount:         -thb_amount,
        kind:           "yuan_payment",
        status:         "pending",
        reference_type: "yuan_payment",
        reference_id:   String(created.id),       // legacy tb_payment.id is bigint; ref col is text
      }),
    );
    if (walletErr) {
      // Roll back the orphan tb_payment row so the customer is not
      // shown success for a transfer the wallet was never reserved for.
      await admin.from("tb_payment").delete().eq("id", created.id);
      return { ok: false, error: `wallet_debit_failed: ${walletErr.message}` };
    }
  }

  revalidatePath("/service-payment");

  void sendNotification(userId, {
    category: "yuan_payment",
    severity: "info",
    title:    `ฝากโอนหยวนสำเร็จ`,
    body:     `¥${d.yuan_amount.toFixed(2)} = ฿${thb_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
    link_href: `/service-payment`,
    reference_type: "yuan_payment",
    reference_id:   String(created.id),
  });

  // P1-24: ping the staff LINE-OA group so ops verify the new ฝากโอน promptly
  // — faithful to legacy pcs-admin/payment.php → lineNotify(...) on create.
  // No-op until LINE_STAFF_GROUP_ID is configured (see lib/notifications/staff-group.ts).
  void notifyStaffGroup(
    `จากลูกค้า: ${memberCode}\n` +
    `ยอด: ¥${d.yuan_amount.toFixed(2)} = ฿${thb_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}\n` +
    `สถานะ: รอดำเนินการ`,
    {
      title:    `📩 ฝากโอน/ฝากชำระใหม่ #${created.id}`,
      url:      `/admin/yuan-payments/${created.id}`,
      urlLabel: "ดูรายการฝากโอน",
    },
  );

  return { ok: true, data: { id: created.id, thb_amount } };
}
