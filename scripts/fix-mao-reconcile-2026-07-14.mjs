// 🔴 MONEY RECONCILE (owner 2026-07-14) — เหมาๆ (PCSF/PRF flat delivery fee) ฿50 ↔ ฿100.
// ───────────────────────────────────────────────────────────────────────────────────
// ROOT: MAO_FLAT_FEE = ฿100 (SOT · lib/forwarder/mao-fee.ts · owner 2026-06-19). Two paths
// under-stated it at the legacy ฿50:
//   · billing-run / consolidate  → computeForwarderDebitBatch: already ฿100 for a long time.
//   · customer SELF-PAY split    → actions/forwarder.ts hardcoded ฿50 until fd6b5160.
//   · the SELF-PAY MODAL display  → forwarder-pay-modal.tsx hardcoded ฿50 until THIS session.
//
// OWNER RULE (verbatim): "ที่ยังไม่เก็บมาแก้เลย (→฿100) · ที่ลูกค้าจ่าย ฿50 มาแล้ว ปรับหลังบ้าน
//   เราเป็น ฿50 ให้ตรง (อย่าไล่เก็บเพิ่ม)".
//     BUCKET 1 — UNPAID/uncollected เหมาๆ whose back-end still shows ฿50 → RAISE to ฿100.
//     BUCKET 2 — customer ALREADY PAID ฿50 (physical slip) but the back-end recorded ฿100
//                → LOWER the back-end to ฿50 so it reconciles to what was collected. NEVER
//                chase the ฿50 gap.
//
// GUARDRAILS (money-critical):
//   · dry-run DEFAULT — prints the plan; writes nothing without --apply.
//   · backup JSON written before ANY write.
//   · single txn per bucket · idempotent (re-run = 0 rows) · never touches cancelled invoices.
//   · BUCKET 2 is NEVER auto-selected — it lowers a COLLECTED amount, which requires บัญชี to
//     confirm (from the SLIP) that the physical transfer was ฿50. Pass an explicit, owner/
//     บัญชี-signed id list via --bucket2-invoice-ids=<csv>. With no list it only REPORTS
//     candidates for review — it will not write.
//   · bill == receipt: BUCKET 2 lowers the invoice AND its issued receipt(s) together (both
//     mao_fee_thb and the totals) so the two documents stay equal after the reconcile.
//
// USAGE:
//   node scripts/fix-mao-reconcile-2026-07-14.mjs                         # dry-run (report both buckets)
//   node scripts/fix-mao-reconcile-2026-07-14.mjs --apply --bucket1       # raise unpaid ฿50→฿100
//   node scripts/fix-mao-reconcile-2026-07-14.mjs --apply --bucket2-invoice-ids=123,456  # บัญชี-signed lower to ฿50
//
// The SELF-PAY pending slips (tb_wallet_hs type='4' status='1') submitted at the old ฿50
// display are handled at APPROVE time, NOT here: the modal now shows ฿100 (this session), so
// new slips are ฿100; any in-flight ฿50 slip is settled with an approve-time เหมาๆ override of
// ฿50 (so the record matches the ฿50 the customer actually transferred). This script only
// reconciles PERSISTED invoice/receipt documents.

import pg from "pg";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const DO_B1 = process.argv.includes("--bucket1");
const b2Arg = process.argv.find((a) => a.startsWith("--bucket2-invoice-ids="));
const B2_IDS = b2Arg
  ? b2Arg.split("=")[1].split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0)
  : [];

const MAO_SOT = 100; // lib/forwarder/mao-fee.ts MAO_FLAT_FEE
const MAO_OLD = 50;  // the legacy under-stated fee
const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: process.env.SUPABASE_DB_PASSWORD || "DqOzfEZVXfMHIryz",
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

console.log(`\n════ เหมาๆ MAO reconcile · ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} · SOT ฿${MAO_SOT} ════`);

// ── BUCKET 1 — UNPAID/uncollected invoices whose mao_fee_thb is still the legacy ฿50 ──
// (Excludes paid + cancelled: paid means the customer already settled the recorded amount →
//  raising it would be chasing them, which is BUCKET 2's job/owner-forbidden.)
const b1 = (await c.query(
  `SELECT id, doc_no, userid, status, COALESCE(mao_fee_thb,0) AS mao, total_thb
     FROM tb_forwarder_invoice
    WHERE COALESCE(mao_fee_thb,0) = $1
      AND status NOT IN ('paid','cancelled')
    ORDER BY id`,
  [MAO_OLD],
)).rows;

console.log(`\n── BUCKET 1 · UNPAID invoices at ฿${MAO_OLD} → raise to ฿${MAO_SOT} (${b1.length}) ──`);
for (const r of b1) {
  console.log(`  #${r.id} ${r.doc_no} ${r.userid} [${r.status}] mao ฿${Number(r.mao).toFixed(2)}→฿${MAO_SOT} · total ฿${Number(r.total_thb).toFixed(2)}→฿${round2(Number(r.total_thb) + (MAO_SOT - Number(r.mao))).toFixed(2)}`);
}
if (b1.length === 0) console.log("  (none — invoice mao is already ฿100 everywhere · no-op)");

// ── BUCKET 2 — CANDIDATES: PAID เหมาๆ invoices (mao already ฿100). บัญชี must confirm from the
//    SLIP which of these were physically transferred at ฿50 (customer paid ฿50). ONLY the
//    explicit --bucket2-invoice-ids list is written; the rest are informational. ──
const b2cand = (await c.query(
  `SELECT i.id, i.doc_no, i.userid, i.status, COALESCE(i.mao_fee_thb,0) AS mao, i.total_thb, i.paid_at
     FROM tb_forwarder_invoice i
    WHERE COALESCE(i.mao_fee_thb,0) = $1
      AND i.status = 'paid'
    ORDER BY i.id`,
  [MAO_SOT],
)).rows;

console.log(`\n── BUCKET 2 · PAID invoices at ฿${MAO_SOT} — บัญชี review vs slip; lower to ฿${MAO_OLD} only for confirmed ฿50-collected (${b2cand.length} candidates) ──`);
for (const r of b2cand) {
  const chosen = B2_IDS.includes(Number(r.id)) ? "  ⬅ SELECTED (บัญชี-signed → lower to ฿50)" : "";
  console.log(`  #${r.id} ${r.doc_no} ${r.userid} paid ${String(r.paid_at).slice(0,10)} · mao ฿${Number(r.mao).toFixed(2)} · total ฿${Number(r.total_thb).toFixed(2)}${chosen}`);
}
if (B2_IDS.length > 0) {
  const unknown = B2_IDS.filter((id) => !b2cand.some((r) => Number(r.id) === id));
  if (unknown.length > 0) console.log(`  ⚠️ --bucket2-invoice-ids not found among paid-฿100 candidates: ${unknown.join(", ")} (skipped)`);
}

// ── DRY-RUN gate ──
if (!APPLY) {
  console.log(`\n🟡 DRY-RUN — no writes. Re-run with:`);
  console.log(`     --apply --bucket1                          (raise ${b1.length} unpaid → ฿100)`);
  console.log(`     --apply --bucket2-invoice-ids=<csv>        (lower บัญชี-signed paid → ฿50)\n`);
  await c.end();
  process.exit(0);
}

// ── backup (always, before any write) ──
const backupPath = `scripts/fix-mao-reconcile-backup-${stamp}.json`;
writeFileSync(backupPath, JSON.stringify({ bucket1: b1, bucket2_candidates: b2cand, bucket2_selected: B2_IDS }, null, 2));
console.log(`\nbackup → ${backupPath}`);

// ── BUCKET 1 write — raise unpaid ฿50 → ฿100 (idempotent · guarded WHERE) ──
if (DO_B1 && b1.length > 0) {
  await c.query("begin");
  try {
    let n = 0;
    for (const r of b1) {
      const delta = MAO_SOT - Number(r.mao); // +50
      const res = await c.query(
        `UPDATE tb_forwarder_invoice
            SET mao_fee_thb = $1,
                total_thb   = round((COALESCE(total_thb,0) + $2)::numeric, 2)
          WHERE id = $3 AND COALESCE(mao_fee_thb,0) = $4 AND status NOT IN ('paid','cancelled')`,
        [MAO_SOT, delta, r.id, MAO_OLD],
      );
      n += res.rowCount;
    }
    await c.query("commit");
    console.log(`✅ BUCKET 1 — raised ${n} invoice(s) ฿${MAO_OLD}→฿${MAO_SOT}`);
  } catch (e) {
    await c.query("rollback");
    console.error("❌ BUCKET 1 ROLLED BACK:", e.message);
  }
} else if (DO_B1) {
  console.log("BUCKET 1 — nothing to raise.");
}

// ── BUCKET 2 write — lower บัญชี-signed PAID invoices ฿100 → ฿50 (reconcile-DOWN to the ฿50
//    physically collected · never chase the gap). Lowers the invoice AND its receipt(s) so
//    bill == receipt. Idempotent (guarded WHERE mao=100). ──
if (B2_IDS.length > 0) {
  const targets = b2cand.filter((r) => B2_IDS.includes(Number(r.id)));
  await c.query("begin");
  try {
    let ninv = 0, nrcpt = 0;
    for (const r of targets) {
      const delta = Number(r.mao) - MAO_OLD; // -50 off total
      const iRes = await c.query(
        `UPDATE tb_forwarder_invoice
            SET mao_fee_thb = $1,
                total_thb   = round((COALESCE(total_thb,0) - $2)::numeric, 2)
          WHERE id = $3 AND COALESCE(mao_fee_thb,0) = $4 AND status = 'paid'`,
        [MAO_OLD, delta, r.id, MAO_SOT],
      );
      ninv += iRes.rowCount;
      // Keep the issued receipt(s) equal to the reconciled bill. tb_receipt has NO direct
      // invoice FK — it links via tb_receipt_item.fid → the invoice's forwarder ids. Resolve
      // the rids that cover THIS invoice's forwarders, then lower those receipts too.
      const rids = (await c.query(
        `SELECT DISTINCT ri.rid
           FROM tb_receipt_item ri
          WHERE ri.fid IN (
            SELECT forwarder_id FROM tb_forwarder_invoice_item WHERE invoice_id = $1
          ) AND ri.rid IS NOT NULL`,
        [r.id],
      )).rows.map((x) => x.rid);
      if (rids.length > 0) {
        const rRes = await c.query(
          `UPDATE tb_receipt
              SET mao_fee_thb = $1,
                  ramount     = round((COALESCE(ramount,0) - $2)::numeric, 2)
            WHERE rid = ANY($3) AND COALESCE(mao_fee_thb,0) = $4 AND rstatus <> '2'`,
          [MAO_OLD, delta, rids, MAO_SOT],
        );
        nrcpt += rRes.rowCount;
      }
    }
    await c.query("commit");
    console.log(`✅ BUCKET 2 — lowered ${ninv} invoice(s) + ${nrcpt} receipt(s) ฿${MAO_SOT}→฿${MAO_OLD} (reconciled to ฿50 collected · no top-up chased)`);
  } catch (e) {
    await c.query("rollback");
    console.error("❌ BUCKET 2 ROLLED BACK:", e.message);
  }
}

await c.end();
console.log("\ndone.\n");
