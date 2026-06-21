/**
 * collapse-multiactive-admins-2026-06-21.mjs
 *
 * One-off prod data cleanup for /admin/admins (owner 2026-06-21: "ซ้ำซ้อน ·
 * บัคมั่ว · มีพนักงานไม่กี่คน แถวเพียบ"). The `admins` table holds one row per
 * (profile_id, role) grant. A handful of people accumulated >1 ACTIVE grant
 * (role granted twice without the older being deactivated) → they hold extra
 * hidden roles + the per-row dropdown/toggle can't act per-person cleanly.
 *
 * Fix: for every profile with >1 active grant, KEEP the most-recent active grant
 * and set is_active=false on the rest (history preserved · NOT deleted). The
 * page's display-dedupe already shows the most-recent active role as effective,
 * so this makes the DB match what staff see.
 *
 * SAFE: soft-deactivate only (no hard delete). Dry-run by default — prints the
 * exact plan + a JSON backup of every row it would touch. Re-run with --apply.
 *
 * Usage:
 *   node scripts/collapse-multiactive-admins-2026-06-21.mjs            # dry-run
 *   node scripts/collapse-multiactive-admins-2026-06-21.mjs --apply    # write
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

console.log(`[collapse-multiactive-admins] target: ${new URL(url).host} · mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);

const { data: grants, error } = await sb
  .from("admins")
  .select("profile_id, role, is_active, granted_at, granted_by")
  .order("granted_at", { ascending: false });
if (error) { console.error("read failed", error); process.exit(1); }

const { data: profs } = await sb
  .from("profiles")
  .select("id, email, member_code, employee_code, first_name, last_name")
  .in("id", [...new Set(grants.map((g) => g.profile_id))]);
const pm = new Map((profs ?? []).map((p) => [p.id, p]));
const whoOf = (pid) => {
  const p = pm.get(pid);
  return p ? (p.email?.split("@")[0] || p.member_code || p.employee_code || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()) : pid.slice(0, 8);
};

// group by profile, grants already granted_at desc
const byp = new Map();
for (const g of grants) { if (!byp.has(g.profile_id)) byp.set(g.profile_id, []); byp.get(g.profile_id).push(g); }

const toDeactivate = []; // {profile_id, role, who, keepRole}
for (const [pid, gs] of byp) {
  const active = gs.filter((g) => g.is_active); // desc order preserved
  if (active.length <= 1) continue;
  const keep = active[0]; // most-recent active = the effective role the page shows
  for (const g of active.slice(1)) {
    toDeactivate.push({ profile_id: pid, role: g.role, who: whoOf(pid), keepRole: keep.role, granted_at: g.granted_at });
  }
}

if (toDeactivate.length === 0) { console.log("\n✓ no multi-active people — nothing to collapse."); process.exit(0); }

console.log(`\nPlan — deactivate ${toDeactivate.length} extra active grant(s) across ${new Set(toDeactivate.map(t=>t.profile_id)).size} people:\n`);
for (const t of toDeactivate) {
  console.log(`  ${t.who.padEnd(16)} keep "${t.keepRole}"  →  deactivate "${t.role}" (granted ${t.granted_at.slice(0,10)})`);
}

// backup the exact rows being changed (full row state pre-change)
const backup = toDeactivate.map((t) => {
  const g = grants.find((x) => x.profile_id === t.profile_id && x.role === t.role);
  return { ...g, who: t.who };
});
const stamp = "2026-06-21";
const backupPath = `/tmp/collapse-multiactive-admins-backup-${stamp}.json`;
writeFileSync(backupPath, JSON.stringify(backup, null, 2));
console.log(`\nbackup written: ${backupPath}`);

if (!APPLY) { console.log("\nDRY-RUN — re-run with --apply to write."); process.exit(0); }

let ok = 0, fail = 0;
for (const t of toDeactivate) {
  const { error: e } = await sb
    .from("admins")
    .update({ is_active: false })
    .eq("profile_id", t.profile_id)
    .eq("role", t.role);
  if (e) { console.error(`  ✗ ${t.who} ${t.role}:`, e.message); fail++; } else { ok++; }
}
console.log(`\nAPPLIED — ${ok} deactivated · ${fail} failed.`);
process.exit(fail ? 1 : 0);
