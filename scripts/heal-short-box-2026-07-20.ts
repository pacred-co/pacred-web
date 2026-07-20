/**
 * heal-short-box-2026-07-20.ts — restore the boxes the backlink sweep made invisible
 * (owner 2026-07-20 "ตรวจข้อมูลให้ถูกต้องก่อน จากนั้น fill ไปเลยครับ").
 *
 * ROOT: scripts/backlink-staging-committed-2026-07-20.ts (the "stamped 44" sweep)
 * stamped genuinely-UNCOMMITTED staging boxes onto EXISTING family rows via its
 * anchor/bare_to_box fallbacks WITHOUT checking the target row's VALUE covers the
 * box → 7 families are now missing a box's weight/คิว entirely (เก็บเงินขาด) and 2
 * rows hold wrong values. All families verified UNBILLED (fstatus 2/3).
 *
 * ACTIONS (each verified row-by-row against staging + box_detail on 2026-07-20):
 *   CREATE — clone an unbilled sibling using the split engine's exact posture
 *            (everything except id/tracking/per-box metrics/sell/shipment-money),
 *            basis from the row's OWN staging (famountcount='1'), dims from
 *            box_detail when present, ALL money = 0 (the ฿0 billing gate + CS
 *            pricing own the price — never guessed here), staging re-pointed.
 *   FIX    — an UNPRICED row whose values ≠ its own staging → set to staging truth.
 *   REPRICE52751 — fvolume was the TOTAL but famountcount was NULL → every consumer
 *            (incl. the pricer) multiplied ×famount → sell 9,039.23 instead of
 *            0.410874×5500 = 2,259.81 (unbilled · caught before billing). Fix the
 *            flag + count + re-price by the row's OWN stored rate (the pass-6
 *            writer's exact formula).
 *   COUNTSYNC — display-only famount ← staging qty (famountcount='1' rows only).
 *
 * SKIPPED (verified NOT under-billed): 519218029036 (single row carries the full
 * family Σ — unsplit but fully valued) · 800020986676 (billed PAID lump — บัญชี).
 *
 * Usage:
 *   DBPW=… tsx scripts/heal-short-box-2026-07-20.ts           (dry-run)
 *   DBPW=… tsx scripts/heal-short-box-2026-07-20.ts --apply
 */
import pg from "pg";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const r2 = (n: number) => Number(n.toFixed(2));
const r6 = (n: number) => Number(n.toFixed(6));

// the split engine's posture (split-box-rows.ts) — never clone these onto a new sibling
const CLONE_OMIT = new Set<string>([
  "id",
  "ftrackingchn", "fweight", "fvolume", "fwidth", "flength", "fheight", "famount", "famountcount",
  "ftotalprice", "frefrate", "frefprice",
  "ftransportprice", "fpriceupdate", "fshippingservice",
  "pricecrate", "ftransportpricechnthb", "priceother", "fdiscount",
  "fcosttotalprice",
  "adminidupdate", "fdateadminstatus",
]);

type Fam = {
  base: string;
  /** staging trackings that must get their OWN new row */
  create: string[];
  /** clone template = this unbilled sibling id */
  template: number;
  /** rows to converge to their OWN staging truth (unpriced only — asserted) */
  fixToStaging?: Array<{ id: number; tracking: string }>;
  /** display-only famount ← staging qty (famountcount='1' only) */
  countSync?: Array<{ id: number; tracking: string }>;
  reprice52751?: boolean;
};

const FAMILIES: Fam[] = [
  { base: "1784190161", create: ["1784190161"], template: 52853 },
  { base: "1784366971", create: ["1784366971"], template: 52885, fixToStaging: [{ id: 52885, tracking: "1784366971-2" }] },
  { base: "1784432869", create: ["1784432869"], template: 52868, fixToStaging: [{ id: 52867, tracking: "1784432869-2" }] },
  { base: "202111486075", create: ["202111486075-2"], template: 52751, reprice52751: true },
  { base: "302197036845", create: ["302197036845-2"], template: 52813, countSync: [{ id: 52813, tracking: "302197036845" }] },
  { base: "76023796235", create: ["76023796235"], template: 52741 },
  { base: "908007156796", create: ["908007156796"], template: 52896 },
];

async function main() {
  const c = new pg.Client({
    host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
    user: "postgres.yzljakczhwrpbxflnmco", password: process.env.DBPW,
    database: "postgres", ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const backup: Record<string, unknown> = {};
  let created = 0, fixed = 0, counted = 0, repriced = 0;

  for (const fam of FAMILIES) {
    console.log(`\n═══ ${fam.base} ═══`);
    const { rows: staging } = await c.query(
      `SELECT id, momo_tracking_no, quantity, weight_kg, cbm, committed_forwarder_id
       FROM momo_import_tracks WHERE regexp_replace(btrim(momo_tracking_no),'-\\d+(/\\d+)?$','') = $1`,
      [fam.base],
    );
    const { rows: live } = await c.query(
      `SELECT * FROM tb_forwarder
       WHERE regexp_replace(btrim(ftrackingchn),'-\\d+(/\\d+)?$','') = $1
         AND COALESCE(fstatus,'') NOT IN ('','0','99') ORDER BY id`,
      [fam.base],
    );
    backup[fam.base] = { staging, live };
    const stByTrack = new Map(staging.map((s) => [String(s.momo_tracking_no).trim(), s]));
    const liveByTrack = new Map(live.map((l) => [String(l.ftrackingchn).trim(), l]));
    const stagingSumWt = r2(staging.reduce((s, x) => s + Number(x.weight_kg || 0), 0));

    // guards: family must be unbilled + template exists + no target tracking taken
    if (live.some((l) => ["5", "6", "7"].includes(String(l.fstatus).trim()))) {
      console.error(`  REFUSE — family has billed rows`); continue;
    }
    const template = live.find((l) => Number(l.id) === fam.template);
    if (!template) { console.error(`  REFUSE — template ${fam.template} not in family`); continue; }
    let refuse = false;
    for (const t of fam.create) {
      if (liveByTrack.has(t)) { console.error(`  REFUSE — target ${t} already live`); refuse = true; }
      if (!stByTrack.has(t)) { console.error(`  REFUSE — no staging for ${t}`); refuse = true; }
    }
    if (refuse) continue;

    const plans: string[] = [];

    // FIX rows → own staging truth (unpriced only)
    for (const f of fam.fixToStaging ?? []) {
      const row = live.find((l) => Number(l.id) === f.id);
      const st = stByTrack.get(f.tracking);
      if (!row || !st) { console.error(`  REFUSE fix #${f.id} — row/staging missing`); refuse = true; continue; }
      if (Number(row.ftotalprice) > 0) { console.error(`  REFUSE fix #${f.id} — row is priced`); refuse = true; continue; }
      plans.push(`FIX #${f.id} ${f.tracking}: (${row.famount}/${row.fweight}/${row.fvolume}) → (${st.quantity}/${r2(Number(st.weight_kg))}/${r6(Number(st.cbm))})`);
    }
    // 52751 special reprice
    if (fam.reprice52751) {
      const row = live.find((l) => Number(l.id) === 52751);
      if (!row || r2(Number(row.ftotalprice)) !== 9039.23 || Number(row.frefrate) !== 5500) {
        console.error(`  REFUSE 52751 reprice — state changed (${row?.ftotalprice}/${row?.frefrate})`); refuse = true;
      } else {
        const newPrice = r2(Number(row.fvolume) * Number(row.frefrate)); // 0.410874×5500 = 2259.81
        plans.push(`REPRICE #52751: famount 4→3 · famountcount →'1' · ฿9,039.23 → ฿${newPrice} (fvolume ${row.fvolume} × rate 5500)`);
      }
    }
    // COUNT sync
    for (const cs of fam.countSync ?? []) {
      const row = live.find((l) => Number(l.id) === cs.id);
      const st = stByTrack.get(cs.tracking);
      if (!row || !st) continue;
      if (String(row.famountcount).trim() !== "1") { plans.push(`SKIP countSync #${cs.id} (famountcount≠'1')`); continue; }
      if (Math.round(Number(row.famount)) !== Number(st.quantity)) {
        plans.push(`COUNT #${cs.id}: famount ${row.famount} → ${st.quantity}`);
      }
    }
    // CREATE rows
    for (const t of fam.create) {
      const st = stByTrack.get(t)!;
      plans.push(`CREATE ${t}: ${st.quantity} กล่อง · ${r2(Number(st.weight_kg))} kg · ${r6(Number(st.cbm))} คิว (clone #${fam.template} · ฿0 · staging ${st.id} re-point)`);
    }
    if (refuse) continue;
    for (const p of plans) console.log(`  ${p}`);

    if (!APPLY) continue;

    await c.query("BEGIN");
    try {
      for (const f of fam.fixToStaging ?? []) {
        const st = stByTrack.get(f.tracking)!;
        const u = await c.query(
          `UPDATE tb_forwarder SET famount=$1, fweight=$2, fvolume=$3, famountcount='1', adminidupdate='sys-heal'
           WHERE id=$4 AND fstatus IN ('1','2','3','4') AND ftotalprice <= 0 RETURNING id`,
          [Number(st.quantity), r2(Number(st.weight_kg)), r6(Number(st.cbm)), f.id],
        );
        if (u.rowCount !== 1) throw new Error(`fix #${f.id} matched ${u.rowCount} rows`);
        fixed += 1;
      }
      if (fam.reprice52751) {
        const u = await c.query(
          `UPDATE tb_forwarder SET famount=3, famountcount='1', ftotalprice=$1, adminidupdate='sys-heal'
           WHERE id=52751 AND fstatus IN ('1','2','3','4') AND ftotalprice=9039.23 RETURNING id`,
          [r2(0.410874 * 5500)],
        );
        if (u.rowCount !== 1) throw new Error(`52751 reprice matched ${u.rowCount}`);
        repriced += 1;
      }
      for (const cs of fam.countSync ?? []) {
        const st = stByTrack.get(cs.tracking)!;
        const row = live.find((l) => Number(l.id) === cs.id)!;
        if (String(row.famountcount).trim() !== "1") continue;
        if (Math.round(Number(row.famount)) === Number(st.quantity)) continue;
        const u = await c.query(
          `UPDATE tb_forwarder SET famount=$1 WHERE id=$2 AND famountcount='1' AND fstatus IN ('1','2','3','4') RETURNING id`,
          [Number(st.quantity), cs.id],
        );
        if (u.rowCount === 1) counted += 1;
      }
      for (const t of fam.create) {
        const st = stByTrack.get(t)!;
        const { rows: bx } = await c.query(
          `SELECT width, length, height FROM momo_box_detail WHERE box_tracking = $1 LIMIT 1`, [t],
        );
        const dims = bx[0] ?? { width: 0, length: 0, height: 0 };
        const cols = Object.keys(template).filter((k) => !CLONE_OMIT.has(k));
        const colSql = cols.map((k) => `"${k}"`).join(", ");
        const overrides = {
          ftrackingchn: t,
          famount: Number(st.quantity),
          famountcount: "1",
          fweight: r2(Number(st.weight_kg)),
          fvolume: r6(Number(st.cbm)),
          fwidth: r2(Number(dims.width || 0)),
          flength: r2(Number(dims.length || 0)),
          fheight: r2(Number(dims.height || 0)),
          ftotalprice: 0, frefrate: 0, frefprice: "",
          ftransportprice: 0, fpriceupdate: 0, fshippingservice: 0,
          pricecrate: 0, ftransportpricechnthb: 0, priceother: 0, fdiscount: 0,
          fcosttotalprice: 0,
          adminidupdate: "sys-heal",
          fdateadminstatus: new Date().toISOString(),
        } as Record<string, unknown>;
        const oKeys = Object.keys(overrides);
        const oSql = oKeys.map((k) => `"${k}"`).join(", ");
        const oParams = oKeys.map((_, i) => `$${i + 2}`).join(", ");
        const ins = await c.query(
          `INSERT INTO tb_forwarder (${colSql}, ${oSql})
           SELECT ${colSql}, ${oParams} FROM tb_forwarder WHERE id = $1 RETURNING id`,
          [fam.template, ...oKeys.map((k) => overrides[k])],
        );
        const newId = Number(ins.rows[0].id);
        await c.query(
          `UPDATE momo_import_tracks SET committed_forwarder_id=$1, committed_at=COALESCE(committed_at, NOW()), updated_at=NOW()
           WHERE id=$2`, [newId, st.id],
        );
        console.log(`  created #${newId} ← ${t}`);
        created += 1;
      }
      // family Σ verify INSIDE the txn — abort on mismatch
      const { rows: v } = await c.query(
        `SELECT ROUND(SUM(fweight)::numeric,2) wt FROM tb_forwarder
         WHERE regexp_replace(btrim(ftrackingchn),'-\\d+(/\\d+)?$','') = $1
           AND COALESCE(fstatus,'') NOT IN ('','0','99')`, [fam.base],
      );
      const liveSum = Number(v[0].wt);
      if (Math.abs(liveSum - stagingSumWt) > 0.05) {
        throw new Error(`Σ mismatch after heal: live ${liveSum} vs staging ${stagingSumWt}`);
      }
      await c.query("COMMIT");
      console.log(`  ✓ family Σ = ${liveSum} kg (staging ${stagingSumWt}) — COMMITTED`);
    } catch (e) {
      await c.query("ROLLBACK");
      console.error(`  ✗ ROLLED BACK: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (APPLY) fs.writeFileSync(`scripts/_backup-heal-shortbox-${Date.now()}.json`, JSON.stringify(backup, null, 2));
  console.log(`\n${APPLY ? "APPLIED" : "DRY-RUN"} — created ${created} · fixed ${fixed} · counted ${counted} · repriced ${repriced}`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
