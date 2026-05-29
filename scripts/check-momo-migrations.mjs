#!/usr/bin/env node
/**
 * Probe prod for momo_* objects introduced by migrations 0119-0122.
 * Read-only. Reports which tables/columns exist so we know what to apply.
 *
 * Usage: PG_PASSWORD='<password>' node scripts/check-momo-migrations.mjs
 */
import pg from "pg";

const { Client } = pg;
const PROJECT_REF = "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.PG_PASSWORD;
if (!PASSWORD) {
  console.error("FATAL: PG_PASSWORD not set");
  process.exit(1);
}
const conn = `postgresql://postgres:${encodeURIComponent(PASSWORD)}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

await client.connect();

// Tables introduced by 0119-0122
const NEW_TABLES = [
  "momo_container_closed_tracks", // 0119
  "momo_raw_events",              // 0120
  "momo_import_track_status_dates", // 0120
  "momo_container_details",       // 0120
  "momo_sack_tracks",             // 0120
  "momo_tracking_links",          // 0121
  "momo_tracking_status_snapshots", // 0121
  "momo_tracking_status_history", // 0121
  "momo_sync_run_items",          // 0122
];

// Columns added to existing tables
const NEW_COLUMNS = [
  ["momo_import_tracks", "momo_container_ref"],   // 0119
  ["momo_container_closed", "momo_container_ref"], // 0119
  ["momo_container_closed", "container_batch_no"], // 0119
  ["momo_container_closed", "real_container_no"],  // 0119
  ["momo_sync_logs", "sync_run_id"],               // 0122
];

const tbl = await client.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND table_name = ANY($1)`,
  [NEW_TABLES]
);
const present = new Set(tbl.rows.map((r) => r.table_name));

console.log("── NEW TABLES (0119-0122) ──");
for (const t of NEW_TABLES) {
  console.log(`  ${present.has(t) ? "✅" : "❌ MISSING"}  ${t}`);
}

console.log("\n── NEW COLUMNS ──");
for (const [t, c] of NEW_COLUMNS) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [t, c]
  );
  console.log(`  ${r.rowCount ? "✅" : "❌ MISSING"}  ${t}.${c}`);
}

// Confirm legacy untouched (sanity)
console.log("\n── LEGACY SANITY (must exist, unchanged) ──");
for (const t of ["tb_forwarder", "tb_cnt", "momo_import_tracks", "momo_container_closed", "momo_sync_logs"]) {
  const r = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables
     WHERE table_schema='public' AND table_name=$1`,
    [t]
  );
  console.log(`  ${r.rows[0].n ? "✅" : "❌"}  ${t}`);
}

await client.end();
