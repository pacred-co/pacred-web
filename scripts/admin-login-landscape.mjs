/**
 * Read-only — list every active admin + whether they hold an `admin_*` login
 * (the only shape the new dedicated /admin/login accepts). An active admin
 * WITHOUT an admin_* email is a lock-out risk once the dedicated admin login
 * goes live. Run: node --env-file=.env.local scripts/admin-login-landscape.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const ref = url.match(/https:\/\/([a-z0-9]+)\./)?.[1] ?? "?";
const admin = createClient(url, key, { auth: { persistSession: false } });

const { data: rows, error } = await admin
  .from("admins")
  .select("profile_id, role, is_active")
  .eq("is_active", true);
if (error) { console.error("admins query failed:", error.message); process.exit(1); }

const ids = [...new Set(rows.map((r) => r.profile_id))];
const { data: profs, error: pErr } = await admin
  .from("profiles")
  .select("id, email, member_code, first_name, last_name")
  .in("id", ids);
if (pErr) { console.error("profiles query failed:", pErr.message); process.exit(1); }

const byId = new Map(profs.map((p) => [p.id, p]));
const rolesById = {};
for (const r of rows) (rolesById[r.profile_id] ??= []).push(r.role);

console.log(`\n=== Admin login landscape · DB ref ${ref} ===`);
console.log(`active admin rows: ${rows.length} · distinct admins: ${ids.length}\n`);

let adminUsername = 0;
const lockoutRisk = [];
for (const id of ids) {
  const p = byId.get(id);
  const email = p?.email ?? "(no email)";
  if (/^admin_[a-z0-9_]+@pacred\.co\.th$/i.test(email)) {
    adminUsername++;
  } else {
    lockoutRisk.push({
      email,
      member_code: p?.member_code,
      name: [p?.first_name, p?.last_name].filter(Boolean).join(" "),
      roles: rolesById[id],
    });
  }
}
console.log(`OK  has admin_* login (can use /admin/login): ${adminUsername}`);
console.log(`!!  NO admin_* login (LOCKOUT RISK):          ${lockoutRisk.length}\n`);
if (lockoutRisk.length) {
  console.log("--- lockout-risk admins (would need an admin_* account) ---");
  for (const r of lockoutRisk) {
    console.log(`  ${r.member_code ?? "?"} | ${r.name || "(no name)"} | ${r.email} | roles=[${r.roles.join(",")}]`);
  }
}
console.log("");
