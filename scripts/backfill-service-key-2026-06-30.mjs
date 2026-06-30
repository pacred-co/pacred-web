#!/usr/bin/env node
/**
 * Backfill `service_key` (+ fcl_lcl / direction) on the 4 live order tables
 * from each row's table identity + discriminator columns (owner 2026-06-30
 * "เอาทุกบริการของเราเข้า DB"). Run AFTER migration 0232 is applied.
 *
 *   tb_header_order  → shop_order      (mode from htransporttype)
 *   tb_payment       → yuan_transfer
 *   tb_forwarder     → import_cargo    (mode from container name, fcl_lcl=lcl)
 *   freight_shipments→ freight_import / freight_export (direction)
 *
 * ⚠️ REFERENCE / CATEGORIZATION ONLY (AGENTS.md §0e) — sets only service_key /
 *    fcl_lcl / direction. NEVER touches money / status / any other column.
 *
 * SAFE: DRY-RUN by DEFAULT (prints per-table counts). Pass --apply to write.
 * IDEMPOTENT: only updates rows where service_key IS NULL (re-runnable; a tagged
 *    row is never re-touched). fcl_lcl/direction set only when currently NULL.
 *
 * Connects via SUPABASE_DB_PASSWORD (pg Client · same path as
 * scripts/apply-migration-generic.mjs). PROJECT_REF defaults to prod; override
 * with PROJECT_REF env for dev.
 *
 * Run:
 *   SUPABASE_DB_PASSWORD='<pw>' node scripts/backfill-service-key-2026-06-30.mjs
 *   SUPABASE_DB_PASSWORD='<pw>' node scripts/backfill-service-key-2026-06-30.mjs --apply
 *   PROJECT_REF=lozntlidlqqzzcaathnm SUPABASE_DB_PASSWORD='<dev-pw>' node scripts/backfill-service-key-2026-06-30.mjs
 */
import pg from "pg";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const PROJECT_REF = process.env.PROJECT_REF || "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PASSWORD) {
  console.error("FATAL: SUPABASE_DB_PASSWORD (or PG_PASSWORD) not set");
  process.exit(1);
}

// ── derivation (mirror of lib/services/service-catalog.ts resolveServiceKey) ──
function modeFromLegacyType(t) {
  const s = (t ?? "").trim();
  if (s === "1") return "truck";
  if (s === "2") return "sea";
  if (s === "3") return "air";
  return null;
}
function modeFromCabinetName(name) {
  const n = (name ?? "").toUpperCase();
  if (!n) return null;
  if (n.includes("GZS") || n.includes("SEA")) return "sea";
  if (n.includes("GZA") || n.includes("AIR")) return "air";
  if (n.includes("GZE") || n.includes("EK")) return "truck"; // EK is ROAD
  return null;
}

// ── connect (aws-1 pooler first · same as apply-migration-generic.mjs) ──
const POOLER_HOSTS = [
  "aws-1-ap-southeast-1.pooler.supabase.com",
  "aws-0-ap-southeast-1.pooler.supabase.com",
];
const POOLER_USER = `postgres.${PROJECT_REF}`;
const DIRECT_HOST = `db.${PROJECT_REF}.supabase.co`;
const enc = encodeURIComponent(PASSWORD);
const attempts = [
  ...POOLER_HOSTS.flatMap((h) => [
    { label: `session-pooler ${h}:5432`, conn: `postgresql://${POOLER_USER}:${enc}@${h}:5432/postgres` },
    { label: `transaction-pooler ${h}:6543`, conn: `postgresql://${POOLER_USER}:${enc}@${h}:6543/postgres` },
  ]),
  { label: "direct 5432", conn: `postgresql://postgres:${enc}@${DIRECT_HOST}:5432/postgres` },
];

async function tryConnect(label, conn) {
  console.log(`Trying ${label}…`);
  const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
  await c.connect();
  console.log("✓ Connected.");
  return c;
}

let client = null;
for (const a of attempts) {
  try { client = await tryConnect(a.label, a.conn); break; }
  catch (e) { console.log(`  ✗ ${e.code ?? "error"}: ${e.message}`); }
}
if (!client) { console.error("FATAL: could not connect via any path."); process.exit(2); }

console.log(`\nTarget: ${PROJECT_REF}   mode: ${APPLY ? "APPLY ✍️" : "DRY-RUN 👀"}\n`);

const summary = [];
async function run(label, set, where, derive) {
  // Count untagged rows (the candidates).
  const cnt = await client.query(`select count(*)::int n from public.${where.table} where ${where.cond}`);
  const total = cnt.rows[0].n;

  let detail = "";
  if (derive) {
    // sample the derived dimension distribution (read-only) for the plan
    const dist = await client.query(derive);
    detail = dist.rows.map((r) => `${r.bucket}=${r.n}`).join(", ");
  }

  summary.push({ table: where.table, serviceKey: label, candidates: total, detail });

  if (!APPLY) return;
  if (total === 0) return;
  const res = await client.query(set);
  console.log(`  ✍️ ${where.table} → ${label}: updated ${res.rowCount} rows`);
}

try {
  // 1) tb_header_order → shop_order (+ no fcl/lcl column on this table)
  await run(
    "shop_order",
    `update public.tb_header_order set service_key='shop_order' where service_key is null`,
    { table: "tb_header_order", cond: "service_key is null" },
    `select case htransporttype when '1' then 'truck' when '2' then 'sea' when '3' then 'air' else 'unknown' end bucket, count(*)::int n
       from public.tb_header_order where service_key is null group by 1 order by 1`,
  );

  // 2) tb_payment → yuan_transfer
  await run(
    "yuan_transfer",
    `update public.tb_payment set service_key='yuan_transfer' where service_key is null`,
    { table: "tb_payment", cond: "service_key is null" },
    null,
  );

  // 3) tb_forwarder → import_cargo (+ fcl_lcl='lcl' where null). Mode derived in
  //    the dashboard from container name; not stored as a column here.
  await run(
    "import_cargo",
    `update public.tb_forwarder
        set service_key = 'import_cargo',
            fcl_lcl     = coalesce(fcl_lcl, 'lcl')
      where service_key is null`,
    { table: "tb_forwarder", cond: "service_key is null" },
    // distribution by container-name token (matches modeFromCabinetName)
    `select case
              when upper(fcabinetnumber) like '%GZS%' or upper(fcabinetnumber) like '%SEA%' then 'sea'
              when upper(fcabinetnumber) like '%GZA%' or upper(fcabinetnumber) like '%AIR%' then 'air'
              when upper(fcabinetnumber) like '%GZE%' or upper(fcabinetnumber) like '%EK%'  then 'truck'
              else 'unresolved(name)'
            end bucket, count(*)::int n
       from public.tb_forwarder where service_key is null group by 1 order by 1`,
  );

  // 4) freight_shipments → freight_export when direction='export', else freight_import.
  //    direction column is new (mig 0232) so existing rows are NULL → all default import.
  await run(
    "freight_export",
    `update public.freight_shipments set service_key='freight_export' where service_key is null and direction='export'`,
    { table: "freight_shipments", cond: "service_key is null and direction='export'" },
    null,
  );
  await run(
    "freight_import",
    `update public.freight_shipments set service_key='freight_import' where service_key is null and (direction is null or direction <> 'export')`,
    { table: "freight_shipments", cond: "service_key is null and (direction is null or direction <> 'export')" },
    null,
  );

  // ── plan / summary ──
  console.log("\n── plan (untagged rows that would get a service_key) ──");
  for (const s of summary) {
    console.log(
      `  ${s.table.padEnd(18)} → ${s.serviceKey.padEnd(15)} : ${String(s.candidates).padStart(7)} rows` +
        (s.detail ? `   [${s.detail}]` : ""),
    );
  }
  const grand = summary.reduce((a, s) => a + s.candidates, 0);
  console.log(`  ${"TOTAL".padEnd(18)}   ${"".padEnd(15)}   ${String(grand).padStart(7)} rows`);
  console.log(`\n${APPLY ? "✓ APPLIED." : "👀 DRY-RUN — re-run with --apply to write."}`);
} catch (err) {
  console.error("✗ FAILED:", err.code, err.message);
  if (err.detail) console.error("  Detail:", err.detail);
  process.exit(3);
} finally {
  await client.end();
}
