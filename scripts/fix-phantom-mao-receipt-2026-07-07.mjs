/**
 * Fix the phantom ค่าส่งเหมาๆ (mao_fee_thb) on 2 receipts (owner 2026-07-07).
 *
 * /admin/accounting/forwarder-invoice/15140 + /15141 (tb_receipt.id) show a
 * "+ ค่าส่งเหมาๆ (PRF) 100.00" line, but the matching ใบวางบิล (FRI2606-00020 /
 * -00017) charged mao_fee_thb=0. The receipt was auto-issued with a live-recomputed
 * ฿100 that the bill never billed → receipt ≠ bill. Owner rule: bills = ground truth,
 * these 2 orders do NOT charge เหมาๆ. Bring the receipt back to the bill:
 *   15140: mao_fee_thb 100→0, totalbeforewithholding 195→95,     ramount 195→95
 *   15141: mao_fee_thb 100→0, totalbeforewithholding 221.39→121.39, ramount 221.39→121.39
 * (corporate but total < ฿1000 → no juristic-1% split → ramount == totalbeforewithholding)
 *
 * Guarded WHERE (id + mao_fee_thb=100 + rstatus<>'2') = idempotent + safe re-run.
 * DRY-RUN by default. Pass --apply to write. Backs up the rows first.
 *
 *   node --env-file=.env.local scripts/fix-phantom-mao-receipt-2026-07-07.mjs         # dry-run + backup
 *   node --env-file=.env.local scripts/fix-phantom-mao-receipt-2026-07-07.mjs --apply # write
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const FIXES = [
  { id: 15140, mao: 0, total: 95,     ramount: 95 },
  { id: 15141, mao: 0, total: 121.39, ramount: 121.39 },
];

const COLS = "id,rid,rstatus,mao_fee_thb,totalbeforewithholding,ramount,recompnumber,corporatetype";

async function main() {
  const ids = FIXES.map((f) => f.id);
  const { data: before, error } = await sb.from("tb_receipt").select(COLS).in("id", ids);
  if (error) { console.error("read failed:", error); process.exit(1); }
  console.log("=== BEFORE ===");
  console.table(before);

  // Backup to scratchpad (money data — NOT committed).
  const backupPath = process.env.TEMP
    ? `${process.env.TEMP}/phantom-mao-receipt-backup-2026-07-07.json`
    : "/tmp/phantom-mao-receipt-backup-2026-07-07.json";
  writeFileSync(backupPath, JSON.stringify(before, null, 2));
  console.log(`backup written: ${backupPath}`);

  console.log("\n=== PLAN ===");
  for (const f of FIXES) {
    const row = before?.find((r) => r.id === f.id);
    if (!row) { console.log(`  id ${f.id}: NOT FOUND — skip`); continue; }
    if (String(row.rstatus) === "2") { console.log(`  id ${f.id}: rstatus=2 (cancelled) — skip`); continue; }
    if (Number(row.mao_fee_thb) !== 100) { console.log(`  id ${f.id}: mao_fee_thb=${row.mao_fee_thb} (not 100 — already fixed?) — skip`); continue; }
    console.log(`  id ${f.id}: mao_fee_thb ${row.mao_fee_thb}→${f.mao} · total ${row.totalbeforewithholding}→${f.total} · ramount ${row.ramount}→${f.ramount}`);
  }

  if (!APPLY) { console.log("\nDRY-RUN — pass --apply to write."); return; }

  console.log("\n=== APPLYING ===");
  for (const f of FIXES) {
    const { data, error: uErr } = await sb.from("tb_receipt")
      .update({ mao_fee_thb: f.mao, totalbeforewithholding: f.total, ramount: f.ramount })
      .eq("id", f.id).eq("mao_fee_thb", 100).neq("rstatus", "2").select("id");
    if (uErr) { console.error(`  id ${f.id}: UPDATE failed`, uErr); continue; }
    console.log(`  id ${f.id}: updated ${data?.length ?? 0} row(s)`);
  }

  const { data: after } = await sb.from("tb_receipt").select(COLS).in("id", ids);
  console.log("\n=== AFTER ===");
  console.table(after);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
