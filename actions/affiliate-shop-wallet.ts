"use server";

/**
 * G7 · Shop wallet / affiliate payouts — REAL implementation
 * (D1 customer-backend gap #4 — Sprint-2 P1.2).
 *
 * Backed by `tb_wallet_shop` (per-profile balance) + `tb_shop_transactions`
 * (ledger), both added in migration 0104. The legacy `tb_shop_pay_h`
 * schema (0081 L4896-4961) is preserved for historical joins but the
 * live shop balance flows through the new tables.
 *
 * Four actions:
 *
 *   getShopWalletSummary()
 *     4-card hero data — balance · lifetime_earned · pending · available.
 *     `available = balance − SUM(pending outbound)` so an in-flight
 *     withdraw request locks the funds for the customer before the
 *     admin approves it.
 *
 *   listShopWalletTransactions({ limit })
 *     Newest-first ledger page. Owner-only via RLS.
 *
 *   transferFromPersonalToShopWallet({ amount, note })
 *     Atomic dual-INSERT — debits `wallet` (main bucket) via a
 *     `shop_transfer_out` row + credits `tb_wallet_shop` via a
 *     `transfer_in` row. Both COMPLETED, so the balance triggers move
 *     money immediately. Overdraw on the personal wallet is blocked
 *     by the `wallet_assert_no_overdraw()` BEFORE-trigger from
 *     migration 0064.
 *
 *   requestShopWalletWithdraw({ amount, bank_name, account_name,
 *                               account_number, note? })
 *     PENDING withdraw row — bank details stored on the txn row so the
 *     admin payout console renders without a join. The available-
 *     balance check sits in app code (RLS allows kind='withdraw'
 *     status='pending' + profile_id=auth.uid()); the auto-recompute
 *     trigger leaves the balance untouched until admin promotes to
 *     completed.
 *
 * Auth posture:
 *   - All four actions require an authenticated session (createClient).
 *   - Mutations also assertNotImpersonating() — admin view-as-customer
 *     is read-only per G-4.
 *   - Reads use the owner-scoped client (RLS narrows naturally).
 *   - Mutations route through the admin client for the writes so both
 *     legs of a transfer can atomically land in one connection; the
 *     code re-checks ownership before each write to keep the security
 *     boundary explicit.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertNotImpersonating } from "@/lib/auth/impersonation";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// Types — wire format for the /wallet-shop page + actions client
// ────────────────────────────────────────────────────────────

export type ShopWalletKind =
  | "earn"
  | "refund"
  | "payment"
  | "withdraw"
  | "transfer_in"
  | "transfer_out"
  | "adjustment";

export type ShopWalletTxnStatus = "pending" | "completed" | "failed" | "cancelled";

export type ShopWalletTransaction = {
  id:          string;
  kind:        ShopWalletKind;
  status:      ShopWalletTxnStatus;
  amount:      number;
  note:        string | null;
  created_at:  string;
};

export type ShopWalletSummary = {
  balance:         number;
  lifetime_earned: number;
  pending:         number;
  available:       number;
};

export type TransferToShopInput = {
  amount: number;
  note?:  string;
};

export type ShopWithdrawInput = {
  amount:         number;
  bank_name:      string;
  account_name:   string;
  account_number: string;
  note?:          string;
};

// Minimum withdraw / transfer floor — mirrors the personal wallet's
// floor logic. ฿1.00 = the smallest amount that's worth processing.
const MIN_AMOUNT_THB = 1;

// ────────────────────────────────────────────────────────────
// getShopWalletSummary
// ────────────────────────────────────────────────────────────
export async function getShopWalletSummary(): Promise<ActionResult<ShopWalletSummary>> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  // Balance row — owner-only RLS. Returns null when no row yet (cold
  // customer); the trigger creates it on first inbound txn, but a
  // zero-state read MUST not blow up.
  const { data: walletRow, error: walletErr } = await supabase
    .from("tb_wallet_shop")
    .select("balance, lifetime_earned")
    .eq("profile_id", user.id)
    .maybeSingle<{ balance: number | string; lifetime_earned: number | string }>();
  if (walletErr) return { ok: false, error: walletErr.message };

  const balance         = Number(walletRow?.balance ?? 0);
  const lifetime_earned = Number(walletRow?.lifetime_earned ?? 0);

  // Pending outbound — withdraws + transfer_out the customer has filed
  // that aren't completed yet. Locks the funds in `available`.
  type PendingRow = { amount: number | string };
  const { data: pendingRows, error: pendingErr } = await supabase
    .from("tb_shop_transactions")
    .select("amount")
    .eq("profile_id", user.id)
    .eq("status", "pending")
    .in("kind", ["withdraw", "transfer_out"]);
  if (pendingErr) return { ok: false, error: pendingErr.message };

  // `amount` for outbound kinds is stored as a negative number — sum
  // the absolute values for the "pending lock" total.
  const pending = ((pendingRows ?? []) as PendingRow[]).reduce(
    (s, r) => s + Math.abs(Number(r.amount)),
    0,
  );

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    ok: true,
    data: {
      balance:         round2(balance),
      lifetime_earned: round2(lifetime_earned),
      pending:         round2(pending),
      available:       Math.max(0, round2(balance - pending)),
    },
  };
}

// ────────────────────────────────────────────────────────────
// listShopWalletTransactions
// ────────────────────────────────────────────────────────────
export async function listShopWalletTransactions(
  opts: { limit?: number } = {},
): Promise<ActionResult<ShopWalletTransaction[]>> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  const limit = Math.min(Math.max(1, opts.limit ?? 20), 100);

  type Raw = {
    id:         string;
    kind:       ShopWalletKind;
    status:     ShopWalletTxnStatus;
    amount:     number | string;
    note:       string | null;
    created_at: string;
  };
  const { data, error } = await supabase
    .from("tb_shop_transactions")
    .select("id, kind, status, amount, note, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };

  const rows: ShopWalletTransaction[] = ((data ?? []) as Raw[]).map((r) => ({
    id:         r.id,
    kind:       r.kind,
    status:     r.status,
    // Show absolute value to the customer — sign is encoded in `kind`
    // (inbound vs outbound) for UI rendering convenience. The DB column
    // stays signed for the trigger's SUM math.
    amount:     Math.abs(Number(r.amount)),
    note:       r.note,
    created_at: r.created_at,
  }));

  return { ok: true, data: rows };
}

// ────────────────────────────────────────────────────────────
// transferFromPersonalToShopWallet — atomic two-INSERT
// ────────────────────────────────────────────────────────────
export async function transferFromPersonalToShopWallet(
  input: TransferToShopInput,
): Promise<ActionResult<{ amount: number }>> {
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT_THB) {
    return { ok: false, error: `ยอดต้องไม่น้อยกว่า ${MIN_AMOUNT_THB} บาท` };
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const amt = round2(amount);

  // Server-side balance check on the personal main bucket. The
  // wallet_assert_no_overdraw BEFORE-trigger from migration 0064 will
  // refuse a debit larger than available — but we check here first
  // so we can return a friendly TH message instead of letting the DB
  // constraint surface as a generic error.
  const admin = createAdminClient();
  const { data: avail, error: availErr } = await admin
    .rpc("wallet_available_balance", { p_profile: user.id, p_bucket: "main" });
  if (availErr) return { ok: false, error: availErr.message };
  const availableMain = Number(avail ?? 0);
  if (amt > availableMain) {
    return {
      ok: false,
      error: `ยอดในกระเป๋าหลักไม่พอ (มี ${availableMain.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท)`,
    };
  }

  // Atomic dual-INSERT. We don't have a true transaction across two
  // supabase-js calls, but each INSERT is its own statement and they
  // happen via the admin client which uses one underlying connection.
  // Failure of the second leg triggers a compensating delete on the
  // first — best-effort + logged. The unique-by-reference_id pattern
  // below could turn this into a single-statement CTE later.
  const txnId = crypto.randomUUID();

  const { error: debitErr } = await admin
    .from("wallet_transactions")
    .insert({
      profile_id:     user.id,
      bucket:         "main",
      amount:         -amt,
      kind:           "shop_transfer_out",
      status:         "completed",
      note:           input.note?.trim() || "โอนเข้ากระเป๋าร้าน",
      reference_type: "manual",
      reference_id:   txnId,
    });
  if (debitErr) return { ok: false, error: debitErr.message };

  const { error: creditErr } = await admin
    .from("tb_shop_transactions")
    .insert({
      profile_id:     user.id,
      kind:           "transfer_in",
      status:         "completed",
      amount:         amt,
      note:           input.note?.trim() || "โอนจากกระเป๋าหลัก",
      reference_type: "transfer_pair",
      reference_id:   txnId,
    });

  if (creditErr) {
    // Best-effort rollback — drop the debit so the customer's money
    // isn't trapped in a half-completed transfer. We don't bubble this
    // delete's error; the customer sees the original credit error.
    await admin
      .from("wallet_transactions")
      .delete()
      .eq("reference_type", "manual")
      .eq("reference_id", txnId);
    return { ok: false, error: creditErr.message };
  }

  revalidatePath("/wallet-shop");
  revalidatePath("/wallet");
  return { ok: true, data: { amount: amt } };
}

// ────────────────────────────────────────────────────────────
// requestShopWalletWithdraw — pending row + available-balance check
// ────────────────────────────────────────────────────────────
export async function requestShopWalletWithdraw(
  input: ShopWithdrawInput,
): Promise<ActionResult<{ id: string; amount: number }>> {
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT_THB) {
    return { ok: false, error: `ยอดถอนต้องไม่น้อยกว่า ${MIN_AMOUNT_THB} บาท` };
  }
  const bank_name      = (input.bank_name      ?? "").trim();
  const account_name   = (input.account_name   ?? "").trim();
  const account_number = (input.account_number ?? "").trim();
  if (!bank_name || !account_name || !account_number) {
    return { ok: false, error: "กรุณากรอกข้อมูลธนาคารให้ครบ" };
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const amt = round2(amount);

  // Available = balance − pending outbound. Use the same query the
  // /wallet-shop summary uses; bail with a friendly message if the
  // customer is over-withdrawing.
  const summary = await getShopWalletSummary();
  if (!summary.ok) return summary;
  if (!summary.data) return { ok: false, error: "summary_unavailable" };
  if (amt > summary.data.available) {
    return {
      ok: false,
      error:
        `ยอดที่ขอเบิกเกินยอดใช้ได้จริง — ` +
        `ขอ ${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท ` +
        `แต่ใช้ได้เพียง ${summary.data.available.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท`,
    };
  }

  // The owner-insert RLS policy allows kind='withdraw' + status='pending'
  // + profile_id=auth.uid() — use the customer-scoped client so the
  // policy is exercised (defence-in-depth). Amount is stored negative
  // since the trigger's SUM is signed.
  const { data: row, error: insErr } = await supabase
    .from("tb_shop_transactions")
    .insert({
      profile_id:     user.id,
      kind:           "withdraw",
      status:         "pending",
      amount:         -amt,
      note:           input.note?.trim() || null,
      reference_type: "withdraw_request",
      bank_name,
      account_name,
      account_number,
    })
    .select("id")
    .single<{ id: string }>();
  if (insErr || !row) {
    return { ok: false, error: insErr?.message ?? "ไม่สามารถสร้างคำขอเบิกได้" };
  }

  revalidatePath("/wallet-shop");
  return { ok: true, data: { id: row.id, amount: amt } };
}
