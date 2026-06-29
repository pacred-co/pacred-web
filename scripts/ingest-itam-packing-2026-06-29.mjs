#!/usr/bin/env node
/**
 * iTAM (แต้ม) packing-list → taem_packing_line ingestion (2026-06-29).
 *
 * Owner (2026-06-29): *"เอาข้อมูลเข้า database · อุดจุดบอด"* — persist the iTAM
 * packing-list ground truth (the TRUTH source) into the REFERENCE table
 * taem_packing_line (mig 0226) so the MOMO-API-drop gap is VISIBLE on the
 * read-only drift page + one-click-fixable via the EXISTING audited reconcile.
 *
 * This writes ONLY the reference table taem_packing_line. It NEVER touches
 * tb_forwarder / tb_order / any money/price/status table (§0e isolation). It is
 * idempotent — re-running upserts the same (container_no, base_tracking) rows in
 * place (UNIQUE key on mig 0226). Default is DRY-RUN; pass --apply to write.
 *
 *   DRY-RUN (default):  SUPABASE_DB_PASSWORD='<pw>' node scripts/ingest-itam-packing-2026-06-29.mjs
 *   APPLY:              SUPABASE_DB_PASSWORD='<pw>' node scripts/ingest-itam-packing-2026-06-29.mjs --apply
 *
 * Method (mirrors lib/admin/taem-reconcile-parser.ts CANON + lib/admin/momo-bill-header.ts):
 *   - read every *.xlsx in C:\Users\Admin\Desktop\Packing List\TAM - Packing List\
 *     (PDFs + non-xlsx skipped) · sheet "Shipment Report"
 *   - CANON cols: [0]Container [1]Trans [7]Type [8]Code [9]Tracking
 *                 [13]Total Parcel [16]Total Wt. [17]Total Vol. [24]etd [25]eta
 *   - carry-forward the container (iTAM leaves col 0 blank on -2..-N continuation rows)
 *   - de-dup the -N/M box suffix to the BASE tracking, SUMming parcel/wt/vol
 *     (so a multi-box shipment is one row · the momo-bill-header discipline)
 *   - upsert into taem_packing_line (container_no, base_tracking)
 *
 * xlsx is read via Python+openpyxl (no JS xlsx lib in package.json) shelled out to
 * a temp JSON, then de-duped + upserted here.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const { Client } = pg;
// Defaults to prod; override with PROJECT_REF env for dev-sync (DEV-SYNC rule).
const PROJECT_REF = process.env.PROJECT_REF || "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;

const SRC_DIR = "C:\\Users\\Admin\\Desktop\\Packing List\\TAM - Packing List";

// ── de-dup helpers (verbatim from lib/admin/momo-bill-header.ts) ────────────
function baseTracking(tracking) {
  if (!tracking) return null;
  const t = String(tracking).trim();
  if (!t || t === "-") return null;
  return t.replace(/-\d+(?:\/\d+)?$/, "");
}
const toNum = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const round3 = (n) => Math.round(n * 1000) / 1000;
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const cellStr = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

// ── 1. extract every xlsx → JSON rows via Python (openpyxl) ──────────────────
const PY = `
import openpyxl, os, json, glob, sys, io
# Force UTF-8 stdout (Windows console defaults to cp1252 → can't encode CN/TH).
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
src = ${JSON.stringify(SRC_DIR)}
CANON = {"container":0,"trans":1,"type":7,"code":8,"tracking":9,"parcel":13,"totalWt":16,"totalVol":17,"etd":24,"eta":25}
def cell(r, i):
    return r[i] if i < len(r) and r[i] is not None else None
out = []
for fn in sorted(glob.glob(os.path.join(src, "*.xlsx"))):
    base = os.path.basename(fn)
    if base.startswith("~$"):
        continue
    try:
        wb = openpyxl.load_workbook(fn, read_only=True, data_only=True)
    except Exception as e:
        out.append({"file": base, "error": str(e), "rows": []})
        continue
    # Pick the iTAM "Shipment Report" layout sheet (col 0 header == "Container Name").
    # The legacy "Pacred 2026-06-19" overview uses a DIFFERENT "MOMO Pacred" sheet
    # whose col 0 is "ftrackingchn" (tracking, not container) — it is NOT the
    # per-container truth (the dry-run doc explicitly excludes it). Skip any file
    # whose chosen sheet is not the Container-Name layout so we never mistake a
    # tracking for a container.
    sheet = None
    for sn in (["Shipment Report"] + [s for s in wb.sheetnames if s != "Shipment Report"]):
        if sn not in wb.sheetnames:
            continue
        first = next(wb[sn].iter_rows(values_only=True), ())
        h0 = (str(first[0]).strip().lower() if (len(first) > 0 and first[0] is not None) else "")
        if h0 == "container name":
            sheet = sn
            break
    if sheet is None:
        out.append({"file": base, "skipped": "not-shipment-report-layout", "rows": []})
        wb.close()
        continue
    ws = wb[sheet]
    rows = list(ws.iter_rows(values_only=True))
    # detect header: first row col 0 == "Container Name" (or "ftrackingchn")
    fileRows = []
    for ri, r in enumerate(rows):
        c0 = (str(r[0]).strip().lower() if (len(r) > 0 and r[0] is not None) else "")
        if c0 in ("container name", "ftrackingchn"):
            continue  # header
        rec = {k: cell(r, i) for k, i in CANON.items()}
        # normalize date cells to iso string when openpyxl already gave a datetime
        for dk in ("etd", "eta"):
            v = rec[dk]
            if hasattr(v, "isoformat"):
                rec[dk] = v.isoformat()[:10]
        fileRows.append(rec)
    out.append({"file": base, "sheet": sheet, "rows": fileRows})
    wb.close()
sys.stdout.write(json.dumps(out, ensure_ascii=False, default=str))
`;

const tmpPy = path.join(os.tmpdir(), "itam-extract.py");
const tmpJson = path.join(os.tmpdir(), "itam-packing.json");
fs.writeFileSync(tmpPy, PY, "utf-8");

console.log(`\n${"=".repeat(74)}`);
console.log(`iTAM packing-list ingestion — ${APPLY ? "APPLY" : "DRY-RUN"}`);
console.log(`src: ${SRC_DIR}`);
console.log(`${"=".repeat(74)}\n`);

const pyBin = process.platform === "win32" ? "python" : "python3";
const py = spawnSync(pyBin, [tmpPy], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
if (py.status !== 0) {
  console.error("FATAL: python extractor failed.", py.stderr || py.error?.message);
  process.exit(1);
}
let files;
try {
  files = JSON.parse(py.stdout);
} catch (e) {
  console.error("FATAL: could not parse python output as JSON.", e.message);
  process.exit(1);
}
fs.writeFileSync(tmpJson, py.stdout, "utf-8");

// ── 2. de-dup to base tracking (carry-forward container · sum parcel/wt/vol) ──
// Keyed by (container_no, base_tracking). source_file = the first file that
// produced the row (idempotent · re-ingest overwrites).
const agg = new Map(); // key -> aggregate row
let rawDataRows = 0;
const perContainer = new Map(); // container -> base-tracking Set (for the dry-run table)

for (const f of files) {
  if (f.error) {
    console.warn(`  ⚠ ${f.file}: read error — skipped (${f.error})`);
    continue;
  }
  if (f.skipped) {
    console.log(`  · ${f.file}: skipped (${f.skipped})`);
    continue;
  }
  let curContainer = null;
  for (const r of f.rows) {
    const containerCell = cellStr(r.container);
    if (containerCell) curContainer = containerCell; // carry-forward
    const tracking = cellStr(r.tracking);
    if (!tracking) continue; // not actionable
    const base = baseTracking(tracking);
    if (!base) continue;
    const container = curContainer;
    if (!container) continue; // a tracking with no resolvable container — skip (header artifact)
    rawDataRows += 1;

    const key = `${container}::${base}`;
    let row = agg.get(key);
    if (!row) {
      row = {
        container_no: container,
        base_tracking: base,
        member_code: cellStr(r.code),
        item_type: cellStr(r.type),
        total_parcel: 0,
        total_wt_kg: 0,
        total_vol_cbm: 0,
        etd: null, // real files leave these blank — captured if ever present
        eta: null,
        source_file: f.file,
        _hasMeasure: false,
      };
      agg.set(key, row);
      if (!perContainer.has(container)) perContainer.set(container, new Set());
    }
    perContainer.get(container).add(base);
    // member_code / item_type: keep the first non-null seen across the group.
    if (!row.member_code && cellStr(r.code)) row.member_code = cellStr(r.code);
    if (!row.item_type && cellStr(r.type)) row.item_type = cellStr(r.type);
    const p = toNum(r.parcel);
    const w = toNum(r.totalWt);
    const v = toNum(r.totalVol);
    if (p != null) row.total_parcel += p;
    if (w != null) { row.total_wt_kg += w; row._hasMeasure = true; }
    if (v != null) { row.total_vol_cbm += v; row._hasMeasure = true; }
    // etd/eta — only adopt a real date (Python already iso-trimmed datetimes).
    const etd = cellStr(r.etd);
    const eta = cellStr(r.eta);
    if (!row.etd && etd && /^\d{4}-\d{2}-\d{2}$/.test(etd)) row.etd = etd;
    if (!row.eta && eta && /^\d{4}-\d{2}-\d{2}$/.test(eta)) row.eta = eta;
  }
}

const rows = Array.from(agg.values()).map((r) => ({
  container_no: r.container_no,
  base_tracking: r.base_tracking,
  member_code: r.member_code,
  item_type: r.item_type,
  total_parcel: r.total_parcel || null,
  total_wt_kg: r._hasMeasure ? round3(r.total_wt_kg) : null,
  total_vol_cbm: r._hasMeasure ? round6(r.total_vol_cbm) : null,
  etd: r.etd,
  eta: r.eta,
  source_file: r.source_file,
}));

// ── 3. report (dry-run table) ────────────────────────────────────────────────
console.log(`Files ingested: ${files.filter((f) => !f.error && !f.skipped).length} xlsx (of ${files.length} found) · raw data rows: ${rawDataRows}`);
console.log(`De-duped base-tracking rows to upsert: ${rows.length}\n`);
console.log("Per-container summary (iTAM truth · de-duped to base tracking):");
console.log(`  ${"container".padEnd(18)} ${"base trk".padStart(8)} ${"boxes".padStart(7)} ${"weight kg".padStart(12)} ${"CBM".padStart(11)}`);
const containerKeys = Array.from(perContainer.keys()).sort();
for (const c of containerKeys) {
  const cr = rows.filter((r) => r.container_no === c);
  const boxes = cr.reduce((a, r) => a + (r.total_parcel || 0), 0);
  const wt = cr.reduce((a, r) => a + (r.total_wt_kg || 0), 0);
  const vol = cr.reduce((a, r) => a + (r.total_vol_cbm || 0), 0);
  console.log(`  ${c.padEnd(18)} ${String(cr.length).padStart(8)} ${String(boxes).padStart(7)} ${wt.toFixed(1).padStart(12)} ${vol.toFixed(4).padStart(11)}`);
}
console.log("");

if (rows.length === 0) {
  console.error("No rows parsed — nothing to do.");
  process.exit(1);
}

if (!APPLY) {
  console.log(`DRY-RUN complete. ${rows.length} rows would be upserted into taem_packing_line.`);
  console.log(`(parsed JSON written to ${tmpJson})`);
  console.log(`Re-run with --apply (and SUPABASE_DB_PASSWORD set) to write.\n`);
  process.exit(0);
}

// ── 4. APPLY — idempotent upsert ─────────────────────────────────────────────
if (!PASSWORD) {
  console.error("FATAL: --apply requires SUPABASE_DB_PASSWORD.");
  process.exit(1);
}

const POOLER_HOSTS = [
  "aws-1-ap-southeast-1.pooler.supabase.com",
  "aws-0-ap-southeast-1.pooler.supabase.com",
];
const POOLER_USER = `postgres.${PROJECT_REF}`;
const DIRECT_HOST = `db.${PROJECT_REF}.supabase.co`;
const attempts = [
  ...POOLER_HOSTS.flatMap((h) => [
    { label: `session-pooler ${h}:5432`, conn: `postgresql://${POOLER_USER}:${encodeURIComponent(PASSWORD)}@${h}:5432/postgres` },
    { label: `transaction-pooler ${h}:6543`, conn: `postgresql://${POOLER_USER}:${encodeURIComponent(PASSWORD)}@${h}:6543/postgres` },
  ]),
  { label: "direct 5432", conn: `postgresql://postgres:${encodeURIComponent(PASSWORD)}@${DIRECT_HOST}:5432/postgres` },
];
let client = null;
for (const a of attempts) {
  try {
    console.log(`Trying ${a.label}…`);
    client = new Client({ connectionString: a.conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
    await client.connect();
    console.log("✓ Connected.");
    break;
  } catch (e) {
    console.log(`  ✗ ${e.code ?? "error"}: ${e.message}`);
    client = null;
  }
}
if (!client) { console.error("FATAL: could not connect to prod via any path."); process.exit(2); }

let upserted = 0;
try {
  await client.query("begin");
  for (const r of rows) {
    await client.query(
      `insert into public.taem_packing_line
         (container_no, base_tracking, member_code, item_type, total_parcel,
          total_wt_kg, total_vol_cbm, etd, eta, source_file, ingested_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       on conflict (container_no, base_tracking) do update set
         member_code   = excluded.member_code,
         item_type     = excluded.item_type,
         total_parcel  = excluded.total_parcel,
         total_wt_kg   = excluded.total_wt_kg,
         total_vol_cbm = excluded.total_vol_cbm,
         etd           = excluded.etd,
         eta           = excluded.eta,
         source_file   = excluded.source_file,
         ingested_at   = now()`,
      [
        r.container_no, r.base_tracking, r.member_code, r.item_type, r.total_parcel,
        r.total_wt_kg, r.total_vol_cbm, r.etd, r.eta, r.source_file,
      ],
    );
    upserted += 1;
  }
  await client.query("commit");
  console.log(`\n✓ APPLIED — upserted ${upserted} rows into taem_packing_line.`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error("✗ INGESTION FAILED (rolled back):", err.code, err.message);
  if (err.detail) console.error("  Detail:", err.detail);
  if (err.hint) console.error("  Hint:", err.hint);
  process.exit(3);
} finally {
  await client.end();
}
