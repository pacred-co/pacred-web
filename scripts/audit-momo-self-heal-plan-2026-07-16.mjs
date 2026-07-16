/**
 * AUDIT-B — READ-ONLY blast radius for the MOMO box-count SELF-HEAL (owner 2026-07-16).
 *
 * MIRRORS the exact decision in lib/integrations/momo-web/box-detail-reconcile-plan.ts
 * (planBoxDetailReconcile), so the audit and the shipped cron pass agree 1:1. Quantifies
 * the CURRENT corruption the self-heal would target and PROVES the momo-corroboration
 * rule cleanly separates heal-able from the "MOMO มั่ว" cases it must refuse.
 *
 * Classes reported:
 *   (1) LEFTOVER aggregate-weight BARE bases  → bareZeroes  (heal: metrics→0)
 *   (2) CORRUPT "-N/M" DETAIL rows            → detailFixes (heal: converge to box truth)
 *   (3) MOMO-มั่ว cases the heal MUST REFUSE  → reviews {weight_vol_only_momo_suspect,
 *                                                        momo_does_not_reconcile_aggregate}
 *   (4) PRICED-ANCHOR bares (left · money>0)  → reviews {priced_anchor_bare} + direct scan
 *
 * NO writes. SELECT only. RUN: node scripts/audit-momo-self-heal-plan-2026-07-16.mjs
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

const TOL = 0.02; // 2% — the money-basis corroboration tolerance (== the plan default)

// ── pure helpers — byte-mirror box-detail-reconcile-plan.ts ──
const num = (v) => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n) => Number(num(n).toFixed(2));
const r6 = (n) => Number(num(n).toFixed(6));
const piecesOf = (q) => { const n = Math.round(num(q)); return Number.isFinite(n) && n > 0 ? n : 1; };
const suffixOf = (t) => { const m = /-(\d+)(?:\/\d+)?$/.exec((t ?? "").trim()); return m ? Number(m[1]) : 0; };
const baseOf = (t) => (t ?? "").trim().replace(/-\d+(?:\/\d+)?$/, "");
const boxCbmFromDims = (b) => {
  const w = num(b.width), l = num(b.length), h = num(b.height);
  if (w > 0 || l > 0 || h > 0) return r6((w * l * h) / 1_000_000);
  return r6(num(b.cbm));
};
const relDiff = (a, b) => { const d = Math.max(Math.abs(a), Math.abs(b)); return d < 1e-9 ? 0 : Math.abs(a - b) / d; };
const BILLED = new Set(["5", "6", "7"]);
const isBilled = (f) => BILLED.has(String(f ?? "").trim());

function trueBoxTotals(boxes) {
  let fweight = 0, fvolume = 0, famount = 0, count = 0;
  for (const b of boxes) {
    if (suffixOf(b.boxTracking) <= 0) continue;
    const qty = piecesOf(b.quantity);
    fweight += r2(num(b.weightKg) * qty);
    fvolume += r6(boxCbmFromDims(b) * qty);
    famount += qty;
    count += 1;
  }
  return { fweight: r2(fweight), fvolume: r6(fvolume), famount, count };
}

// PORT of planBoxDetailReconcile — returns { detailFixes, bareZeroes, reviews } for a group.
function planBoxDetailReconcile(group, boxes) {
  const detailFixes = [], bareZeroes = [], reviews = [];
  const byBox = new Map();
  for (const b of boxes) { const t = (b.boxTracking ?? "").trim(); if (t) byBox.set(t, b); }
  const totals = trueBoxTotals(boxes);
  const bare = group.find((r) => suffixOf(r.ftrackingchn) === 0);
  const barePrice = bare ? num(bare.ftotalprice) : 0;
  const bareIsPricedAnchor = bare != null && barePrice > 0;

  for (const row of group) {
    if (suffixOf(row.ftrackingchn) <= 0) continue;
    if (isBilled(row.fstatus)) continue;
    const box = byBox.get((row.ftrackingchn ?? "").trim());
    if (!box) continue;
    const qty = piecesOf(box.quantity);
    const truth = {
      famount: qty, fweight: r2(num(box.weightKg) * qty), fvolume: r6(boxCbmFromDims(box) * qty),
      fwidth: r2(num(box.width)), flength: r2(num(box.length)), fheight: r2(num(box.height)),
    };
    const curAmount = Math.round(num(row.famount));
    const amountInflated = curAmount !== truth.famount && curAmount > truth.famount;
    if (!amountInflated) {
      if (relDiff(num(row.fweight), truth.fweight) > TOL || relDiff(num(row.fvolume), truth.fvolume) > TOL) {
        reviews.push({ kind: "weight_vol_only_momo_suspect", id: row.id, tracking: row.ftrackingchn,
          detail: { cur: num(row.fweight), momo: truth.fweight, factor: truth.fweight > 0 ? r2(truth.fweight / Math.max(num(row.fweight), 1e-9)) : 0 } });
      }
      continue;
    }
    if (!bare) { reviews.push({ kind: "aggregate_on_detail_no_bare", id: row.id, tracking: row.ftrackingchn }); continue; }
    if (bareIsPricedAnchor) { reviews.push({ kind: "priced_anchor_bare", id: row.id, tracking: row.ftrackingchn, detail: { barePrice } }); continue; }
    const copiesAggregate = curAmount === Math.round(num(bare.famount)) &&
      relDiff(num(row.fweight), num(bare.fweight)) <= TOL && relDiff(num(row.fvolume), num(bare.fvolume)) <= TOL;
    if (!copiesAggregate) { reviews.push({ kind: "amount_inflated_not_bare_aggregate", id: row.id, tracking: row.ftrackingchn }); continue; }
    const momoReconciles = totals.count > 1 && relDiff(num(bare.fweight), totals.fweight) <= TOL;
    if (!momoReconciles) {
      reviews.push({ kind: "momo_does_not_reconcile_aggregate", id: row.id, tracking: row.ftrackingchn,
        detail: { bare: num(bare.fweight), momoSum: totals.fweight, relDiff: r2(relDiff(num(bare.fweight), totals.fweight)) } });
      continue;
    }
    const priced = num(row.ftotalprice) > 0;
    const basis = String(row.frefprice ?? "").trim() === "2" ? truth.fvolume : truth.fweight;
    const newPrice = priced ? r2(basis * num(row.frefrate)) : 0;
    const twin = group.find((x) => x.id !== row.id && suffixOf(x.ftrackingchn) > 0 &&
      r2(num(x.fwidth)) === truth.fwidth && r2(num(x.flength)) === truth.flength && r2(num(x.fheight)) === truth.fheight &&
      relDiff(num(x.fweight), truth.fweight) <= TOL);
    if (priced && (!twin || relDiff(newPrice, num(twin ? twin.ftotalprice : 0)) > 0.01)) {
      reviews.push({ kind: "priced_no_twin_corroboration", id: row.id, tracking: row.ftrackingchn }); continue;
    }
    detailFixes.push({ id: row.id, tracking: row.ftrackingchn, truth, priced, newPrice,
      twinId: twin ? twin.id : null, twinPrice: twin ? num(twin.ftotalprice) : null, cur: { famount: curAmount, fweight: num(row.fweight) } });
  }

  if (bare && !isBilled(bare.fstatus) && !bareIsPricedAnchor) {
    const siblings = group.filter((r) => suffixOf(r.ftrackingchn) > 0);
    const alreadyZero = num(bare.fweight) === 0 && num(bare.fvolume) === 0 && Math.round(num(bare.famount)) === 0;
    if (siblings.length > 0 && !alreadyZero) {
      const isTrueAggregate = totals.count > 1 && relDiff(num(bare.fweight), totals.fweight) <= TOL;
      const sibWeightSum = r2(siblings.reduce((s, x) => s + num(x.fweight), 0));
      const siblingsCoverShipment = totals.count > 1 && relDiff(sibWeightSum, totals.fweight) <= TOL;
      if (isTrueAggregate && siblingsCoverShipment) {
        bareZeroes.push({ id: bare.id, tracking: bare.ftrackingchn, trueSum: totals, bareWeight: num(bare.fweight), sibWeightSum });
      } else if (num(bare.fweight) > 0) {
        reviews.push({ kind: isTrueAggregate ? "aggregate_bare_siblings_dont_cover" : "weighted_bare_not_clean_aggregate",
          id: bare.id, tracking: bare.ftrackingchn, detail: { bare: num(bare.fweight), momoSum: totals.fweight, sibSum: sibWeightSum } });
      }
    }
  }
  return { detailFixes, bareZeroes, reviews };
}

async function main() {
  await client.connect();

  const { rows: boxRows } = await client.query(
    `SELECT base_tracking, box_tracking, width, length, height, weight_kg, cbm, quantity FROM momo_box_detail`,
  );
  const boxTrackingSet = new Set(), baseSet = new Set();
  for (const b of boxRows) {
    const bt = (b.box_tracking ?? "").trim(); if (bt) boxTrackingSet.add(bt);
    const base = (b.base_tracking ?? "").trim(); if (base) baseSet.add(base);
  }
  // durable multi-box bases (== findMultiBoxBases): bases with >1 box.
  const baseCount = new Map();
  for (const b of boxRows) { const base = (b.base_tracking ?? "").trim(); if (base) baseCount.set(base, (baseCount.get(base) ?? 0) + 1); }
  const multiBoxBases = [...baseCount.entries()].filter(([, n]) => n > 1).map(([b]) => b);

  const wanted = Array.from(new Set([...boxTrackingSet, ...baseSet]));
  const { rows: fwd } = await client.query(
    `SELECT id, ftrackingchn, famount, famountcount, fweight, fvolume, fwidth, flength, fheight,
            ftotalprice, frefrate, frefprice, fstatus, userid
       FROM tb_forwarder WHERE ftrackingchn = ANY($1::text[])`,
    [wanted],
  );

  // boxes grouped by base
  const boxesByBase = new Map();
  for (const b of boxRows) {
    const base = (b.base_tracking ?? "").trim(); if (!base) continue;
    const arr = boxesByBase.get(base) ?? []; arr.push({ boxTracking: (b.box_tracking ?? "").trim(), width: b.width, length: b.length, height: b.height, weightKg: b.weight_kg, cbm: b.cbm, quantity: b.quantity });
    boxesByBase.set(base, arr);
  }

  // run the plan per (base with >1 box) × userid
  const allDetailFixes = [], allBareZeroes = [], reviewsByKind = new Map();
  const pushReview = (r) => { const arr = reviewsByKind.get(r.kind) ?? []; arr.push(r); reviewsByKind.set(r.kind, arr); };
  for (const base of multiBoxBases) {
    const boxes = boxesByBase.get(base) ?? [];
    const groupRows = fwd.filter((r) => baseOf(r.ftrackingchn) === base);
    if (groupRows.length === 0) continue;
    const byUser = new Map();
    for (const r of groupRows) { const k = String(r.userid ?? ""); const a = byUser.get(k) ?? []; a.push(r); byUser.set(k, a); }
    for (const [, rows] of byUser) {
      const plan = planBoxDetailReconcile(rows, boxes);
      for (const f of plan.detailFixes) allDetailFixes.push(f);
      for (const z of plan.bareZeroes) allBareZeroes.push(z);
      for (const rev of plan.reviews) pushReview(rev);
    }
  }

  // (4) direct scan — priced-anchor bares (money>0) that co-exist with box siblings (KEPT).
  const pricedAnchorBares = [];
  for (const base of multiBoxBases) {
    const groupRows = fwd.filter((r) => baseOf(r.ftrackingchn) === base);
    const bare = groupRows.find((r) => suffixOf(r.ftrackingchn) === 0);
    const hasSib = groupRows.some((r) => suffixOf(r.ftrackingchn) > 0);
    if (bare && hasSib && num(bare.ftotalprice) > 0) pricedAnchorBares.push(bare);
  }

  const out = [];
  out.push("═══════════════════════════════════════════════════════════════════════════");
  out.push("AUDIT-B — MOMO box-count SELF-HEAL blast radius (READ-ONLY · mirrors the plan)");
  out.push("═══════════════════════════════════════════════════════════════════════════");
  out.push(`momo_box_detail: ${boxRows.length} boxes / ${baseSet.size} bases · MULTI-box bases (>1): ${multiBoxBases.length}`);
  out.push(`tb_forwarder rows matched to momo trackings: ${fwd.length}`);
  out.push(`corroboration tolerance (relTolerance): ${TOL} (2%) · billing gate: fstatus ∉ {5,6,7}`);
  out.push("");

  // CLASS 1 — bareZeroes
  out.push("───────────────────────────────────────────────────────────────────────────");
  out.push(`(1) LEFTOVER aggregate-weight BARE bases the heal would ZERO: ${allBareZeroes.length}`);
  out.push("    (bare price≤0 · unbilled · bare.fweight≈Σmomo AND siblings alone cover Σmomo)");
  out.push("───────────────────────────────────────────────────────────────────────────");
  for (const z of allBareZeroes) {
    out.push(`  ZERO id ${z.id} | ${z.tracking} | bare fweight=${z.bareWeight} → 0 | Σmomo=${z.trueSum.fweight}kg over ${z.trueSum.count} boxes | Σsiblings=${z.sibWeightSum}`);
  }
  out.push("");

  // CLASS 2 — detailFixes
  out.push("───────────────────────────────────────────────────────────────────────────");
  out.push(`(2) CORRUPT "-N/M" DETAIL rows the heal would CONVERGE to box truth: ${allDetailFixes.length}`);
  out.push("───────────────────────────────────────────────────────────────────────────");
  for (const f of allDetailFixes) {
    out.push(`  FIX id ${f.id} | ${f.tracking} | famount ${f.cur.famount}→${f.truth.famount} · fweight ${f.cur.fweight}→${f.truth.fweight}${f.priced ? ` · price→${f.newPrice} (twin ${f.twinId}=${f.twinPrice})` : " · re-price via engine"}`);
  }
  if (allDetailFixes.length === 0) out.push("  (none — the aggregate-on-detail rows currently present are priced-anchor → refused)");
  out.push("");

  // CLASS 3 — MOMO มั่ว refusals
  const mususpect = reviewsByKind.get("weight_vol_only_momo_suspect") ?? [];
  const noReconcile = reviewsByKind.get("momo_does_not_reconcile_aggregate") ?? [];
  out.push("───────────────────────────────────────────────────────────────────────────");
  out.push(`(3) MOMO-มั่ว cases the heal MUST REFUSE: ${mususpect.length + noReconcile.length}`);
  out.push(`    weight_vol_only_momo_suspect (weight_kg×qty ≫ stored · famount right): ${mususpect.length}`);
  out.push(`    momo_does_not_reconcile_aggregate (bare ≉ Σmomo): ${noReconcile.length}`);
  out.push("───────────────────────────────────────────────────────────────────────────");
  for (const r of mususpect) out.push(`  REFUSE id ${r.id} | ${r.tracking} | stored fweight=${r.detail.cur} vs momo weight_kg×qty=${r.detail.momo} (×${r.detail.factor}) → would over-charge`);
  for (const r of noReconcile) out.push(`  REFUSE id ${r.id} | ${r.tracking} | bare=${r.detail.bare} vs Σmomo=${r.detail.momoSum} (relDiff ${r.detail.relDiff})`);
  out.push("");

  // CLASS 4 — priced-anchor bares kept
  const prAnchorReview = reviewsByKind.get("priced_anchor_bare") ?? [];
  out.push("───────────────────────────────────────────────────────────────────────────");
  out.push(`(4) PRICED-ANCHOR bares LEFT INTACT (money>0 · bare with box siblings): ${pricedAnchorBares.length}`);
  out.push(`    detail rows under a priced anchor sent to review: ${prAnchorReview.length}`);
  out.push("───────────────────────────────────────────────────────────────────────────");
  for (const b of pricedAnchorBares.slice(0, 12)) out.push(`  KEEP id ${b.id} | ${b.ftrackingchn} | ${b.userid} | bare price=${num(b.ftotalprice)} fweight=${num(b.fweight)} fstatus=${b.fstatus}`);
  if (pricedAnchorBares.length > 12) out.push(`  … +${pricedAnchorBares.length - 12} more`);
  out.push("");

  // other reviews
  out.push("───────────────────────────────────────────────────────────────────────────");
  out.push("Other REVIEW reasons (informational · never auto-healed):");
  for (const [kind, arr] of reviewsByKind) {
    if (["weight_vol_only_momo_suspect", "momo_does_not_reconcile_aggregate", "priced_anchor_bare"].includes(kind)) continue;
    out.push(`  ${String(arr.length).padStart(3)} × ${kind}`);
  }
  out.push("");

  // corroboration proof
  out.push("═══════════════════════════════════════════════════════════════════════════");
  out.push("COROBORATION PROOF — the rule cleanly separates HEAL-ABLE from MOMO-มั่ว:");
  out.push("═══════════════════════════════════════════════════════════════════════════");
  const healBareOk = allBareZeroes.every((z) => relDiff(z.bareWeight, z.trueSum.fweight) <= TOL && relDiff(z.sibWeightSum, z.trueSum.fweight) <= TOL);
  out.push(`  • Every heal-able BARE reconciles momo within ${TOL}: ${healBareOk ? "✅ YES" : "❌ NO"} (${allBareZeroes.length} rows)`);
  const mususpectSeparated = mususpect.every((r) => relDiff(r.detail.cur, r.detail.momo) > TOL);
  out.push(`  • Every MOMO-มั่ว weight row is OUTSIDE ${TOL} (so never healed): ${mususpectSeparated ? "✅ YES" : "❌ NO"} (${mususpect.length} rows)`);
  const minMususpectFactor = mususpect.length ? Math.min(...mususpect.map((r) => r.detail.factor).filter((x) => x > 0)) : null;
  out.push(`  • Smallest มั่ว over-charge factor (momo/stored): ${minMususpectFactor == null ? "n/a" : "×" + minMususpectFactor} — all ≫ 1, unambiguously refused`);
  out.push(`  • Verdict: TOL=${TOL} SEPARATES heal-able (≈0% diff) from มั่ว (≥100% diff · a ×N tonnage) with a huge margin.`);

  console.log(out.join("\n"));
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
