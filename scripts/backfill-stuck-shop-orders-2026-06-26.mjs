#!/usr/bin/env node
/**
 * One-time backfill (owner 2026-06-26): complete ฝากสั่งซื้อ orders that are
 * stuck at hstatus 4/40 even though their linked ฝากนำเข้า forwarder already
 * reached the China warehouse (fstatus ≥ 2). The new trigger (mig 0215) fixes
 * this going forward; this clears the existing backlog (P22318 etc.).
 *
 *   DRY-RUN:  SUPABASE_DB_PASSWORD='<pw>' node scripts/backfill-stuck-shop-orders-2026-06-26.mjs
 *   APPLY:    SUPABASE_DB_PASSWORD='<pw>' node scripts/backfill-stuck-shop-orders-2026-06-26.mjs --apply
 *
 * Forward-only · status-only · no money. Idempotent (re-run = 0 rows once done).
 */
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const PROJECT_REF = process.env.PROJECT_REF || "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("FATAL: SUPABASE_DB_PASSWORD not set"); process.exit(1); }

const SELECT_SQL = `
  select h.hno, h.hstatus, h.userid
  from tb_header_order h
  where h.hstatus in ('4','40')
    and exists (
      select 1 from tb_forwarder f
      where f.fstatus in ('2','3','4','5','6','7')
        and ( nullif(btrim(coalesce(f.reforder,'')),'') = h.hno
              or f.ftrackingchn in (
                   select o.ctrackingnumber from tb_order o
                   where o.hno = h.hno and coalesce(o.ctrackingnumber,'') <> '' ) )
    )
  order by h.hno`;

const UPDATE_SQL = `
  update tb_header_order h set hstatus='5', hdateupdate=now()
  where h.hstatus in ('4','40')
    and exists (
      select 1 from tb_forwarder f
      where f.fstatus in ('2','3','4','5','6','7')
        and ( nullif(btrim(coalesce(f.reforder,'')),'') = h.hno
              or f.ftrackingchn in (
                   select o.ctrackingnumber from tb_order o
                   where o.hno = h.hno and coalesce(o.ctrackingnumber,'') <> '' ) )
    )`;

const hosts = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
let client = null;
for (const h of hosts) {
  try {
    const c = new pg.Client({ connectionString: `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@${h}:5432/postgres`, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12_000 });
    await c.connect(); client = c; console.log(`✓ connected ${h}`); break;
  } catch (e) { console.log(`  ${h} failed: ${e.message}`); }
}
if (!client) { console.error("FATAL: could not connect"); process.exit(1); }

const sel = await client.query(SELECT_SQL);
console.log(`\n${APPLY ? "APPLY" : "DRY-RUN"} — stuck ฝากสั่งซื้อ (4/40 → 5): ${sel.rowCount}`);
for (const r of sel.rows.slice(0, 50)) console.log(`  ${r.hno} · st=${r.hstatus} · ${r.userid}`);
if (sel.rowCount > 50) console.log(`  ... +${sel.rowCount - 50} more`);
console.log(`P22318 present: ${sel.rows.some((r) => r.hno === "P22318")}`);

if (APPLY) {
  const upd = await client.query(UPDATE_SQL);
  console.log(`\n✅ APPLIED — ${upd.rowCount} orders completed (4/40→5)`);
} else {
  console.log(`\n(dry-run — re-run with --apply to complete the ${sel.rowCount} orders)`);
}
await client.end();
