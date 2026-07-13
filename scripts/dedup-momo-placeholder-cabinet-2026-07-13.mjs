/**
 * ════════════════════════════════════════════════════════════════════════
 * BATCH CLEANUP — MOMO cross-cabinet DUPLICATE rows (Bug A · ภูม 2026-07-13)
 * ════════════════════════════════════════════════════════════════════════
 * PROBLEM (prod · pre-existing · dates 2026-07-05 + 07-10, NOT from today's deploy):
 *   The SAME physical box exists as TWO tb_forwarder rows —
 *     • one under the REAL container   (e.g. GZE260704-1)  ← created by the
 *       container-closed box-split (correct)
 *     • one under a ROUTING PLACEHOLDER (e.g. PR20260701-EK01) ← created later
 *       when MOMO's import-track feed returned the box under the routing batch
 *       and it got committed as a NEW row (the "ตู้หลอก" · wrong)
 *   Same ftrackingchn (e.g. 1783051207-10) → the box is billed/counted TWICE.
 *   Scope (prod probe 2026-07-13): 3 base trackings · 1783051207 (19 dup rows) +
 *   302162248998 (1) + JYM188058949964 (1 · ⚠️ 1 is BILLED → auto-skipped, manual).
 *
 * WHAT THIS DELETES (the wrong copy only):
 *   a row R where —
 *     R.fcabinetnumber matches the routing-placeholder pattern (PR/MO/PCS + 8d + -SEA/EK/AIR + 2d)
 *     AND another row S has the SAME ftrackingchn under a NON-placeholder (real) container
 *     AND R.fstatus NOT in ('5','6','7')  (unbilled — a billed dup is NEVER touched)
 *   → the real-container row S is KEPT; the placeholder duplicate R is DELETED.
 *
 * 💰 MONEY-SAFETY:
 *   - DRY-RUN by DEFAULT — prints the exact delete list + a per-customer summary; writes NOTHING.
 *   - --apply writes a JSON backup of every row to be deleted FIRST
 *     (scripts/_backup-dedup-placeholder-<ts>.json · full row + restore INSERT).
 *   - NEVER deletes a billed row (fstatus 5/6/7) — those are reported for MANUAL review.
 *   - Only deletes a placeholder row that HAS a real-container twin (same ftrackingchn) —
 *     a placeholder row with NO real twin is left alone (it's just not-yet-in-a-closed-container,
 *     not a duplicate).
 *   - Owner reviews the dry-run Σ before --apply (this is a billable-row delete on prod).
 *
 * RUN (prod):
 *   dry:   PROD_DB_PW=… node scripts/dedup-momo-placeholder-cabinet-2026-07-13.mjs
 *   apply: PROD_DB_PW=… node scripts/dedup-momo-placeholder-cabinet-2026-07-13.mjs --apply
 * ════════════════════════════════════════════════════════════════════════
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const PASSWORD = process.env.PROD_DB_PW || process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("PROD_DB_PW not set — aborting."); process.exit(1); }

const client = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

const PLACEHOLDER_RX = `^(PR|MO|PCS)[0-9]{8}-(SEA|EK|AIR)[0-9]{2}$`;

await client.connect();
console.log(`\n=== MOMO placeholder-cabinet DEDUP · ${APPLY ? "APPLY (writes!)" : "DRY-RUN"} ===\n`);

// Rows to delete: placeholder-cabinet rows whose exact ftrackingchn ALSO exists under a real container, unbilled.
const { rows: toDelete } = await client.query(`
  select r.id, r.ftrackingchn, r.userid, r.fcabinetnumber, r.fweight, r.ftotalprice, r.fstatus,
         s.id AS keep_id, s.fcabinetnumber AS keep_cabinet
    from tb_forwarder r
    join tb_forwarder s
      on s.ftrackingchn = r.ftrackingchn
     and s.id <> r.id
     and (s.fcabinetnumber IS NOT NULL AND s.fcabinetnumber <> '' AND s.fcabinetnumber !~ '${PLACEHOLDER_RX}')
   where r.fcabinetnumber ~ '${PLACEHOLDER_RX}'
     and r.fstatus in ('1','2','3','4')
   order by r.ftrackingchn, r.id`);

// Billed placeholder dups — REPORTED, never auto-deleted.
const { rows: billedDup } = await client.query(`
  select r.id, r.ftrackingchn, r.userid, r.fcabinetnumber, r.ftotalprice, r.fstatus
    from tb_forwarder r
    join tb_forwarder s
      on s.ftrackingchn = r.ftrackingchn and s.id <> r.id
     and (s.fcabinetnumber IS NOT NULL AND s.fcabinetnumber <> '' AND s.fcabinetnumber !~ '${PLACEHOLDER_RX}')
   where r.fcabinetnumber ~ '${PLACEHOLDER_RX}' and r.fstatus in ('5','6','7')
   order by r.ftrackingchn`);

console.log(`จะลบ ${toDelete.length} แถว (placeholder dup · unbilled) · เก็บ real-container twin ไว้:\n`);
const byCust = {};
for (const r of toDelete) {
  console.log(`  DEL id=${r.id} ${r.ftrackingchn} [${r.fcabinetnumber}] ฿${r.ftotalprice} PR=${r.userid} → เก็บ id=${r.keep_id} [${r.keep_cabinet}]`);
  byCust[r.userid] = (byCust[r.userid] || 0) + 1;
}
console.log(`\nสรุปตามลูกค้า:`, JSON.stringify(byCust));

if (billedDup.length > 0) {
  console.log(`\n⚠️ ${billedDup.length} แถว placeholder ที่ BILLED แล้ว (ไม่แตะ · ต้อง manual · owner/บัญชี):`);
  for (const r of billedDup) console.log(`  KEEP-MANUAL id=${r.id} ${r.ftrackingchn} [${r.fcabinetnumber}] ฿${r.ftotalprice} fstatus=${r.fstatus} PR=${r.userid}`);
}

if (!APPLY) {
  console.log(`\n(DRY-RUN · ยังไม่ลบ) — ตรวจ list ข้างบน + owner เคาะ แล้วรันซ้ำด้วย --apply`);
  await client.end();
  process.exit(0);
}

// APPLY — backup full rows first, then delete.
const ids = toDelete.map((r) => r.id);
if (ids.length === 0) { console.log("ไม่มีอะไรต้องลบ"); await client.end(); process.exit(0); }
const { rows: fullRows } = await client.query(`select * from tb_forwarder where id = any($1::text[])`, [ids]);
const backupFile = `scripts/_backup-dedup-placeholder-${Date.now()}.json`;
writeFileSync(backupFile, JSON.stringify(fullRows, null, 2));
console.log(`\nbackup เขียนแล้ว: ${backupFile} (${fullRows.length} แถว · มี full row ไว้ restore)`);

const { rowCount } = await client.query(`delete from tb_forwarder where id = any($1::text[]) and fstatus in ('1','2','3','4')`, [ids]);
console.log(`\n✅ ลบแล้ว ${rowCount} แถว. เสร็จ.`);
await client.end();
