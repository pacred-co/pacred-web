// ════════════════════════════════════════════════════════════════════════════
// RECONCILE — กล่อง/น้ำหนัก/ขนาด ของทุกชิปเม้น ให้ตรง momo_box_detail (ความจริงจาก MOMO)
//
// owner 2026-07-17 (พร้อมรูปป้ายกล่องจริง "1/2" = 2 กล่อง):
//   "PR050 ลูกค้าเขามาแค่ 2 กล่องนะครับ ... แทรคนี้กล่องที่ 1 นายกดมา 6 กล่องจะรั่ว
//    ทำไมยังแก้ไม่หายสักทีครับ ไหนบอกไม่เกิดขึ้นอีกไงครับ"
//   "MOMO หรือ live แยกแถว แยกแทรค กล่อง น้ำหนักมาชัดเจน แต่นายไปรวมหมด"
//   "ก็รวมไปเลยนะครับ คิดเงินเป็นชิปเม้น แต่มีแจง แทรคกิ้ง กล่อง ขนาด จำนวน ให้ชัดเจน"
//
// THE BUG (prod-verified · 519218029029 PR050):
//   momo_box_detail (MOMO's per-box truth):
//     519218029029-1/2 → 1 กล่อง · 16.5kg · 0.0356 คิว
//     519218029029-2/2 → 1 กล่อง · 20.0kg · 0.035574 คิว      Σ = 2 กล่อง · 36.5kg
//   tb_forwarder:
//     #52380 bare  famount=2 · 36.50kg · ฿730   ← the AGGREGATE header (money lives here)
//     #52477 -1/2  famount=2 · 36.50kg · ฿0     ← the aggregate COPIED onto the box ✗
//     #52478 -2/2  famount=2 · 36.50kg · ฿0     ← same ✗
//     Σ = 6 กล่อง / 109.5kg  → the screen shows "0/6" and the warehouse cannot reconcile.
//
// WHY IT NEVER SELF-HEALED: pass 6 (`box-detail-reconcile-plan.ts`) refuses any base whose
// bare row carries money (`priced_anchor_bare`) — zeroing a priced row's basis risked a
// later re-price turning ฿730 into ฿0. That refusal is now unnecessary: live-rate.ts has a
// ZERO-BASIS GUARD (`zero_basis_price_locked`) that refuses to re-price a 0-basis row, so
// the header's money is pinned and the header can safely become a pure summary row.
//
// WHAT THIS WRITES (money-neutral by construction):
//   • each "-N/M" sibling ← its OWN box from momo_box_detail: famount=quantity,
//     fweight=weight_kg, fvolume=cbm, fwidth/flength/fheight = its dims.
//     Their ftotalprice is 0, and we never re-price them → no money moves.
//   • the bare header ← famount=0, fweight=0, fvolume=0. Keeps ftotalprice untouched
//     (the shipment's SELL freight) — it becomes the summary row the owner asked for,
//     and the zero-basis guard locks its price.
//   • ftotalprice / frefrate / fstatus / any wallet or invoice row: NEVER touched.
//
// GUARDS (skip + report, never guess):
//   • UNBILLED only (fstatus NOT IN 5,6,7,8) unless --include-billed is passed
//   • every sibling must have its OWN momo_box_detail row (corroborated 1:1)
//   • Σ after == momo_box_detail Σ exactly, asserted inside the txn before COMMIT
//   • the bare must currently look like an aggregate (its basis ≈ the Σ), else skip
//   • backup JSON before --apply · single transaction · idempotent (re-run = 0)
//
// RUN:  node scripts/reconcile-box-basis-from-momo-2026-07-17.mjs            (dry-run)
//       node scripts/reconcile-box-basis-from-momo-2026-07-17.mjs --apply
//       …--apply --include-billed     (owner decision · a billed shipment's DISPLAY only)
// ════════════════════════════════════════════════════════════════════════════
import { writeFileSync } from "node:fs";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const INCLUDE_BILLED = process.argv.includes("--include-billed");
const BILLED = ["5", "6", "7", "8"];
const EPS_WT = 0.51;
const EPS_CBM = 0.0005;

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres", ssl: { rejectUnauthorized: false },
});

const n = (v) => Number(v ?? 0) || 0;
const baseOf = (t) => String(t ?? "").trim().replace(/-\d+(\/\d+)?$/, "");
const isBox = (t) => /-\d+(\/\d+)?$/.test(String(t ?? "").trim());

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }
  await c.connect();

  // MOMO truth, per box
  const { rows: bd } = await c.query(
    `SELECT base_tracking, box_tracking, quantity, weight_kg, cbm, width, length, height
       FROM momo_box_detail`);
  const truth = new Map();               // base → Map<box_tracking, detail>
  for (const b of bd) {
    const base = String(b.base_tracking).trim();
    if (!truth.has(base)) truth.set(base, new Map());
    truth.get(base).set(String(b.box_tracking).trim(), b);
  }

  // our rows for those bases
  const { rows: fw } = await c.query(
    `SELECT id, ftrackingchn, famount, famountcount, fweight, fvolume, fwidth, flength, fheight,
            ftotalprice, fstatus, fcabinetnumber, userid
       FROM tb_forwarder
      WHERE regexp_replace(ftrackingchn,'-[0-9]+(/[0-9]+)?$','') = ANY($1)`,
    [[...truth.keys()]]);
  const sys = new Map();
  for (const r of fw) {
    const b = baseOf(r.ftrackingchn);
    if (!sys.has(b)) sys.set(b, []);
    sys.get(b).push(r);
  }

  const plans = [], skips = [];
  for (const [base, boxes] of truth) {
    const rows = sys.get(base) ?? [];
    if (rows.length === 0) continue;
    const bares = rows.filter((r) => !isBox(r.ftrackingchn));
    const sibs = rows.filter((r) => isBox(r.ftrackingchn));
    if (sibs.length === 0) { skips.push({ base, why: "ไม่มีแถวย่อย (ยังไม่แตกกล่อง) — ใช้ split script" }); continue; }

    const billed = rows.filter((r) => BILLED.includes(String(r.fstatus)));
    if (billed.length > 0 && !INCLUDE_BILLED) {
      skips.push({ base, why: `วางบิล/จ่ายแล้ว ${billed.length} แถว (fstatus ${[...new Set(billed.map((b) => b.fstatus))].join("/")}) — ต้อง --include-billed` });
      continue;
    }

    // every sibling must match its own box detail 1:1
    const unmatched = sibs.filter((s) => !boxes.has(String(s.ftrackingchn).trim()));  // box-suffixed but unknown to MOMO
    if (unmatched.length > 0) {
      skips.push({ base, why: `แถวย่อย ${unmatched.length} ตัวไม่มีใน momo_box_detail (${unmatched.slice(0, 2).map((u) => u.ftrackingchn).join(",")})` });
      continue;
    }

    // ⚠️ momo_box_detail.weight_kg / .cbm are PER-BOX; a row's fweight/fvolume are the
    // LINE TOTAL = per-box × quantity. Verified on prod: 1783582423-23 → qty 28 ·
    // weight_kg 19 · cbm 0.1494 ⇒ fweight 532.00 · fvolume 4.183200 (= ×28, and already
    // correct in tb_forwarder). Reading weight_kg as the total would have slashed ~30
    // shipments' weight (KY4001030721114 1782→403.5) = a huge under-charge. The dry-run
    // caught it; keep the ×quantity or this script becomes the bug it fixes.
    const truthQty = [...boxes.values()].reduce((s, b) => s + n(b.quantity), 0);
    const truthWt = [...boxes.values()].reduce((s, b) => s + n(b.weight_kg) * n(b.quantity), 0);
    const truthCbm = [...boxes.values()].reduce((s, b) => s + n(b.cbm) * n(b.quantity), 0);

    // ⚠️ A BARE ROW CAN BE A REAL BOX. MOMO lists the first box under the bare tracking
    // (1783582423 → qty 13 · 19kg/box ⇒ fweight 247, and it IS in momo_box_detail).
    // Only a bare with NO box_detail entry of its own — while box siblings exist — is the
    // aggregate HEADER. Zeroing every bare would have deleted 13 real boxes / 247kg from
    // 1783582423. Discriminate by presence in the truth table, never by the name shape.
    // ⚠️ DUPLICATE ROWS — the invariant caught this on the first --apply and rolled the
    // whole txn back: 1783582989 came out 8 กล่อง/116kg against a truth of 4/58 (exactly
    // 2×) because TWO tb_forwarder rows carry the SAME box_tracking, so both received the
    // same box's values. Writing per-box truth onto a duplicated row set can only ever
    // double it. Dedup is a different job (scripts/reconcile-momo-dup-rows-*) with its own
    // money guards — skip and report, never silently pick one.
    const dupTracks = [...new Map(
      rows.reduce((m, r) => {
        const k = String(r.ftrackingchn).trim();
        m.set(k, (m.get(k) ?? 0) + 1);
        return m;
      }, new Map()),
    ).entries()].filter(([, cnt]) => cnt > 1);
    if (dupTracks.length > 0) {
      skips.push({ base, why: `มีแถวซ้ำ ${dupTracks.length} tracking (${dupTracks.slice(0, 2).map(([t, cnt]) => `${t}×${cnt}`).join(",")}) — ต้อง dedup ก่อน` });
      continue;
    }

    const realBoxes = rows.filter((r) => boxes.has(String(r.ftrackingchn).trim()));
    const headers = rows.filter((r) => !boxes.has(String(r.ftrackingchn).trim()));
    if (realBoxes.length === 0) { skips.push({ base, why: "ไม่มีแถวไหนตรงกับ momo_box_detail เลย" }); continue; }

    // ⚠️ MISSING BOX — MOMO knows a box we have no row for (invariant caught
    // 100029558416: truth 3 กล่อง/44.5kg, we only hold 2 rows ⇒ the Σ can never reach the
    // truth however we write). Creating the row is the SPLIT job (it mints a billable row
    // = money), not this one. Skip + report so it lands on the split/backfill list.
    const known = new Set(rows.map((r) => String(r.ftrackingchn).trim()));
    const missingBoxes = [...boxes.keys()].filter((k) => !known.has(k));
    if (missingBoxes.length > 0) {
      skips.push({ base, why: `MOMO มีกล่องที่ระบบไม่มีแถว ${missingBoxes.length} ตัว (${missingBoxes.slice(0, 2).join(",")}) — ต้อง split/สร้างแถวก่อน` });
      continue;
    }

    const writes = [];
    for (const s of realBoxes) {
      const d = boxes.get(String(s.ftrackingchn).trim());
      const q = n(d.quantity) || 1;
      const want = {
        famount: q,
        fweight: Math.round(n(d.weight_kg) * q * 100) / 100,   // per-box × qty = the line total
        fvolume: Math.round(n(d.cbm) * q * 1e6) / 1e6,          // numeric(14,6)
        fwidth: n(d.width), flength: n(d.length), fheight: n(d.height),
      };
      const same = n(s.famount) === want.famount && Math.abs(n(s.fweight) - want.fweight) < 0.01 && Math.abs(n(s.fvolume) - want.fvolume) < 1e-6;
      if (!same) writes.push({ id: s.id, tracking: s.ftrackingchn, kind: "box", from: `${s.famount}กล่อง/${n(s.fweight)}kg`, to: `${want.famount}กล่อง/${want.fweight}kg`, want, price: n(s.ftotalprice) });
    }
    // the aggregate header (no box_detail of its own) → pure summary (basis 0 · money kept)
    for (const b of headers) {
      if (n(b.famount) === 0 && n(b.fweight) === 0 && n(b.fvolume) === 0) continue;
      writes.push({ id: b.id, tracking: b.ftrackingchn, kind: "header", from: `${b.famount}กล่อง/${n(b.fweight)}kg`, to: `0/0 (หัวสรุป · เก็บ ฿${n(b.ftotalprice)})`, want: { famount: 0, fweight: 0, fvolume: 0 }, price: n(b.ftotalprice) });
    }
    if (writes.length === 0) continue;

    const sysQtyNow = rows.reduce((s, r) => s + n(r.famount), 0);
    const sysWtNow = rows.reduce((s, r) => s + n(r.fweight), 0);
    plans.push({ base, cab: rows[0].fcabinetnumber, pr: rows[0].userid, st: [...new Set(rows.map((r) => r.fstatus))].join("/"),
      truthQty, truthWt, truthCbm, sysQtyNow, sysWtNow, writes,
      headerMoney: bares.reduce((s, b) => s + n(b.ftotalprice), 0) });
  }

  plans.sort((a, b) => (b.sysQtyNow - b.truthQty) - (a.sysQtyNow - a.truthQty));
  console.log(`📋 ชิปเม้นที่จะแก้ให้ตรง MOMO: ${plans.length}\n`);
  console.log("base                 PR      ตู้            กล่อง       น้ำหนัก(kg)      แถวที่เขียน");
  for (const p of plans.slice(0, 30)) {
    console.log(`${p.base.padEnd(20)} ${(p.pr || "").padEnd(7)} ${(p.cab || "-").padEnd(13)} ${String(p.sysQtyNow).padStart(3)}→${String(p.truthQty).padStart(3)}  ${String(p.sysWtNow.toFixed(1)).padStart(8)}→${String(p.truthWt.toFixed(1)).padStart(8)}  ${p.writes.length} แถว  [st ${p.st}]`);
  }
  if (plans.length > 30) console.log(`   … อีก ${plans.length - 30} ชิปเม้น`);
  const totalWrites = plans.reduce((s, p) => s + p.writes.length, 0);
  console.log(`\nรวม ${totalWrites} แถวที่จะเขียน (famount/fweight/fvolume/dims เท่านั้น · ไม่แตะ ftotalprice/fstatus)`);
  if (skips.length) {
    console.log(`\n⏭️  ข้าม ${skips.length} ชิปเม้น:`);
    const byWhy = {};
    for (const s of skips) { const k = s.why.replace(/\(.*/, "").trim(); (byWhy[k] ??= []).push(s.base); }
    for (const [why, bases] of Object.entries(byWhy)) console.log(`   ${why} → ${bases.length} ตัว: ${bases.slice(0, 4).join(", ")}${bases.length > 4 ? " …" : ""}`);
  }

  if (!APPLY) { console.log("\n(dry-run — ใส่ --apply เพื่อเขียนจริง)"); await c.end(); return; }
  if (plans.length === 0) { console.log("\nไม่มีอะไรต้องแก้"); await c.end(); return; }

  const ids = plans.flatMap((p) => p.writes.map((w) => w.id));
  const { rows: bak } = await c.query(`SELECT * FROM tb_forwarder WHERE id = ANY($1)`, [ids]);
  const path = "scripts/_backup-box-basis-2026-07-17.json";
  writeFileSync(path, JSON.stringify(bak, null, 2));
  console.log(`\n💾 backup → ${path} (${bak.length} แถว)`);

  await c.query("BEGIN");
  try {
    const moneyBefore = (await c.query(`SELECT COALESCE(SUM(ftotalprice),0) t FROM tb_forwarder WHERE id = ANY($1)`, [ids])).rows[0].t;
    let wrote = 0;
    for (const p of plans) {
      for (const w of p.writes) {
        const cols = w.want;
        const set = Object.keys(cols).map((k, i) => `${k} = $${i + 2}`).join(", ");
        const res = await c.query(
          `UPDATE tb_forwarder SET ${set} WHERE id = $1${INCLUDE_BILLED ? "" : ` AND fstatus NOT IN ('5','6','7','8')`}`,
          [w.id, ...Object.values(cols)]);
        wrote += res.rowCount;
      }
    }
    // INVARIANT 1 — money untouched
    const moneyAfter = (await c.query(`SELECT COALESCE(SUM(ftotalprice),0) t FROM tb_forwarder WHERE id = ANY($1)`, [ids])).rows[0].t;
    if (Number(moneyBefore) !== Number(moneyAfter)) throw new Error(`MONEY MOVED: ${moneyBefore} → ${moneyAfter}`);
    // INVARIANT 2 — every touched base now Σ-matches MOMO
    for (const p of plans) {
      const { rows: after } = await c.query(
        `SELECT COALESCE(SUM(famount),0) q, COALESCE(SUM(fweight),0) w FROM tb_forwarder
          WHERE regexp_replace(ftrackingchn,'-[0-9]+(/[0-9]+)?$','') = $1`, [p.base]);
      if (Number(after[0].q) !== p.truthQty || Math.abs(Number(after[0].w) - p.truthWt) > EPS_WT) {
        throw new Error(`INVARIANT FAIL ${p.base}: ได้ ${after[0].q}กล่อง/${after[0].w}kg ต้องเป็น ${p.truthQty}/${p.truthWt}`);
      }
    }
    await c.query("COMMIT");
    console.log(`\n✅ เขียน ${wrote} แถว · เงินไม่ขยับ (Σ ${moneyBefore}) · ทุกชิปเม้น Σ ตรง momo_box_detail ✓`);
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("❌ ROLLBACK:", e.message);
    process.exit(1);
  }
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
