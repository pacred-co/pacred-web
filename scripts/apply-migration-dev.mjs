#!/usr/bin/env node
/**
 * DEV migration applier — sibling of apply-migration-generic.mjs (which is
 * hardcoded to the PROD ref). This one derives the Supabase project ref from
 * NEXT_PUBLIC_SUPABASE_URL in the loaded env, so it always targets whatever the
 * local .env.local points at (the DEV project on dev machines). Use ONLY for
 * idempotent additive migrations on DEV, for browser testing before prod-apply.
 *
 * Usage:
 *   node --env-file=.env.local scripts/apply-migration-dev.mjs supabase/migrations/0173_xxx.sql
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const file = process.argv[2];
if (!file) {
  console.error("usage: node --env-file=.env.local scripts/apply-migration-dev.mjs <migration-path>");
  process.exit(1);
}
const sql = readFileSync(resolve(process.cwd(), file), "utf-8");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ref = (url.match(/https:\/\/([a-z0-9]+)\./) || [])[1];
const pw = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!ref || !pw) {
  console.error("FATAL: need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD in env");
  process.exit(1);
}
console.log(`\n=== ${file} → DEV ref=${ref} · ${sql.length} chars ===`);

const hosts = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
const attempts = hosts.flatMap((h) => [5432, 6543].map((port) => ({
  label: `${h}:${port}`,
  conn: `postgresql://postgres.${ref}:${encodeURIComponent(pw)}@${h}:${port}/postgres`,
})));

let client = null;
for (const a of attempts) {
  try {
    const c = new Client({ connectionString: a.conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
    await c.connect();
    console.log(`✓ connected ${a.label}`);
    client = c;
    break;
  } catch (e) { console.log(`  ✗ ${a.label}: ${e.code ?? e.message}`); }
}
if (!client) { console.error("FATAL: no connection"); process.exit(2); }

try { await client.query(sql); console.log("✓ APPLIED"); }
catch (e) { console.error("✗ FAILED:", e.code, e.message); if (e.detail) console.error("  ", e.detail); process.exit(3); }
finally { await client.end(); }
