// ════════════════════════════════════════════════════════════════════════════
// RECONCILE — a base tracking whose boxes MOMO loaded into SEVERAL containers.
// owner 2026-07-16: "ตรวจแทรคกิ้งเทียบ momo live ยังไม่ตรงกับในระบบเลย ทั้งกล่อง
// ทั้งแทรคกิ้ง และคิวก็ยังเบิ้ลอยู่"
//
// THE BUG (root · actions/admin/momo-packing-reconcile.ts:196):
//   "The container is meta-level (every parcel row inherits it)" — the packing apply
//   groups the file's lines by baseTracking and stamps the file's ONE container onto
//   EVERY sibling of that base. When MOMO splits one base across containers, each
//   packing upload stomps the previous one → all N siblings end up in whichever
//   container was uploaded LAST.
//
// THE DAMAGE (measured on prod):
//   1783582423   → packing: GZS260710-1=60 box · GZS260710-2=28 · GZS260712-1=28
//                  system : GZS260710-1=116 (ALL of them)
//   KY4001030721114 → packing: GZE260709-1=69 · GZE260712-1=61
//                  system : GZE260709-1=130 (ALL of them)
//   Nothing is lost — every box exists. They are parked in the wrong container, so
//   one container reads over-full (its คิว/กล่อง "เบิ้ล") while the others read empty
//   → warehouse can't complete a scan, admin can't collect.
//
// THE FIX: the packing list names each box line INDIVIDUALLY ("1783582423-15"), so the
// correct container per row is unambiguous. Re-point fcabinetnumber per ROW from the
// packing lists. Money-neutral: only fcabinetnumber (+ ftransporttype when the mode
// changes with the container) is written — never a price/weight/cbm/status column.
//
// GUARDS
//   • BILLED rows (fstatus >= 5) are NEVER touched — a container move would re-group
//     the เหมาๆ per-bill fee + the container bucket on a row whose money is settled.
//     They are reported for the owner to decide.
//   • Only rows whose CURRENT container disagrees with the packing list are written.
//   • Every packing file must parse to the standard MOMO layout, else it is skipped.
//   • Backup JSON written before --apply. Single transaction. Idempotent (re-run = 0).
//
// RUN:  node scripts/reconcile-cross-container-split-2026-07-16.mjs           (dry-run)
//       node scripts/reconcile-cross-container-split-2026-07-16.mjs --apply
// ════════════════════════════════════════════════════════════════════════════
import { execSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import pg from "pg";

const DIR = process.env.PACKING_DIR || "C:/Users/Admin/Desktop/Packing List/MOMO - Packing now";
const APPLY = process.argv.includes("--apply");
const BILLED = new Set(["5", "6", "7", "8"]);

const norm = (t) => String(t ?? "").trim().replace(/\s+/g, "");
const baseOf = (t) => norm(t).replace(/-\d+(\/\d+)?$/, "");

/** Parse one MOMO packing xlsx → { container, lines:[{tracking, parcel, wt, cbm}] }. */
function parsePacking(cab) {
  const xml = execSync(`unzip -p "${DIR}/${cab}.xlsx" xl/worksheets/sheet1.xml`, { maxBuffer: 1e9 }).toString();
  const lines = [];
  let hdr = null;
  for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const n = +rm[1];
    const c = {};
    for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)) {
      const v = cm[2].match(/<v>([\s\S]*?)<\/v>/) || cm[2].match(/<t>([\s\S]*?)<\/t>/);
      if (v) c[cm[1]] = v[1].trim();
    }
    // r4 = the summary band: H=tracking count · K=boxes · M=total wt · O=total cbm · Q=container
    if (n === 4 && c.Q) hdr = { tracks: +(c.H || 0), boxes: +(c.K || 0), cab: c.Q.trim() };
    if (n < 7) continue;
    const t = norm(c.H);
    if (!t || t === "Tracking" || !c.L) continue;
    lines.push({ tracking: t, parcel: +(c.L || 0), wt: +(c.O || 0), cbm: +(c.P || 0) });
  }
  if (!hdr || !hdr.cab) return null; // non-standard layout → skip, never guess
  // drop the trailing container-TOTAL line (its "tracking" cell holds the tracking COUNT)
  const rows = lines.filter((r) => !(String(r.tracking) === String(hdr.tracks) && r.parcel === hdr.boxes));
  return { container: hdr.cab, lines: rows };
}

const client = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres", ssl: { rejectUnauthorized: false },
});

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) {
    console.error("SUPABASE_DB_PASSWORD required"); process.exit(1);
  }
  await client.connect();

  // ── 1. read every packing list → tracking → container (the TRUTH) ──────────
  const truth = new Map();          // exact tracking → container
  const skipped = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".xlsx"))) {
    const cab = f.replace(".xlsx", "");
    let p;
    try { p = parsePacking(cab); } catch (e) { skipped.push(`${cab} (parse: ${String(e).slice(0, 40)})`); continue; }
    if (!p) { skipped.push(`${cab} (layout ไม่มาตรฐาน)`); continue; }
    for (const l of p.lines) {
      const prev = truth.get(l.tracking);
      if (prev && prev !== p.container) {
        // the SAME exact tracking listed in two containers = MOMO ambiguity → never guess
        truth.set(l.tracking, "__CONFLICT__");
      } else if (!prev) truth.set(l.tracking, p.container);
    }
  }
  if (skipped.length) console.log(`⚠️  ข้ามไฟล์ที่อ่านไม่ได้ (${skipped.length}): ${skipped.join(", ")}\n`);

  // ── 2. only the bases MOMO actually split across containers matter ─────────
  const byBase = new Map();
  for (const [t, cab] of truth) {
    if (cab === "__CONFLICT__") continue;
    const b = baseOf(t);
    if (!byBase.has(b)) byBase.set(b, new Set());
    byBase.get(b).add(cab);
  }
  const splitBases = [...byBase.entries()].filter(([, s]) => s.size > 1).map(([b]) => b);
  console.log(`🔎 base ที่ MOMO แยกลงหลายตู้: ${splitBases.length} ตัว — ${splitBases.join(", ") || "(ไม่มี)"}\n`);
  if (splitBases.length === 0) { await client.end(); return; }

  // ── 3. compare each system row against the packing truth ──────────────────
  const moves = [], blocked = [], unknown = [];
  for (const b of splitBases) {
    const { rows } = await client.query(
      `SELECT id, ftrackingchn, fcabinetnumber, fstatus, famount, fweight, fvolume, ftransporttype, userid
         FROM tb_forwarder
        WHERE ftrackingchn = $1 OR ftrackingchn LIKE $2
        ORDER BY id`, [b, b + "-%"]);
    for (const r of rows) {
      const want = truth.get(norm(r.ftrackingchn));
      if (!want || want === "__CONFLICT__") { unknown.push({ ...r, why: want ? "ตู้ขัดกันใน packing" : "ไม่มีในใบ packing" }); continue; }
      const cur = (r.fcabinetnumber ?? "").trim();
      if (cur === want) continue;                               // already right
      if (BILLED.has(String(r.fstatus))) { blocked.push({ ...r, want, cur }); continue; }
      moves.push({ id: r.id, tracking: r.ftrackingchn, from: cur || "(ว่าง)", to: want, box: r.famount, fstatus: r.fstatus, userid: r.userid });
    }
  }

  console.log(`📋 ต้องย้ายตู้: ${moves.length} แถว`);
  for (const m of moves) console.log(`   #${m.id} ${m.tracking.padEnd(20)} ${m.box}กล่อง  ${m.from} → ${m.to}   [fstatus ${m.fstatus} · ${m.userid}]`);
  if (blocked.length) {
    console.log(`\n🔴 วางบิลแล้ว — ไม่แตะ (owner เคาะ): ${blocked.length} แถว`);
    for (const b of blocked) console.log(`   #${b.id} ${b.ftrackingchn} ${b.cur} → ควรเป็น ${b.want} [fstatus ${b.fstatus}]`);
  }
  if (unknown.length) {
    console.log(`\n⚠️  ไม่มีในใบ packing (ไม่แตะ): ${unknown.length} แถว`);
    for (const u of unknown.slice(0, 10)) console.log(`   #${u.id} ${u.ftrackingchn} [${u.why}]`);
  }

  // ── 4. show the resulting container totals so the owner can eyeball them ──
  const affected = [...new Set([...moves.map((m) => m.from), ...moves.map((m) => m.to)])].filter((c) => c && c !== "(ว่าง)");
  console.log(`\n📦 ยอดตู้ หลังย้าย (คาดการณ์):`);
  for (const cab of affected) {
    const { rows } = await client.query(
      `SELECT COALESCE(SUM(famount),0) box, COALESCE(SUM(fweight),0) wt, COALESCE(SUM(fvolume),0) cbm
         FROM tb_forwarder WHERE fcabinetnumber=$1`, [cab]);
    const cur = rows[0];
    let box = Number(cur.box), wt = Number(cur.wt), cbm = Number(cur.cbm);
    for (const m of moves) {
      const row = await client.query(`SELECT famount,fweight,fvolume FROM tb_forwarder WHERE id=$1`, [m.id]);
      const v = row.rows[0];
      if (m.from === cab) { box -= Number(v.famount || 0); wt -= Number(v.fweight || 0); cbm -= Number(v.fvolume || 0); }
      if (m.to === cab)   { box += Number(v.famount || 0); wt += Number(v.fweight || 0); cbm += Number(v.fvolume || 0); }
    }
    console.log(`   ${cab.padEnd(14)} ${String(cur.box).padStart(4)}→${String(box).padStart(4)} กล่อง · ${Number(cur.wt).toFixed(1).padStart(8)}→${wt.toFixed(1).padStart(8)} kg · ${Number(cur.cbm).toFixed(4).padStart(9)}→${cbm.toFixed(4).padStart(9)} คิว`);
  }

  if (!APPLY) { console.log(`\n(dry-run — ใส่ --apply เพื่อเขียนจริง)`); await client.end(); return; }
  if (moves.length === 0) { console.log("\nไม่มีอะไรต้องแก้"); await client.end(); return; }

  // ── 5. backup + apply in ONE transaction ─────────────────────────────────
  const ids = moves.map((m) => m.id);
  const { rows: backup } = await client.query(`SELECT * FROM tb_forwarder WHERE id = ANY($1)`, [ids]);
  const path = `scripts/_backup-cross-container-split-2026-07-16.json`;
  writeFileSync(path, JSON.stringify(backup, null, 2));
  console.log(`\n💾 backup → ${path} (${backup.length} แถว)`);

  await client.query("BEGIN");
  try {
    let n = 0;
    for (const m of moves) {
      // fcabinetnumber only (+ transport mode follows the container prefix: GZS=เรือ · GZE=รถ).
      // Guard the UPDATE on the CURRENT container + an unbilled fstatus so a concurrent
      // bill/move can't be silently clobbered (0 rows → we notice).
      const mode = /^GZS|^SEA/i.test(m.to) ? "2" : /^GZE|^EK/i.test(m.to) ? "1" : /^GZA|^AIR/i.test(m.to) ? "3" : null;
      const res = await client.query(
        `UPDATE tb_forwarder
            SET fcabinetnumber = $1${mode ? ", ftransporttype = $4" : ""}
          WHERE id = $2 AND COALESCE(fcabinetnumber,'') = $3 AND fstatus NOT IN ('5','6','7','8')`,
        mode ? [m.to, m.id, m.from === "(ว่าง)" ? "" : m.from, mode] : [m.to, m.id, m.from === "(ว่าง)" ? "" : m.from]);
      if (res.rowCount === 1) n++;
      else console.log(`   ⚠️ #${m.id} ไม่ถูกเขียน (ข้อมูลเปลี่ยนระหว่างรัน) — ข้าม`);
    }
    await client.query("COMMIT");
    console.log(`\n✅ ย้ายแล้ว ${n}/${moves.length} แถว`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ ROLLBACK:", e.message);
    process.exit(1);
  }
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
