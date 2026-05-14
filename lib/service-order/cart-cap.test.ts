/**
 * Integration test for the cart_items cap trigger (P-31 — Sprint 7+ Track A).
 *
 * Hits real Supabase (admin client, bypasses RLS) and verifies the
 * `cart_items_cap` trigger defined in 0011_service_order.sql:
 *
 *   - Trigger fires BEFORE INSERT; reads `count(*) where profile_id = NEW.profile_id`
 *   - Raises if count >= 151 (so up to 151 items succeed; 152nd fails)
 *   - Error message exactly: "cart cap reached (151 items)"
 *
 * ⚠️ FINDING for Sprint 7+ Track A: PORT_PLAN P-31 spec text says
 *    "Insert 150 OK → 151st throws" — that's off-by-one with the
 *    actual trigger which says `if cnt >= 151`. Real behavior:
 *    insert up to 151 succeeds, 152nd fails. Test below mirrors the
 *    actual trigger (which matches legacy PHP cart.php:17,76 hardcoded
 *    151-item cap behaviour). If product wants strictly 150 max, the
 *    trigger would need `>= 150`, OR if PORT_PLAN text is canonical,
 *    flag for เดฟ to adjust the trigger threshold.
 *
 * DECISION (per §6 self-directed):
 * - Bulk-insert 151 in chunks of 50 + 1, then attempt the 152nd.
 *   Smaller chunks make any mid-test failure easier to localise than
 *   one big 151-row insert.
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

console.log("=== cart_items 151-cap trigger (P-31) ===");

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
    // step 1 — insert 151 cart items (within cap; trigger uses >= 151)
    // ────────────────────────────────────────────────────────
    console.log("\nstep 1 — insert 151 cart items (3×50 + 1, all within cap)");

    const CHUNK = 50;
    for (let chunk = 0; chunk < 3; chunk++) {
      const rows = Array.from({ length: CHUNK }, (_, i) => ({
        profile_id: profileId,
        price_cny:  10 + ((chunk * CHUNK + i) % 100),
        amount:     1,
        title:      `P31 cart item #${chunk * CHUNK + i + 1}`,
      }));
      const { error } = await admin.from("cart_items").insert(rows);
      assertEq(`chunk ${chunk + 1}/3 (50 rows) inserted`, error?.message ?? null, null);
    }

    // 151st individual insert should still pass (cnt=150 < 151)
    const { error: r151 } = await admin.from("cart_items").insert({
      profile_id: profileId,
      price_cny:  77,
      amount:     1,
      title:      "P31 cart item #151 (last allowed)",
    });
    assertEq("151st insert succeeds (cnt was 150 < 151)", r151?.message ?? null, null);

    const { count: countAt151 } = await admin
      .from("cart_items")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId);
    assertEq("count = 151 after bulk insert + single", countAt151, 151);

    // ────────────────────────────────────────────────────────
    // step 2 — 152nd insert raises trigger error
    // ────────────────────────────────────────────────────────
    console.log("\nstep 2 — 152nd insert raises 'cart cap reached'");

    const { error: capErr } = await admin.from("cart_items").insert({
      profile_id: profileId,
      price_cny:  99,
      amount:     1,
      title:      "P31 cart item #152 (should fail)",
    });
    assertTrue(
      "152nd insert returned an error",
      capErr != null,
      `expected non-null error, got: ${JSON.stringify(capErr)}`,
    );
    assertTrue(
      "error message mentions 'cart cap reached'",
      (capErr?.message ?? "").includes("cart cap reached"),
      `actual message: ${capErr?.message}`,
    );

    // ────────────────────────────────────────────────────────
    // step 3 — count is still exactly 151 (trigger fired BEFORE INSERT)
    // ────────────────────────────────────────────────────────
    console.log("\nstep 3 — count unchanged after rejected insert");
    const { count: countAfterReject } = await admin
      .from("cart_items")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId);
    assertEq("count still 151 (trigger fired before insert)", countAfterReject, 151);
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
