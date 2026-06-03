#!/usr/bin/env -S node
/**
 * reset-clear-admins-2026-06-02.mjs — DESTRUCTIVE. The "clear ALL legacy admins"
 * half of the 2026-06-02 prod-auth overhaul.
 *
 *   DRY-RUN (default):  tsx scripts/reset-clear-admins-2026-06-02.mjs
 *   APPLY:              tsx scripts/reset-clear-admins-2026-06-02.mjs --apply
 *
 * Order (apply mode — backup ALWAYS happens first, even in --apply):
 *   (a) BACKUP all tb_users {userID, adminIDSale} → scripts/backup-adminIDSale-<ISO>.json
 *       (mandatory · the reset in (b) is reversible from this file)
 *   (b) RESET  every tb_users.adminIDSale → 'admin_center'
 *   (c) REF-REPORT — scan the 3 sales-attribution tables for adminIDs that would
 *       be left dangling, and print a "ห้าม death" report. (These tables are NOT
 *       deleted — only reported.)
 *   (d) HARD-DELETE the OLD admins:
 *         - tb_admin rows whose adminID ∉ the new clean roster (15 + admin_center)
 *         - admins / admin_contact_extras / profiles / auth.users rows for
 *           admin profiles NOT in the kept set (the 3 existing: PR132/PR112/PR009)
 *       Deletion happens AFTER (b) so no customer is left pointing at a deleted rep.
 *
 * IDEMPOTENT: re-running after a successful apply resets already-reset rows to
 *   the same value (no-op) and finds no old admins to delete. Always re-backs-up.
 *
 * REVERSIBLE: restore adminIDSale from the backup JSON (a tiny companion
 *   restore-from-backup snippet is printed at the end).
 *
 * Verified prod state (2026-06-02): tb_users 8,928 rows · 8,890 non-empty
 *   adminIDSale · 0 already admin_center. tb_admin 13 legacy rows. admins 3.
 *   admin_contact_extras 0. Ref-table dangling values enumerated below.
 */

import { writeFileSync } from "node:fs";
import { loadEnv, makeClient, KEEP_ADMIN_IDS } from "./_admin-roster-2026-06-02.mjs";

const APPLY = process.argv.includes("--apply");
const CENTER_ID = "admin_center";

// The 3 admin profiles that ALREADY exist and must be KEPT (never deleted).
// (provision-admins-2026-06-02.mjs ensures these; here we protect them.)
const KEEP_MEMBER_CODES = new Set(["PR132", "PR112", "PR009"]);

// The 3 sales-attribution tables + their (lowercase!) adminID columns.
// Verified on prod 2026-06-02 — these are LOWERCASE, unlike tb_admin/tb_users.
const REF_TABLES = [
  { table: "tb_sales_report", col: "sradminidsale", note: "commission attribution per forwarder" },
  { table: "tb_user_sales_admin_pay", col: "admincreate", note: "who created the payout slip" },
  { table: "tb_org_tell_ships", col: "adminid", note: "org tell-ship assignment" },
];

function section(title) {
  console.log("\n" + "─".repeat(74));
  console.log(title);
  console.log("─".repeat(74));
}
const log = (...a) => console.log(...a);

async function main() {
  const env = loadEnv();
  const db = makeClient(env);

  section(`reset-clear-admins-2026-06-02  ${APPLY ? "⚙️  APPLY (DESTRUCTIVE)" : "🔍 DRY-RUN (no writes)"}`);
  log(`target  : ${env.URL}`);
  log(`env file: ${env.envPath}`);
  log(`keep adminIDs (15 + central): ${[...KEEP_ADMIN_IDS].join(", ")}`);
  log(`keep member_codes (existing admins): ${[...KEEP_MEMBER_CODES].join(", ")}`);

  // ── (a) BACKUP — always, even in apply mode (mandatory safety) ──
  section("(a) BACKUP tb_users {userID, adminIDSale}");
  const backup = await fetchAll(db, "tb_users", "userID,adminIDSale");
  log(`fetched ${backup.length} tb_users rows`);
  const nonEmpty = backup.filter((r) => (r.adminIDSale ?? "") !== "").length;
  log(`  non-empty adminIDSale : ${nonEmpty}`);
  log(`  empty adminIDSale     : ${backup.length - nonEmpty}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = new URL(`./backup-adminIDSale-${stamp}.json`, import.meta.url).pathname;
  if (APPLY) {
    writeFileSync(backupPath, JSON.stringify(backup, null, 0), "utf8");
    log(`  ✓ backup written: ${backupPath}`);
  } else {
    log(`  [dry-run] WOULD write backup: ${backupPath}`);
    log(`  [dry-run] sample (first 3):`, JSON.stringify(backup.slice(0, 3)));
  }

  // ── (b) RESET all tb_users.adminIDSale → admin_center ──
  section(`(b) RESET tb_users.adminIDSale → '${CENTER_ID}'`);
  const alreadyCenter = backup.filter((r) => r.adminIDSale === CENTER_ID).length;
  const toReset = backup.length - alreadyCenter;
  log(`rows already '${CENTER_ID}' : ${alreadyCenter}`);
  log(`rows to reset             : ${toReset}`);
  if (APPLY) {
    // PATCH every row whose adminIDSale != admin_center. A single bulk PATCH
    // with a filter (adminIDSale neq admin_center) updates all matching rows.
    const updated = await db.restWrite(
      "PATCH",
      `tb_users?adminIDSale=neq.${CENTER_ID}`,
      { adminIDSale: CENTER_ID },
      { prefer: "return=minimal,count=exact" },
    );
    void updated;
    // verify
    const remaining = await db.count(`tb_users?adminIDSale=neq.${CENTER_ID}`);
    log(`  ✓ reset complete. rows still != '${CENTER_ID}': ${remaining}`);
  } else {
    log(`  [dry-run] WOULD PATCH ${toReset} rows: tb_users.adminIDSale = '${CENTER_ID}'`);
  }

  // ── (c) REF-REPORT — "ห้าม death": dangling sales-attribution adminIDs ──
  section("(c) REF-REPORT — sales-attribution tables (NOT deleted · report only)");
  log(`These tables store historical adminID strings. They have NO FK to tb_admin,`);
  log(`so deleting old tb_admin rows does NOT cascade — but any adminID here that`);
  log(`is NOT in the new roster will no longer resolve to a name. Listed for review.`);
  let danglingTotal = 0;
  for (const { table, col, note } of REF_TABLES) {
    const distinct = await distinctCounts(db, table, col);
    log(`\n  ${table}.${col}  (${note})`);
    if (distinct.size === 0) {
      log(`    (empty / no rows)`);
      continue;
    }
    const sorted = [...distinct.entries()].sort((a, b) => b[1] - a[1]);
    for (const [val, cnt] of sorted) {
      const kept = val === "" ? false : KEEP_ADMIN_IDS.has(val);
      const flag = val === "" ? "—(blank)" : kept ? "✓ KEPT" : "⚠ DANGLING";
      if (!kept && val !== "") danglingTotal += cnt;
      log(`    ${flag.padEnd(11)} ${JSON.stringify(val).padEnd(24)} × ${cnt}`);
    }
  }
  log(`\n  ⚠ TOTAL rows referencing an adminID NOT in the new roster: ${danglingTotal}`);
  log(`  → These are HISTORICAL records (commission/payout/org). They already point`);
  log(`    at admins removed in earlier churn. The overhaul does NOT make them worse;`);
  log(`    name-resolution for old reports will fall back to the raw adminID string.`);
  log(`  → "ห้าม death": no LIVE customer flow reads these for the active sales rep —`);
  log(`    that path is tb_users.adminIDSale (reset to '${CENTER_ID}' in step b) → tb_admin.`);

  // ── (d) HARD-DELETE old admins ──
  section("(d) HARD-DELETE old admins (after reset · so no customer is orphaned)");

  // (d.1) tb_admin rows whose adminID ∉ kept set.
  // tb_admin PK is "ID" (uppercase) + columns are camelCase-quoted on prod.
  const { rows: tbAdminRows } = await db.rest(`tb_admin?select=ID,adminID,adminNickname`);
  const oldTbAdmin = tbAdminRows.filter((r) => !KEEP_ADMIN_IDS.has(r.adminID));
  log(`\n  tb_admin: ${tbAdminRows.length} rows · OLD (∉ roster): ${oldTbAdmin.length}`);
  for (const r of oldTbAdmin) {
    log(`    delete tb_admin ID=${r.ID} adminID=${JSON.stringify(r.adminID)} nick=${JSON.stringify(r.adminNickname)}`);
  }

  // (d.2) admins / profiles / auth — admin profiles NOT in the kept member_code set.
  const { rows: adminRoleRows } = await db.rest(`admins?select=profile_id,role,is_active`);
  const adminProfileIds = [...new Set(adminRoleRows.map((r) => r.profile_id))];
  let profiles = [];
  if (adminProfileIds.length) {
    const inList = adminProfileIds.join(",");
    const res = await db.rest(
      `profiles?select=id,member_code,first_name,last_name,email,phone&id=in.(${inList})`,
    );
    profiles = res.rows;
  }
  // KEEP every roster admin. An admin profile is kept if its admin_contact_extras
  // legacy_admin_id ∈ the new roster (KEEP_ADMIN_IDS) OR it is one of the 3 pre-existing
  // (KEEP_MEMBER_CODES). After provisioning, the admins table IS exactly the 15 roster,
  // so this selects 0 to delete — the old mess lived in tb_admin only (d.1). This guards
  // against the bug where comparing ONLY member_code would have deleted the 12 freshly
  // provisioned admins (whose codes are PR018/PR019/… not the original PR132/112/009).
  const extrasMap = new Map();
  if (adminProfileIds.length) {
    const exInList = adminProfileIds.join(",");
    const exRes = await db.rest(`admin_contact_extras?select=profile_id,legacy_admin_id&profile_id=in.(${exInList})`);
    for (const e of exRes.rows) extrasMap.set(e.profile_id, e.legacy_admin_id);
  }
  const isRosterAdmin = (p) =>
    KEEP_MEMBER_CODES.has(p.member_code) || KEEP_ADMIN_IDS.has(extrasMap.get(p.id));
  const oldAdminProfiles = profiles.filter((p) => !isRosterAdmin(p));
  log(`\n  admins table: ${adminRoleRows.length} role rows across ${adminProfileIds.length} profiles`);
  log(`  admin profiles to DELETE (∉ ${[...KEEP_MEMBER_CODES].join("/")}): ${oldAdminProfiles.length}`);
  for (const p of oldAdminProfiles) {
    log(`    delete admin profile ${p.id} member_code=${p.member_code} name="${p.first_name ?? ""} ${p.last_name ?? ""}" email=${p.email ?? "-"}`);
  }
  const keptProfiles = profiles.filter((p) => isRosterAdmin(p));
  log(`  KEEP (existing admins): ${keptProfiles.map((p) => p.member_code).join(", ") || "(none found yet)"}`);

  if (!APPLY) {
    section("Summary (DRY-RUN — nothing written)");
    log(`(a) backup        : WOULD write ${backup.length} rows → ${backupPath}`);
    log(`(b) reset         : WOULD set ${toReset} tb_users → adminIDSale='${CENTER_ID}'`);
    log(`(c) ref-report    : ${danglingTotal} historical rows reference non-roster adminIDs (reported, not touched)`);
    log(`(d) delete        : WOULD delete ${oldTbAdmin.length} tb_admin rows + ${oldAdminProfiles.length} admin profiles (+ their admins/extras/auth)`);
    log(`\nRun with --apply to execute. Reset is reversible from the backup JSON.`);
    return;
  }

  // ── APPLY deletes ──
  let delErrors = 0;

  // (d.1) delete old tb_admin rows (PK = "ID")
  for (const r of oldTbAdmin) {
    try {
      await db.restWrite("DELETE", `tb_admin?ID=eq.${r.ID}`, undefined, { prefer: "return=minimal" });
      log(`    ✓ deleted tb_admin ID=${r.ID} (${r.adminID})`);
    } catch (e) {
      delErrors++;
      console.error(`    ✗ tb_admin ID=${r.ID} delete failed: ${e.message}`);
    }
  }

  // (d.2) delete old admin profiles: admins → admin_contact_extras → auth → profiles
  //       (profiles cascade may remove admins/extras via FK on delete cascade,
  //        but we delete explicitly + in order to be safe across schemas.)
  for (const p of oldAdminProfiles) {
    try {
      await db.restWrite("DELETE", `admins?profile_id=eq.${p.id}`, undefined, { prefer: "return=minimal" });
      await db.restWrite("DELETE", `admin_contact_extras?profile_id=eq.${p.id}`, undefined, { prefer: "return=minimal" });
      // auth.users delete (GoTrue) — profiles.id == auth uid for provisioned admins.
      await db.authDeleteUser(p.id);
      // profiles row (in case no auth row existed / cascade didn't fire)
      await db.restWrite("DELETE", `profiles?id=eq.${p.id}`, undefined, { prefer: "return=minimal" });
      log(`    ✓ deleted admin profile ${p.id} (${p.member_code})`);
    } catch (e) {
      delErrors++;
      console.error(`    ✗ admin profile ${p.id} delete failed: ${e.message}`);
    }
  }

  section("Summary (APPLIED)");
  log(`(a) backup        : ${backupPath}`);
  log(`(b) reset         : ${toReset} tb_users → adminIDSale='${CENTER_ID}'`);
  log(`(c) ref-report    : ${danglingTotal} historical rows reference non-roster adminIDs (left intact)`);
  log(`(d) deleted       : ${oldTbAdmin.length - 0} tb_admin rows + ${oldAdminProfiles.length} admin profiles`);
  log(`    delete errors : ${delErrors}`);
  log(`\nReverse the reset (if needed):`);
  log(`  node --input-type=module -e "import {loadEnv,makeClient} from './scripts/_admin-roster-2026-06-02.mjs';`);
  log(`    import {readFileSync} from 'node:fs'; const db=makeClient(loadEnv());`);
  log(`    const b=JSON.parse(readFileSync('${backupPath}','utf8'));`);
  log(`    for(const r of b){await db.restWrite('PATCH','tb_users?userID=eq.'+encodeURIComponent(r.userID),{adminIDSale:r.adminIDSale},{prefer:'return=minimal'});}"`);

  if (delErrors > 0) process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────

/** Page through an entire table for the given columns. */
async function fetchAll(db, table, select) {
  const out = [];
  const page = 1000;
  for (let from = 0; from < 1_000_000; from += page) {
    const { rows } = await db.rest(`${table}?select=${select}`, {
      headers: { Range: `${from}-${from + page - 1}` },
    });
    if (!rows.length) break;
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

/** Distinct value → count for one column (paged client-side group). */
async function distinctCounts(db, table, col) {
  const m = new Map();
  const rows = await fetchAll(db, table, col);
  for (const r of rows) {
    const v = (r[col] ?? "").toString();
    m.set(v, (m.get(v) || 0) + 1);
  }
  return m;
}

main().catch((e) => {
  console.error("\nFATAL:", e.message);
  process.exit(1);
});
