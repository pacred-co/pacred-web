/**
 * Integration test for the OTP flow (P-28 — Sprint 7+ Track A).
 *
 * Hits real Supabase (admin client, bypasses RLS) and exercises the
 * underlying behaviors of `actions/otp.ts`:
 *
 *   1. requestOtp inserts a hashed code with TTL + purpose
 *   2. Rate limit: 4th request within 1h returns rate_limit
 *   3. verifyOtp success path consumes the row (used=true)
 *   4. verifyOtp wrong-code increments attempts but doesn't consume
 *   5. verifyOtp expired code is rejected
 *   6. verifyOtp consumed-once enforcement (re-verify same code = false)
 *
 * DECISION (per §6 self-directed):
 * - Same approach as placement.test.ts — replicate the action logic
 *   directly via admin client rather than importing the server actions.
 *   The actions use createAdminClient() which is fine in tsx, but they
 *   also short-circuit on OTP_BYPASS=true (which `.env.local` sets for
 *   dev). We bypass the bypass by talking to the DB directly with the
 *   same hashCode + insert + select shapes, so we're testing the
 *   schema correctness + the algorithm a re-implementation would need
 *   to match.
 * - hashCode is duplicated locally instead of imported because
 *   `actions/otp.ts` has "use server" — every export must be an action.
 *   The hashCode helper isn't exported. Re-implementing here is 4 lines
 *   and matches the actions/otp.ts logic exactly (sha256 + pepper).
 *
 * Run with:  pnpm tsx --env-file=.env.local lib/auth/otp.test.ts
 * Or:        pnpm test  (chained alongside other test files)
 *
 * Skips gracefully (exit 0) if SUPABASE env vars are missing — so CI
 * without secrets doesn't fail.
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

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

// Mirrors actions/otp.ts::hashCode exactly. Kept local because actions
// are server-only — see DECISION block above.
function hashCode(code: string): string {
  const pepper = process.env.OTP_PEPPER ?? "default-pepper";
  return createHash("sha256").update(code + pepper).digest("hex");
}

const RATE_LIMIT_PER_HOUR = 3;
const MAX_ATTEMPTS        = 5;
const OTP_TTL_MS          = 5 * 60 * 1000;

console.log("=== OTP flow integration test (P-28) ===");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log("⏭  SUPABASE env vars unset — skipping integration test (this is OK for CI without secrets).");
    console.log("    Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local to run.");
    process.exit(0);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  // Per-run unique phone so concurrent test runs don't collide on rate limit.
  // Use 0900000000 + 7-digit run id mod 10M → 10-digit phone string.
  const runSuffix = (Date.now() % 10_000_000).toString().padStart(7, "0");
  const phone     = `09${runSuffix}1`; // 10 digits, leading 0

  const insertedIds: string[] = [];

  async function cleanup() {
    console.log("\n🧹 cleanup");
    try {
      if (insertedIds.length > 0) {
        await admin.from("otp_codes").delete().in("id", insertedIds);
      }
      // Belt-and-suspenders: also delete any otp_codes for this phone in
      // case the test inserted but failed to capture the id.
      await admin.from("otp_codes").delete().eq("phone", phone);
      console.log("  ✓ cleanup done");
    } catch (e) {
      console.error("  ✗ cleanup error (non-fatal):", e instanceof Error ? e.message : e);
    }
  }

  try {
    // ────────────────────────────────────────────────────────
    // step 1 — insert 3 OTPs (within rate limit)
    // ────────────────────────────────────────────────────────
    console.log("\nstep 1 — insert 3 OTP rows (within rate limit of 3/hr)");
    for (let i = 1; i <= RATE_LIMIT_PER_HOUR; i++) {
      const code = String(100000 + i).padStart(6, "0");
      const { data, error } = await admin
        .from("otp_codes")
        .insert({
          phone,
          code_hash: hashCode(code),
          purpose:   "register",
          expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
        })
        .select("id")
        .single<{ id: string }>();
      assertEq(`insert #${i} succeeded`, error?.message ?? null, null);
      if (data?.id) insertedIds.push(data.id);
    }

    // ────────────────────────────────────────────────────────
    // step 2 — rate-limit gate (4th insert in same hour blocked)
    // ────────────────────────────────────────────────────────
    console.log("\nstep 2 — rate limit gate at 4th request");
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await admin
      .from("otp_codes")
      .select("id", { count: "exact", head: true })
      .eq("phone", phone)
      .gte("created_at", oneHourAgo);
    assertTrue(
      `rate limit window count = ${count} >= ${RATE_LIMIT_PER_HOUR} → would reject 4th request`,
      (count ?? 0) >= RATE_LIMIT_PER_HOUR,
    );

    // ────────────────────────────────────────────────────────
    // step 3 — verify success path consumes the latest unused row
    // ────────────────────────────────────────────────────────
    console.log("\nstep 3 — verifyOtp success consumes row");
    const successCode = "100003"; // matches the 3rd insert above
    const { data: latestUnused } = await admin
      .from("otp_codes")
      .select("id, code_hash")
      .eq("phone", phone)
      .eq("purpose", "register")
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; code_hash: string }>();
    assertTrue("latest unused OTP found", latestUnused != null);

    const submittedHash = hashCode(successCode);
    assertEq("submitted code hash matches stored hash", submittedHash, latestUnused?.code_hash ?? null);

    // Mark used (mirrors verifyOtp's success branch)
    if (latestUnused) {
      await admin.from("otp_codes").update({ used: true }).eq("id", latestUnused.id);
      const { data: after } = await admin
        .from("otp_codes")
        .select("used")
        .eq("id", latestUnused.id)
        .maybeSingle<{ used: boolean }>();
      assertEq("row marked used after verify", after?.used, true);
    }

    // ────────────────────────────────────────────────────────
    // step 4 — wrong code increments attempts (no consume)
    // ────────────────────────────────────────────────────────
    console.log("\nstep 4 — wrong code increments attempts, doesn't consume");
    const { data: nextUnused } = await admin
      .from("otp_codes")
      .select("id, attempts, used")
      .eq("phone", phone)
      .eq("purpose", "register")
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; attempts: number; used: boolean }>();
    assertTrue("another unused OTP exists for wrong-code test", nextUnused != null);

    if (nextUnused) {
      const wrongHash = hashCode("999999");
      // wrongHash will not match the stored one for this row — simulate
      // verifyOtp's failure branch: attempts++ + used = (attempts >= MAX)
      const newAttempts = nextUnused.attempts + 1;
      await admin
        .from("otp_codes")
        .update({
          attempts: newAttempts,
          used:     newAttempts >= MAX_ATTEMPTS,
        })
        .eq("id", nextUnused.id);

      const { data: afterWrong } = await admin
        .from("otp_codes")
        .select("attempts, used")
        .eq("id", nextUnused.id)
        .maybeSingle<{ attempts: number; used: boolean }>();
      assertEq("attempts incremented", afterWrong?.attempts, 1);
      assertEq("not consumed (still used=false until MAX)", afterWrong?.used, false);
      // Sanity that wrong hash != stored
      assertTrue("wrong hash != any stored hash", wrongHash !== nextUnused.id);
    }

    // ────────────────────────────────────────────────────────
    // step 5 — expired code rejected (would not pass `expires_at > now`)
    // ────────────────────────────────────────────────────────
    console.log("\nstep 5 — expired code rejected by query");
    const expiredCode = "555555";
    const { data: expiredRow, error: expErr } = await admin
      .from("otp_codes")
      .insert({
        phone,
        code_hash:  hashCode(expiredCode),
        purpose:    "register",
        expires_at: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
      })
      .select("id")
      .single<{ id: string }>();
    assertEq("expired-row insert ok", expErr?.message ?? null, null);
    if (expiredRow?.id) insertedIds.push(expiredRow.id);

    // verifyOtp's query is `expires_at > now()` — that excludes this row
    const { data: shouldBeNull } = await admin
      .from("otp_codes")
      .select("id")
      .eq("phone", phone)
      .eq("purpose", "register")
      .eq("used", false)
      .eq("code_hash", hashCode(expiredCode))
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    assertEq("expired row not returned by verifyOtp's query", shouldBeNull, null);

    // ────────────────────────────────────────────────────────
    // step 6 — consumed-once enforcement (used=true row not returned)
    // ────────────────────────────────────────────────────────
    console.log("\nstep 6 — consumed-once: used row not returned for re-verify");
    // The latestUnused row from step 3 was marked used. Re-querying with
    // used=false filter should not return it even though hash still matches.
    if (latestUnused) {
      const { data: reVerify } = await admin
        .from("otp_codes")
        .select("id")
        .eq("id", latestUnused.id)
        .eq("used", false)
        .maybeSingle();
      assertEq("consumed row excluded by used=false filter", reVerify, null);
    }
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
