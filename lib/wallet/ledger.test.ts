/**
 * Integration test for the wallet ledger consistency (P-29 — Sprint 7+ Track A).
 *
 * Hits real Supabase (admin client, bypasses RLS) and exercises the
 * `wallet_recompute_balance()` trigger defined in 0007_wallet.sql:
 *
 *   - Trigger fires on INSERT/UPDATE/DELETE to wallet_transactions
 *   - Recomputes bucket balance from sum(amount) WHERE status='completed'
 *   - pending / failed / cancelled rows DO NOT count toward balance
 *   - Three buckets are independent: main / cashback / credit
 *
 * Cases (10 assertions across 4 scenarios):
 *
 *   A. main bucket: pending → completed flips balance correctly
 *   B. cashback bucket: parallel deposit doesn't bleed into main bucket
 *   C. credit bucket: same isolation
 *   D. cancellation: completed → cancelled drops balance back
 *
 * DECISION (per §6 self-directed):
 * - Same approach as P-26 placement.test.ts + P-28 otp.test.ts: drive
 *   DB ops via admin client, observe trigger side-effects directly.
 *   The actions/wallet.ts + actions/admin/wallet.ts code paths are thin
 *   wrappers over these same INSERTs and UPDATEs — testing the trigger
 *   covers the contract that those actions depend on.
 * - We assert exact balance values (not "> 0") because the trigger is
 *   sum-based — any double-counting / drift would surface here.
 *
 * Run with:  pnpm tsx --env-file=.env.local lib/wallet/ledger.test.ts
 * Or:        pnpm test  (chained)
 *
 * Skips gracefully (exit 0) if SUPABASE env vars are missing.
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

console.log("=== wallet ledger trigger consistency (P-29) ===");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log("⏭  SUPABASE env vars unset — skipping integration test (this is OK for CI without secrets).");
    process.exit(0);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const runId    = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const email    = `p29-test-${runId}@pacred-test.local`;
  const password = "Test123!secure";

  let userId:    string | null = null;
  let profileId: string | null = null;
  const txIds:   string[] = [];

  async function cleanup() {
    console.log("\n🧹 cleanup");
    try {
      if (txIds.length > 0) {
        await admin.from("wallet_transactions").delete().in("id", txIds);
      }
      if (profileId) {
        // wallet row cascades from profile FK on delete cascade
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

  // Helper — read all 3 bucket balances from the wallet row.
  async function readBalances(): Promise<{ main: number; cashback: number; credit: number }> {
    const { data } = await admin
      .from("wallet")
      .select("balance, cashback_balance, credit_balance")
      .eq("profile_id", profileId!)
      .maybeSingle<{ balance: number; cashback_balance: number; credit_balance: number }>();
    return {
      main:     Number(data?.balance ?? 0),
      cashback: Number(data?.cashback_balance ?? 0),
      credit:   Number(data?.credit_balance ?? 0),
    };
  }

  try {
    // ────────────────────────────────────────────────────────
    // setup — create auth user + profile so wallet FK is satisfied
    // ────────────────────────────────────────────────────────
    console.log("\nsetup — create test profile");
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
      first_name:   "P29",
      last_name:    "Test",
      phone:        `09${(Date.now() % 10_000_000).toString().padStart(7, "0")}`,
      account_type: "personal",
      status:       "active",
    });
    assertEq("profile row created", profErr?.message ?? null, null);
    profileId = userId;

    // ────────────────────────────────────────────────────────
    // A. main bucket — pending → completed flips balance correctly
    // ────────────────────────────────────────────────────────
    console.log("\nA. main bucket — pending → completed flips balance");

    const { data: depA, error: depAErr } = await admin
      .from("wallet_transactions")
      .insert({
        profile_id: profileId,
        bucket:     "main",
        amount:     500,
        kind:       "deposit",
        status:     "pending",
      })
      .select("id")
      .single<{ id: string }>();
    assertEq("insert pending deposit ok", depAErr?.message ?? null, null);
    if (depA?.id) txIds.push(depA.id);

    const balAfterPending = await readBalances();
    assertEq("balance unchanged on pending deposit", balAfterPending.main, 0);

    // Flip to completed → trigger should bump main balance to 500
    await admin.from("wallet_transactions").update({ status: "completed" }).eq("id", depA!.id);
    const balAfterComplete = await readBalances();
    assertEq("balance = 500 after completing deposit", balAfterComplete.main, 500);

    // ────────────────────────────────────────────────────────
    // B. cashback bucket — independent from main
    // ────────────────────────────────────────────────────────
    console.log("\nB. cashback bucket — independent from main");

    const { data: cb } = await admin
      .from("wallet_transactions")
      .insert({
        profile_id: profileId,
        bucket:     "cashback",
        amount:     50,
        kind:       "cashback_earn",
        status:     "completed",
      })
      .select("id")
      .single<{ id: string }>();
    if (cb?.id) txIds.push(cb.id);

    const balAfterCashback = await readBalances();
    assertEq("cashback bucket = 50 after completed earn", balAfterCashback.cashback, 50);
    assertEq("main bucket unchanged at 500 after cashback insert", balAfterCashback.main, 500);

    // ────────────────────────────────────────────────────────
    // C. credit bucket — also independent
    // ────────────────────────────────────────────────────────
    console.log("\nC. credit bucket — independent");

    const { data: cr } = await admin
      .from("wallet_transactions")
      .insert({
        profile_id: profileId,
        bucket:     "credit",
        amount:     1000,
        kind:       "adjustment",
        status:     "completed",
      })
      .select("id")
      .single<{ id: string }>();
    if (cr?.id) txIds.push(cr.id);

    const balAfterCredit = await readBalances();
    assertEq("credit bucket = 1000 after adjustment", balAfterCredit.credit, 1000);
    assertEq("main bucket still 500 after credit insert", balAfterCredit.main, 500);
    assertEq("cashback still 50 after credit insert", balAfterCredit.cashback, 50);

    // ────────────────────────────────────────────────────────
    // D. cancellation — completed → cancelled drops balance back
    // ────────────────────────────────────────────────────────
    console.log("\nD. cancellation — completed → cancelled excludes from balance");

    await admin.from("wallet_transactions").update({ status: "cancelled" }).eq("id", depA!.id);
    const balAfterCancel = await readBalances();
    assertEq("main bucket = 0 after cancelling the only completed deposit", balAfterCancel.main, 0);
    assertEq("cashback unaffected by main cancel", balAfterCancel.cashback, 50);
    assertEq("credit unaffected by main cancel", balAfterCancel.credit, 1000);

    // Sanity — the cancelled txn still exists; it just doesn't count
    const { data: stillThere } = await admin
      .from("wallet_transactions")
      .select("status")
      .eq("id", depA!.id)
      .maybeSingle<{ status: string }>();
    assertEq("cancelled row still exists in ledger", stillThere?.status, "cancelled");
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
