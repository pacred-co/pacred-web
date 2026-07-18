/**
 * ingest-ttw-packing-2026-07-18.ts — stage the 8 TTW/อี้อู (Yiwu) packing lists
 * into ttw_packing_line (mig 0262) so the tracking + data are "in the system"
 * (owner 2026-07-18 "เอาแทรคกิ้งและ data เข้าระบบไปก่อน · เดี๋ยว CS มาใส่ PR").
 *
 * Parse: lib/admin/yiwu-packing-xlsx-parser.ts (the SAME parser the /admin/api-
 * forwarder-yiwu route uses · proven Σ-aggregated == each file's own footer
 * grand-total for boxes/weight/cbm). Per (container, 单号) — box-detail rows
 * aggregated to the base tracking by the parser.
 *
 * CONTAINER = the FILENAME (= the eventual fcabinetnumber) — the parser's in-cell
 * container guess is unreliable (grabs an internal YWYY/GZYY packing serial), so we
 * override with the filename. warehouse='TTW' · origin='อี้อู' · transport from the
 * container code (all 8 = เรือ). member_code auto-filled ONLY when the 唛头 mark is
 * literally a PR (e.g. PR032/SEA); otherwise null → CS assigns via the delivery notes.
 *
 * SAFETY: ttw_packing_line is a NON-billable STAGING table (§0e isolation · no FK to
 * money tables · nothing here feeds a customer price until CS assigns a PR + commits
 * via a separate gated path). The upsert is idempotent and NEVER clobbers a CS-assigned
 * member_code or a committed row (committed_forwarder_id IS NULL guard). Dry-run +
 * backup first (the printed plan is the gate).
 *
 * RUN: SUPABASE_DB_PASSWORD='…' ./node_modules/.bin/tsx scripts/ingest-ttw-packing-2026-07-18.ts [--apply] [--dir=/path]
 */
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { parseYiwuPackingXlsx } from "../lib/admin/yiwu-packing-xlsx-parser";
import { transportModeFromCabinetName } from "../lib/forwarder/cabinet-transport";

const APPLY = process.argv.includes("--apply");
const dirArg = process.argv.find((a) => a.startsWith("--dir="));
const DIR = dirArg ? dirArg.slice(6) : "/Users/dev/Desktop";
const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }

// The 8 containers the owner dropped (filename = container = fcabinetnumber).
const FILES = [
  "GZS260614-1T", "GZS260615-2T", "GZS260618-3T", "GZS260619-4T",
  "GZS260625-5T", "GZS260707-6T", "GZS260714-7T", "YWS260717-8T",
];

const round = (n: number, dp: number) => { const f = 10 ** dp; return Math.round(n * f) / f; };
/** A 唛头 mark that IS a PR (e.g. "PR032/SEA" · "PR32") → the PR code, uppercased. */
function prFromMark(mark: string | null | undefined): string | null {
  const m = (mark ?? "").toUpperCase().match(/PR\d{2,}/);
  return m ? m[0] : null;
}

type PlanRow = {
  container_no: string; base_tracking: string; shipping_mark: string | null;
  member_code: string | null; pr_source: string | null; warehouse: string; origin: string;
  transport_mode: string; boxes: number | null; weight_kg: number | null; cbm: number | null;
  product_name: string | null; item_type: string | null; sm_date: string | null; source_file: string;
};

async function main() {
  const plan: PlanRow[] = [];
  const perContainer: { file: string; tracks: number; boxes: number; wt: number; cbm: number; prMatched: number }[] = [];

  for (const name of FILES) {
    const file = `${name}.xlsx`;
    const buf = readFileSync(`${DIR}/${file}`);
    const parsed = parseYiwuPackingXlsx(buf);
    const transport = transportModeFromCabinetName(name) ?? "2"; // all 8 = เรือ
    let boxes = 0, wt = 0, cbm = 0, prMatched = 0;
    for (const a of parsed.aggregated) {
      const track = (a.baseTracking ?? "").trim();
      if (!track) continue;
      const mark = (a.code ?? "").trim() || null;
      const pr = prFromMark(mark);
      if (pr) prMatched++;
      const b = a.parcelCount == null ? null : Math.round(a.parcelCount);
      const w = a.totalWeight == null ? null : round(a.totalWeight, 3);
      const c = a.totalCbm == null ? null : round(a.totalCbm, 6);
      boxes += b ?? 0; wt += w ?? 0; cbm += c ?? 0;
      plan.push({
        container_no: name, base_tracking: track, shipping_mark: mark,
        member_code: pr, pr_source: pr ? "mark" : null, warehouse: "TTW", origin: "อี้อู",
        transport_mode: transport, boxes: b, weight_kg: w, cbm: c,
        product_name: (a.product ?? "").trim() || null, item_type: (a.productType ?? "").trim() || null,
        sm_date: (a.smDate ?? "").trim() || null, source_file: file,
      });
    }
    perContainer.push({ file: name, tracks: parsed.aggregated.length, boxes, wt: round(wt, 2), cbm: round(cbm, 4), prMatched });
    if (parsed.warnings.length) console.log(`  ⚠ ${name}: ${parsed.warnings.join("; ")}`);
  }

  console.log(`\n━━ TTW/อี้อู PACKING-LIST INGEST PLAN (${plan.length} tracking rows · ${FILES.length} containers) ━━`);
  console.table(perContainer);
  console.log(`Σ tracks=${plan.length} · PR-auto-matched (มาร์ค PR###)=${plan.filter((p) => p.member_code).length} · rest=CS ใส่ PR ทีหลัง`);

  if (!APPLY) { console.log("\n(dry-run — pass --apply · backup written first)"); return; }

  const c = new pg.Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(PW!)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
  });
  await c.connect();
  // Backup the CURRENT staging rows for these containers (before the upsert).
  const { rows: before } = await c.query(
    `SELECT * FROM ttw_packing_line WHERE container_no = ANY($1) ORDER BY container_no, base_tracking`,
    [FILES],
  );
  writeFileSync(`/tmp/backup-ttw-packing-2026-07-18.json`, JSON.stringify(before, null, 2));
  console.log(`\n📦 backup (${before.length} pre-existing rows) → /tmp/backup-ttw-packing-2026-07-18.json`);

  await c.query("BEGIN");
  let n = 0;
  for (const p of plan) {
    const res = await c.query(
      `INSERT INTO ttw_packing_line
         (container_no, base_tracking, shipping_mark, member_code, pr_source, warehouse, origin,
          transport_mode, boxes, weight_kg, cbm, product_name, item_type, sm_date, source_file, ingested_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),now())
       ON CONFLICT (container_no, base_tracking) DO UPDATE SET
         shipping_mark  = EXCLUDED.shipping_mark,
         member_code    = COALESCE(ttw_packing_line.member_code, EXCLUDED.member_code),
         pr_source      = CASE WHEN ttw_packing_line.member_code IS NOT NULL THEN ttw_packing_line.pr_source ELSE EXCLUDED.pr_source END,
         transport_mode = EXCLUDED.transport_mode,
         boxes          = EXCLUDED.boxes,
         weight_kg      = EXCLUDED.weight_kg,
         cbm            = EXCLUDED.cbm,
         product_name   = EXCLUDED.product_name,
         item_type      = EXCLUDED.item_type,
         sm_date        = EXCLUDED.sm_date,
         source_file    = EXCLUDED.source_file,
         updated_at     = now()
       WHERE ttw_packing_line.committed_forwarder_id IS NULL`,
      [p.container_no, p.base_tracking, p.shipping_mark, p.member_code, p.pr_source, p.warehouse, p.origin,
       p.transport_mode, p.boxes, p.weight_kg, p.cbm, p.product_name, p.item_type, p.sm_date, p.source_file],
    );
    n += res.rowCount ?? 0;
  }
  await c.query("COMMIT");
  const { rows: [{ total }] } = await c.query(`SELECT count(*)::int total FROM ttw_packing_line WHERE container_no = ANY($1)`, [FILES]);
  console.log(`\n✅ applied — ${n} rows upserted · ttw_packing_line now holds ${total} rows for these ${FILES.length} containers`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
