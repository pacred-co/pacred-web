/**
 * ════════════════════════════════════════════════════════════════════════
 * BACKFILL — split existing AGGREGATED MOMO box rows into N sibling rows.
 * ════════════════════════════════════════════════════════════════════════
 * Owner/ภูม 2026-07-02: a cargo tracking MOMO split into N boxes of different sizes
 * is currently stored as ONE aggregate `tb_forwarder` row (famount=N · the per-box
 * dims in momo_box_detail). This one-off backfill turns each such aggregate into N
 * SIBLING rows (one per box · MOMO's "-i/n") so 1 box = 1 row — the SAME shape the
 * already-correct trackings X90012661 / 800117017081 have. Going forward the live
 * MOMO pass (lib/integrations/momo-web/split-box-rows.ts, wired into
 * propagateMomoLiveStatusAndData) does this automatically on every commit + cron;
 * this backfill just handles the rows that already landed aggregated.
 *
 * 💰 MONEY-SAFETY — the SAME money-neutral guard as the live pass
 * (lib/integrations/momo-web/split-box-rows-plan.ts planBoxRowSplit):
 *   splits ONLY when the aggregate is UNBILLED (fstatus 1/2/3/4), UNPRICED
 *   (ftotalprice ≤ 0), has NO linked ฝากสั่งซื้อ (reforder=''), and the box Σ
 *   (pieces/weight/คิว) MATCHES the aggregate famount/fweight/fvolume (so the split
 *   can NEVER change the SELL basis). NEVER touches fstatus 5/6/7. IDEMPOTENT — a
 *   base that already has sibling rows is skipped. The billing loop groups by base
 *   tracking, so N siblings = ONE customer bill (verified).
 *
 * SAFETY RAILS
 *   - DRY-RUN by DEFAULT — prints the plan; writes NOTHING. Pass `--apply` to write.
 *   - `--apply` writes a JSON backup of every touched aggregate row FIRST
 *     (scripts/_backup-split-momo-<ts>.json) with a restore snippet.
 *   - The anchor row keeps its id + BARE base tracking (suffix-0 เหมาๆ anchor +
 *     the momo_import_tracks.committed_forwarder_id linkage stays valid). New boxes
 *     are INSERTed with "<base>-i/n". Price columns are RESET to 0 on every row — the
 *     row was already unpriced (total=0), and the next MOMO Live cron/commit re-prices
 *     each row from its OWN คิว (computeAndFillForwarderImportRate · money-isolated).
 *
 * RUN:
 *   dry:   SUPABASE_DB_PASSWORD=… tsx scripts/split-aggregated-momo-boxes-2026-07-02.ts
 *   apply: SUPABASE_DB_PASSWORD=… tsx scripts/split-aggregated-momo-boxes-2026-07-02.ts --apply
 * ════════════════════════════════════════════════════════════════════════
 */

import pg from "pg";
import { writeFileSync } from "node:fs";
import {
  planBoxRowSplit,
  baseOf,
  suffixOf,
  type AggregateRowInput,
  type BoxDetailInput,
} from "../lib/integrations/momo-web/split-box-rows-plan";

const APPLY = process.argv.includes("--apply");
// --priced (owner/ภูม 2026-07-03): ALSO split rows that are already PRICED, money-neutrally
// (the total SELL is preserved — split proportionally · Σ === aggregate to the satang). The
// default run stays UNPRICED-only (the original safe behaviour). Prod has 26 priced multi-box
// aggregates (e.g. #52142) that stay folded until this flag runs.
const ALLOW_PRICED = process.argv.includes("--priced");
const PROJECT_REF = "yzljakczhwrpbxflnmco"; // PROD
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) {
  console.error("SUPABASE_DB_PASSWORD not set — aborting.");
  process.exit(1);
}
const HOSTS = [
  "aws-1-ap-southeast-1.pooler.supabase.com",
  "aws-0-ap-southeast-1.pooler.supabase.com",
];
const USER = `postgres.${PROJECT_REF}`;

// Shipment-level money columns — anchor keeps them, siblings get 0 (never multiply).
// Matches split-box-rows.ts SHIPMENT_LEVEL_MONEY (otherCharges + cost).
const SHIPMENT_LEVEL_MONEY = [
  "ftransportprice", "fpriceupdate", "fshippingservice",
  "pricecrate", "ftransportpricechnthb", "priceother", "fdiscount",
  "fcosttotalprice",
];
// tb_forwarder columns to CLONE onto a new sibling (everything except id + the
// per-box metrics + price columns we set explicitly). Matches split-box-rows.ts.
const CLONE_OMIT = new Set<string>([
  "id",
  "ftrackingchn", "fweight", "fvolume", "fwidth", "flength", "fheight", "famount",
  "ftotalprice", "frefrate", "frefprice",
  ...SHIPMENT_LEVEL_MONEY,
]);

async function connect(): Promise<pg.Client> {
  for (const h of HOSTS) {
    const cl = new pg.Client({
      connectionString: `postgresql://${USER}:${encodeURIComponent(PASSWORD!)}@${h}:5432/postgres`,
    });
    try {
      await cl.connect();
      console.log(`connected via ${h}:5432\n`);
      return cl;
    } catch (e) {
      console.error(`  ${h}:5432 → ${(e as { code?: string }).code ?? (e as Error).message}`);
    }
  }
  throw new Error("all hosts failed");
}

function n(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const p = parseFloat(String(v));
  return Number.isFinite(p) ? p : 0;
}

async function main() {
  const c = await connect();
  const q = <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
    c.query(sql, params).then((r) => r.rows as T[]);

  console.log(APPLY ? "*** APPLY MODE — will WRITE ***\n" : "*** DRY-RUN (no writes) — pass --apply to write ***\n");

  // 1. Every base tracking with >1 box in momo_box_detail.
  const bases = await q<{ base_tracking: string; boxes: string }>(
    `select base_tracking, count(*) as boxes from momo_box_detail group by base_tracking having count(*) > 1 order by count(*) desc`,
  );
  console.log(`Found ${bases.length} multi-box base trackings in momo_box_detail.\n`);

  const summary = {
    candidates: bases.length,
    willSplit: 0,
    siblingsToCreate: 0,
    skipped: {} as Record<string, number>,
  };
  const backup: Array<Record<string, unknown>> = [];

  for (const { base_tracking } of bases) {
    const base = baseOf(base_tracking.trim());

    // Box detail for this base.
    const boxRows = await q(
      `select box_tracking, width, length, height, weight_kg, cbm, quantity from momo_box_detail where base_tracking=$1 order by box_tracking`,
      [base],
    );
    // All tb_forwarder rows on this base (aggregate + any siblings).
    const fwdRows = await q(
      `select * from tb_forwarder where ftrackingchn = $1 or ftrackingchn like $2`,
      [base, `${base}-%`],
    );
    const exact = fwdRows.filter((r) => baseOf(String(r.ftrackingchn ?? "")) === base);

    const bump = (reason: string) => {
      summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1;
    };

    if (exact.length === 0) {
      bump("no_aggregate_row");
      continue;
    }
    if (exact.some((r) => suffixOf(String(r.ftrackingchn ?? "")) > 0)) {
      bump("already_split");
      continue;
    }
    const aggregate = exact.find((r) => suffixOf(String(r.ftrackingchn ?? "")) === 0);
    if (!aggregate) {
      bump("not_bare_base");
      continue;
    }

    const aggInput: AggregateRowInput = {
      id: Number(aggregate.id),
      ftrackingchn: String(aggregate.ftrackingchn ?? ""),
      fstatus: String(aggregate.fstatus ?? ""),
      reforder: String(aggregate.reforder ?? ""),
      ftotalprice: n(aggregate.ftotalprice),
      famount: n(aggregate.famount),
      famountcount: (aggregate.famountcount as string | null) ?? null,
      fweight: n(aggregate.fweight),
      fvolume: n(aggregate.fvolume),
      frefrate: aggregate.frefrate as number | string | null,
      frefprice: aggregate.frefprice as number | string | null,
    };
    const boxInputs: BoxDetailInput[] = boxRows.map((b) => ({
      boxTracking: String(b.box_tracking ?? "").trim(),
      weightKgPerPiece: n(b.weight_kg),
      cbmPerPiece: n(b.cbm),
      width: n(b.width),
      length: n(b.length),
      height: n(b.height),
      quantity: n(b.quantity),
    }));

    const decision = planBoxRowSplit(aggInput, boxInputs, { allowPriced: ALLOW_PRICED });
    if (!decision.split) {
      bump(decision.reason);
      console.log(`  SKIP  ${base}  (${decision.reason}) — fid=${aggInput.id} amt=${aggInput.famount} wt=${aggInput.fweight} cbm=${aggInput.fvolume} total=${aggInput.ftotalprice} status=${aggInput.fstatus}`);
      continue;
    }

    // 💰 PRICED-split defence: the plan forces Σ === aggregate, but VERIFY before writing.
    if (decision.priced) {
      const planSum = decision.rows.reduce((s, r) => s + Number(r.ftotalprice ?? 0), 0);
      const drift = Math.abs(Math.round(planSum * 100) / 100 - Math.round(aggInput.ftotalprice * 100) / 100);
      if (drift > 0.005) {
        bump("priced_drift");
        console.log(`  SKIP  ${base}  (priced_drift Σ${planSum} ≠ ${aggInput.ftotalprice}) — fid=${aggInput.id}`);
        continue;
      }
    }

    summary.willSplit += 1;
    const newSiblings = decision.rows.filter((r) => !r.isAnchor).length;
    summary.siblingsToCreate += newSiblings;
    console.log(`  SPLIT ${base}  fid=${aggInput.id} → ${decision.rows.length} rows (1 anchor + ${newSiblings} new):`);
    for (const r of decision.rows) {
      console.log(`          ${r.isAnchor ? "[anchor→UPDATE]" : "[INSERT]"} '${r.ftrackingchn}' wt=${r.fweight} cbm=${r.fvolume} dims=${r.fwidth}x${r.flength}x${r.fheight} amt=${r.famount}`);
    }

    if (!APPLY) continue;

    // ── APPLY ──
    // Backup the aggregate row before mutating.
    backup.push({ ...aggregate });

    // Clone template = aggregate minus id/metrics/price columns.
    const template: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(aggregate)) {
      if (!CLONE_OMIT.has(k)) template[k] = v;
    }

    const anchor = decision.rows.find((r) => r.isAnchor)!;
    // Per-box price: PRICED split writes the PRESERVED share + the copied rate (mirrors
    // split-box-rows.ts) · UNPRICED split resets to 0 (re-priced later by the MOMO cron).
    const priced = decision.priced === true;
    const priceOf = (r: (typeof decision.rows)[number]) =>
      priced
        ? { ftotalprice: Number(r.ftotalprice ?? 0), frefrate: r.frefrate ?? 0, frefprice: r.frefprice ?? "0" }
        : { ftotalprice: 0, frefrate: 0, frefprice: "0" };
    const ap = priceOf(anchor);
    // 💰 ATOMIC per-base: wrap the anchor UPDATE + sibling INSERTs in ONE txn so a partial
    // failure can NEVER under/over-bill (a ROLLBACK undoes everything). (Money review 2026-07-03.)
    await c.query("begin");
    try {
      // 4a. UPDATE the aggregate → box-1. TOCTOU: still unbilled/aggregate AND (unpriced path:
      // still ≤0 · priced path: price UNCHANGED). Shipment-money columns are NOT touched.
      const upd = await q(
        `update tb_forwarder
           set fweight=$1, fvolume=$2, fwidth=$3, flength=$4, fheight=$5, famount=$6,
               ftotalprice=$7, frefrate=$8, frefprice=$9, adminidupdate='sys-split'
         where id=$10 and fstatus = any($11) and famount=$12 and ${priced ? "ftotalprice=$13" : "ftotalprice<=0"}
         returning id`,
        [anchor.fweight, anchor.fvolume, anchor.fwidth, anchor.flength, anchor.fheight, anchor.famount,
         ap.ftotalprice, ap.frefrate, ap.frefprice,
         aggInput.id, ["1", "2", "3", "4"], aggInput.famount,
         ...(priced ? [aggInput.ftotalprice] : [])],
      );
      if (upd.length === 0) {
        await c.query("rollback");
        console.log(`          ! anchor UPDATE matched 0 rows (raced/priced-changed) — skipping ${base}`);
        bump("already_split");
        summary.willSplit -= 1;
        summary.siblingsToCreate -= newSiblings;
        backup.pop();
        continue;
      }

      // 4b. INSERT boxes 2..N. Clone non-money fields, force shipment-money = 0, set the per-box
      // freight (0 unpriced · preserved share priced). Parameterised multi-row insert.
      const cols = Object.keys(template);
      for (const r of decision.rows.filter((x) => !x.isAnchor)) {
        const sp = priceOf(r);
        const rowCols = [
          ...cols,
          ...SHIPMENT_LEVEL_MONEY,
          "ftrackingchn", "fweight", "fvolume", "fwidth", "flength", "fheight", "famount",
          "ftotalprice", "frefrate", "frefprice", "adminidupdate",
        ];
        const rowVals = [
          ...cols.map((k) => template[k]),
          ...SHIPMENT_LEVEL_MONEY.map(() => 0),
          r.ftrackingchn, r.fweight, r.fvolume, r.fwidth, r.flength, r.fheight, r.famount,
          sp.ftotalprice, sp.frefrate, sp.frefprice, "sys-split",
        ];
        const placeholders = rowVals.map((_, i) => `$${i + 1}`).join(", ");
        const colList = rowCols.map((k) => `"${k}"`).join(", ");
        await c.query(`insert into tb_forwarder (${colList}) values (${placeholders})`, rowVals);
      }
      await c.query("commit");
      console.log(`          ✓ applied: updated anchor id=${aggInput.id} + inserted ${newSiblings} siblings${priced ? " (priced · money-neutral)" : ""}`);
    } catch (txErr) {
      await c.query("rollback").catch(() => {});
      console.log(`          ! txn ROLLED BACK for ${base}: ${(txErr as Error).message}`);
      bump("txn_error");
      summary.willSplit -= 1;
      summary.siblingsToCreate -= newSiblings;
      backup.pop();
    }
  }

  if (APPLY && backup.length > 0) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `scripts/_backup-split-momo-${ts}.json`;
    writeFileSync(path, JSON.stringify({ note: "aggregate tb_forwarder rows BEFORE split — restore by re-UPDATEing these fields + DELETE the inserted -i/n siblings for the same base", rows: backup }, null, 2));
    console.log(`\nBackup written: ${path} (${backup.length} aggregate rows)`);
  }

  console.log(`\n════════ SUMMARY ════════`);
  console.log(`multi-box bases:      ${summary.candidates}`);
  console.log(`WILL SPLIT:           ${summary.willSplit}  (+ ${summary.siblingsToCreate} new sibling rows)`);
  console.log(`skipped:`);
  for (const [reason, count] of Object.entries(summary.skipped).sort()) {
    console.log(`  ${reason}: ${count}`);
  }
  console.log(APPLY ? `\n*** APPLIED ***` : `\n*** DRY-RUN — nothing written. Re-run with --apply to write. ***`);

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
