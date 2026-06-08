#!/usr/bin/env node
/**
 * Dry-run / apply for migration 0148_freight_doc_rls.sql.
 *
 * Default = dry-run: BEGIN; <migration>; ROLLBACK; — parses the SQL, runs
 * every statement in a transaction, then ROLLBACKs. Any syntax error,
 * missing table, bad column name, or permission issue surfaces here BEFORE
 * touching prod. Prints the affected policy names from the migration.
 *
 * Pass `--apply` to flip ROLLBACK → COMMIT. Owner-only action — do NOT
 * pass `--apply` from an agent run.
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD='<pw>' node scripts/apply-0148-rls-dryrun.mjs
 *   SUPABASE_DB_PASSWORD='<pw>' node scripts/apply-0148-rls-dryrun.mjs --apply
 *
 * Connection strategy mirrors scripts/apply-migration-generic.mjs:
 *   try aws-1 session pooler → aws-1 tx pooler → aws-0 (fallback) →
 *   direct db.<ref> (IPv6-only · slow on IPv4-only networks).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const MIGRATION_PATH = resolve(process.cwd(), "supabase/migrations/0148_freight_doc_rls.sql");
const PROJECT_REF = "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PASSWORD) {
  console.error("FATAL: SUPABASE_DB_PASSWORD (or PG_PASSWORD) not set.");
  console.error("Set it from .env.local or paste the prod DB pw on the command line.");
  process.exit(1);
}

const POOLER_HOSTS = [
  "aws-1-ap-southeast-1.pooler.supabase.com",
  "aws-0-ap-southeast-1.pooler.supabase.com",
];
const POOLER_USER = `postgres.${PROJECT_REF}`;
const DIRECT_HOST = `db.${PROJECT_REF}.supabase.co`;

const sql = readFileSync(MIGRATION_PATH, "utf-8");
console.log(`\n=== 0148_freight_doc_rls.sql · ${sql.split("\n").length} lines · ${sql.length} chars ===`);
console.log(`Mode: ${APPLY ? "🔴 APPLY (committing)" : "🟢 DRY-RUN (will ROLLBACK)"}`);

// Extract policy names from the SQL for the report
const policyMatches = [...sql.matchAll(/create policy ([a-z_]+)\s+on\s+(public\.[a-z_]+)/gi)];
console.log(`\nPolicies created/replaced (${policyMatches.length}):`);
for (const m of policyMatches) {
  console.log(`  • ${m[1].padEnd(40)} on ${m[2]}`);
}
const dropMatches = [...sql.matchAll(/drop policy if exists ([a-z_]+)\s+on\s+(public\.[a-z_]+)/gi)];
console.log(`\nPolicies dropped first (${dropMatches.length}):`);
for (const m of dropMatches) {
  console.log(`  • ${m[1].padEnd(40)} on ${m[2]}`);
}

async function tryConnect(label, conn) {
  console.log(`\nTrying ${label}…`);
  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  console.log("✓ Connected.");
  return client;
}

let client = null;
const attempts = [
  ...POOLER_HOSTS.flatMap((h) => [
    { label: `session-pooler ${h}:5432`,     conn: `postgresql://${POOLER_USER}:${encodeURIComponent(PASSWORD)}@${h}:5432/postgres` },
    { label: `transaction-pooler ${h}:6543`, conn: `postgresql://${POOLER_USER}:${encodeURIComponent(PASSWORD)}@${h}:6543/postgres` },
  ]),
  { label: "direct 5432", conn: `postgresql://postgres:${encodeURIComponent(PASSWORD)}@${DIRECT_HOST}:5432/postgres` },
];
for (const a of attempts) {
  try { client = await tryConnect(a.label, a.conn); break; }
  catch (e) { console.log(`  ✗ ${e.code ?? "error"}: ${e.message}`); }
}
if (!client) { console.error("\nFATAL: could not connect to prod via any path."); process.exit(2); }

const t0 = Date.now();
try {
  await client.query("BEGIN");
  console.log("\n=== Running migration in transaction ===");
  await client.query(sql);
  console.log(`✓ SQL executed in ${Date.now() - t0}ms`);

  // Post-run sanity: list the live policies on the 4 target tables so the
  // owner can eyeball the new state. The DROP-then-CREATE sequence in the
  // migration means we should see exactly the policies declared above —
  // plus any pre-existing customer-side / seq policies that aren't touched
  // (tax_invoices_self_read, freight_invoices_customer_read, etc.).
  const tables = [
    "tax_invoices",
    "tax_invoice_lines",
    "freight_invoices",
    "freight_invoice_lines",
  ];
  console.log("\n=== Live policies after migration (inside txn) ===");
  for (const t of tables) {
    const r = await client.query(
      `select policyname, cmd
         from pg_policies
        where schemaname = 'public' and tablename = $1
        order by policyname`,
      [t],
    );
    console.log(`  ${t}:`);
    for (const row of r.rows) {
      console.log(`    • ${row.policyname.padEnd(40)} (${row.cmd})`);
    }
  }

  if (APPLY) {
    await client.query("COMMIT");
    console.log(`\n🔴 COMMITTED · 0148 is live on prod (${Date.now() - t0}ms total)`);
  } else {
    await client.query("ROLLBACK");
    console.log(`\n🟢 DRY RUN OK · ROLLED BACK · ready to apply (${Date.now() - t0}ms total)`);
    console.log("Re-run with `--apply` to commit (owner-only).");
  }
} catch (err) {
  try { await client.query("ROLLBACK"); } catch {}
  console.error("\n✗ MIGRATION FAILED:", err.code, err.message);
  if (err.detail) console.error("  Detail:", err.detail);
  if (err.hint)   console.error("  Hint:",   err.hint);
  process.exit(3);
} finally {
  await client.end();
}
