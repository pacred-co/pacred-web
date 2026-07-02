/**
 * Owner 2026-07-02 — completeness fix for the PR999→PR168 move: the synthetic
 * auth.users email encodes the member code (pcs-legacy-<code>) and the NATIVE
 * login path (actions/auth.ts:150 legacySyntheticEmail(code)) relies on it. The
 * move changed member_code/userID but NOT the auth email → นันทพร(now PR168) still
 * had pcs-legacy-pr999, and pcs-legacy-pr168 pointed at ศิริญญา(now PR540) → a
 * password reset on PR168 couldn't log in (native hit the wrong auth row).
 * FIX: realign auth emails to the NEW codes. Order: free pr168 (ศิริญญา→pr540) first.
 * Then real signInWithPassword test with the owner's reset password.
 *   node --env-file=.env.local scripts/fix-auth-email-pr168-pr540-2026-07-02.mjs         # dry-run
 *   node --env-file=.env.local scripts/fix-auth-email-pr168-pr540-2026-07-02.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
const APPLY = process.argv.includes("--apply");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, SR = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL, SR, { auth: { autoRefreshToken:false, persistSession:false } });
// order: free pcs-legacy-pr168 (ศิริญญา) BEFORE นันทพร takes it.
const PLAN = [
  { id: "05272378-2641-43d2-af5a-ea025f6b483a", who: "ศิริญญา (now PR540)", email: "pcs-legacy-pr540@users.pacred.invalid" },
  { id: "d9939fb6-97ae-4d6e-baaa-ce4ab28c739e", who: "นันทพร (now PR168)",  email: "pcs-legacy-pr168@users.pacred.invalid" },
];
console.log(`=== fix auth emails · ${APPLY ? "APPLY" : "DRY-RUN"} ===`);
for (const p of PLAN) {
  const { data } = await admin.auth.admin.getUserById(p.id);
  console.log(`  ${p.who}: ${data?.user?.email || "?"} → ${p.email}`);
}
if (!APPLY) { console.log("\n(dry-run · re-run with --apply)"); process.exit(0); }
for (const p of PLAN) {
  const { error } = await admin.auth.admin.updateUserById(p.id, { email: p.email });
  console.log(error ? `  ✗ ${p.who}: ${error.message}` : `  ✓ ${p.who} → ${p.email}`);
}
console.log("\n=== REAL login test: PR168 native email + owner's reset password 'UVbtPB' ===");
const anon = createClient(URL, ANON, { auth: { autoRefreshToken:false, persistSession:false } });
const { data: s, error: se } = await anon.auth.signInWithPassword({ email: "pcs-legacy-pr168@users.pacred.invalid", password: "UVbtPB" });
console.log(se ? `  ✗ login FAILED: ${se.message}` : `  ✓ LOGIN OK · session for ${s.user?.email} (id ${s.user?.id.slice(0,8)})`);
