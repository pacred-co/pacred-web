#!/usr/bin/env node
/**
 * scripts/fix-juristic-pr075-2026-07-03.mjs
 *
 * Owner 2026-07-03 — the juristic save flow fails for PR075 ("บันทึกไม่ได้").
 *
 * ROOT CAUSE (see actions/admin/customer-profile.ts:558 + profile-sections.tsx):
 *   The CorporateEditor pre-fills form.corporatenumber VERBATIM from the stored
 *   tb_corporate.corporatenumber and only strips non-digits on subsequent
 *   keystrokes — NOT on pre-fill. If the legacy row stored a dirty tax id
 *   (dash / space / apostrophe / wrong length), an admin who clicks
 *   แก้ไข → บันทึก without retyping submits the dirty string → the strict server
 *   regex /^\d{13}$/ rejects → the form shows "เลขผู้เสียภาษีต้อง 13 หลัก" and
 *   never saves. The same blocks on a whitespace-only corporatename/address.
 *
 *   The CODE fix (client normalize-on-prefill + strict server) is already in
 *   place. This script is the optional DATA-hygiene companion: it makes the
 *   STORED row clean so the round-trips (including tax-invoice reads) see a
 *   canonical value, and it self-heals a drifted userCompany flag.
 *
 * WHAT IT TOUCHES (corporate PROFILE only — NEVER tax/billing/money logic):
 *   - tb_corporate.corporatenumber  → strip to digits ONLY IF result is exactly
 *                                      13 digits (else leaves it for a human to
 *                                      correct — never guesses/truncates).
 *   - tb_corporate.corporatename     → .trim() if it had leading/trailing space.
 *   - tb_corporate.corporateaddress  → .trim() if it had leading/trailing space.
 *   - tb_users.userCompany           → set '1' ONLY IF a tb_corporate row EXISTS
 *                                      but the flag isn't '1' (half-done convert).
 *
 *   It does NOT change corporatestatus (approval is a human decision), and it
 *   does NOT touch any tax-invoice / billing / wallet / commission table.
 *
 * DRY-RUN by default. --apply writes a JSON backup first, then runs ONE txn
 * (ROLLBACK on any error = no half-state). A human runs it; the DB password is
 * read from the environment — it is NEVER hardcoded.
 *
 *   SUPABASE_DB_PASSWORD='...' node scripts/fix-juristic-pr075-2026-07-03.mjs
 *   SUPABASE_DB_PASSWORD='...' node scripts/fix-juristic-pr075-2026-07-03.mjs --apply
 *
 * Optionally target other userids: pass them as CLI args, e.g.
 *   ... fix-juristic-pr075-2026-07-03.mjs PR075 PR112 --apply
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");
// Any non-flag arg is a target userid; default to PR075.
const TARGETS = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const USERIDS = (TARGETS.length ? TARGETS : ["PR075"]).map((s) => s.toUpperCase());

const PROJECT_REF = "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PASSWORD) { console.error("FATAL: SUPABASE_DB_PASSWORD (or PG_PASSWORD) not set"); process.exit(1); }
const POOLER_HOST = "aws-0-ap-southeast-1.pooler.supabase.com";
const POOLER_HOST1 = "aws-1-ap-southeast-1.pooler.supabase.com";
const POOLER_USER = `postgres.${PROJECT_REF}`;
const DIRECT_HOST = `db.${PROJECT_REF}.supabase.co`;
const enc = encodeURIComponent(PASSWORD);
const ATTEMPTS = [
  [`pooler-1 5432`, `postgresql://${POOLER_USER}:${enc}@${POOLER_HOST1}:5432/postgres`],
  [`pooler-0 5432`, `postgresql://${POOLER_USER}:${enc}@${POOLER_HOST}:5432/postgres`],
  [`pooler-0 6543`, `postgresql://${POOLER_USER}:${enc}@${POOLER_HOST}:6543/postgres`],
  [`direct 5432`,   `postgresql://postgres:${enc}@${DIRECT_HOST}:5432/postgres`],
];
async function connect() {
  for (const [label, conn] of ATTEMPTS) {
    try {
      const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
      await c.connect();
      console.log(`✓ connected (${label})`);
      return c;
    } catch (e) { console.log(`  ✗ ${label}: ${e.code ?? "err"} ${e.message}`); }
  }
  throw new Error("could not connect to prod via any path");
}

const show = (v) => (v === null || v === undefined ? "«null»" : `"${v}"`);

async function main() {
  console.log(`\n=== FIX JURISTIC SAVE · ${APPLY ? "🚨 APPLY" : "🔸 DRY-RUN"} · targets: ${USERIDS.join(", ")} ===\n`);
  const c = await connect();

  const backup = [];
  const plan = [];

  for (const userid of USERIDS) {
    const [{ rows: uRows }, { rows: cRows }] = await Promise.all([
      c.query(`SELECT "userID","userCompany","userName","userLastName" FROM tb_users WHERE "userID" = $1`, [userid]),
      c.query(`SELECT id, userid, corporatenumber, corporatename, corporateaddress, corporatestatus
               FROM tb_corporate WHERE userid = $1`, [userid]),
    ]);

    const u = uRows[0];
    const corp = cRows[0];
    console.log(`— ${userid} —`);
    if (!u) { console.log(`  ⚠ NOT in tb_users — skip\n`); continue; }
    console.log(`  tb_users.userCompany = ${show(u.userCompany)}  (${u.userName ?? ""} ${u.userLastName ?? ""})`);
    if (!corp) {
      console.log(`  ⚠ no tb_corporate row — this customer is NOT juristic (nothing to repair here)\n`);
      continue;
    }
    console.log(`  tb_corporate.id=${corp.id} status=${show(corp.corporatestatus)}`);
    console.log(`    corporatenumber  = ${show(corp.corporatenumber)}  (len ${(corp.corporatenumber ?? "").length})`);
    console.log(`    corporatename    = ${show(corp.corporatename)}`);
    console.log(`    corporateaddress = ${show(corp.corporateaddress)}`);

    // Compute the clean values.
    const rawNum = corp.corporatenumber ?? "";
    const digits = rawNum.replace(/\D/g, "");
    const cleanNum = digits.length === 13 ? digits : null; // only auto-clean a value that becomes exactly 13 digits
    const cleanName = (corp.corporatename ?? "").trim();
    const cleanAddr = (corp.corporateaddress ?? "").trim();

    const set = {};
    if (cleanNum !== null && cleanNum !== rawNum) set.corporatenumber = cleanNum;
    if (cleanName !== (corp.corporatename ?? "")) set.corporatename = cleanName;
    if (cleanAddr !== (corp.corporateaddress ?? "")) set.corporateaddress = cleanAddr;

    // Flag repair: a corporate row exists → the customer IS juristic → flag must be '1'.
    const needFlag = u.userCompany !== "1";

    // Warn (don't auto-fix) the cases a human must handle.
    if (rawNum !== "" && cleanNum === null) {
      console.log(`    ⚠ tax id normalizes to ${digits.length} digits (not 13) — NOT auto-fixed. A human must correct it in the UI.`);
    }
    if (cleanName === "") console.log(`    ⚠ corporatename is empty after trim — NOT auto-fixed (needs real data).`);
    if (cleanAddr === "") console.log(`    ⚠ corporateaddress is empty after trim — NOT auto-fixed (needs real data).`);

    const hasCorpChange = Object.keys(set).length > 0;
    if (!hasCorpChange && !needFlag) {
      console.log(`  ✓ already clean — no change needed\n`);
      continue;
    }

    console.log(`  → PLANNED CHANGES:`);
    for (const [k, v] of Object.entries(set)) console.log(`     tb_corporate.${k}: ${show(corp[k])} → ${show(v)}`);
    if (needFlag) console.log(`     tb_users.userCompany: ${show(u.userCompany)} → "1"  (self-heal half-done convert)`);
    console.log();

    backup.push({
      userid,
      tb_users: { userCompany: u.userCompany },
      tb_corporate: { id: corp.id, corporatenumber: corp.corporatenumber, corporatename: corp.corporatename, corporateaddress: corp.corporateaddress },
    });
    plan.push({ userid, corpId: corp.id, set, needFlag });
  }

  if (plan.length === 0) { console.log("Nothing to change. Done."); await c.end(); return; }

  if (!APPLY) {
    console.log(`🔸 DRY-RUN — no writes. Re-run with --apply to execute (${plan.length} customer(s) will change).`);
    await c.end();
    return;
  }

  const backupPath = `/tmp/fix-juristic-backup-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`💾 backup written → ${backupPath}`);

  try {
    await c.query("BEGIN");
    for (const p of plan) {
      const cols = Object.keys(p.set);
      if (cols.length) {
        const sets = cols.map((k, i) => `${k} = $${i + 2}`).join(", ");
        await c.query(`UPDATE tb_corporate SET ${sets} WHERE id = $1`, [p.corpId, ...cols.map((k) => p.set[k])]);
      }
      if (p.needFlag) {
        await c.query(`UPDATE tb_users SET "userCompany" = '1' WHERE "userID" = $1`, [p.userid]);
      }
    }
    await c.query("COMMIT");
    console.log(`✅ APPLIED to ${plan.length} customer(s). Backup: ${backupPath}`);
  } catch (e) {
    await c.query("ROLLBACK");
    console.error(`✗ ERROR — ROLLED BACK (no change). ${e.message}`);
    process.exitCode = 1;
  }
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
