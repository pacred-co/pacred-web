/**
 * Smoke-test the signup → profile-insert path end-to-end against prod.
 *
 * Creates a throwaway auth.user, inserts a profile with member_code=NULL
 * (so the trigger has to allocate one), reads back the assigned code,
 * then deletes both. The whole thing leaves prod in its original state
 * — and tells us whether:
 *   (a) the lowest-vacant scanner is installed (assigned code = low PR<n>)
 *   (b) the simple nextval is installed       (assigned code = PR10904+)
 *   (c) the broken retry trigger is still up  (insert errors with P0001)
 *
 * Run:
 *   pnpm exec tsx --env-file=.env.recovery-prod scripts/test-signup-trigger.mts
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
console.log(`[smoke] target: ${url}`);

// ── 1. Create a throwaway auth.user ──────────────────────────────
const testEmail = `trigger-smoke-${Date.now()}@test.pacred.invalid`;
console.log(`\n[1] Creating test auth.user (email=${testEmail})…`);
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email:          testEmail,
  password:       "Smoke-Test-Throwaway-Password-2026",
  email_confirm:  true,
  user_metadata:  { first_name: "Smoke", last_name: "Test" },
});
if (createErr || !created.user) {
  console.error("  ✗ createUser failed:", createErr);
  process.exit(1);
}
const testId = created.user.id;
console.log(`  ✓ created: ${testId}`);

// ── 2. Insert profile with member_code=NULL — trigger MUST allocate ─
console.log("\n[2] Inserting profile with member_code=null (trigger allocates)…");
const { error: insErr } = await admin.from("profiles").insert({
  id:           testId,
  account_type: "personal",
  first_name:   "Smoke",
  last_name:    "Test",
  email:        testEmail,
  services:     [],
  status:       "active",
});
if (insErr) {
  console.error("  ✗ profile insert FAILED:");
  console.error("    message:", insErr.message);
  console.error("    code:   ", insErr.code);
  console.error("    details:", insErr.details);
  console.error("    hint:   ", insErr.hint);
  // Cleanup auth.user
  await admin.auth.admin.deleteUser(testId);
  console.error("\n❌ TRIGGER STILL BROKEN — เดฟ ต้องรัน SQL (lowest-vacant CREATE OR REPLACE)");
  process.exit(2);
}

// ── 3. Read back to see what code the trigger assigned ──────────
const { data: row, error: selErr } = await admin
  .from("profiles")
  .select("member_code, first_name, last_name, status")
  .eq("id", testId)
  .maybeSingle();
if (selErr || !row) {
  console.error("  ✗ readback failed:", selErr);
  await admin.from("profiles").delete().eq("id", testId);
  await admin.auth.admin.deleteUser(testId);
  process.exit(3);
}
const assignedCode = row.member_code as string;
console.log(`  ✓ trigger assigned: ${assignedCode}`);

// ── 4. Cleanup — delete profile + auth.user, restore state ──────
console.log("\n[3] Cleanup…");
const { error: delProfErr } = await admin.from("profiles").delete().eq("id", testId);
if (delProfErr) console.error("  ⚠ profile delete failed:", delProfErr);
else console.log("  ✓ profile deleted");
const { error: delUserErr } = await admin.auth.admin.deleteUser(testId);
if (delUserErr) console.error("  ⚠ auth.user delete failed:", delUserErr);
else console.log("  ✓ auth.user deleted");

// ── 5. Interpret the result ─────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════════");
const m = assignedCode.match(/^PR(\d+)$/);
if (!m) {
  console.log(`⚠️  unexpected code format: "${assignedCode}"`);
  process.exit(0);
}
const n = parseInt(m[1]!, 10);
if (n < 10000) {
  console.log(`✅ LOWEST-VACANT scanner is ACTIVE — assigned ${assignedCode} (low gap filled)`);
} else if (n >= 10904 && n < 20000) {
  console.log(`🟡 SIMPLE nextval is active — assigned ${assignedCode} (continues from max+1, but does NOT fill gaps)`);
  console.log("    To switch to lowest-vacant fill: เดฟ ต้องรัน the CREATE OR REPLACE SQL");
} else if (n >= 20000) {
  console.log(`⚠️  assigned ${assignedCode} — sequence still bumped to high range (setval ไม่ได้ดึงลง)`);
} else {
  console.log(`🟡 assigned ${assignedCode} — review`);
}
console.log("══════════════════════════════════════════════════════════");
