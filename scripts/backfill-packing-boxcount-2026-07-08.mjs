// Backfill box-count/weight/cbm from the authoritative packing lists.
// Owner 2026-07-08: (1) NON-BILLED box-short → correct measurement + re-price
// (proportional to the same basis · exact for a box-count scale-up). (2) BILLED
// (fstatus 5/6/7) box-short → correct MEASUREMENT ONLY (data accurate · price/bill
// FROZEN · never touch a customer who already paid). Skips multi-sibling bases
// (>1 non-billed row · would double-count) + basis-flip cases → flags them.
// Default DRY-RUN. Pass --apply to write. Backs up every touched row first.
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { shipments } = JSON.parse(readFileSync("C:/Users/Admin/AppData/Local/Temp/packing-all.json", "utf-8"));
const num = (x) => Number(x) || 0;
const r2 = (n) => Math.round(n * 100) / 100;
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const baseOf = (t) => String(t || "").replace(/-\d+(\/\d+)?$/, "").trim();
const BILLED = new Set(["5", "6", "7"]);
const COMPARISON = 250;

const containers = [...new Set(shipments.map((x) => x.container))].filter(Boolean);
const sysByBase = new Map();
for (let i = 0; i < containers.length; i += 40) {
  const { data } = await s.from("tb_forwarder")
    .select("id,userid,ftrackingchn,fcabinetnumber,fstatus,famount,famountcount,fweight,fvolume,frefrate,frefprice,ftotalprice")
    .in("fcabinetnumber", containers.slice(i, i + 40));
  for (const r of data ?? []) {
    const k = `${r.fcabinetnumber}|${baseOf(r.ftrackingchn)}`;
    (sysByBase.get(k) ?? sysByBase.set(k, []).get(k)).push(r);
  }
}

const plan = { nonBilledReprice: [], billedDataOnly: [], skipMultiRow: [], skipBasisFlip: [], skipNoWrite: [] };
for (const sh of shipments) {
  const rows = sysByBase.get(`${sh.container}|${sh.base}`) ?? [];
  if (rows.length === 0) continue; // MISSING — handled by the tool/owner, not here
  const sysBoxes = rows.reduce((a, r) => a + Math.max(1, num(r.famount)), 0);
  // CLEAN box-short ONLY: the packing list has STRICTLY more boxes than the system.
  // (A system-has-more-boxes / weight-only diff is ambiguous → leave for the tool.)
  const boxShort = sh.boxes > sysBoxes;
  if (!boxShort) continue;

  const nonBilled = rows.filter((r) => !BILLED.has(String(r.fstatus)));
  const billed = rows.filter((r) => BILLED.has(String(r.fstatus)));

  // Target ONE row to carry the corrected aggregate (mirror the tool's single-writeFid rule).
  if (nonBilled.length > 1) { plan.skipMultiRow.push({ ...sh, fids: rows.map((r) => r.id) }); continue; }

  const target = nonBilled[0] ?? billed[0];
  const isBilled = !target || BILLED.has(String(target.fstatus));
  const newWt = r2(sh.wt), newVol = r6(sh.cbm), newBoxes = sh.boxes;

  if (isBilled) {
    // DATA-ONLY: correct measurement · FREEZE price (don't touch the paid bill).
    plan.billedDataOnly.push({ fid: target.id, cab: sh.container, base: sh.base, pr: sh.pr,
      from: { boxes: num(target.famount), wt: num(target.fweight), vol: num(target.fvolume) },
      to: { boxes: newBoxes, wt: newWt, vol: newVol }, price: num(target.ftotalprice) + " (frozen)" });
    continue;
  }

  // NON-BILLED: correct measurement + proportional re-price on the stored basis.
  const basis = String(target.frefprice) === "1" ? "kg" : "cbm";
  const oldQty = basis === "kg" ? num(target.fweight) : num(target.fvolume);
  const newQty = basis === "kg" ? newWt : newVol;
  const newKgPerCbm = newVol !== 0 ? newWt / newVol : 0;
  const wantKg = newKgPerCbm > COMPARISON; // ค่าเทียบ 250 default
  // basis-flip guard: if the corrected aggregate wants a DIFFERENT basis than the stored one,
  // proportional pricing would be wrong (needs the other rate card) → flag for the tool.
  if ((wantKg && basis !== "kg") || (!wantKg && basis !== "cbm")) {
    plan.skipBasisFlip.push({ fid: target.id, base: sh.base, pr: sh.pr, storedBasis: basis, wantKg, newKgPerCbm: r2(newKgPerCbm) });
    continue;
  }
  if (oldQty <= 0) { plan.skipNoWrite.push({ fid: target.id, base: sh.base, reason: "oldQty<=0" }); continue; }
  if (num(target.ftotalprice) <= 0) { plan.skipNoWrite.push({ fid: target.id, base: sh.base, reason: "price=0 · rate missing → ใช้เครื่องมือ" }); continue; }
  const newPrice = r2(num(target.ftotalprice) * (newQty / oldQty));
  plan.nonBilledReprice.push({ fid: target.id, cab: sh.container, base: sh.base, pr: sh.pr, basis,
    from: { boxes: num(target.famount), wt: num(target.fweight), vol: num(target.fvolume), price: num(target.ftotalprice) },
    to: { boxes: newBoxes, wt: newWt, vol: newVol, price: newPrice } });
}

console.log(`\n=== BACKFILL PLAN (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
console.log(`non-billed re-price: ${plan.nonBilledReprice.length} · billed data-only: ${plan.billedDataOnly.length} · skip multi-row: ${plan.skipMultiRow.length} · skip basis-flip: ${plan.skipBasisFlip.length} · skip no-write: ${plan.skipNoWrite.length}`);
console.log("\n-- NON-BILLED (แก้กล่อง/น้ำหนัก + คิดเงินใหม่) --");
for (const p of plan.nonBilledReprice) console.log(`  #${p.fid} ${p.pr} ${p.base} [${p.basis}] · ${p.from.boxes}กล่อง/${p.from.wt}kg/฿${p.from.price} → ${p.to.boxes}กล่อง/${p.to.wt}kg/฿${p.to.price}`);
console.log("\n-- BILLED (แก้ข้อมูลเฉยๆ · ไม่แตะเงิน) --");
for (const p of plan.billedDataOnly) console.log(`  #${p.fid} ${p.pr} ${p.base} · ${p.from.boxes}กล่อง/${p.from.wt}kg → ${p.to.boxes}กล่อง/${p.to.wt}kg · ฿${p.price}`);
if (plan.skipMultiRow.length) { console.log("\n-- SKIP multi-row (>1 non-billed sibling · ใช้เครื่องมือ) --"); for (const p of plan.skipMultiRow) console.log(`  ${p.base} ${p.pr} fids ${p.fids}`); }
if (plan.skipBasisFlip.length) { console.log("\n-- SKIP basis-flip (ใช้เครื่องมือ re-price) --"); for (const p of plan.skipBasisFlip) console.log(`  #${p.fid} ${p.base} stored ${p.storedBasis} · KGPerCBM ${p.newKgPerCbm} wantKg ${p.wantKg}`); }

if (!APPLY) { console.log("\n(dry-run · ไม่เขียน · เพิ่ม --apply เพื่อลงจริง)"); process.exit(0); }

// APPLY — backup first
const touched = [...plan.nonBilledReprice, ...plan.billedDataOnly].map((p) => p.fid);
const { data: backup } = await s.from("tb_forwarder").select("*").in("id", touched);
writeFileSync(`/tmp/backfill-boxcount-backup-${Date.now()}.json`, JSON.stringify(backup, null, 1));
console.log(`\nbackup ${backup?.length} rows saved.`);
let ok = 0, err = 0;
for (const p of plan.nonBilledReprice) {
  const { error } = await s.from("tb_forwarder").update({ famount: p.to.boxes, fweight: p.to.wt, fvolume: p.to.vol, famountcount: "1", ftotalprice: p.to.price }).eq("id", p.fid).not("fstatus", "in", "(5,6,7)");
  error ? (err++, console.log("ERR", p.fid, error.message)) : ok++;
}
for (const p of plan.billedDataOnly) {
  // measurement ONLY · NO ftotalprice (frozen · paid customer untouched)
  const { error } = await s.from("tb_forwarder").update({ famount: p.to.boxes, fweight: p.to.wt, fvolume: p.to.vol, famountcount: "1" }).eq("id", p.fid);
  error ? (err++, console.log("ERR", p.fid, error.message)) : ok++;
}
console.log(`\nAPPLIED: ${ok} ok · ${err} err`);
