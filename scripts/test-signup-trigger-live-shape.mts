/**
 * Reproduce the live registerPersonal failure with the EXACT payload shape:
 * include phone + how_know + Thai name like the customer hit.
 * Compare with the earlier smoke test (no phone) to isolate which field
 * is causing the profile_failed.
 *
 * Run:
 *   pnpm exec tsx --env-file=.env.recovery-prod scripts/test-signup-trigger-live-shape.mts
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
console.log(`[smoke-live] target: ${url}`);

// Unique test phone unlikely to collide. The customer used 0800588746;
// we use a clearly-test pattern to avoid conflict.
const testPhone = `669999${Date.now().toString().slice(-5)}`;
const testEmail = `live-shape-${Date.now()}@test.pacred.invalid`;

console.log(`\n[1] createUser (phone=${testPhone})…`);
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  phone:         testPhone,
  password:      "Smoke-Test-Throwaway-Password-2026",
  phone_confirm: true,
  email:         testEmail,
  email_confirm: true,
  user_metadata: { first_name: "ช้อ", last_name: "ครั้ง" },
});
if (createErr || !created.user) {
  console.error("  ✗ createUser failed:", createErr);
  process.exit(1);
}
const testId = created.user.id;
console.log(`  ✓ ${testId}`);

console.log("\n[2] Insert profile EXACTLY like actions/auth.ts registerPersonal…");
const payload = {
  id:           testId,
  account_type: "personal",
  first_name:   "ช้อ",
  last_name:    "ครั้ง",
  phone:        testPhone,
  email:        null,                // matches "email empty → null" branch
  services:     [] as string[],      // empty array (no service picked)
  how_know:     null,                // dropdown not selected
  status:       "active",
};
console.log("  payload:", payload);
const { error: insErr } = await admin.from("profiles").insert(payload);

if (insErr) {
  console.error("\n  ✗ INSERT FAILED — root cause:");
  console.error("    message:", insErr.message);
  console.error("    code:   ", insErr.code);
  console.error("    details:", insErr.details);
  console.error("    hint:   ", insErr.hint);
  // Cleanup auth.user
  await admin.auth.admin.deleteUser(testId);
  process.exit(2);
}

const { data: row } = await admin
  .from("profiles")
  .select("member_code")
  .eq("id", testId)
  .maybeSingle();
console.log(`  ✓ trigger assigned: ${row?.member_code}`);

// Cleanup
console.log("\n[3] Cleanup…");
await admin.from("profiles").delete().eq("id", testId);
await admin.auth.admin.deleteUser(testId);
console.log("  ✓ cleaned");

console.log("\n✅ LIVE-SHAPE TEST PASSED — payload identical to actions/auth.ts succeeds → bug is NOT in the DB layer");
