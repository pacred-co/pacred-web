/**
 * BACKFILL tb_receipt.refwhid — link each existing receipt to the funding
 * wallet_hs (the "อ้างอิงชำระเงิน" reference · legacy refWHID).
 *
 * WHY: the auto-receipt hook historically INSERTed tb_receipt with refwhid=null,
 * so the receipt list's orange "อ้างอิงชำระเงิน" button NEVER rendered (ภูม
 * 2026-07-15 flag). The code fix (auto-issue-receipt.ts + the 3 wallet-approve
 * callers) threads wallet_hs.id → refwhid going forward. This backfills the
 * EXISTING receipts so the button also works on the current data.
 *
 * MATCH (legacy semantic — wallet_hs.reforder = the forwarder it paid):
 *   receipt.rid → tb_receipt_item.fid[] → tb_wallet_hs WHERE reforder = ANY(fids).
 *   Pick the BEST candidate: prefer one with a slip image (imagesslip<>''),
 *   then the most recent (highest wallet_hs.id).
 *   No wallet match (receipt funded via billing-run · no wallet topup) → leave
 *   null. The button correctly stays hidden — same as legacy.
 *
 * SAFETY: refwhid is a REFERENCE column, not money — this NEVER touches ramount /
 * totalbeforewithholding / rstatus. Only fills refwhid where it is currently NULL.
 * DRY-RUN by default. --apply writes (JSON backup of the before-state first).
 *
 * RUN:
 *   dry (dev):   SUPABASE_DB_PASSWORD='<dev pw>'  node scripts/backfill-receipt-refwhid-2026-07-15.mjs --ref lozntlidlqqzzcaathnm
 *   apply (dev): SUPABASE_DB_PASSWORD='<dev pw>'  node scripts/backfill-receipt-refwhid-2026-07-15.mjs --ref lozntlidlqqzzcaathnm --apply
 *   prod:        SUPABASE_DB_PASSWORD='<prod pw>' node scripts/backfill-receipt-refwhid-2026-07-15.mjs --ref yzljakczhwrpbxflnmco [--apply]
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const refArg = process.argv.indexOf("--ref");
const REF = refArg >= 0 ? process.argv[refArg + 1] : null;
const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW || !REF) { console.error("need SUPABASE_DB_PASSWORD + --ref <projectref>"); process.exit(1); }

const c = new pg.Client({
  connectionString: `postgresql://postgres:${encodeURIComponent(PW)}@db.${REF}.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});

async function main() {
  await c.connect();
  console.log(`${APPLY ? "*** APPLY ***" : "*** DRY-RUN ***"}  ref=${REF}\n`);

  // Candidate = every receipt with refwhid null that has ≥1 fid whose forwarder
  // was paid by a wallet_hs (reforder = fid). DISTINCT ON picks the best wallet
  // per receipt: slip first (imagesslip non-empty), then newest id.
  const { rows } = await c.query(`
    SELECT DISTINCT ON (r.id)
      r.id rec_id, r.rid, r.userid,
      wh.id wh_id, wh.reforder wh_fid, (wh.imagesslip IS NOT NULL AND wh.imagesslip <> '') has_slip
    FROM tb_receipt r
    JOIN tb_receipt_item ri ON ri.rid = r.rid
    JOIN tb_wallet_hs wh ON wh.reforder = ri.fid::text
    WHERE r.refwhid IS NULL
    ORDER BY r.id,
             (wh.imagesslip IS NOT NULL AND wh.imagesslip <> '') DESC,
             wh.id DESC
  `);

  const totalNull = (await c.query(`SELECT count(*)::int n FROM tb_receipt WHERE refwhid IS NULL`)).rows[0].n;
  console.log(`receipts refwhid=null: ${totalNull} · จะผูกได้: ${rows.length} (ที่เหลือ = billing-run ไม่มี wallet ref)`);
  console.log(`  มีสลิป: ${rows.filter(r => r.has_slip).length} · ไม่มีสลิป: ${rows.filter(r => !r.has_slip).length}\n`);
  rows.slice(0, 12).forEach(r => console.log(`  ${r.rid} → wallet_hs ${r.wh_id} (fid ${r.wh_fid}${r.has_slip ? " · มีสลิป" : ""})`));
  if (rows.length > 12) console.log(`  … อีก ${rows.length - 12} ใบ`);

  if (!APPLY) { console.log(`\n*** DRY-RUN — ไม่เขียน. --apply เพื่อผูกจริง ***`); await c.end(); return; }
  if (rows.length === 0) { console.log(`\nไม่มีอะไรต้องผูก.`); await c.end(); return; }

  const backup = `scripts/_backup-receipt-refwhid-${REF}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(backup, JSON.stringify(rows.map(r => ({ rec_id: r.rec_id, rid: r.rid, old_refwhid: null, new_refwhid: r.wh_id })), null, 2));
  console.log(`\nbackup: ${backup}`);

  await c.query("BEGIN");
  try {
    let n = 0;
    for (const r of rows) {
      const res = await c.query(
        `UPDATE tb_receipt SET refwhid=$1 WHERE id=$2 AND refwhid IS NULL`,
        [Number(r.wh_id), Number(r.rec_id)]);
      n += res.rowCount;
    }
    await c.query("COMMIT");
    console.log(`*** ผูกแล้ว ${n} ใบ (refwhid ← funding wallet_hs) ***`);
  } catch (e) { await c.query("ROLLBACK"); console.error("ROLLBACK:", e.message); }
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
