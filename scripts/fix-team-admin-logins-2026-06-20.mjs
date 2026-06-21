/**
 * Fix the 4 team back-office logins that can't reach /admin (owner 2026-06-20:
 * "login ไม่ได้ · admin_dev/admin_poom/admin_got/admin_pop").
 *
 * ROOT CAUSE: ปอน's new /admin/login (signInAdmin) accepts ONLY an admin_*
 * username → maps to admin_<name>@pacred.co.th → signInWithPassword(email). It has
 * NO employee_code/phone fallback (unlike the old /login). These 4 team profiles
 * were never provisioned with that synthetic email, so the admin entrance can't
 * authenticate them. The other 18 admins all have admin_<name>@pacred.co.th and
 * work fine.
 *
 * FIX (owner: "ใช้รหัสเดียวกับ PR เหมือนทุกคน"): set the admin_<name>@pacred.co.th
 * email + confirm it on each EXISTING auth user, KEEPING their current password
 * (= their PR account password) — EXCEPT admin_pop, a legacy-bridge account
 * (email …@users.pacred.invalid · no usable native password) which gets the
 * owner-specified password 0948782006 (same value as the committed
 * create-admin-pop.mjs · = his phone, the team convention).
 *
 * Uses the GoTrue admin API (service-role) — the supported path that keeps
 * auth.users + auth.identities consistent. Targets WHATEVER .env.local points at
 * (verified PROD = yzljakczhwrpbxflnmco before writing).
 *
 * DRY-RUN by default. Apply: node --env-file=.env.local scripts/fix-team-admin-logins-2026-06-20.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const ref = url.match(/https:\/\/([a-z0-9]+)\./)?.[1] ?? "?";
if (ref !== "yzljakczhwrpbxflnmco") {
  console.error(`REFUSING: this fix targets PROD (yzljakczhwrpbxflnmco) but .env.local points at ${ref}.`);
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

// member_code → desired admin_* email (+ optional password reset).
// password=null → KEEP the account's existing password (their PR password).
const TARGETS = [
  { mc: "PR112", email: "admin_dev@pacred.co.th",  password: null },
  { mc: "PR038", email: "admin_got@pacred.co.th",  password: null },
  { mc: "PR009", email: "admin_poom@pacred.co.th", password: null },
  { mc: "PR321", email: "admin_pop@pacred.co.th",  password: "0948782006" }, // legacy-bridge → set native pw
];

console.log(`\n=== fix-team-admin-logins · DB ${ref} · ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);

for (const t of TARGETS) {
  // Resolve the profile (= auth user id) by member_code.
  const { data: prof, error: pErr } = await admin
    .from("profiles").select("id, email, employee_code").eq("member_code", t.mc).maybeSingle();
  if (pErr) { console.error(`  ✗ ${t.mc}: profiles lookup failed: ${pErr.message}`); continue; }
  if (!prof) { console.error(`  ✗ ${t.mc}: no profile found`); continue; }

  // Read current auth state.
  const { data: got, error: gErr } = await admin.auth.admin.getUserById(prof.id);
  if (gErr || !got?.user) { console.error(`  ✗ ${t.mc}: getUserById failed: ${gErr?.message}`); continue; }
  const cur = got.user;

  console.log(`  ${t.mc} (emp ${prof.employee_code})`);
  console.log(`    current auth email : ${cur.email ?? "(none)"} · confirmed=${Boolean(cur.email_confirmed_at)} · phone=${cur.phone ?? "-"}`);
  console.log(`    →  set email       : ${t.email} (email_confirm=true)`);
  console.log(`    →  password        : ${t.password ? `RESET to ${t.password}` : "KEEP existing (PR password)"}`);

  if (!APPLY) { console.log(`    (dry-run · no change)\n`); continue; }

  const patch = { email: t.email, email_confirm: true };
  if (t.password) patch.password = t.password;
  const { error: uErr } = await admin.auth.admin.updateUserById(prof.id, patch);
  if (uErr) { console.error(`    ✗ updateUserById failed: ${uErr.message}\n`); continue; }

  // Keep profiles.email in sync (display only — login uses auth.users).
  const { error: peErr } = await admin.from("profiles").update({ email: t.email }).eq("id", prof.id);
  if (peErr) console.error(`    ⚠ profiles.email sync failed (non-fatal): ${peErr.message}`);

  // Verify.
  const { data: after } = await admin.auth.admin.getUserById(prof.id);
  console.log(`    ✓ applied · now email=${after?.user?.email} · confirmed=${Boolean(after?.user?.email_confirmed_at)}\n`);
}

console.log(APPLY ? "=== done ===" : "=== dry-run complete · re-run with --apply to write ===");
