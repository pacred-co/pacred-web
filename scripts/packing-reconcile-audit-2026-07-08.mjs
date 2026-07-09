// READ-ONLY audit — every MOMO packing-list shipment vs tb_forwarder.
// Flags: MISSING (packing has it, system doesn't) · BOX-SHORT (system fewer boxes
// than packing = the PR548 class) · WEIGHT/CBM drift. No writes.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { shipments, sacks } = JSON.parse(readFileSync("C:/Users/Admin/AppData/Local/Temp/packing-all.json", "utf-8"));

const num = (x) => Number(x) || 0;
const baseOf = (t) => String(t || "").replace(/-\d+(\/\d+)?$/, "").trim();

// Pull all tb_forwarder rows for the containers in the packing lists.
const containers = [...new Set(shipments.map((s) => s.container))].filter(Boolean);
const bySysBase = new Map(); // container|base -> {rows:[], boxes, wt, cbm}
for (let i = 0; i < containers.length; i += 40) {
  const chunk = containers.slice(i, i + 40);
  const { data, error } = await s.from("tb_forwarder")
    .select("id,userid,ftrackingchn,fcabinetnumber,fstatus,famount,famountcount,fweight,fvolume,ftotalprice")
    .in("fcabinetnumber", chunk);
  if (error) { console.error("query err", error.message); continue; }
  for (const r of data ?? []) {
    const key = `${r.fcabinetnumber}|${baseOf(r.ftrackingchn)}`;
    const g = bySysBase.get(key) ?? { rows: [], boxes: 0, wt: 0, cbm: 0, prs: new Set(), billed: false };
    g.rows.push(r);
    g.boxes += Math.max(1, num(r.famount));
    g.wt += num(r.fweight);
    g.cbm += num(r.fvolume);
    g.prs.add(r.userid);
    if (["5", "6", "7"].includes(String(r.fstatus))) g.billed = true;
    bySysBase.set(key, g);
  }
}

const missing = [], boxShort = [], drift = [], ok = [];
for (const sh of shipments) {
  const key = `${sh.container}|${sh.base}`;
  const sys = bySysBase.get(key);
  if (!sys || sys.rows.length === 0) { missing.push(sh); continue; }
  const wtDiff = Math.abs(sys.wt - sh.wt);
  const cbmDiff = Math.abs(sys.cbm - sh.cbm);
  if (sys.boxes < sh.boxes) boxShort.push({ ...sh, sysBoxes: sys.boxes, sysWt: sys.wt, sysCbm: round(sys.cbm), billed: sys.billed, fids: sys.rows.map((r) => r.id) });
  else if (wtDiff > 0.5 || cbmDiff > 0.002) drift.push({ ...sh, sysWt: sys.wt, sysCbm: round(sys.cbm), wtDiff: round(wtDiff), billed: sys.billed, fids: sys.rows.map((r) => r.id) });
  else ok.push(sh);
}
function round(n) { return Math.round(n * 1000) / 1000; }

console.log(`\n=== PACKING-LIST ↔ SYSTEM AUDIT (${shipments.length} shipments · 29 ตู้) ===`);
console.log(`OK: ${ok.length} · 🔴 MISSING (ไม่มีในระบบ): ${missing.length} · 🟠 BOX-SHORT (กล่องขาด · แบบ PR548): ${boxShort.length} · 🟡 WEIGHT/CBM DRIFT: ${drift.length}`);

console.log(`\n🔴 MISSING (${missing.length}) — packing list มี แต่ระบบไม่มีเลย:`);
for (const m of missing.slice(0, 40)) console.log(`  ${m.container} · ${m.base} · ${m.pr} · ${m.boxes}กล่อง · ${m.wt}kg · ${m.cbm}คิว`);
if (missing.length > 40) console.log(`  … +${missing.length - 40} more`);

console.log(`\n🟠 BOX-SHORT (${boxShort.length}) — ระบบกล่องน้อยกว่า packing (เก็บขาด):`);
for (const b of boxShort.slice(0, 40)) console.log(`  ${b.container} · ${b.base} · ${b.pr} · packing ${b.boxes}กล่อง/${b.wt}kg vs ระบบ ${b.sysBoxes}กล่อง/${b.sysWt}kg ${b.billed ? "· 🔒บิลแล้ว" : ""} · fid ${b.fids}`);
if (boxShort.length > 40) console.log(`  … +${boxShort.length - 40} more`);

console.log(`\n🟡 WEIGHT/CBM DRIFT (${drift.length}) — น้ำหนัก/คิว ไม่ตรง (>0.5kg/0.002คิว):`);
for (const d of drift.slice(0, 30)) console.log(`  ${d.container} · ${d.base} · ${d.pr} · packing ${d.wt}kg/${d.cbm}คิว vs ระบบ ${d.sysWt}kg/${d.sysCbm}คิว (Δ${d.wtDiff}kg) ${d.billed ? "· 🔒บิลแล้ว" : ""} · fid ${d.fids}`);
if (drift.length > 30) console.log(`  … +${drift.length - 30} more`);

console.log(`\n📦 SACK-flagged (${sacks.length}):`);
for (const sk of sacks) console.log(`  ${sk.container} · ${sk.tracking} · ${sk.pr} · ${sk.prod}`);
