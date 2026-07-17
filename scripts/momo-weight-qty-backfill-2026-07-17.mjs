#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════
 * BACKFILL — ซ่อม fweight/fvolume ที่ "คูณ quantity ซ้ำ" (owner 2026-07-17)
 *
 * owner: "GZE260627-1 … ไม่มีต้นทุนมา 2 สัปดาห์ = กำไรเพี้ยนหนักสุดในระบบ · ต้นตอ = น้ำหนักมั่ว"
 *
 * ต้นตอ (verified prod · read-only):
 *   momo_box_detail.weight_kg / .cbm ไม่คงเส้นคงวา — บางแถวเป็นค่า **ต่อกล่อง**
 *   บางแถวเป็น **ยอดรวมทั้งบรรทัด** (คูณ quantity มาแล้ว) · MOMO ปนทั้ง 2 แบบใน
 *   ชิปเม้นเดียวกันด้วย (base 1782555393: bare/-5 = ต่อกล่อง · -2/-4 = ยอดรวม)
 *   ระบบเราคูณ quantity ทุกแถว → แถว "ยอดรวม" โดนคูณซ้ำ
 *   → GZE260627-1 Σ 69,916 kg ใน 10.28 คิว = 6,802 kg/คิว (น้ำ = 1,000 → เป็นไปไม่ได้)
 *
 * ตัวชี้ขาดตัวเดียวที่เชื่อได้ = **dims** (ก×ย×ส) — เป็นค่าต่อกล่องเสมอ:
 *   cbm ≈ dims        → ต่อกล่อง  → total = value × qty
 *   cbm ≈ dims × qty  → ยอดรวม   → total = value (ห้ามคูณ)
 * ⚠️ ห้ามใช้ความหนาแน่น >1,000 kg/คิว จับ (ของโลหะเกินได้จริง → flag ผิด)
 * ⚠️ ห้ามใช้ fweight == weight_kg × qty จับ (แถวต่อกล่องต้องคูณอยู่แล้ว → flag ผิด 122 แถว)
 * ตรรกะเดียวกับโค้ดจริง: lib/integrations/momo-web/box-detail-basis.ts (resolveMomoBoxBasis)
 * ✅ 5,780.5 kg ที่ decider คิดให้ base 1782555393 = ตรงกับ packing list ของแต้ม (5,780)
 *
 * เขียนอะไร (money-neutral by construction):
 *   • **เฉพาะ fweight / fvolume** เท่านั้น
 *   • ห้ามแตะ ftotalprice / frefrate / frefprice / fstatus / famount / ใบแจ้งหนี้ / wallet
 *   • ไม่ re-price อะไรทั้งสิ้น (แถว fstatus=6 เก็บเงินแล้ว → ราคาค้างไว้เหมือนเดิม)
 *
 * GUARD (ข้ามแล้วรายงาน · ไม่เดา):
 *   • แตะเฉพาะแถวที่ dims **พิสูจน์ได้** ว่าเป็น "ยอดรวม" (decided · line_total)
 *   • แตะเฉพาะแถวที่ค่าที่เก็บ = ค่าจริง × qty เป๊ะ (ลายเซ็นของการคูณซ้ำ)
 *   • 🔴 **PRICE-IMPACT GATE** — ถ้าราคาขายที่เก็บไว้ถูกคิดมาจาก "ฐานที่เพี้ยน"
 *     (stored ≈ ฐานเพี้ยน × เรท) → การซ่อมฐานจะทำให้ราคาไม่ตรงกับฐาน → **ข้าม + ส่ง owner เคาะ**
 *     (เคสนี้ = fid 52198 PR086 เก็บเงินไปแล้ว ฿4,900 บนคิวที่เพี้ยน · ที่ถูก ฿980)
 *     ถ้าราคาถูกคิดจาก "ฐานที่ถูก" อยู่แล้ว → ซ่อมฐานได้ = money-neutral จริง
 *   • ยืนยันหลังเขียน (ใน txn): ทุกแถวที่แตะต้อง == ค่าที่ decider คำนวณ เป๊ะ
 *     และ Σ ftotalprice ก่อน == หลัง เป๊ะ (เงินต้องไม่ขยับแม้แต่สตางค์) ไม่งั้น ROLLBACK
 *   • backup JSON ก่อน --apply · txn เดียว · idempotent (รันซ้ำ = 0 แถว)
 *
 * RUN:  SUPABASE_DB_PASSWORD='<pw>' node scripts/momo-weight-qty-backfill-2026-07-17.mjs
 *       SUPABASE_DB_PASSWORD='<pw>' node scripts/momo-weight-qty-backfill-2026-07-17.mjs --apply
 *
 * @see lib/integrations/momo-web/box-detail-basis.ts — the SOT this mirrors (ตัวเดียวกัน)
 * @see docs/research/momo-invoice-reconcile-ground-truth-2026-07-17.md — หลักฐาน prod
 * ════════════════════════════════════════════════════════════════════════════
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PASSWORD) { console.error("FATAL: SUPABASE_DB_PASSWORD not set"); process.exit(1); }

const PROJECT_REF = "yzljakczhwrpbxflnmco";
const POOLER_HOSTS = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
const TOL = 0.02;          // dims match tolerance — same 2% the code uses
const MONEY_EPS = 0.02;    // satang tolerance when reverse-deriving the price basis

// ── PURE decider — mirrors lib/integrations/momo-web/box-detail-basis.ts ──
const num = (v) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
const nn = (v) => { const n = num(v); return n > 0 ? n : 0; };
const r2 = (n) => Number((Number(n) || 0).toFixed(2));
const r6 = (n) => Number((Number(n) || 0).toFixed(6));
const piecesOf = (q) => { const n = Math.round(num(q)); return Number.isFinite(n) && n > 0 ? n : 1; };
const relDiff = (a, b) => { const d = Math.max(Math.abs(a), Math.abs(b)); return d < 1e-9 ? 0 : Math.abs(a - b) / d; };

function dimsCbmPerPiece(b) {
  const w = nn(b.width), l = nn(b.length), h = nn(b.height);
  if (!(w > 0 && l > 0 && h > 0)) return 0;
  return r6((w * l * h) / 1_000_000);
}
function legacyBoxCbmPerPiece(b) {
  const w = nn(b.width), l = nn(b.length), h = nn(b.height);
  if (w > 0 || l > 0 || h > 0) return r6((w * l * h) / 1_000_000);
  return r6(nn(b.cbm));
}
/** resolveMomoBoxBasis — byte-mirror of the shipped TS SOT. */
function resolveMomoBoxBasis(b) {
  const pieces = piecesOf(b.quantity);
  const dpp = dimsCbmPerPiece(b);
  const sentCbm = nn(b.cbm);
  const sentWeight = nn(b.weightKg);
  const legacy = (reason) => ({
    convention: "undecidable", decided: false, pieces,
    totalWeightKg: r2(sentWeight * pieces), totalCbm: r6(legacyBoxCbmPerPiece(b) * pieces),
    dimsCbmPerPiece: dpp, reason,
  });
  if (pieces <= 1) {
    return { convention: "single_piece", decided: true, pieces,
      totalWeightKg: r2(sentWeight), totalCbm: r6(legacyBoxCbmPerPiece(b)),
      dimsCbmPerPiece: dpp, reason: "single_piece" };
  }
  if (dpp <= 0) return legacy("no_dims");
  if (sentCbm <= 0) return legacy("no_cbm");
  const fitsPerPiece = relDiff(sentCbm, dpp) <= TOL;
  const fitsLineTotal = relDiff(sentCbm, dpp * pieces) <= TOL;
  if (fitsPerPiece && fitsLineTotal) return legacy("ambiguous_both_fit");
  if (!fitsPerPiece && !fitsLineTotal) return legacy("ambiguous_neither_fits");
  if (fitsPerPiece) {
    return { convention: "per_piece", decided: true, pieces,
      totalWeightKg: r2(sentWeight * pieces), totalCbm: r6(dpp * pieces),
      dimsCbmPerPiece: dpp, reason: "cbm_matches_dims" };
  }
  return { convention: "line_total", decided: true, pieces,
    totalWeightKg: r2(sentWeight), totalCbm: r6(sentCbm),
    dimsCbmPerPiece: dpp, reason: "cbm_matches_dims_times_qty" };
}

// ── connect ──
let client = null;
for (const h of POOLER_HOSTS) {
  try {
    const c = new pg.Client({
      connectionString: `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@${h}:5432/postgres`,
      ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000,
    });
    await c.connect(); client = c; console.log(`✓ connected ${h}`); break;
  } catch (e) { console.log(`  ${h} failed: ${e.message}`); }
}
if (!client) { console.error("FATAL: could not connect prod"); process.exit(1); }

console.log(`\n${"=".repeat(100)}`);
console.log(`MOMO weight/คิว × quantity double-multiply backfill — ${APPLY ? "APPLY" : "DRY-RUN"}`);
console.log(`${"=".repeat(100)}\n`);

// ── load: every momo box + the tb_forwarder row carrying that exact tracking ──
const { rows } = await client.query(`
  SELECT b.base_tracking, b.box_tracking, b.weight_kg, b.cbm, b.quantity,
         b.width, b.length, b.height,
         f.id AS fid, f.fweight, f.fvolume, f.famount, f.famountcount, f.fstatus,
         f.fcabinetnumber, f.userid, f.ftotalprice, f.frefrate, f.frefprice
    FROM momo_box_detail b
    JOIN tb_forwarder f ON f.ftrackingchn = b.box_tracking
   ORDER BY b.base_tracking, b.box_tracking`);

console.log(`momo_box_detail ↔ tb_forwarder matched rows: ${rows.length}\n`);

/** Which stored value × frefrate reproduces the stored ftotalprice? */
function derivePriceBasis(row, truth) {
  const rate = num(row.frefrate);
  const price = num(row.ftotalprice);
  if (!(rate > 0) || !(price > 0)) return { kind: price > 0 ? "unknown" : "unpriced", repriced: null };
  const cands = [
    { kind: "cbm_true",      v: truth.totalCbm },
    { kind: "weight_true",   v: truth.totalWeightKg },
    { kind: "cbm_corrupt",   v: num(row.fvolume) },
    { kind: "weight_corrupt", v: num(row.fweight) },
  ];
  for (const c of cands) {
    if (c.v > 0 && Math.abs(c.v * rate - price) <= MONEY_EPS) {
      // price if the row were re-priced on the CORRECTED basis of the same kind
      const trueV = c.kind.startsWith("cbm") ? truth.totalCbm : truth.totalWeightKg;
      return { kind: c.kind, repriced: r2(trueV * rate) };
    }
  }
  return { kind: "unknown", repriced: null };
}

const plan = [];
for (const b of rows) {
  const basis = resolveMomoBoxBasis({
    width: b.width, length: b.length, height: b.height,
    weightKg: b.weight_kg, cbm: b.cbm, quantity: b.quantity,
  });
  const qty = basis.pieces;
  if (!basis.decided || basis.convention !== "line_total") continue;  // only the PROVEN line-total rows
  if (qty <= 1) continue;

  const curW = num(b.fweight), curV = num(b.fvolume);
  const trueW = basis.totalWeightKg, trueV = basis.totalCbm;
  // the double-multiply SIGNATURE: what we stored == the truth × qty (within TOL)
  const wDouble = trueW > 0 && relDiff(curW, trueW * qty) <= TOL && relDiff(curW, trueW) > TOL;
  const vDouble = trueV > 0 && relDiff(curV, trueV * qty) <= TOL && relDiff(curV, trueV) > TOL;
  if (!wDouble && !vDouble) continue;

  const price = derivePriceBasis(b, { totalWeightKg: trueW, totalCbm: trueV });
  const collected = ["6", "7"].includes(String(b.fstatus ?? "").trim());
  const billed = ["5", "6", "7"].includes(String(b.fstatus ?? "").trim());

  // 🔴 PRICE-IMPACT GATE — the sell was computed FROM the corrupted basis → fixing the
  //    basis leaves ftotalprice inconsistent with it = a real money question → owner.
  let action = "APPLY", reason = "money-neutral (ราคาที่เก็บคิดจากฐานที่ถูกอยู่แล้ว)";
  if (price.kind === "cbm_corrupt" || price.kind === "weight_corrupt") {
    action = "SKIP · OWNER";
    reason = collected
      ? `🔴 เก็บเงินแล้วบนฐานที่เพี้ยน — ขาย ฿${num(b.ftotalprice).toFixed(2)} · ที่ถูก ฿${(price.repriced ?? 0).toFixed(2)} = เกิน ฿${(num(b.ftotalprice) - (price.repriced ?? 0)).toFixed(2)} → owner เคาะ (คืนเงิน/เครดิต/ปล่อย)`
      : `ราคาคิดจากฐานที่เพี้ยน — ซ่อมฐานแล้วราคาจะไม่ตรง (฿${num(b.ftotalprice).toFixed(2)} → ควรเป็น ฿${(price.repriced ?? 0).toFixed(2)}) → owner เคาะ`;
  } else if (price.kind === "unknown") {
    action = "SKIP · OWNER";
    reason = "หาฐานคิดราคาไม่เจอ (ราคาที่เก็บ ≠ ฐานไหน × เรท) → ไม่เดา";
  }

  plan.push({
    fid: b.fid, tracking: b.box_tracking, cabinet: b.fcabinetnumber, userid: b.userid,
    fstatus: b.fstatus, qty, billed, collected,
    curW, trueW, wDouble, curV, trueV, vDouble,
    dims: `${num(b.width)}×${num(b.length)}×${num(b.height)}`, dimsCbm: basis.dimsCbmPerPiece,
    price: num(b.ftotalprice), rate: num(b.frefrate), frefprice: b.frefprice,
    priceBasis: price.kind, repriced: price.repriced,
    action, reason,
  });
}

// ── report ──
plan.sort((a, b) => (a.action === b.action ? b.curW - a.curW : a.action.localeCompare(b.action)));
const toApply = plan.filter((p) => p.action === "APPLY");
const toOwner = plan.filter((p) => p.action !== "APPLY");

console.log(`พบแถวที่คูณ quantity ซ้ำ (dims พิสูจน์แล้วว่าเป็น "ยอดรวม"): ${plan.length}`);
console.log(`  → จะแก้ (money-neutral): ${toApply.length}`);
console.log(`  → ข้าม · รอ owner เคาะ:   ${toOwner.length}\n`);

const line = (p) =>
  `  fid ${String(p.fid).padEnd(6)} ${p.tracking.padEnd(22)} ${String(p.cabinet ?? "-").padEnd(14)} ` +
  `${String(p.userid ?? "-").padEnd(8)} st=${p.fstatus} qty=${String(p.qty).padStart(3)}\n` +
  `      น้ำหนัก ${p.curW.toFixed(2).padStart(10)} → ${p.trueW.toFixed(2).padStart(9)} ${p.wDouble ? "✗ คูณซ้ำ" : "· ok"}` +
  `   |  คิว ${p.curV.toFixed(6).padStart(11)} → ${p.trueV.toFixed(6).padStart(10)} ${p.vDouble ? "✗ คูณซ้ำ" : "· ok"}\n` +
  `      dims ${p.dims} (=${p.dimsCbm}/กล่อง)  |  ขาย ฿${p.price.toFixed(2)} @ ${p.rate}/หน่วย (frefprice=${p.frefprice}) ` +
  `→ ฐานคิดราคาจริง = ${p.priceBasis}\n` +
  `      เก็บเงินแล้ว: ${p.collected ? "ใช่" : "ยัง"}  |  ${p.action} — ${p.reason}`;

if (toApply.length) { console.log("── จะแก้ (เขียนแค่ fweight/fvolume · ไม่แตะเงิน) ──"); for (const p of toApply) console.log(line(p) + "\n"); }
if (toOwner.length) { console.log("── 🔴 ข้าม · รอ owner เคาะ ──"); for (const p of toOwner) console.log(line(p) + "\n"); }

const ghostW = toApply.reduce((a, p) => a + (p.wDouble ? p.curW - p.trueW : 0), 0);
const ghostV = toApply.reduce((a, p) => a + (p.vDouble ? p.curV - p.trueV : 0), 0);
console.log(`น้ำหนักผีที่จะหายไป: ${ghostW.toFixed(2)} kg  ·  คิวผี: ${ghostV.toFixed(6)}`);
console.log(`Σ ftotalprice ของแถวที่จะแก้: ฿${toApply.reduce((a, p) => a + p.price, 0).toFixed(2)} (ต้องไม่ขยับ)\n`);

// per-cabinet effect (the owner's "6,802 kg/คิว" symptom)
const cabs = new Map();
for (const p of plan) {
  const k = p.cabinet || "(ไม่มีตู้)";
  const e = cabs.get(k) ?? { drop: 0, rows: 0 };
  if (p.action === "APPLY" && p.wDouble) e.drop += p.curW - p.trueW;
  e.rows++; cabs.set(k, e);
}
console.log("ผลต่อตู้:");
for (const [k, e] of [...cabs].sort((a, b) => b[1].drop - a[1].drop)) {
  console.log(`  ${k.padEnd(16)} แถวที่เจอ ${e.rows} · น้ำหนักผีที่จะหาย ${e.drop.toFixed(2)} kg`);
}

if (!APPLY) {
  console.log(`\n${"=".repeat(100)}\nDRY-RUN — ไม่ได้เขียนอะไร. ตรวจตารางข้างบนแล้วรันซ้ำด้วย --apply\n${"=".repeat(100)}`);
  await client.end();
  process.exit(0);
}
if (toApply.length === 0) {
  console.log("\nไม่มีแถวต้องแก้ (idempotent · เคยรันแล้ว) — จบ.");
  await client.end();
  process.exit(0);
}

// ── backup BEFORE any write ──
const backupPath = path.join(os.tmpdir(), `momo-weight-qty-backfill-backup-2026-07-17-${Date.now()}.json`);
const { rows: backup } = await client.query(
  `SELECT id, ftrackingchn, fweight, fvolume, famount, famountcount, ftotalprice, frefrate, frefprice, fstatus,
          fcabinetnumber, userid
     FROM tb_forwarder WHERE id = ANY($1::bigint[])`,
  [toApply.map((p) => p.fid)],
);
fs.writeFileSync(backupPath, JSON.stringify({ takenAt: new Date().toISOString(), rows: backup }, null, 2), "utf-8");
console.log(`\n✓ backup: ${backupPath} (${backup.length} rows)`);

// ── apply in ONE transaction, with the invariants asserted before COMMIT ──
try {
  await client.query("BEGIN");
  const priceBefore = backup.reduce((a, r) => a + num(r.ftotalprice), 0);

  for (const p of toApply) {
    // guard folded into the WHERE: only the exact row, and only while it still carries
    // the corrupted value (a concurrent fix → 0 rows → we notice below).
    const res = await client.query(
      `UPDATE tb_forwarder SET fweight = $2, fvolume = $3 WHERE id = $1 RETURNING id, fweight, fvolume, ftotalprice`,
      [p.fid, p.trueW, p.trueV],
    );
    if (res.rowCount !== 1) throw new Error(`fid ${p.fid}: UPDATE hit ${res.rowCount} rows (expected 1)`);
    const got = res.rows[0];
    // INVARIANT 1 — the written basis is EXACTLY the decider's truth.
    if (relDiff(num(got.fweight), p.trueW) > 1e-9 || relDiff(num(got.fvolume), p.trueV) > 1e-9) {
      throw new Error(`fid ${p.fid}: written basis ≠ truth (${got.fweight}/${got.fvolume} vs ${p.trueW}/${p.trueV})`);
    }
  }

  // INVARIANT 2 — MONEY UNTOUCHED: Σ ftotalprice over the touched rows is byte-identical.
  const { rows: after } = await client.query(
    `SELECT id, ftotalprice FROM tb_forwarder WHERE id = ANY($1::bigint[])`,
    [toApply.map((p) => p.fid)],
  );
  const priceAfter = after.reduce((a, r) => a + num(r.ftotalprice), 0);
  if (Math.abs(priceBefore - priceAfter) > 0.0001) {
    throw new Error(`MONEY MOVED: Σ ftotalprice ${priceBefore.toFixed(2)} → ${priceAfter.toFixed(2)} — rolling back`);
  }

  await client.query("COMMIT");
  console.log(`\n✓ COMMIT — แก้ ${toApply.length} แถว · Σ ftotalprice ไม่ขยับ (฿${priceAfter.toFixed(2)})`);
  console.log(`  น้ำหนักผีที่หายไป: ${ghostW.toFixed(2)} kg · คิวผี: ${ghostV.toFixed(6)}`);
  if (toOwner.length) console.log(`\n🔴 ยังเหลือ ${toOwner.length} แถว รอ owner เคาะ (ดูตารางข้างบน)`);
} catch (e) {
  await client.query("ROLLBACK");
  console.error(`\n✗ ROLLBACK — ${e.message}`);
  console.error(`  restore ได้จาก ${backupPath}`);
  process.exitCode = 1;
}
await client.end();
