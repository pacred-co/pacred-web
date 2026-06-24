/**
 * Integration test for the cart_items cap trigger (P-31 — Sprint 7+ Track A).
 *
 * Hits real Supabase (admin client, bypasses RLS) and verifies the
 * `cart_items_cap` trigger defined in 0011_service_order.sql:
 *
 *   - Trigger fires BEFORE INSERT; reads `count(*) where profile_id = NEW.profile_id`
 *   - Raises if count >= 10000 (so up to 10000 items succeed; 10001st fails)
 *   - Error message exactly: "cart cap reached (10000 items)"
 *
 * 2026-06-23 (ภูม · owner-approved): cap raised 151 → 10000 (customers
 *    order high-qty / low-CBM). Migration 0208 CREATE-OR-REPLACEs the
 *    `cart_items_cap()` function body to `if cnt >= 10000`. This test
 *    mirrors the new threshold: insert up to CAP succeeds, CAP+1 fails.
 *
 * DECISION (per §6 self-directed):
 * - Bulk-insert CAP rows in chunks of 200, then attempt the CAP+1-th.
 *   Smaller chunks make any mid-test failure easier to localise than
 *   one big CAP-row insert.
 * - Use minimal cart_items columns — only required fields
 *   (profile_id, price_cny, amount). Other columns have schema defaults
 *   or are nullable, so we don't need to populate them.
 *
 * Run with:  pnpm tsx --env-file=.env.local lib/service-order/cart-cap.test.ts
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

function assertTrue(label: string, condition: boolean, hint?: string) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}${hint ? `\n    ${hint}` : ""}`);
  }
}

// Cart cap — raised 151 → 10000 (ภูม 2026-06-23 · migration 0208).
const CAP = 10000;

console.log(`=== cart_items ${CAP}-cap trigger (P-31) ===`);

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log("⏭  SUPABASE env vars unset — skipping integration test (this is OK for CI without secrets).");
    process.exit(0);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const runId    = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const email    = `p31-test-${runId}@pacred-test.local`;
  const password = "Test123!secure";

  let userId:    string | null = null;
  let profileId: string | null = null;

  async function cleanup() {
    console.log("\n🧹 cleanup");
    try {
      if (profileId) {
        // Cascading FK on cart_items + profiles + auth.users would handle
        // most of this on auth.admin.deleteUser, but be explicit so a
        // partial cascade doesn't leave orphans.
        await admin.from("cart_items").delete().eq("profile_id", profileId);
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

  try {
    // ────────────────────────────────────────────────────────
    // setup — create profile (required for FK + trigger row scope)
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
      first_name:   "P31",
      last_name:    "Test",
      phone:        `08${(Date.now() % 10_000_000).toString().padStart(7, "0")}`,
      account_type: "personal",
      status:       "active",
    });
    assertEq("profile row created", profErr?.message ?? null, null);
    profileId = userId;

    // ────────────────────────────────────────────────────────
    // step 1 — fill the cart to exactly CAP (within cap; trigger uses >= CAP)
    // ────────────────────────────────────────────────────────
    console.log(`\nstep 1 — insert CAP-1 (${CAP - 1}) cart items in chunks of 200`);

    const CHUNK = 200;
    let inserted = 0;
    let chunkErr: string | null = null;
    while (inserted < CAP - 1) {
      const n = Math.min(CHUNK, CAP - 1 - inserted);
      const rows = Array.from({ length: n }, (_, i) => ({
        profile_id: profileId,
        price_cny:  10 + ((inserted + i) % 100),
        amount:     1,
        title:      `P31 cart item #${inserted + i + 1}`,
      }));
      const { error } = await admin.from("cart_items").insert(rows);
      if (error) { chunkErr = error.message; break; }
      inserted += n;
    }
    assertEq(`bulk insert of CAP-1 (${CAP - 1}) rows succeeded`, chunkErr, null);

    // The CAP-th individual insert should still pass (cnt = CAP-1 < CAP)
    const { error: rCap } = await admin.from("cart_items").insert({
      profile_id: profileId,
      price_cny:  77,
      amount:     1,
      title:      `P31 cart item #${CAP} (last allowed)`,
    });
    assertEq(`${CAP}th insert succeeds (cnt was ${CAP - 1} < ${CAP})`, rCap?.message ?? null, null);

    const { count: countAtCap } = await admin
      .from("cart_items")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId);
    assertEq(`count = ${CAP} after bulk insert + single`, countAtCap, CAP);

    // ────────────────────────────────────────────────────────
    // step 2 — the CAP+1-th insert raises the trigger error
    // ────────────────────────────────────────────────────────
    console.log(`\nstep 2 — ${CAP + 1}th insert raises 'cart cap reached'`);

    const { error: capErr } = await admin.from("cart_items").insert({
      profile_id: profileId,
      price_cny:  99,
      amount:     1,
      title:      `P31 cart item #${CAP + 1} (should fail)`,
    });
    assertTrue(
      `${CAP + 1}th insert returned an error`,
      capErr != null,
      `expected non-null error, got: ${JSON.stringify(capErr)}`,
    );
    assertTrue(
      "error message mentions 'cart cap reached'",
      (capErr?.message ?? "").includes("cart cap reached"),
      `actual message: ${capErr?.message}`,
    );

    // ────────────────────────────────────────────────────────
    // step 3 — count is still exactly CAP (trigger fired BEFORE INSERT)
    // ────────────────────────────────────────────────────────
    console.log("\nstep 3 — count unchanged after rejected insert");
    const { count: countAfterReject } = await admin
      .from("cart_items")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId);
    assertEq(`count still ${CAP} (trigger fired before insert)`, countAfterReject, CAP);
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
