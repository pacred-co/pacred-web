"use server";

import { revalidatePath } from "next/cache";
import { bustCustomerChrome } from "@/lib/cache/revalidate-chrome";
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
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { BANK } from "@/components/seo/site";

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
// ADR-0018 §D-3 #1/#2 repoint (2026-05-30): the displayed wallet balance
// is now `tb_wallet.wallettotal` (legacy SOT, keyed by member_code PR####),
// NOT the rebuilt `wallet.balance` (empty on prod → ฿0 for all 8,898
// migrated customers). `tb_wallet` is RLS deny-all for non-service-role
// (migration 0081 L8601) so the read goes through the admin client, after
// resolving member_code from the signed-in user's profile.
//
// cashback / credit collapse to 0 here: under ADR-0018 the cash-back
// wallet lives in a SEPARATE table (tb_cash_back · cust-01 P1-16) and the
// credit-line in tb_wallet_credit — both are different concerns, out of
// scope for the balance-read repoint. The customer-credit-line read path
// is handled elsewhere (actions/credit.ts); this `getWallet` only surfaces
// the spendable main balance.
// TODO(ADR-0018 follow-up): wire tb_cash_back / tb_wallet_credit reads if a
// consumer needs the cashback/credit figures from this single call.
export async function getWallet(): Promise<ActionResult<WalletBalance>> {
  const profileData = await getCurrentUserWithProfile();
  if (!profileData?.user) return { ok: false, error: "not_signed_in" };

  const memberCode = profileData.profile?.member_code ?? null;
  // No member_code (brand-new account mid-signup) → no legacy wallet row →
  // zero balance. Not an error.
  if (!memberCode) {
    return { ok: true, data: { balance: 0, cashback_balance: 0, credit_balance: 0 } };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_wallet")
    .select("wallettotal")
    .eq("userid", memberCode)
    .maybeSingle<{ wallettotal: number | string }>();

  if (error) {
    console.error(`[tb_wallet read] failed`, { code: error.code, message: error.message, userid: memberCode });
    return { ok: false, error: error.message };
  }
  return {
    ok: true,
    data: {
      balance: Number(data?.wallettotal ?? 0),
      cashback_balance: 0, // separate table (tb_cash_back) — ADR-0018 §D-3 #1
      credit_balance: 0,   // separate table (tb_wallet_credit) — ADR-0018 §D-3 #1
    },
  };
}

// ADR-0018 §D-3 #1 repoint (2026-05-30) — the customer wallet ledger is now
// the LEGACY `tb_wallet_hs` table (104,591 rows on prod · keyed by member_code
// PR####), NOT the rebuilt `wallet_transactions` (empty → /wallet/history was
// blank for all 8,898 migrated customers · P0-8). This is a READ-only repoint
// that maps each legacy row into the existing `WalletTransaction` shape so the
// history page's tabs / status badges / +/- rendering keep working unchanged.
//
// Mapping (legacy `tb_wallet_hs.type` → rebuilt `kind`/sign · matches the
// type-categorisation in actions/admin/customer-profile.ts L85-87):
//   type 1 = ชำระเงิน            → kind=deposit        · CREDIT (+)
//   type 2 = ชำระฝากสั่ง         → kind=order_payment   · DEBIT (−)
//   type 3 = ถอนเงิน            → kind=withdraw        · DEBIT (−)
//   type 4 = ชำระฝากนำเข้า       → kind=import_payment  · DEBIT (−)
//   type 5 = คืนเงิน            → kind=refund          · CREDIT (+)
//   type 6 = ชำระฝากโอน         → kind=yuan_payment    · DEBIT (−)
//   type 7 = ชำระเงินรอตรวจสอบ    → kind=order_top_up    · DEBIT (−)
//   status 1=pending · 2=completed · 3=failed (legacy 0081 L6213)
// The legacy `amount` is stored POSITIVE; we apply the sign per direction so
// the page's `tx.amount >= 0` green/red rendering is correct.
const HS_TYPE_TO_KIND: Record<string, { kind: string; credit: boolean }> = {
  "1": { kind: "deposit",        credit: true  },
  "2": { kind: "order_payment",  credit: false },
  "3": { kind: "withdraw",       credit: false },
  "4": { kind: "import_payment", credit: false },
  "5": { kind: "refund",         credit: true  },
  "6": { kind: "yuan_payment",   credit: false },
  "7": { kind: "order_top_up",   credit: false },
};
const HS_STATUS_TO_STATUS: Record<string, WalletTransaction["status"]> = {
  "1": "pending",
  "2": "completed",
  "3": "failed",
};

type LegacyWalletHsRow = {
  id: number;
  date: string | null;
  dateslip: string | null;
  amount: number | string | null;
  status: string | null;
  type: string | null;
  reforder: string | null;
  imagesslip: string | null;
  depositnamebank: string | null;
  nameuserbank: string | null;
  nouserbank: string | null;
  note: string | null;
};

export async function listWalletTransactions(
  limit = 50,
): Promise<ActionResult<WalletTransaction[]>> {
  const profileData = await getCurrentUserWithProfile();
  if (!profileData?.user) return { ok: false, error: "not_signed_in" };

  const memberCode = profileData.profile?.member_code ?? null;
  // No member_code (mid-signup) → no legacy ledger → empty list (not an error).
  if (!memberCode) return { ok: true, data: [] };

  // tb_wallet_hs is RLS deny-all for non-service-role (0081 L8602) → admin client.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_wallet_hs")
    .select(
      "id, date, dateslip, amount, status, type, reforder, imagesslip, depositnamebank, nameuserbank, nouserbank, note",
    )
    .eq("userid", memberCode)
    .order("date", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[tb_wallet_hs list] failed`, { code: error.code, message: error.message, userid: memberCode });
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []) as unknown as LegacyWalletHsRow[];
  const mapped: WalletTransaction[] = rows.map((r) => {
    const typeKey = r.type ?? "";
    const meta = HS_TYPE_TO_KIND[typeKey] ?? { kind: "adjustment", credit: true };
    const rawAmount = Math.abs(Number(r.amount ?? 0)) || 0;
    return {
      id:             String(r.id),
      bucket:         "main", // tb_wallet_hs has no bucket dimension (cashback = tb_cash_back_hs)
      amount:         meta.credit ? rawAmount : -rawAmount,
      kind:           meta.kind,
      status:         HS_STATUS_TO_STATUS[r.status ?? ""] ?? "pending",
      slip_url:       r.imagesslip || null,
      slip_date:      r.dateslip,
      bank_name:      r.depositnamebank || null,
      account_name:   r.nameuserbank || null,
      account_number: r.nouserbank || null,
      reference_type: null,
      reference_id:   r.reforder || null,
      note:           r.note || null,
      created_at:     r.date ?? new Date(0).toISOString(),
    };
  });

  return { ok: true, data: mapped };
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

// ── 2026-06-19 (owner) — customer "เติมเงิน" (wallet self top-up) RETIRED
//    platform-wide. The /wallet/deposit route now redirects + every nav entry
//    was removed, so this action is no longer reachable from any UI. It is kept
//    intact (writes a PENDING row that still requires an admin slip-approve, so
//    a crafted POST can't self-credit) — a future cleanup may delete it.
//    Admin manual-credit (actions/admin/wallet-hs.ts) is unaffected.
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
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
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
// TOMBSTONE (2026-05-30 · ADR-0018 §D-2 rule 1 + §D-3 #4 · P0-7) — DEAD on
// the legacy SOT. This writes the REBUILT `wallet_transactions` table which
// is empty on prod, so all 8,898 migrated customers' withdraw requests were
// invisible to admin (audit P0-7 / cust-05). The live customer withdraw flow
// is `submitWithdrawRequest` in actions/wallet-tb.ts (debits tb_wallet +
// inserts a pending tb_wallet_hs type='3' row); the withdraw-form.tsx now
// calls THAT. Kept on disk for one sprint per the Tier-A tombstone convention;
// delete together with the rebuilt `wallet` / `wallet_transactions` tables
// when their last reader retires. Do NOT wire new callers to this.
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
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
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
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  // RLS-scoped read = ownership verification. Returns null if not owned
  // (customer can't even see other users' rows).
  const { data: existing, error: existingErr } = await supabase
    .from("wallet_transactions")
    .select("id, kind, status, amount, profile_id")
    .eq("id", parsed.data.tx_id)
    .maybeSingle<{ id: string; kind: string; status: string; amount: number; profile_id: string }>();

  if (existingErr) {
    console.error(`[wallet_transactions mutation lookup] failed`, { code: existingErr.code, message: existingErr.message });
    return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
  }
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

// ────────────────────────────────────────────────────────────
// LEGACY (D1 / ADR-0017) — submitLegacyWalletDeposit
// ────────────────────────────────────────────────────────────
//
// Faithful 1:1 transcription of `member/wallet.php` L3-51 (the
// `addData` POST handler) AND `member/wallet-credit.php` L3-51 (the
// same handler — both pages share the deposit-modal POST flow).
//
// What the legacy does:
//   1. Validates amount + slip image upload (PNG/JPEG only).
//   2. Renames the file to `<userID>_<uniqid><time>.<ext>` under
//      `storage/slip/`.
//   3. Insert `tb_wallet_hs (depositNameBank, amount, imagesSlip,
//      userID, type='1', status='1', date=NOW())` — pending admin
//      verify.
//   4. `move_uploaded_file()` to storage.
//   5. SELECT the just-inserted ID and fire a LINE Notify (admin
//      channel) — Pacred replaces with an in-app notification because
//      LINE Notify EOL'd (Apr 2025) + the customer-facing record is
//      the in-app feed.
//
// The Pacred deviation:
//   - Slip goes to the `slips` Supabase bucket under
//     `{auth.uid()}/wallet_deposit/<time>.<ext>` (matching the
//     forwarder slip pattern + the bucket's RLS prefix policy).
//   - `wusercredit` is set to '1' when the deposit comes from
//     /wallet-credit/, '0' otherwise — so the row surfaces in the
//     credit-history tab the legacy wallet-credit.php reads
//     (load_wallet_hs.php `WHERE wUserCredit=1`).
//   - In-app notification replaces LINE Notify (admin); customer
//     also gets a "ส่งคำขอชำระเงิน" feed entry.
//
// Returns the freshly-inserted tb_wallet_hs.id so the UI can echo it
// (legacy alerts a SweetAlert "successDeposit" without showing the
// id; we surface it for the success message).
export type SubmitLegacyDepositInput = {
  amount: number;
  slipFile: File;
  /** "1" = deposit on the credit wallet (wallet-credit.php); "0" = main wallet (wallet.php). */
  wUserCredit?: "0" | "1";
};

export async function submitLegacyWalletDeposit(
  input: SubmitLegacyDepositInput,
): Promise<ActionResult<{ id: number }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  // ── Validate amount (wallet.php L5-6 — empty amount alert) ──
  const amount = Number(input?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "กรุณากรอกจำนวนเงิน" };
  }
  if (amount > 1_000_000) {
    return { ok: false, error: "จำนวนเงินสูงสุด 1,000,000 บาท" };
  }

  // ── Validate slip file (wallet.php L8-16 — PNG/JPEG check) ──
  const file = input?.slipFile;
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "กรุณเลือกรูปข้อมูลให้ครบ" };
  }
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  if (!isImage && !isPdf) {
    return { ok: false, error: "ไฟล์รูปไม่ถูกต้อง" };
  }
  // wallet.php uses dropify `data-max-file-size="9M"`; Pacred caps at
  // 5 MB (= the `slips` bucket validation default).
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "ไฟล์ใหญ่เกิน 5 MB" };
  }

  const profileData = await getCurrentUserWithProfile();
  if (!profileData?.user) return { ok: false, error: "not_signed_in" };
  if (!profileData.profile) return { ok: false, error: "no_profile" };
  const userID = profileData.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  const supabase = await createClient();

  // ── Upload slip (wallet.php L18-23 — move_uploaded_file) ──
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
  const slipPath = `${profileData.user.id}/wallet_deposit/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("slips")
    .upload(slipPath, file, { upsert: false, contentType: file.type });
  if (upErr) return { ok: false, error: `slip_upload: ${upErr.message}` };

  // ── Insert tb_wallet_hs (wallet.php L31-34) ──
  // tb_wallet_hs is RLS-locked to service_role → admin client.
  const wUserCredit = input.wUserCredit === "1" ? "1" : "0";
  // wallet.php L28 hardcodes `$depositNameBank = 'KBANK-064-174-3836'`
  // (the legacy K-Bank account); Pacred uses the current account in
  // components/seo/site.ts. Format kept identical: "KBANK-<acct>".
  const depositNameBank = `KBANK-${BANK.accountNumber}`;
  const datetimeNow = new Date().toISOString().replace("T", " ").slice(0, 19);

  const admin = createAdminClient();

  const { data: inserted, error: insErr } = await admin
    .from("tb_wallet_hs")
    .insert({
      date:            datetimeNow,
      amount:          Number(amount.toFixed(2)),
      status:          "1",
      type:            "1",
      typenew:         "1",
      typeservice:     "1",
      imagesslip:      slipPath,
      depositnamebank: depositNameBank,
      userid:          userID,
      whno:            "",
      wusercredit:     wUserCredit,
      adminidcrate:    "",
    })
    .select("id")
    .single<{ id: number }>();

  if (insErr) {
    // Roll back the slip upload so we don't leave an orphaned file.
    await admin.storage.from("slips").remove([slipPath]);
    return { ok: false, error: `wallet_hs insert: ${insErr.message}` };
  }

  // ── Customer-facing in-app notification (replaces wallet.php L48
  //    LINE Notify topup which targeted the admin channel) ──
  void sendNotification(profileData.user.id, notify.walletDepositRequested({
    amount,
    txId: String(inserted.id),
  }));

  // Re-render the wallet pages so the new pending row surfaces in the
  // four-tab history without a hard reload.
  revalidatePath("/wallet");
  revalidatePath("/wallet/deposit");
  revalidatePath("/wallet/history");
  revalidatePath("/wallet-credit");
  // New pending top-up row → refresh the customer chrome (wallet/header badges)
  // so the deposit surfaces instantly instead of after the 60s cache TTL.
  bustCustomerChrome();

  return { ok: true, data: { id: inserted.id } };
}
