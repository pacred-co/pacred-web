// 🔴 MONEY/STATUS (owner 2026-07-16) — two independent reconciles.
//
// PR178 — un-settle the STALE orphan blocking re-collect.
//   fwd 52133/52134 (fstatus=5 · docs ALL cancelled: FRI52/53 + receipt FRG26) but
//   tb_wallet_hs 105593 (฿364.82 · reforder=52133 · typenew=6 · status=2 SETTLED ·
//   depositnamebank KBANK = direct bank slip, NOT wallet) survived → the pay-on-behalf
//   create idempotency gate dead-ends "ชำระไปแล้ว". Un-settle 105593 (status 2→3) so
//   the owner can re-collect the combined ฿364.82. NO wallet refund (KBANK = money in
//   bank, not a wallet debit). fstatus already 5. 105592 (฿50 · status=3) already rejected.
//   (The code auto-heal ships alongside so this never recurs; this clears the stuck row.)
//
// PR139 — advance the ARRIVED-but-stuck box-split orders so they become collectable.
//   52474/52475/52485/52489 (JYM800120650588-1..4/4 · container GZE260707-1) are stuck
//   at fstatus=3 (กำลังส่งมาไทย) EVEN THOUGH GZE260707-1 has arrived (14 siblings at 5,
//   20 at 6) — the box-split rows missed the arrival advance. They are priced + measured
//   → advance 3→5 (ถึงไทย→รอชำระเงิน · stamp fdatestatus4+5 · money-neutral, no price change).
//   The other 3 PR139 orders (52667/52135/52279) stay at 3 — their containers are still
//   fully in-transit (all siblings at 3). fshipby is empty on all → owner picks the carrier
//   at collection (not set here). Root (box-split arrival-scan miss) = carryover to fix.
//
//   dry:   node scripts/reconcile-pr178-pr139-2026-07-16.mjs
//   apply: node scripts/reconcile-pr178-pr139-2026-07-16.mjs --apply
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: "postgres.yzljakczhwrpbxflnmco", password: "DqOzfEZVXfMHIryz", database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
const nowIso = new Date().toISOString();
const PR139_ARRIVED = [52474, 52475, 52485, 52489];

// snapshot before
const before = {
  hs105593: (await c.query(`SELECT id, status, note FROM tb_wallet_hs WHERE id=105593`)).rows[0],
  pr139: (await c.query(`SELECT id, fstatus, fdatestatus4, fdatestatus5 FROM tb_forwarder WHERE id = ANY($1) ORDER BY id`, [PR139_ARRIVED])).rows,
};

console.log(`\n════ PR178 + PR139 reconcile · ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"} ════`);

console.log(`\n── PR178 · un-settle orphan 105593 ──`);
console.log(`  105593 status ${before.hs105593?.status} → 3 (un-settle · KBANK direct-slip → NO wallet refund)`);
console.log(`  → gate clears · owner re-collects combined ฿364.82 (52133+52134)`);

console.log(`\n── PR139 · advance arrived box-split orders (GZE260707-1) 3→5 ──`);
before.pr139.forEach((r) => {
  const willAdvance = String(r.fstatus) === "3";
  console.log(`  #${r.id} fstatus ${r.fstatus}${willAdvance ? " → 5 (ถึงไทย→รอชำระเงิน · stamp fdatestatus4+5)" : " (SKIP · not fstatus=3)"}`);
});
console.log(`  (52667/52135/52279 คงที่ fstatus=3 — ตู้ยัง in-transit ทั้งตู้)`);

if (!APPLY) { console.log(`\n🟡 DRY-RUN — ไม่เขียน. --apply เพื่อแก้จริง\n`); await c.end(); process.exit(0); }

writeFileSync("scripts/reconcile-pr178-pr139-backup-2026-07-16.json", JSON.stringify({ before }, null, 2));
await c.query("begin");
try {
  // PR178 — un-settle orphan (idempotent · only if still status=2)
  const r1 = await c.query(
    `UPDATE tb_wallet_hs SET status='3', adminidupdate='admin_web',
        note='ย้อนการชำระค้าง (orphan) PR178 #52133 — เอกสารถูกยกเลิกหมดแล้ว เปิดให้เก็บใหม่รวมบิล (KBANK direct-slip · ไม่คืน wallet)'
      WHERE id=105593 AND status='2'`,
  );
  console.log(`\n  PR178: un-settled 105593 (rows=${r1.rowCount})`);

  // PR139 — advance arrived box-split orders 3→5 (idempotent · only fstatus=3)
  const r2 = await c.query(
    `UPDATE tb_forwarder
        SET fstatus='5',
            fdatestatus4 = COALESCE(fdatestatus4, $2::timestamptz),
            fdatestatus5 = COALESCE(fdatestatus5, $2::timestamptz),
            adminidupdate='admin_web'
      WHERE id = ANY($1) AND fstatus='3'`,
    [PR139_ARRIVED, nowIso],
  );
  console.log(`  PR139: advanced ${r2.rowCount} order(s) 3→5`);

  await c.query("commit");
  console.log(`\n✅ APPLIED · PR178 re-collectable · PR139 4 order ถึงคิวเก็บเงินแล้ว`);
} catch (e) { await c.query("rollback"); console.error("❌ ROLLED BACK:", e.message); }
await c.end();
