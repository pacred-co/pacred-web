/**
 * ════════════════════════════════════════════════════════════════════════════
 * DATA-FIX — MOMO "box bug" ROOT-2: corrupt per-box detail rows + redundant
 *            aggregate bare headers (owner 2026-07-16 · #52559 / 1783582989).
 *
 * DRY-RUN by default. `--apply` writes (with a JSON backup first). SELECT-audit
 * companion = scripts/audit-momo-box-blast-radius-2026-07-16.mjs (run that first).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FIXES (the SAFE, corroborated tier ONLY)
 * ─────────────────────────────────────────────────────────────────────────────
 * ROOT-2 has one UNAMBIGUOUS, money-safe shape and several that are NOT safe to
 * auto-apply. This script writes ONLY the safe tier and PRINTS the rest for the
 * owner/integrator to resolve by hand. It NEVER guesses on money.
 *
 * ✅ AUTO-FIX — "aggregate-on-a-detail-row" under the redundant-header model:
 *    A suffixed detail row ("<base>-N/M") that wrongly carries the WHOLE-shipment
 *    aggregate (its famount/fweight/fvolume == the group's BARE base row), where
 *    the BARE base carries NO money (price ≤ 0 → it is a redundant header, NOT a
 *    priced anchor) and momo_box_detail holds the row's real per-box truth.
 *    → set the detail row to its momo_box_detail truth (famount = qty · fweight =
 *      weight_kg×qty · fvolume = cbmFromDims×qty · dims = truth dims), re-price a
 *      priced row on its own truth basis (คิว→fvolume×frefrate · else kg→fweight×
 *      frefrate), and ZERO the redundant bare header's famount/fweight/fvolume so
 *      it never re-inflates a Σ (its money is already 0 · row kept as the เหมาๆ
 *      anchor + committed_forwarder_id link). Prod #52559/1783582989: 52436 →
 *      13.5kg / re-price 986→229.50 (== its identical twin 52437) · 52559 → 0.
 *    Corroboration required: (a) the detail row copies the bare aggregate, (b) the
 *    bare's fweight ≈ the Σ of the group's TRUE per-box weights (from momo), (c)
 *    the re-priced value matches an identical-dims sibling when one exists.
 *
 * 🚫 NOT auto-applied (PRINTED as REVIEW — a human/owner call, money-sensitive):
 *   • PRICED-ANCHOR model (e.g. 519218029029/PR050): the BARE base carries MONEY
 *     (ftotalprice>0) so it is the anchor, NOT a redundant header — zeroing it would
 *     destroy the bill, and the -N/M rows are botched duplicates whose correct
 *     resolution needs a DELETE + a money decision. Never touched here.
 *   • WEIGHT-ONLY mismatch (e.g. 1782555393 PR067, 1783051207 PR075 detail rows): the row's
 *     stored fweight IS the kg-billing basis and momo_box_detail.weight_kg is
 *     unreliable (weight_kg×qty yields physically-impossible tonnages · "MOMO มั่ว").
 *     Applying momo weight would 10× OVER-CHARGE. Warehouse must verify real weights.
 *   • BILLED rows (fstatus 6/7): excluded by the unbilled-only guard — owner sign-off.
 *   • X-prefix / non-momo_box_detail rows: owner-review (audit CLASS 3).
 *
 * MONEY-SAFETY: unbilled-only (fstatus ∉ 6/7) · only corrects OVER-charges down to
 * the corroborated truth · never zeroes a money-carrying row · never deletes · every
 * touched row is backed up (full JSON) before --apply · one transaction · row-count
 * verified. Pairs with the count-SOT code fix in lib/admin/momo-bill-header.ts (which
 * already drops a money-0 bare from the money-aware displays); this data-fix also
 * corrects the per-box DETAIL rows the code fix cannot (they carry money) + zeroes
 * the header so the remaining count-only display callers drop it via the zero-weight
 * fallback (belt-and-suspenders).
 *
 * RUN (dry-run):  node scripts/fix-momo-boxcount-corrupt-2026-07-16.mjs
 * RUN (apply):    node scripts/fix-momo-boxcount-corrupt-2026-07-16.mjs --apply
 * ════════════════════════════════════════════════════════════════════════════
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");

const client = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: "DqOzfEZVXfMHIryz",
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

// ── pure helpers — mirror lib/integrations/momo-web/box-detail-recompute.ts ──
const num = (v) => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n) => Number(num(n).toFixed(2));
const r6 = (n) => Number(num(n).toFixed(6));
const piecesOf = (q) => {
  const n = Math.round(num(q));
  return Number.isFinite(n) && n > 0 ? n : 1;
};
const suffixOf = (t) => {
  const m = /-(\d+)(?:\/\d+)?$/.exec((t ?? "").trim());
  return m ? Number(m[1]) : 0;
};
const baseOf = (t) => (t ?? "").trim().replace(/-\d+(?:\/\d+)?$/, "");
const boxCbmFromDims = (w, l, h, cbm) => {
  const W = num(w), L = num(l), H = num(h);
  if (W > 0 || L > 0 || H > 0) return r6((W * L * H) / 1_000_000);
  return r6(num(cbm));
};
const relDiff = (a, b) => {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom < 1e-9) return 0;
  return Math.abs(a - b) / denom;
};
const TOL = 0.02; // 2% — same tolerance the split money-basis guard uses
const isBilled = (fstatus) => ["6", "7"].includes(String(fstatus ?? "").trim());

async function main() {
  await client.connect();

  // ── momo_box_detail = the per-box truth ──
  const { rows: boxRows } = await client.query(
    `SELECT base_tracking, box_tracking, width, length, height, weight_kg, cbm, quantity
       FROM momo_box_detail`,
  );
  const byBoxTracking = new Map();
  const baseSet = new Set();
  const boxTrackingSet = new Set();
  for (const b of boxRows) {
    const bt = (b.box_tracking ?? "").trim();
    if (bt) { byBoxTracking.set(bt, b); boxTrackingSet.add(bt); }
    const base = (b.base_tracking ?? "").trim();
    if (base) baseSet.add(base);
  }

  // ── tb_forwarder rows for every tracking momo knows (box + base) ──
  const wanted = Array.from(new Set([...boxTrackingSet, ...baseSet]));
  const { rows: fwd } = await client.query(
    `SELECT id, ftrackingchn, famount, famountcount, fweight, fvolume,
            fwidth, flength, fheight, ftotalprice, frefrate, frefprice,
            fstatus, fcabinetnumber, userid
       FROM tb_forwarder
      WHERE ftrackingchn = ANY($1::text[])`,
    [wanted],
  );

  // group by (baseOf(tracking) :: userid)
  const groups = new Map();
  for (const r of fwd) {
    const key = `${baseOf(r.ftrackingchn)}::${r.userid ?? ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  // truth Σ per group (from momo_box_detail box_trackings that belong to the base)
  function trueBoxTotals(base) {
    const boxes = boxRows.filter((b) => baseOf(b.box_tracking) === base && suffixOf(b.box_tracking) > 0);
    let wSum = 0, vSum = 0, aSum = 0;
    for (const b of boxes) {
      const qty = piecesOf(b.quantity);
      wSum += r2(num(b.weight_kg) * qty);
      vSum += r6(boxCbmFromDims(b.width, b.length, b.height, b.cbm) * qty);
      aSum += qty;
    }
    return { fweight: r2(wSum), fvolume: r6(vSum), famount: aSum, count: boxes.length };
  }

  const detailFixes = [];   // { row, truth, newPrice, twinPrice }
  const bareZeroes = [];    // { row, trueSum }
  const reviews = [];       // { kind, ...info }

  // ── DETAIL-ROW auto-fix candidates (aggregate-on-detail · redundant-header model) ──
  for (const r of fwd) {
    if (suffixOf(r.ftrackingchn) <= 0) continue;               // suffixed detail only
    if (isBilled(r.fstatus)) continue;                          // unbilled only
    const box = byBoxTracking.get((r.ftrackingchn ?? "").trim());
    if (!box) continue;                                         // need momo truth
    const qty = piecesOf(box.quantity);
    const truth = {
      famount: qty,
      fweight: r2(num(box.weight_kg) * qty),
      fvolume: r6(boxCbmFromDims(box.width, box.length, box.height, box.cbm) * qty),
      fwidth: num(box.width), flength: num(box.length), fheight: num(box.height),
    };
    const curA = Math.round(num(r.famount));
    // signature of "holds the aggregate": famount is wrong AND larger than the box's real count.
    const amountInflated = curA !== truth.famount && curA > truth.famount;
    if (!amountInflated) {
      // weight-only / vol-only / equal → NOT the aggregate-on-detail shape → REVIEW/skip.
      if (relDiff(num(r.fweight), truth.fweight) > TOL || relDiff(num(r.fvolume), truth.fvolume) > TOL) {
        reviews.push({ kind: "WEIGHT/VOL-ONLY (momo weight suspect · DO NOT auto-apply)", row: r, truth });
      }
      continue;
    }
    // the group's BARE base — must be a REDUNDANT header (price ≤ 0), not a priced anchor.
    const key = `${baseOf(r.ftrackingchn)}::${r.userid ?? ""}`;
    const bare = (groups.get(key) ?? []).find((x) => suffixOf(x.ftrackingchn) === 0);
    if (!bare) { reviews.push({ kind: "aggregate-on-detail but NO bare base (REVIEW)", row: r, truth }); continue; }
    if (num(bare.ftotalprice) > 0) {
      reviews.push({ kind: "PRICED-ANCHOR model — bare carries money (DELETE/money decision · REVIEW)", row: r, truth, bare });
      continue;
    }
    // corroboration: the detail row copied the bare's aggregate (famount+fweight+fvolume ≈ bare).
    const copiesAggregate =
      curA === Math.round(num(bare.famount)) &&
      relDiff(num(r.fweight), num(bare.fweight)) <= TOL &&
      relDiff(num(r.fvolume), num(bare.fvolume)) <= TOL;
    if (!copiesAggregate) { reviews.push({ kind: "amount inflated but does NOT match bare aggregate (REVIEW)", row: r, truth, bare }); continue; }

    // re-price a priced row on its OWN truth basis (คิว→fvolume · else kg→fweight) × frefrate.
    const priced = num(r.ftotalprice) > 0;
    const basis = String(r.frefprice ?? "").trim() === "2" ? truth.fvolume : truth.fweight;
    const newPrice = priced ? r2(basis * num(r.frefrate)) : num(r.ftotalprice);
    // extra corroboration: identical-dims sibling's price (should match the re-price).
    const twin = (groups.get(key) ?? []).find(
      (x) => x.id !== r.id && suffixOf(x.ftrackingchn) > 0 &&
        num(x.fwidth) === truth.fwidth && num(x.flength) === truth.flength && num(x.fheight) === truth.fheight &&
        relDiff(num(x.fweight), truth.fweight) <= TOL,
    );
    detailFixes.push({ row: r, truth, priced, newPrice, twinPrice: twin ? num(twin.ftotalprice) : null, twinId: twin?.id ?? null });
  }

  // ── BARE-BASE zero candidates (redundant aggregate header · price ≤ 0) ──
  const fixedBases = new Set(detailFixes.map((f) => baseOf(f.row.ftrackingchn)));
  for (const [key, rows] of groups) {
    const bare = rows.find((x) => suffixOf(x.ftrackingchn) === 0);
    if (!bare) continue;
    if (isBilled(bare.fstatus)) continue;
    if (num(bare.ftotalprice) > 0) continue;                    // never zero a money-carrying row
    const hasBoxSibling = rows.some((x) => suffixOf(x.ftrackingchn) > 0);
    if (!hasBoxSibling) continue;
    const alreadyZero = num(bare.fweight) === 0 && num(bare.fvolume) === 0 && Math.round(num(bare.famount)) === 0;
    if (alreadyZero) continue;
    const base = baseOf(bare.ftrackingchn);
    // only zero a bare whose fweight ≈ the TRUE Σ of the group's per-box weights (genuine aggregate),
    // and only when we are also correcting that base's detail rows (so the pair nets out correctly).
    const totals = trueBoxTotals(base);
    const isTrueAggregate = totals.count > 1 && relDiff(num(bare.fweight), totals.fweight) <= TOL;
    if (!isTrueAggregate) {
      // weighted bare that is NOT a clean aggregate → leave for review (do not guess).
      if (num(bare.fweight) > 0) reviews.push({ kind: "weighted bare · not a clean Σ-aggregate (REVIEW)", row: bare, truth: totals });
      continue;
    }
    if (!fixedBases.has(base)) {
      // Σ matches but no detail row of this base qualified for auto-fix → don't zero in isolation.
      reviews.push({ kind: "aggregate bare but its detail rows were NOT auto-fixed (REVIEW together)", row: bare, truth: totals });
      continue;
    }
    bareZeroes.push({ row: bare, trueSum: totals });
  }

  // ─────────────────────────────── REPORT ───────────────────────────────
  const L = [];
  L.push("════════════════════════════════════════════════════════════════════════════");
  L.push(`MOMO box-count corrupt DATA-FIX — ${APPLY ? "🔴 APPLY MODE (writing)" : "DRY-RUN (no writes)"}`);
  L.push("════════════════════════════════════════════════════════════════════════════");
  L.push(`momo_box_detail: ${boxRows.length} boxes / ${baseSet.size} bases · tb_forwarder matched: ${fwd.length}`);
  L.push("");
  L.push(`✅ AUTO-FIX detail rows: ${detailFixes.length} · zero bare headers: ${bareZeroes.length}`);
  L.push("────────────────────────────────────────────────────────────────────────────");
  for (const f of detailFixes) {
    const r = f.row;
    L.push(`  FIX id ${r.id} | ${r.ftrackingchn} | ${r.userid} | fstatus=${r.fstatus}`);
    L.push(`      famount ${Math.round(num(r.famount))}→${f.truth.famount} · fweight ${num(r.fweight)}→${f.truth.fweight} · fvolume ${num(r.fvolume)}→${f.truth.fvolume} · dims ${num(r.fwidth)}x${num(r.flength)}x${num(r.fheight)}→${f.truth.fwidth}x${f.truth.flength}x${f.truth.fheight}`);
    if (f.priced) {
      const basisLabel = String(r.frefprice ?? "").trim() === "2" ? "คิว" : "kg";
      const twinNote = f.twinPrice != null
        ? (relDiff(f.newPrice, f.twinPrice) <= 0.01 ? `· ✓ matches twin id ${f.twinId} (${f.twinPrice})` : `· ⚠️ twin id ${f.twinId} = ${f.twinPrice} (DIFFERS — review)`)
        : "· (no identical twin to corroborate)";
      L.push(`      ftotalprice ${num(r.ftotalprice)}→${f.newPrice} (${basisLabel}@${num(r.frefrate)}) ${twinNote}`);
    }
  }
  for (const z of bareZeroes) {
    const r = z.row;
    L.push(`  ZERO bare id ${r.id} | ${r.ftrackingchn} | ${r.userid} | fstatus=${r.fstatus} | price=${num(r.ftotalprice)}`);
    L.push(`      famount ${Math.round(num(r.famount))}→0 · fweight ${num(r.fweight)}→0 · fvolume ${num(r.fvolume)}→0  (redundant aggregate · true Σ=${z.trueSum.fweight}kg over ${z.trueSum.count} boxes)`);
  }
  L.push("");
  L.push(`🚫 REVIEW-ONLY (NOT applied — money-sensitive / momo-suspect / needs human decision): ${reviews.length}`);
  L.push("────────────────────────────────────────────────────────────────────────────");
  for (const v of reviews) {
    const r = v.row;
    L.push(`  [${v.kind}]`);
    L.push(`      id ${r.id} | ${r.ftrackingchn} | ${r.userid} | fstatus=${r.fstatus} | price=${num(r.ftotalprice)} | CUR famount=${Math.round(num(r.famount))} fweight=${num(r.fweight)} fvolume=${num(r.fvolume)}${v.truth ? ` | truth famount=${v.truth.famount} fweight=${v.truth.fweight} fvolume=${v.truth.fvolume}` : ""}`);
  }
  L.push("");
  L.push("NOTE — 519218029029/PR050 (bare 52380 price=730 = priced anchor) + all weight-only");
  L.push("       mismatches are intentionally REVIEW-ONLY: fixing them needs an owner decision");
  L.push("       (delete/money for the anchor · real-weight verification for the momo-suspect kg rows).");
  console.log(L.join("\n"));

  if (!APPLY) {
    L.push("");
    L.push("DRY-RUN — no writes. Re-run with --apply to write (a JSON backup is taken first).");
    console.log("\nDRY-RUN — no writes. Re-run with --apply to write (a JSON backup is taken first).");
    await client.end();
    return;
  }

  if (detailFixes.length === 0 && bareZeroes.length === 0) {
    console.log("\nNothing to apply. Done.");
    await client.end();
    return;
  }

  // ── APPLY — backup, then one transaction ──
  const touchedIds = [...detailFixes.map((f) => f.row.id), ...bareZeroes.map((z) => z.row.id)];
  const { rows: backup } = await client.query(
    `SELECT * FROM tb_forwarder WHERE id = ANY($1::int[])`,
    [touchedIds],
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `scripts/_backup-fix-momo-boxcount-${stamp}.json`;
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`\nBackup written: ${backupPath} (${backup.length} rows)`);

  await client.query("BEGIN");
  try {
    for (const f of detailFixes) {
      const q = f.priced
        ? `UPDATE tb_forwarder SET famount=$2, fweight=$3, fvolume=$4, fwidth=$5, flength=$6, fheight=$7, ftotalprice=$8
             WHERE id=$1 AND fstatus NOT IN ('6','7')`
        : `UPDATE tb_forwarder SET famount=$2, fweight=$3, fvolume=$4, fwidth=$5, flength=$6, fheight=$7
             WHERE id=$1 AND fstatus NOT IN ('6','7')`;
      const params = f.priced
        ? [f.row.id, f.truth.famount, f.truth.fweight, f.truth.fvolume, f.truth.fwidth, f.truth.flength, f.truth.fheight, f.newPrice]
        : [f.row.id, f.truth.famount, f.truth.fweight, f.truth.fvolume, f.truth.fwidth, f.truth.flength, f.truth.fheight];
      const res = await client.query(q, params);
      if (res.rowCount !== 1) throw new Error(`detail fix id ${f.row.id} affected ${res.rowCount} rows (expected 1) — ABORT`);
    }
    for (const z of bareZeroes) {
      const res = await client.query(
        `UPDATE tb_forwarder SET famount=0, fweight=0, fvolume=0
           WHERE id=$1 AND fstatus NOT IN ('6','7') AND (ftotalprice IS NULL OR ftotalprice::numeric <= 0)`,
        [z.row.id],
      );
      if (res.rowCount !== 1) throw new Error(`bare-zero id ${z.row.id} affected ${res.rowCount} rows (expected 1) — ABORT`);
    }
    await client.query("COMMIT");
    console.log(`✅ APPLIED — ${detailFixes.length} detail fix + ${bareZeroes.length} bare-zero. Backup: ${backupPath}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ ROLLED BACK —", e.message);
    process.exitCode = 1;
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
