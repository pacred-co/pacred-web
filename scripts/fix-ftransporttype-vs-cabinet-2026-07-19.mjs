/**
 * fix-ftransporttype-vs-cabinet-2026-07-19.mjs — align stored ftransporttype to the
 * PHYSICAL container code (the SOT · cabinet-transport.ts). A GZE(road) container carrying
 * ftransporttype='2'(sea) is a stale-display artifact (cost already uses the code → correct;
 * this only fixes the stored field + any raw-ftransporttype display + a false data-health flag).
 * Scope: 8 rows on GZE260716-1 (stored '2' vs code '1'), UNBILLED. Display-only · no re-price
 * (plain UPDATE · cost resolver reads the container code). dry-run+backup.
 */
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
async function main(){
  const c=new pg.Client({host:"aws-1-ap-southeast-1.pooler.supabase.com",port:5432,user:"postgres.yzljakczhwrpbxflnmco",password:process.env.SUPABASE_DB_PASSWORD,database:"postgres",ssl:{rejectUnauthorized:false}});
  await c.connect();
  // GZE/EK/YWE prefix → road('1'); guard to the exact mismatch (stored '2', road cabinet, unbilled).
  const {rows}=await c.query(`
    SELECT id, fcabinetnumber cab, ftransporttype tt FROM tb_forwarder
    WHERE fstatus<>'99' AND ftransporttype='2'
      AND (upper(fcabinetnumber) LIKE '%GZE%' OR upper(fcabinetnumber) LIKE '%YWE%' OR upper(fcabinetnumber) LIKE '%EK%')
      AND NOT EXISTS(SELECT 1 FROM tb_forwarder_invoice_item ii WHERE ii.forwarder_id=tb_forwarder.id)`);
  console.log(`road containers stored as sea (unbilled): ${rows.length}`);
  console.table(rows.slice(0,15));
  if(!APPLY){console.log("(dry-run — --apply)");await c.end();return;}
  writeFileSync("/tmp/backup-ftransporttype-2026-07-19.json",JSON.stringify(rows,null,2));
  const ids=rows.map(r=>r.id);
  const r=await c.query(`UPDATE tb_forwarder SET ftransporttype='1' WHERE id=ANY($1::bigint[])`,[ids]);
  console.log(`✅ set ${r.rowCount} rows ftransporttype '2'→'1' (road) · backup /tmp/backup-ftransporttype-2026-07-19.json`);
  await c.end();
}
main().catch(e=>{console.error(e);process.exit(1)});
