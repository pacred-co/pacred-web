#!/usr/bin/env node
/**
 * scripts/reassign-member-code.mjs — GENERALIZED "รันเลข PR ลูกค้าใหม่".
 *
 * Owner 2026-07-06 — re-assign a customer a NEW PR code (the LOWEST VACANT gap,
 * or an explicit --to), MOVE ALL of the customer's data to the new code, FREE
 * the old code, and preserve login + everything (receipts etc.). Only the PR
 * number changes.
 *
 * Mirrors the proven precedents:
 *   - scripts/move-userid-pr999-pr168-2026-07-02.mjs  (introspect-all + ONE txn)
 *   - scripts/swap-userid-pr10683-pr121.mjs           (lowest-clean-gap search)
 *   - scripts/fix-auth-email-pr168-pr540-2026-07-02.mjs (realign auth email so
 *     the NATIVE login `legacySyntheticEmail(code)` still resolves → login works)
 *
 * WHAT it does (single customer, NOT a swap):
 *   1. Sanity — the customer exists at --from in tb_users; the target is VACANT
 *      (no tb_users/profiles collision) → else abort.
 *   2. Introspect information_schema for EVERY userid column
 *      (userid / userID / member_code) — so NO table is missed (52+ tables).
 *   3. Resolve --to: explicit code, or "auto" = the LOWEST VACANT PR gap that is
 *      ALSO clean (zero rows in every userid table) so nothing collides / mixes.
 *   4. ONE pg transaction: UPDATE every userid reference old→new + tb_users PK +
 *      profiles.member_code. Verify per-table counts; ROLLBACK on any mismatch.
 *   5. AFTER commit: realign the auth.users email to pcs-legacy-<newcode> via the
 *      Supabase admin API (updateUserById keeps auth.identities consistent — a
 *      raw SQL email UPDATE would leave the identity stale → login breaks). Then
 *      keep profiles.email in sync (display only).
 *
 * DRY-RUN by default (prints the resolved code + per-table counts + the plan +
 * the auth-email change). Pass --apply to execute (writes a JSON backup first).
 *
 *   # dry-run (explicit target):
 *   SUPABASE_DB_PASSWORD='...' node --env-file=.env.local scripts/reassign-member-code.mjs --from PR10794 --to PR034
 *   # dry-run (auto lowest-vacant):
 *   SUPABASE_DB_PASSWORD='...' node --env-file=.env.local scripts/reassign-member-code.mjs --from PR10794 --to auto
 *   # execute:
 *   SUPABASE_DB_PASSWORD='...' node --env-file=.env.local scripts/reassign-member-code.mjs --from PR10794 --to auto --apply
 *
 * The `--env-file=.env.local` supplies NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY for the auth-email step; SUPABASE_DB_PASSWORD is the
 * prod DB password for the pg table-move step.
 */
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import {
  computeLowestVacantPrCode,
  describeReassignPlan,
  shouldRealignAuthEmail,
  PR_CODE_RE,
} from "../lib/admin/reassign-member-code.ts";

const { Client } = pg;
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
function arg(name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}
const FROM = (arg("--from") || "").trim().toUpperCase();
const TO_RAW = (arg("--to") || "").trim();
if (!FROM || !PR_CODE_RE.test(FROM)) {
  console.error("FATAL: --from <PRxxxx> is required (e.g. --from PR10794)");
  process.exit(1);
}
if (!TO_RAW) {
  console.error("FATAL: --to <PRxxxx> | auto is required");
  process.exit(1);
}
const TO_AUTO = TO_RAW.toLowerCase() === "auto";
const TO_EXPLICIT = TO_AUTO ? null : TO_RAW.toUpperCase();
if (TO_EXPLICIT && !PR_CODE_RE.test(TO_EXPLICIT)) {
  console.error(`FATAL: --to must be a PR code or "auto" (got ${TO_RAW})`);
  process.exit(1);
}

const PROJECT_REF = "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PASSWORD) { console.error("FATAL: SUPABASE_DB_PASSWORD (or PG_PASSWORD) not set"); process.exit(1); }
const POOLER_HOST = "aws-0-ap-southeast-1.pooler.supabase.com";
const POOLER_USER = `postgres.${PROJECT_REF}`;
const DIRECT_HOST = `db.${PROJECT_REF}.supabase.co`;
const enc = encodeURIComponent(PASSWORD);
const ATTEMPTS = [
  [`session-pooler 5432`, `postgresql://${POOLER_USER}:${enc}@${POOLER_HOST}:5432/postgres`],
  [`txn-pooler 6543`,     `postgresql://${POOLER_USER}:${enc}@${POOLER_HOST}:6543/postgres`],
  [`direct 5432`,         `postgresql://postgres:${enc}@${DIRECT_HOST}:5432/postgres`],
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

/**
 * MONEY-SAFETY invariant. A code move is an IDENTITY move: the ONLY thing that
 * may change is the code column itself — never an amount / status / price.
 *
 * Rather than hand-listing money columns (which drifts as tables are added — the
 * whole reason this script introspects), fingerprint EVERY row the move touches
 * with the code column REMOVED (`to_jsonb(row) - '<codecol>'`). Taken before the
 * UPDATEs at the OLD code and after them at the NEW code, an identical
 * (rowCount, md5) pair per table proves every other column — wallet balance,
 * order totals, statuses, rate cards — is byte-identical. Strictly stronger than
 * "wallet + Σ orders unchanged", and it can never miss a column.
 *
 * `- $2::text[]` deletes the keys outright (no string-replace false positives),
 * and jsonb normalises key order, so the digest is deterministic.
 *
 * AUDIT_COLS are excluded because a BEFORE-UPDATE trigger legitimately rewrites
 * them on ANY update — `profiles` carries `profiles_updated_at_trigger` →
 * `set_updated_at()`, so `updated_at` MUST move when member_code moves. A
 * timestamp is not money; every other column still has to match byte-for-byte.
 */
const AUDIT_COLS = ["updated_at", "updatedat", "modified_at", "modifiedat"];
async function fingerprint(c, tables, code) {
  const out = {};
  for (const t of tables) {
    const r = (await c.query(
      `SELECT count(*)::int AS n,
              md5(coalesce(string_agg(x, '|' ORDER BY x), '')) AS digest
         FROM (SELECT (to_jsonb(r) - $2::text[])::text AS x
                 FROM "${t.table}" r WHERE r."${t.column}" = $1) s`,
      [code, [t.column, ...AUDIT_COLS]])).rows[0];
    out[`${t.table}.${t.column}`] = { n: r.n, digest: r.digest };
  }
  return out;
}

/**
 * Human-readable money read-out (what the owner actually wants to eyeball). The
 * `fingerprint` above is the authoritative assertion; this just names the numbers.
 * Each probe is skipped if the table/column is absent — no hard-coded schema
 * assumption can break the move.
 */
const MONEY_PROBES = [
  { table: "tb_wallet",       column: "userid", sum: "wallettotal",     label: "wallet balance" },
  { table: "tb_cash_back",    column: "userid", sum: "cbtotal",         label: "cash-back" },
  { table: "tb_header_order", column: "userid", sum: "htotalpriceuser", label: "Σ shop orders" },
  { table: "tb_forwarder",    column: "userid", sum: "ftotalprice",     label: "Σ forwarder freight" },
];
async function moneyReadout(c, code) {
  const out = {};
  for (const p of MONEY_PROBES) {
    try {
      const r = (await c.query(
        `SELECT count(*)::int AS n, coalesce(sum("${p.sum}"),0)::text AS total
           FROM "${p.table}" WHERE "${p.column}" = $1`, [code])).rows[0];
      out[p.label] = { rows: r.n, total: r.total };
    } catch { /* table/column absent — the fingerprint still covers it */ }
  }
  return out;
}

async function main() {
  console.log(`\n=== REASSIGN customer code · ${APPLY ? "APPLY" : "DRY-RUN"} ===`);
  console.log(`    from ${FROM} → ${TO_AUTO ? "auto (lowest vacant)" : TO_EXPLICIT}\n`);
  const c = await connect();

  // 1. Sanity — the customer exists at FROM (userID is camelCase).
  const who = (await c.query(
    `SELECT "userID","userName","userLastName","userTel" FROM tb_users WHERE "userID" = $1`, [FROM])).rows;
  if (!who.length) { console.error(`✗ ${FROM} not found in tb_users — abort`); process.exit(1); }
  const cust = who[0];
  console.log(`Customer: ${cust.userID} = ${cust.userName} ${cust.userLastName} (${cust.userTel})`);

  // 2. Introspect EVERY customer-code column.
  const cols = (await c.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name IN ('userid','userID','member_code')
      ORDER BY table_name`)).rows;
  console.log(`\nScanning ${cols.length} customer-code columns for ${FROM}…`);

  // Per-column count for FROM (skip columns with 0). Introspection-driven, not hardcoded.
  const tables = [];
  for (const t of cols) {
    let rows;
    try {
      rows = (await c.query(
        `SELECT count(*)::int c FROM "${t.table_name}" WHERE "${t.column_name}" = $1`, [FROM])).rows;
    } catch (e) { console.log(`  ⚠ skip ${t.table_name}.${t.column_name}: ${e.message}`); continue; }
    const n = rows[0]?.c ?? 0;
    if (n) {
      console.log(`  ${(t.table_name + "." + t.column_name).padEnd(38)} ${FROM}=${n}`);
      tables.push({ table: t.table_name, column: t.column_name, rows: n });
    }
  }

  // 3. Build the registry (used PR codes across BOTH registries).
  const reg = (await c.query(
    `SELECT "userID" code FROM tb_users WHERE "userID" ~ '^PR[0-9]+$'
      UNION SELECT member_code FROM profiles WHERE member_code ~ '^PR[0-9]+$'`)).rows;
  const usedCodes = reg.map((r) => r.code);

  // Resolve TO — explicit (verify vacant) OR auto (lowest clean vacant gap).
  let TO = null;
  if (TO_EXPLICIT) {
    TO = TO_EXPLICIT;
    if (TO === FROM) { console.error("✗ --to equals --from — nothing to do"); process.exit(1); }
    // Target MUST be vacant in both registries.
    const collide = (await c.query(
      `SELECT 1 FROM tb_users WHERE "userID"=$1 UNION SELECT 1 FROM profiles WHERE member_code=$1 LIMIT 1`, [TO])).rows;
    if (collide.length) { console.error(`✗ target ${TO} is already in use (tb_users/profiles) — abort`); process.exit(1); }
    // And clean of orphan rows in every userid table (belt-and-braces).
    let dirty = null;
    for (const t of tables) {
      const hit = await c.query(`SELECT 1 FROM "${t.table}" WHERE "${t.column}"=$1 LIMIT 1`, [TO]);
      if (hit.rows.length) { dirty = `${t.table}.${t.column}`; break; }
    }
    if (dirty) { console.error(`✗ target ${TO} has orphan rows in ${dirty} — abort (choose a clean code)`); process.exit(1); }
  } else {
    // auto: the lowest vacant registry code that is ALSO clean of orphan rows.
    const used = new Set(usedCodes);
    let cand = computeLowestVacantPrCode([...used]);
    for (;;) {
      let dirty = false;
      for (const t of tables) {
        const hit = await c.query(`SELECT 1 FROM "${t.table}" WHERE "${t.column}"=$1 LIMIT 1`, [cand]);
        if (hit.rows.length) { dirty = true; break; }
      }
      if (!dirty) { TO = cand; break; }
      console.log(`  (gap ${cand} skipped — orphan rows exist somewhere)`);
      used.add(cand);                       // treat as taken, keep climbing
      cand = computeLowestVacantPrCode([...used]);
    }
  }

  // Current auth email (for the plan + realignment).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supa = url && sr ? createClient(url, sr, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
  let authId = null, authEmailFrom = null, migratedFromPcs = null;
  {
    const prof = (await c.query(
      `SELECT id, email, migrated_from_pcs FROM profiles WHERE member_code=$1`, [FROM])).rows[0];
    authId = prof?.id ?? null;
    migratedFromPcs = prof?.migrated_from_pcs ?? null;
    if (authId && supa) {
      const { data } = await supa.auth.admin.getUserById(authId);
      authEmailFrom = data?.user?.email ?? null;
    }
  }
  // Realign the auth email ONLY for a code-keyed (migrated) account — see
  // shouldRealignAuthEmail. A NATIVE customer's credential is their phone/own
  // email; stamping a synthetic one on them plants a bogus credential.
  const realignAuth = shouldRealignAuthEmail({ migratedFromPcs, authUserId: authId });

  const plan = describeReassignPlan({ fromCode: FROM, toCode: TO, tables, authEmailFrom });
  console.log(`\nLowest/target code → ${TO}`);
  console.log(`\nPLAN (${plan.tables.length} tables · ${plan.totalRows} rows):`);
  console.log(`  MOVE   ${FROM} → ${TO}   (all userid references)`);
  if (realignAuth) {
    console.log(`  AUTH   ${authEmailFrom ?? "(none)"} → ${plan.authEmailTo}   [auth.users id ${authId?.slice(0, 8) ?? "?"}]`);
  } else {
    const why = !authId
      ? "no auth.users row (never provisioned)"
      : `NATIVE account (migrated_from_pcs=${migratedFromPcs}) — credential is phone/own email, NOT the PR code`;
    console.log(`  AUTH   untouched — ${why}`);
    console.log(`         current auth email: ${authEmailFrom ?? "(none)"}  ·  login keeps working via profiles.member_code → phone`);
  }

  // Money read-out (the fingerprint inside the txn is the hard assertion).
  const moneyBefore = await moneyReadout(c, FROM);
  console.log(`\nMONEY (must be IDENTICAL after — identity move, no amount may change):`);
  for (const [k, v] of Object.entries(moneyBefore)) console.log(`  ${k.padEnd(22)} ${v.total.padStart(14)}   [${v.rows} rows]`);

  if (!APPLY) {
    console.log(`\n— DRY-RUN — owner: confirm ${FROM} → ${TO}, then re-run with --apply.\n`);
    await c.end();
    return;
  }

  // 4. Backup identity + plan before mutating.
  const bkPath = `reassign-${FROM}-to-${TO}-backup-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(bkPath, JSON.stringify({ from: FROM, to: TO, customer: cust, authId, authEmailFrom, plan }, null, 2));
  console.log(`\n✓ backup → ${bkPath}`);

  // 5. ONE transaction: move every userid reference FROM→TO. Verify + rollback.
  console.log("\nApplying table move (single transaction)…");
  await c.query("BEGIN");
  let moved = 0;
  try {
    // Snapshot every touched row (code column excluded) BEFORE the writes.
    const before = await fingerprint(c, plan.tables, FROM);

    for (const t of plan.tables) {
      const r = await c.query(`UPDATE "${t.table}" SET "${t.column}"=$1 WHERE "${t.column}"=$2`, [TO, FROM]);
      if (r.rowCount !== t.rows) {
        throw new Error(`row-count mismatch on ${t.table}.${t.column}: expected ${t.rows}, updated ${r.rowCount}`);
      }
      moved += r.rowCount;
    }
    // No FROM rows may remain anywhere (fail-closed verify inside the txn).
    for (const t of plan.tables) {
      const left = (await c.query(`SELECT count(*)::int c FROM "${t.table}" WHERE "${t.column}"=$1`, [FROM])).rows[0].c;
      if (left) throw new Error(`verify failed: ${left} ${FROM} rows still in ${t.table}.${t.column}`);
    }
    // MONEY-SAFETY: the same rows must now sit at TO, byte-identical in every
    // non-code column. Any drift = something other than the code changed → abort.
    const after = await fingerprint(c, plan.tables, TO);
    for (const key of Object.keys(before)) {
      const b = before[key], a = after[key];
      if (a.n !== b.n) throw new Error(`invariant failed: ${key} had ${b.n} rows at ${FROM}, ${a.n} at ${TO}`);
      if (a.digest !== b.digest) throw new Error(`invariant failed: ${key} row content changed (only the code column may change)`);
    }
    // The human money numbers must match too (redundant with the digest, but it
    // is the number the owner reads — assert it explicitly rather than trust).
    const mBefore = moneyBefore, mAfter = await moneyReadout(c, TO);
    for (const [k, v] of Object.entries(mBefore)) {
      if (mAfter[k]?.total !== v.total) throw new Error(`invariant failed: ${k} ${v.total} → ${mAfter[k]?.total}`);
    }
    await c.query("COMMIT");
    console.log(`✓ COMMIT · ${FROM}→${TO}: ${moved} rows across ${plan.tables.length} tables`);
  } catch (e) {
    await c.query("ROLLBACK");
    console.error(`✗ ROLLBACK — ${e.message}\n  (nothing changed)`);
    process.exit(3);
  }

  // 6. AFTER commit — realign the auth email so NATIVE login still resolves.
  //    updateUserById keeps auth.identities consistent (raw SQL would not).
  if (realignAuth && supa) {
    const { error: aeErr } = await supa.auth.admin.updateUserById(authId, { email: plan.authEmailTo, email_confirm: true });
    if (aeErr) {
      console.error(`\n✗ AUTH EMAIL realign FAILED: ${aeErr.message}`);
      console.error(`  ⚠ TABLES ARE MOVED to ${TO} but the auth email is still ${authEmailFrom}.`);
      console.error(`  → login-by-code will miss until you run: updateUserById(${authId}, { email: '${plan.authEmailTo}', email_confirm:true })`);
      console.error(`  (or free the target email first if a stale user holds it, per fix-auth-email precedent).`);
      process.exit(4);
    }
    console.log(`✓ auth email → ${plan.authEmailTo}`);
    // Keep profiles.email in sync (display only).
    const { error: peErr } = await c.query(`UPDATE profiles SET email=$1 WHERE id=$2`, [plan.authEmailTo, authId]);
    if (peErr) console.log(`  ⚠ profiles.email sync failed (non-fatal): ${peErr.message}`);
  } else if (realignAuth && !supa) {
    console.error(`\n✗ auth realign REQUIRED for this migrated account but NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing.`);
    console.error(`  ⚠ TABLES ARE MOVED to ${TO} — re-run the realign with --env-file=.env.local before the customer logs in.`);
    process.exit(4);
  } else {
    console.log(`\n· auth untouched (correct — this account is not code-keyed; see shouldRealignAuthEmail).`);
  }

  // 7. Verify tb_users + the money read-out + a login smoke hint.
  const v = (await c.query(`SELECT "userID","userName","userLastName","userTel" FROM tb_users WHERE "userID"=$1`, [TO])).rows;
  console.log("\nVerify tb_users:");
  for (const r of v) console.log(`  ${r.userID.padEnd(9)} = ${r.userName} ${r.userLastName} (${r.userTel})`);
  const moneyAfter = await moneyReadout(c, TO);
  console.log("Verify money (must equal the pre-move read-out):");
  for (const [k, val] of Object.entries(moneyAfter)) console.log(`  ${k.padEnd(22)} ${val.total.padStart(14)}   [${val.rows} rows]`);
  console.log(`\n✓ DONE. ${cust.userName} ${cust.userLastName} = ${TO} (was ${FROM}) · ${FROM} is now VACANT.`);
  console.log(
    realignAuth
      ? `  Login: native email ${plan.authEmailTo} — password unchanged (legacy passTam + Supabase Auth both intact).`
      : `  Login: unchanged — the credential (phone / own email) is not keyed to the PR code; login-by-code now resolves ${TO}.`,
  );
  console.log("");
  await c.end();
}
main().catch((e) => { console.error("✗ uncaught:", e); process.exit(1); });
