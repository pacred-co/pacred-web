// Advance ฝากสั่งซื้อ shop orders that are STUCK: tb_header_order.hstatus='4'
// (รอร้านจีนจัดส่ง) while their linked ฝากนำเข้า forwarder (reforder=hno) has
// already reached the china warehouse or beyond (fstatus IN 2..7) → set
// hstatus='40' (ถึงโกดังจีน). FORWARD-ONLY, status-only (no money). The code fix
// (adminBulkUpdateForwarderTbStatus) prevents NEW stuck orders; this clears the
// existing backlog (e.g. P22314 ↔ forwarder #52075). DRY-RUN default; --apply.
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("SUPABASE_DB_PASSWORD not set"); process.exit(1); }
const HOSTS = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
const USER = "postgres.yzljakczhwrpbxflnmco";
async function connect() {
  for (const h of HOSTS) {
    const cl = new pg.Client({ connectionString: `postgresql://${USER}:${encodeURIComponent(PASSWORD)}@${h}:5432/postgres` });
    try { await cl.connect(); console.log(`connected ${h}`); return cl; } catch (e) { console.error(`  ${h} ${e.code ?? e.message}`); }
  }
  throw new Error("all hosts failed");
}
const c = await connect();

// Link a stuck shop order (hstatus '4') to a forwarder that reached china+ via
// EITHER reforder (spawn path) OR the recorded China tracking (MOMO-created rows
// have reforder="" → match tb_order.ctrackingnumber = f.ftrackingchn).
const SELECT = `
  select ho.hno, ho.hstatus,
         array_agg(distinct f.id::text) as forwarder_ids,
         array_agg(distinct f.fstatus)  as forwarder_statuses
    from tb_header_order ho
    join tb_forwarder f
      on f.fstatus in ('2','3','4','5','6','7')
     and (
       (coalesce(f.reforder,'') <> '' and f.reforder = ho.hno)
       or exists (
         select 1 from tb_order o
          where o.hno = ho.hno
            and coalesce(o.ctrackingnumber,'') <> ''
            and o.ctrackingnumber = f.ftrackingchn
       )
     )
   where ho.hstatus = '4'
   group by ho.hno, ho.hstatus
   order by ho.hno`;

const rows = (await c.query(SELECT)).rows;
console.log(`\n${rows.length} stuck shop orders (hstatus '4' but forwarder ถึงโกดังจีน+):\n`);
for (const r of rows) console.log(`  ${r.hno}: forwarders [${(r.forwarder_ids||[]).join(",")}] fstatus [${(r.forwarder_statuses||[]).join(",")}] → hstatus 40`);
if (rows.length === 0) { await c.end(); console.log("nothing to fix."); process.exit(0); }

writeFileSync(`/tmp/fix-stuck-shop-order-backup-${APPLY ? "apply" : "dryrun"}.json`,
  JSON.stringify(rows.map((r) => ({ hno: r.hno, hstatus: r.hstatus })), null, 2));
console.log(`\nbackup: /tmp/fix-stuck-shop-order-backup-${APPLY ? "apply" : "dryrun"}.json`);
if (!APPLY) { await c.end(); console.log("\nDRY-RUN — re-run with --apply to commit."); process.exit(0); }

const res = await c.query(`
  update tb_header_order ho
     set hstatus='40', hdateupdate=now()
   where ho.hstatus='4'
     and exists (
       select 1 from tb_forwarder f
        where f.fstatus in ('2','3','4','5','6','7')
          and (
            (coalesce(f.reforder,'') <> '' and f.reforder = ho.hno)
            or exists (
              select 1 from tb_order o
               where o.hno = ho.hno
                 and coalesce(o.ctrackingnumber,'') <> ''
                 and o.ctrackingnumber = f.ftrackingchn
            )
          )
     )`);
await c.end();
console.log(`\nAPPLIED — ${res.rowCount} shop orders advanced 4 → 40.`);
