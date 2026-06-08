#!/usr/bin/env node
/**
 * Detection tool (เดฟ 2026-06-08) — find people who exist TWICE: once as an
 * auth/admin account in `profiles` (member_code PR###) and again as a legacy
 * customer in `tb_users` (userID PR####), matched by phone but holding TWO
 * different codes. This is the duplicate-identity class behind the PR112/PR10584
 * merge — caused by the admin-create / provisioning paths NOT deduping the phone
 * against the legacy customer table (now guarded in adminCreateNew, 2026-06-08).
 *
 * Read-only. Prints a review table; merge/retire decisions are per-person
 * (use scripts/merge-dup-*.mjs as the template — never bulk-delete identities).
 *
 *   node scripts/find-cross-system-phone-dups.mjs
 */
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Normalize a phone to its last 9 significant digits (drops +66 / leading 0).
const norm = (p) => {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("66")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return d.length >= 9 ? d.slice(-9) : "";
};

async function pageAll(table, cols, filterCol) {
  const out = [];
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await sb.from(table).select(cols).not(filterCol, "is", null).range(from, from + PAGE - 1);
    if (error) { console.error(`${table}:`, error.message); break; }
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

const profs = await pageAll("profiles", "member_code,phone,first_name,last_name", "phone");
const users = await pageAll("tb_users", "userID,userTel,userName,userLastName,userStatus", "userTel");

const tuByPhone = new Map();
for (const r of users) {
  const k = norm(r.userTel);
  if (!k) continue;
  if (!tuByPhone.has(k)) tuByPhone.set(k, []);
  tuByPhone.get(k).push(r);
}

const dups = [];
for (const p of profs) {
  const k = norm(p.phone);
  if (!k) continue;
  const matches = (tuByPhone.get(k) || []).filter((t) => t.userID !== p.member_code);
  if (matches.length) {
    dups.push({
      profile: p.member_code,
      name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      tb_users: matches.map((t) => `${t.userID}(status=${t.userStatus})`).join(", "),
    });
  }
}

console.log(`\nscanned: profiles=${profs.length} · tb_users=${users.length}`);
console.log(`=== CROSS-SYSTEM PHONE DUPS (profiles ↔ tb_users, different code) ===`);
console.log(`count: ${dups.length}\n`);
for (const d of dups) {
  console.log(`  profiles ${d.profile.padEnd(9)} "${d.name}"  ⇄  tb_users ${d.tb_users}`);
}
console.log("\n(status=0 in tb_users = already retired/merged. Review each before merging.)\n");
