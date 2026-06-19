/**
 * Provision the `admin_pop` back-office login (owner directive 2026-06-19 ·
 * พี่ป๊อป via ปอน). Mirrors actions/admin/admins.ts → adminCreateNew:
 *   auth.user (email admin_pop@pacred.co.th, pw 0948782006) + profiles + admins(ultra).
 *
 * Safe by default: DRY-RUN unless `--apply` is passed. Idempotent — if the auth
 * user already exists it ensures the profile + ultra role rather than erroring.
 *
 * Run dry:   node --env-file=.env.local scripts/create-admin-pop.mjs
 * Apply:     node --env-file=.env.local scripts/create-admin-pop.mjs --apply
 *
 * Targets WHATEVER DB .env.local points at (currently DEV lozntlidlqqzzcaathnm).
 * For PROD, prefer creating via /admin/admins/new on the live site (the audited
 * path) once an existing admin_* logs in through /admin/login.
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const EMAIL = "admin_pop@pacred.co.th";
const PASSWORD = "0948782006";
const ROLE = "ultra";
const FIRST = "วิสิฐ";
const LAST = "ศิลปเลิศลักษณ์ (admin_pop)";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const ref = url.match(/https:\/\/([a-z0-9]+)\./)?.[1] ?? "?";
const admin = createClient(url, key, { auth: { persistSession: false } });

console.log(`\n=== create admin_pop · DB ref ${ref} · ${APPLY ? "APPLY" : "DRY-RUN"} ===`);
console.log(`  email=${EMAIL} · role=${ROLE} · name="${FIRST} ${LAST}"\n`);

// 1. Does the auth user already exist? (list + match by email)
async function findAuthUserByEmail(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 1000) return null;
    page += 1;
  }
}

const existing = await findAuthUserByEmail(EMAIL);
let profileId = existing?.id ?? null;
console.log(existing ? `• auth user EXISTS → ${profileId}` : "• auth user not found → will create");

if (!APPLY) {
  console.log("\nDRY-RUN — plan:");
  console.log(existing
    ? "  - reset password + ensure profiles row + ensure admins(ultra) role"
    : "  - create auth user (email_confirm) + insert profiles + insert admins(ultra)");
  console.log("\nRe-run with --apply to execute.\n");
  process.exit(0);
}

// APPLY ───────────────────────────────────────────────────────
if (!existing) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: FIRST, last_name: LAST, provisioned_via: "create-admin-pop-script" },
  });
  if (error) { console.error(`createUser failed: ${error.message}`); process.exit(1); }
  profileId = created.user.id;
  console.log(`✓ auth user created → ${profileId}`);
} else {
  // Ensure the password matches what the owner expects.
  const { error } = await admin.auth.admin.updateUserById(profileId, { password: PASSWORD });
  if (error) { console.error(`updateUserById(password) failed: ${error.message}`); process.exit(1); }
  console.log("✓ password reset to the owner-specified value");
}

// profiles (upsert by id) — member_code auto-minted by trigger on insert.
const { error: profErr } = await admin.from("profiles").upsert({
  id: profileId,
  email: EMAIL,
  first_name: FIRST,
  last_name: LAST,
  employee_code: `STAFF-${profileId.replace(/-/g, "").slice(0, 12)}`,
  account_type: "personal",
  status: "active",
  is_active: true,
  register_with: "email",
}, { onConflict: "id" });
if (profErr) { console.error(`profiles upsert failed: ${profErr.message}`); process.exit(1); }
console.log("✓ profiles row ensured");

// admins role (ultra) — upsert idempotent.
const { error: roleErr } = await admin.from("admins").upsert({
  profile_id: profileId,
  role: ROLE,
  is_active: true,
  granted_at: new Date().toISOString(),
}, { onConflict: "profile_id,role" });
if (roleErr) { console.error(`admins upsert failed: ${roleErr.message}`); process.exit(1); }
console.log(`✓ admins(${ROLE}) role ensured`);

// admin_contact_extras — set the nickname used by the /admin/login welcome
// banner ("ยินดีต้อนรับ {ชื่อเล่น}"). Best-effort: a failure here doesn't block
// the login (signInAdmin falls back to first_name).
const NICKNAME = "ป๊อป";
const { error: extrasErr } = await admin.from("admin_contact_extras").upsert({
  profile_id: profileId,
  nickname: NICKNAME,
  display_name: NICKNAME,
  company: "pacred",
}, { onConflict: "profile_id" });
if (extrasErr) console.warn(`! admin_contact_extras upsert warning: ${extrasErr.message}`);
else console.log(`✓ nickname set → "${NICKNAME}"`);

const { data: prof } = await admin.from("profiles").select("member_code").eq("id", profileId).maybeSingle();
console.log(`\n✅ admin_pop ready · profile_id=${profileId} · member_code=${prof?.member_code ?? "?"}`);
console.log(`   login at /admin/login → username "admin_pop" · password "${PASSWORD}"\n`);
