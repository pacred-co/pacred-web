/**
 * AUDIT-B — READ-ONLY blast-radius scan for the MOMO "box bug" (owner 2026-07-16).
 * NO writes. SELECT only. Prints the per-row data-fix plan for the owner to apply.
 *
 * Classes:
 *   (1) CORRUPT DETAIL rows — a "-N/M" (or "-N") tb_forwarder row whose
 *       (famount,fweight,fvolume) differ from its momo_box_detail box (the truth).
 *   (2) AGGREGATE-WEIGHT BARE bases — a bare (suffix-0) tb_forwarder row that has
 *       box-suffixed siblings in the same base+userid, fweight>0 AND ftotalprice=0
 *       (the double-count header the count SOT currently keeps because fweight!=0).
 *   (3) X-prefix / non-momo_box_detail rows with famount>1 (owner-review only).
 *
 * RUN: node scripts/audit-momo-box-blast-radius-2026-07-16.mjs
 */
import pg from "pg";

const client = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: "DqOzfEZVXfMHIryz",
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

// ── pure helpers (mirror box-detail-recompute / split-box-rows-plan) ──
const num = (v) => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const suffixOf = (t) => {
  const m = /-(\d+)(?:\/\d+)?$/.exec((t ?? "").trim());
  return m ? Number(m[1]) : 0;
};
const baseOf = (t) => (t ?? "").trim().replace(/-\d+(?:\/\d+)?$/, "");
const piecesOf = (q) => {
  const n = Math.round(num(q));
  return Number.isFinite(n) && n > 0 ? n : 1;
};
const r2 = (n) => Number(num(n).toFixed(2));
const r6 = (n) => Number(num(n).toFixed(6));
const boxCbmFromDims = (w, l, h, cbm) => {
  const W = num(w), L = num(l), H = num(h);
  if (W > 0 || L > 0 || H > 0) return r6((W * L * H) / 1_000_000);
  return r6(num(cbm));
};
// relative difference; treat both-near-zero as equal
const relDiff = (a, b) => {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom < 1e-9) return 0;
  return Math.abs(a - b) / denom;
};
const TOL = 0.02; // 2% — same tolerance the split money-basis guard uses

async function main() {
  await client.connect();

  // ── Load momo_box_detail (the truth) ──
  const { rows: boxRows } = await client.query(
    `SELECT base_tracking, box_tracking, width, length, height, weight_kg, cbm, quantity, member_code, container_name
       FROM momo_box_detail`,
  );
  const byBoxTracking = new Map(); // exact box_tracking -> row
  const baseSet = new Set();
  const boxTrackingSet = new Set();
  for (const b of boxRows) {
    const bt = (b.box_tracking ?? "").trim();
    if (bt) {
      byBoxTracking.set(bt, b);
      boxTrackingSet.add(bt);
    }
    const base = (b.base_tracking ?? "").trim();
    if (base) baseSet.add(base);
  }

  // ── Load tb_forwarder rows for every tracking momo knows (box + base) ──
  const wanted = Array.from(new Set([...boxTrackingSet, ...baseSet]));
  const { rows: fwd } = await client.query(
    `SELECT id, ftrackingchn, famount, famountcount, fweight, fvolume,
            fwidth, flength, fheight, ftotalprice, frefrate, frefprice,
            fstatus, fcabinetnumber, userid
       FROM tb_forwarder
      WHERE ftrackingchn = ANY($1::text[])`,
    [wanted],
  );

  // Group tb_forwarder rows by (baseOf(tracking) :: userid)
  const groups = new Map();
  for (const r of fwd) {
    const key = `${baseOf(r.ftrackingchn)}::${r.userid ?? ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  // ── CLASS 1 — CORRUPT DETAIL rows ──
  const corrupt = [];
  for (const r of fwd) {
    if (suffixOf(r.ftrackingchn) <= 0) continue; // only suffixed detail rows
    const box = byBoxTracking.get((r.ftrackingchn ?? "").trim());
    if (!box) continue; // no truth to compare
    const qty = piecesOf(box.quantity);
    const truthWeight = r2(num(box.weight_kg) * qty);
    const truthCbm = r6(boxCbmFromDims(box.width, box.length, box.height, box.cbm) * qty);
    const truthAmount = qty;

    const curAmount = Math.round(num(r.famount));
    const curWeight = num(r.fweight);
    const curVolume = num(r.fvolume);

    const amountDiff = curAmount !== truthAmount;
    const weightDiff = relDiff(curWeight, truthWeight) > TOL;
    const volumeDiff = relDiff(curVolume, truthCbm) > TOL;
    if (!amountDiff && !weightDiff && !volumeDiff) continue;

    corrupt.push({
      id: r.id,
      tracking: r.ftrackingchn,
      userid: r.userid,
      fstatus: r.fstatus,
      billed: Number(r.fstatus) >= 6,
      ftotalprice: num(r.ftotalprice),
      priced: num(r.ftotalprice) > 0,
      frefrate: r.frefrate,
      frefprice: r.frefprice,
      cur: { famount: curAmount, fweight: curWeight, fvolume: curVolume,
             fwidth: num(r.fwidth), flength: num(r.flength), fheight: num(r.fheight) },
      truth: { famount: truthAmount, fweight: truthWeight, fvolume: truthCbm,
               fwidth: num(box.width), flength: num(box.length), fheight: num(box.height), quantity: qty },
      diff: { amountDiff, weightDiff, volumeDiff },
      cabinet: r.fcabinetnumber,
    });
  }

  // ── CLASS 2 — AGGREGATE-WEIGHT BARE bases ──
  const aggBare = [];
  for (const [key, rows] of groups) {
    const hasBoxSibling = rows.some((r) => suffixOf(r.ftrackingchn) > 0);
    if (!hasBoxSibling) continue;
    for (const r of rows) {
      if (suffixOf(r.ftrackingchn) !== 0) continue; // bare only
      const w = num(r.fweight);
      const money = num(r.ftotalprice);
      // sibling stats in this group
      const siblings = rows.filter((s) => suffixOf(s.ftrackingchn) > 0);
      const sibWeightSum = r2(siblings.reduce((a, s) => a + num(s.fweight), 0));
      const sibAmountSum = siblings.reduce((a, s) => a + Math.round(num(s.famount)), 0);
      const sibVolumeSum = r6(siblings.reduce((a, s) => a + num(s.fvolume), 0));
      // A redundant aggregate: bare.fweight ≈ Σsiblings AND bare.famount ≈ Σsibling count.
      const looksAggregate =
        relDiff(w, sibWeightSum) <= TOL && Math.round(num(r.famount)) >= sibAmountSum - 0;
      // The dangerous case for the code fix: bare with box siblings + money 0 + weight>0
      // that is NOT an aggregate (weight ≈ one box) → a real un-priced anchor.
      const flagBareMoney0Weight = w > 0 && money === 0;
      if (!flagBareMoney0Weight && money > 0) continue; // a real priced anchor — not our concern
      if (w === 0 && money === 0) {
        // classic zero-weight header — already dropped by the current SOT; skip (not the new class)
        continue;
      }
      aggBare.push({
        key,
        id: r.id,
        tracking: r.ftrackingchn,
        userid: r.userid,
        fstatus: r.fstatus,
        billed: Number(r.fstatus) >= 6,
        fweight: w,
        fvolume: num(r.fvolume),
        famount: Math.round(num(r.famount)),
        ftotalprice: money,
        siblingCount: siblings.length,
        sibWeightSum,
        sibAmountSum,
        sibVolumeSum,
        classification: money > 0 ? "PRICED_ANCHOR(keep)" : looksAggregate ? "REDUNDANT_AGGREGATE(drop)" : "AMBIGUOUS_REVIEW",
        cabinet: r.fcabinetnumber,
      });
    }
  }

  // ── CLASS 3 — X-prefix / non-momo_box_detail rows with famount>1 (owner-review) ──
  const { rows: xrows } = await client.query(
    `SELECT id, ftrackingchn, famount, fweight, fvolume, ftotalprice, fstatus, userid, fcabinetnumber
       FROM tb_forwarder
      WHERE famount > 1
        AND ftrackingchn ILIKE 'X%'
        AND ftrackingchn <> ALL($1::text[])
      ORDER BY famount DESC
      LIMIT 200`,
    [wanted],
  );

  // ────────────────────────────── REPORT ──────────────────────────────
  const out = [];
  out.push("═══════════════════════════════════════════════════════════════════════");
  out.push("AUDIT-B — MOMO box bug blast radius (READ-ONLY · prod)");
  out.push("═══════════════════════════════════════════════════════════════════════");
  out.push(`momo_box_detail rows: ${boxRows.length} · distinct bases: ${baseSet.size} · distinct box_trackings: ${boxTrackingSet.size}`);
  out.push(`tb_forwarder rows matched to momo trackings: ${fwd.length}`);
  out.push("");

  // CLASS 1
  out.push("───────────────────────────────────────────────────────────────────────");
  out.push(`CLASS 1 — CORRUPT DETAIL rows: ${corrupt.length}`);
  out.push(`   (a "-N/M" row whose famount/fweight/fvolume ≠ its momo_box_detail truth)`);
  const c1billed = corrupt.filter((c) => c.billed);
  const c1priced = corrupt.filter((c) => c.priced && !c.billed);
  const c1unpriced = corrupt.filter((c) => !c.priced && !c.billed);
  out.push(`   billed (fstatus>=6 · OWNER-ONLY): ${c1billed.length} · priced-unbilled (re-price): ${c1priced.length} · unpriced-unbilled: ${c1unpriced.length}`);
  out.push("───────────────────────────────────────────────────────────────────────");
  for (const c of corrupt) {
    const flags = [c.diff.amountDiff ? "amount" : "", c.diff.weightDiff ? "weight" : "", c.diff.volumeDiff ? "vol" : ""].filter(Boolean).join("+");
    out.push(
      `  id ${c.id} | ${c.tracking} | ${c.userid} | fstatus=${c.fstatus}${c.billed ? " 🔴BILLED" : ""} | price=${c.ftotalprice} (${c.frefprice === "2" ? "คิว" : "kg"}@${c.frefrate}) | diff:${flags}`,
    );
    out.push(
      `      CUR   famount=${c.cur.famount} fweight=${c.cur.fweight} fvolume=${c.cur.fvolume} dims=${c.cur.fwidth}x${c.cur.flength}x${c.cur.fheight}`,
    );
    out.push(
      `      TRUTH famount=${c.truth.famount} fweight=${c.truth.fweight} fvolume=${c.truth.fvolume} dims=${c.truth.fwidth}x${c.truth.flength}x${c.truth.fheight} (qty ${c.truth.quantity})`,
    );
  }
  out.push("");

  // CLASS 2
  out.push("───────────────────────────────────────────────────────────────────────");
  out.push(`CLASS 2 — AGGREGATE-WEIGHT BARE bases (weight>0, the double-count header): ${aggBare.length}`);
  out.push(`   classification decides the CODE-FIX safety:`);
  const c2agg = aggBare.filter((a) => a.classification.startsWith("REDUNDANT"));
  const c2anchor = aggBare.filter((a) => a.classification.startsWith("PRICED"));
  const c2amb = aggBare.filter((a) => a.classification.startsWith("AMBIG"));
  out.push(`   REDUNDANT_AGGREGATE (safe to drop · money 0): ${c2agg.length} · PRICED_ANCHOR (money>0 · kept): ${c2anchor.length} · AMBIGUOUS (money 0, weight≠Σsib · REVIEW): ${c2amb.length}`);
  out.push("───────────────────────────────────────────────────────────────────────");
  for (const a of aggBare) {
    out.push(
      `  id ${a.id} | ${a.tracking} | ${a.userid} | fstatus=${a.fstatus}${a.billed ? " 🔴BILLED" : ""} | ${a.classification}`,
    );
    out.push(
      `      bare: famount=${a.famount} fweight=${a.fweight} fvolume=${a.fvolume} price=${a.ftotalprice}  ||  siblings(${a.siblingCount}): Σamount=${a.sibAmountSum} Σweight=${a.sibWeightSum} Σvolume=${a.sibVolumeSum}`,
    );
  }
  out.push("");

  // CLASS 3
  out.push("───────────────────────────────────────────────────────────────────────");
  out.push(`CLASS 3 — X-prefix famount>1 NOT in momo_box_detail (OWNER-REVIEW ONLY · do NOT auto-fix): ${xrows.length}`);
  out.push("───────────────────────────────────────────────────────────────────────");
  for (const x of xrows.slice(0, 60)) {
    out.push(`  id ${x.id} | ${x.ftrackingchn} | ${x.userid} | famount=${x.famount} fweight=${num(x.fweight)} price=${num(x.ftotalprice)} fstatus=${x.fstatus}`);
  }
  if (xrows.length > 60) out.push(`  … +${xrows.length - 60} more`);
  out.push("");

  // Order #52559 focused verification (the owner's reported order)
  out.push("───────────────────────────────────────────────────────────────────────");
  out.push("FOCUS — order 1783582989 (PR086 · GZE260712-1 · the owner's #52559) + 519218029029 (PR050):");
  out.push("───────────────────────────────────────────────────────────────────────");
  for (const base of ["1783582989", "519218029029"]) {
    const rowsForBase = fwd.filter((r) => baseOf(r.ftrackingchn) === base);
    out.push(`  base ${base}: ${rowsForBase.length} tb_forwarder rows`);
    for (const r of rowsForBase.sort((a, b) => suffixOf(a.ftrackingchn) - suffixOf(b.ftrackingchn))) {
      const box = byBoxTracking.get((r.ftrackingchn ?? "").trim());
      const truth = box
        ? `truth: qty=${piecesOf(box.quantity)} wt=${r2(num(box.weight_kg) * piecesOf(box.quantity))} cbm=${r6(boxCbmFromDims(box.width, box.length, box.height, box.cbm) * piecesOf(box.quantity))} dims=${num(box.width)}x${num(box.length)}x${num(box.height)}`
        : "(no momo box row)";
      out.push(`    id ${r.id} | ${r.ftrackingchn} | famount=${Math.round(num(r.famount))} fweight=${num(r.fweight)} fvolume=${num(r.fvolume)} price=${num(r.ftotalprice)} fstatus=${r.fstatus}`);
      out.push(`        ${truth}`);
    }
  }

  console.log(out.join("\n"));
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
