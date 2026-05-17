/**
 * Integration test for the wallet overdraw guard (gap-customer.md §H-1,
 * migration 0064).
 *
 * Hits real Supabase (admin client, bypasses RLS — but triggers still
 * fire) and exercises the `wallet_tx_overdraw_guard` trigger backed by
 * `wallet_available_balance()`:
 *
 *   A. A new PENDING main-bucket debit that would push (completed + open
 *      pending debits) below zero is rejected — closes the stacked-
 *      pending-overdraw hole. A debit landing exactly on zero is allowed.
 *   B. pending → completed approval is never blocked, and the balance
 *      never goes negative through it.
 *   C. status='completed' debits (pay-from-wallet / admin allow_overdraw)
 *      are deliberately NOT trigger-blocked — that floor is the app
 *      layer's + money-audit P1-1's, not this trigger's.
 *   D. kind='adjustment' bypasses the guard (admin escape hatch).
 *   E. Editing an open pending withdraw's amount upward is guarded too.
 *
 * Run with:  pnpm tsx --env-file=.env.local lib/wallet/overdraw-guard.test.ts
 * Or:        pnpm test  (chained)
 *
 * Skips gracefully (exit 0) if SUPABASE env vars are missing.
 * REQUIRES migration 0064 applied to the target Supabase.
 */

import { createClient } from "@supabase/supabase-js";

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

function assertOverdrawBlocked(label: string, error: { message?: string } | null) {
  if (error && typeof error.message === "string" && /overdraw/i.test(error.message)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: rejected with an overdraw error\n    actual:   ${JSON.stringify(error)}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

console.log("=== wallet overdraw guard (gap-customer.md §H-1 / migration 0064) ===");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log("⏭  SUPABASE env vars unset — skipping integration test (this is OK for CI without secrets).");
    process.exit(0);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const runId    = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const email    = `overdraw-test-${runId}@pacred-test.local`;
  const password = "Test123!secure";

  let userId:    string | null = null;
  let profileId: string | null = null;

  async function cleanup() {
    console.log("\n🧹 cleanup");
    try {
      if (profileId) {
        await admin.from("wallet_transactions").delete().eq("profile_id", profileId);
        await admin.from("wallet").delete().eq("profile_id", profileId);
        await admin.from("profiles").delete().eq("id", profileId);
      }
      if (userId) {
        await admin.auth.admin.deleteUser(userId);
      }
      console.log("  ✓ cleanup done");
    } catch (e) {
      console.error("  ✗ cleanup error (non-fatal):", e instanceof Error ? e.message : e);
    }
  }

  async function readBalance(): Promise<number> {
    const { data } = await admin
      .from("wallet")
      .select("balance")
      .eq("profile_id", profileId!)
      .maybeSingle<{ balance: number }>();
    return Number(data?.balance ?? 0);
  }

  // Wipe the ledger between scenarios — the recompute trigger drops the
  // balance back to 0. (The overdraw guard does not fire on DELETE.)
  async function resetLedger() {
    await admin.from("wallet_transactions").delete().eq("profile_id", profileId!);
  }

  type TxRow = {
    bucket: string;
    amount: number;
    kind: string;
    status: string;
    reference_type?: string;
    reference_id?: string;
  };
  async function insertTx(row: TxRow): Promise<{ id?: string; error: { message?: string } | null }> {
    const { data, error } = await admin
      .from("wallet_transactions")
      .insert({ profile_id: profileId!, ...row })
      .select("id")
      .maybeSingle<{ id: string }>();
    return { id: data?.id, error };
  }

  try {
    // ────────────────────────────────────────────────────────
    section("setup — create test profile");
    // ────────────────────────────────────────────────────────
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assertEq("auth user created", authErr?.message ?? null, null);
    userId = authData.user?.id ?? null;
    if (!userId) throw new Error("auth user creation returned no id");

    const { error: profErr } = await admin.from("profiles").insert({
      id:           userId,
      first_name:   "Overdraw",
      last_name:    "Test",
      phone:        `09${(Date.now() % 10_000_000).toString().padStart(7, "0")}`,
      account_type: "personal",
      status:       "active",
    });
    assertEq("profile row created", profErr?.message ?? null, null);
    profileId = userId;

    // ────────────────────────────────────────────────────────
    section("A. stacked pending withdraws cannot aggregate-overdraw");
    // ────────────────────────────────────────────────────────
    const a1 = await insertTx({ bucket: "main", amount: 1000, kind: "deposit", status: "completed" });
    assertEq("setup: completed deposit +1000 ok", a1.error?.message ?? null, null);
    assertEq("balance = 1000", await readBalance(), 1000);

    const a2 = await insertTx({ bucket: "main", amount: -600, kind: "withdraw", status: "pending" });
    assertEq("pending withdraw -600 allowed (available 1000)", a2.error?.message ?? null, null);

    const a3 = await insertTx({ bucket: "main", amount: -500, kind: "withdraw", status: "pending" });
    assertOverdrawBlocked("pending withdraw -500 BLOCKED (available is now only 400)", a3.error);

    const a4 = await insertTx({ bucket: "main", amount: -400, kind: "withdraw", status: "pending" });
    assertEq("pending withdraw -400 allowed (available exactly 400 → projected 0)", a4.error?.message ?? null, null);

    const a5 = await insertTx({ bucket: "main", amount: -1, kind: "withdraw", status: "pending" });
    assertOverdrawBlocked("pending withdraw -1 BLOCKED (available is now 0)", a5.error);

    assertEq("balance still 1000 — pending debits do not move it", await readBalance(), 1000);

    // ────────────────────────────────────────────────────────
    section("B. admin approval (pending → completed) is never blocked");
    // ────────────────────────────────────────────────────────
    const b1 = await admin.from("wallet_transactions").update({ status: "completed" }).eq("id", a2.id!);
    assertEq("approve withdraw -600 ok", b1.error?.message ?? null, null);
    assertEq("balance = 400 after approving -600", await readBalance(), 400);

    const b2 = await admin.from("wallet_transactions").update({ status: "completed" }).eq("id", a4.id!);
    assertEq("approve withdraw -400 ok", b2.error?.message ?? null, null);
    assertEq("balance = 0 after approving -400 — never went negative", await readBalance(), 0);

    // ────────────────────────────────────────────────────────
    section("C. status='completed' debit is deliberately NOT trigger-blocked");
    // ────────────────────────────────────────────────────────
    await resetLedger();
    await insertTx({ bucket: "main", amount: 1000, kind: "deposit", status: "completed" });
    const c1 = await insertTx({
      bucket:         "main",
      amount:         -5000,
      kind:           "order_payment",
      status:         "completed",
      reference_type: "order_header",
      reference_id:   `OVTEST-${runId}`,
    });
    assertEq("completed order_payment -5000 allowed despite balance 1000 (pay-from-wallet / allow_overdraw path)",
      c1.error?.message ?? null, null);
    assertEq("balance = -4000 — completed-debit overdraw is the app/admin's call, not this trigger's",
      await readBalance(), -4000);

    // ────────────────────────────────────────────────────────
    section("D. kind='adjustment' bypasses the guard (admin escape hatch)");
    // ────────────────────────────────────────────────────────
    await resetLedger();
    await insertTx({ bucket: "main", amount: 100, kind: "deposit", status: "completed" });
    const d1 = await insertTx({ bucket: "main", amount: -9999, kind: "adjustment", status: "pending" });
    assertEq("pending adjustment -9999 allowed on balance 100", d1.error?.message ?? null, null);

    // ────────────────────────────────────────────────────────
    section("E. editing an open pending withdraw's amount upward is blocked");
    // ────────────────────────────────────────────────────────
    await resetLedger();
    await insertTx({ bucket: "main", amount: 1000, kind: "deposit", status: "completed" });
    const e1 = await insertTx({ bucket: "main", amount: -100, kind: "withdraw", status: "pending" });
    assertEq("pending withdraw -100 allowed", e1.error?.message ?? null, null);

    const e2 = await admin.from("wallet_transactions").update({ amount: -2000 }).eq("id", e1.id!);
    assertOverdrawBlocked("editing the pending withdraw to -2000 BLOCKED", e2.error);

    const e3 = await admin.from("wallet_transactions").update({ amount: -50 }).eq("id", e1.id!);
    assertEq("editing the pending withdraw down to -50 allowed (shrinking a debit)", e3.error?.message ?? null, null);
  } finally {
    await cleanup();
  }

  console.log(`\n${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
