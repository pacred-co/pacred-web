/**
 * 2026-06-05 — verify migration 0141 + the CS-assignment wiring on prod.
 *
 * Phase 1 of the ops-workflow audit (`docs/research/ops-workflow-audit-2026-06-05.md`):
 * per-customer CS rep — mirror of the sales-rep model on `tb_users.adminIDSale`.
 * This probe is read-only; it checks the DB shape + seed + load distribution.
 *
 * Run:
 *   node --env-file=.env.local scripts/probe-cs-rep-0141.mjs
 *
 * Asserts (prints + non-zero exit if any fail):
 *   1. `tb_users."adminIDCS"` column exists (varchar(20), NOT NULL, default '')
 *   2. `tb_admin."adminStatusCS"` column exists (varchar(1), NOT NULL, default '0')
 *   3. `admin_ploy` is in the active CS pool (adminStatusA='1' + adminStatusCS='1')
 *   4. counts: customers with adminIDCS='' (= unassigned · sidebar shows central)
 *      vs customers with adminIDCS!='' (= already assigned)
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("[probe-cs-rep-0141] missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

let failed = false;
function check(label, ok, detail) {
  console.log(`${ok ? "✅" : "❌"}  ${label}${detail ? "  " + detail : ""}`);
  if (!ok) failed = true;
}

console.log(`\n══ probe-cs-rep-0141 · ${url} ══\n`);

// ─── 1. Column shape via PostgREST OpenAPI introspection (cheap; uses Supabase REST) ───
// We can't query information_schema via PostgREST, so instead do a 0-row SELECT to
// confirm the column accepts the camelCase identifier (PostgREST returns 400 on a
// bad column name + we get the actual error).
const { error: shapeUsersErr } = await admin
  .from("tb_users")
  .select(`"adminIDCS"`, { count: "exact", head: true })
  .limit(0);
check(
  `tb_users.adminIDCS column reachable via PostgREST`,
  !shapeUsersErr,
  shapeUsersErr ? `(err: ${shapeUsersErr.message})` : "",
);

const { error: shapeAdminErr } = await admin
  .from("tb_admin")
  .select(`"adminStatusCS"`, { count: "exact", head: true })
  .limit(0);
check(
  `tb_admin.adminStatusCS column reachable via PostgREST`,
  !shapeAdminErr,
  shapeAdminErr ? `(err: ${shapeAdminErr.message})` : "",
);

// ─── 2. Seed — admin_ploy is in the active CS pool ───
const { data: ploy, error: ployErr } = await admin
  .from("tb_admin")
  .select(`"adminID","adminStatusA","adminStatusCS","adminNickname","adminTel"`)
  .eq("adminID", "admin_ploy")
  .maybeSingle();
if (ployErr) {
  check("admin_ploy lookup", false, `(err: ${ployErr.message})`);
} else if (!ploy) {
  check("admin_ploy lookup", false, `(no row — was the central CS provisioned?)`);
} else {
  check(
    "admin_ploy in tb_admin",
    true,
    `(nickname=${JSON.stringify(ploy.adminNickname)}, tel=${ploy.adminTel ?? ""})`,
  );
  check(
    "admin_ploy adminStatusA='1' (active staff)",
    ploy.adminStatusA === "1",
    `(got ${JSON.stringify(ploy.adminStatusA)})`,
  );
  check(
    "admin_ploy adminStatusCS='1' (in CS pool · 0141 seed)",
    ploy.adminStatusCS === "1",
    `(got ${JSON.stringify(ploy.adminStatusCS)})`,
  );
}

// ─── 3. Full active CS pool — anyone else? ───
const { data: pool, error: poolErr } = await admin
  .from("tb_admin")
  .select(`"adminID","adminNickname"`)
  .eq("adminStatusA", "1")
  .eq("adminStatusCS", "1");
if (poolErr) {
  check("CS pool enumeration", false, `(err: ${poolErr.message})`);
} else {
  console.log(`\nActive CS pool (adminStatusA='1' AND adminStatusCS='1'): ${pool.length} member(s)`);
  for (const r of pool) {
    console.log(`   - ${r.adminID}  (${r.adminNickname ?? ""})`);
  }
}

// ─── 4. Customer assignment distribution ───
const { count: unassigned, error: unaErr } = await admin
  .from("tb_users")
  .select("*", { count: "exact", head: true })
  .eq("adminIDCS", "");
if (unaErr) {
  check("count tb_users adminIDCS=''", false, `(err: ${unaErr.message})`);
} else {
  console.log(`\nCustomers with adminIDCS='' (unassigned · sidebar = central):  ${unassigned}`);
}

const { count: assigned, error: assErr } = await admin
  .from("tb_users")
  .select("*", { count: "exact", head: true })
  .neq("adminIDCS", "");
if (assErr) {
  check("count tb_users adminIDCS<>''", false, `(err: ${assErr.message})`);
} else {
  console.log(`Customers with adminIDCS!='' (already assigned):                 ${assigned}`);
}

// Active customers only (the round-robin tally) — the population the picker
// counts when load-balancing.
const { count: assignedActive, error: assActErr } = await admin
  .from("tb_users")
  .select("*", { count: "exact", head: true })
  .neq("adminIDCS", "")
  .eq("userActive", "1")
  .eq("userStatus", "1");
if (!assActErr) {
  console.log(`   of which active (userActive='1' AND userStatus='1'):           ${assignedActive}`);
}

// ─── 5. Per-CS load if anyone has been assigned ───
if (assigned && assigned > 0 && pool && pool.length > 0) {
  const ids = pool.map((p) => p.adminID);
  const { data: byCs, error: byCsErr } = await admin
    .from("tb_users")
    .select("adminIDCS")
    .in("adminIDCS", ids);
  if (!byCsErr) {
    const counts = new Map();
    for (const r of byCs) counts.set(r.adminIDCS, (counts.get(r.adminIDCS) ?? 0) + 1);
    console.log(`\nLoad per CS (across all customers):`);
    for (const id of ids) console.log(`   ${id}:  ${counts.get(id) ?? 0}`);
  }
}

console.log(`\n══ ${failed ? "❌ FAIL" : "✅ all checks passed"} ══\n`);
process.exit(failed ? 1 : 0);
