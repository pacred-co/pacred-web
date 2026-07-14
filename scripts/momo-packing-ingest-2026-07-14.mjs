/**
 * ════════════════════════════════════════════════════════════════════════════
 * แต้ม PACKING-LIST (.xlsx) → tb_forwarder  —  make the system CURRENT from the
 * PHYSICAL ground truth (แต้ม = per-box weight/cbm/box-count).   2026-07-14 · เดฟ
 * ════════════════════════════════════════════════════════════════════════════
 * Reads every .xlsx in "…/Packing List/MOMO - Packing now" (filename = the REAL
 * container, e.g. GZS260624-1 / GZE260704-1 · GZS=เรือ GZE=รถ), and reconciles
 * tb_forwarder to it:
 *   • match each แต้ม base tracking → tb_forwarder by ftrackingchn = base OR
 *     ~ ^base-[0-9] (base + split siblings), GROUPED by base (baseTrackingOf).
 *   • SINGLE (1 non-billed row)  → write the แต้ม AGGREGATE Σ onto it.
 *   • SPLIT  (N non-billed rows) → write EACH sibling to ITS แต้ม box so
 *       Σ(siblings) === แต้ม total (money-neutral vs แต้ม truth · never fanned):
 *         Case A  index-aligned  → per-box by the -i/n suffix (box-1 = bare base)
 *         Case B  same count/idx-misaligned → by-order zip (sorted by idx)
 *         Case C  count differs  → COLLAPSE: Σ onto box-1, zero the other siblings
 *                                  (Σ still === แต้ม · flagged for the owner)
 *   • fcabinetnumber := the REAL container (filename) on every matched row
 *     (resolves routing-placeholder cabinets like PR20260701-EK01 & sack numbers).
 *   • fbox_mark := แต้ม CG (box mark · display) where present.
 *   • famountcount forced "1" (แต้ม Total CBM IS the aggregate · read fvolume direct).
 *   • ftransporttype derived from the container name (GZS→2 เรือ · GZE→1 รถ).
 *   • ZERO the price (frefrate/frefprice/ftotalprice = 0) on any row whose weight
 *     changed → re-price later (via /review or the cron · this script never prices).
 *
 * MONEY-SAFETY (fweight/fvolume = the SELL measurement basis):
 *   • NEVER writes a BILLED row (fstatus ∈ 5/6/7) — reported as skipped/frozen.
 *   • The SPLIT write is EXACT: Σ over the written siblings === the แต้ม Σ. It is
 *     NEVER the aggregate fanned onto N rows (that would multiply the charge).
 *   • แต้ม physical weights are MUCH LOWER than the current MOMO weights → applying
 *     truth LOWERS bills materially → the DRY-RUN reports the Σ weight/cbm delta
 *     per container + a platform total so the owner sees the impact BEFORE apply.
 *   • DRY-RUN by default. --apply is gated + writes a backup JSON of every touched
 *     row first. A TOCTOU guard re-asserts non-billed in the UPDATE WHERE.
 *
 * The parser is a faithful PORT of lib/admin/momo-packing-xlsx-parser.ts
 * (that module can't be imported here — it pulls @/lib/admin/momo-raw-helpers
 * which has `import "server-only"`, which throws under plain node). baseTrackingOf
 * is inlined; the parse body is byte-for-byte the same logic. Verified on
 * GZS260624-1 → 1782110296 = 6 boxes / 82.5 kg (the task's fixture).
 *
 * RUN:
 *   parser self-check:  node scripts/momo-packing-ingest-2026-07-14.mjs --selftest
 *   dry-run (default):  PROD_DB_PW='<prod>' node scripts/momo-packing-ingest-2026-07-14.mjs
 *   apply (writes!):    PROD_DB_PW='<prod>' node scripts/momo-packing-ingest-2026-07-14.mjs --apply
 * ════════════════════════════════════════════════════════════════════════════
 */
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const PACKING_DIR = "C:/Users/Admin/Desktop/Packing List/MOMO - Packing now";
const BACKUP_PATH = "scripts/momo-packing-ingest-backup-2026-07-14.json";
const APPLY = process.argv.includes("--apply");
const SELFTEST = process.argv.includes("--selftest");
const LIMIT_FILE = (process.argv.find((a) => a.startsWith("--file=")) || "").split("=")[1] || null;

const BILLED = new Set(["5", "6", "7"]);
const WT_EPS = 0.01;
const VOL_EPS = 0.000001;

// ─────────────────────────────────────────────────────────────────────────────
// PORTED PARSER  (faithful copy of lib/admin/momo-packing-xlsx-parser.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** Strip a MOMO "-i/n" (or "-i") split-suffix → the BASE tracking. (inlined) */
function baseTrackingOf(re) {
  return String(re ?? "").trim().replace(/-\d+(\/\d+)?$/, "");
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&");
}

function readZipEntry(buf, name) {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0x10000; i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) return readZipEntryByLocalScan(buf, name);
  const cdCount = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const target = Buffer.from(name);
  let p = cdOffset;
  for (let n = 0; n < cdCount && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const fname = buf.subarray(p + 46, p + 46 + nameLen);
    if (fname.equals(target)) return inflateAtLocalHeader(buf, localOff, method, compSize);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function inflateAtLocalHeader(buf, localOff, method, compSize) {
  if (buf.readUInt32LE(localOff) !== 0x04034b50) return null;
  const nameLen = buf.readUInt16LE(localOff + 26);
  const extraLen = buf.readUInt16LE(localOff + 28);
  const dataStart = localOff + 30 + nameLen + extraLen;
  const comp = buf.subarray(dataStart, dataStart + compSize);
  return method === 8 ? zlib.inflateRawSync(comp) : Buffer.from(comp);
}

function readZipEntryByLocalScan(buf, name) {
  let o = 0;
  const target = Buffer.from(name);
  while (o + 30 <= buf.length && buf.readUInt32LE(o) === 0x04034b50) {
    const method = buf.readUInt16LE(o + 8);
    const compSize = buf.readUInt32LE(o + 18);
    const nameLen = buf.readUInt16LE(o + 26);
    const extraLen = buf.readUInt16LE(o + 28);
    const fname = buf.subarray(o + 30, o + 30 + nameLen);
    const dataStart = o + 30 + nameLen + extraLen;
    if (fname.equals(target)) {
      const comp = buf.subarray(dataStart, dataStart + compSize);
      return method === 8 ? zlib.inflateRawSync(comp) : Buffer.from(comp);
    }
    o = dataStart + compSize;
  }
  return null;
}

function colRefToIndex(ref) {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function parseSheetGrid(xml) {
  const grid = [];
  const rowRe = /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml)) !== null) {
    const rowIdx = parseInt(rm[1], 10) - 1;
    const cellsXml = rm[2];
    const row = [];
    const cellRe = /<c\b[^>]*\br="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>|<c\b[^>]*\br="([A-Z]+)\d+"([^>]*)\/>/g;
    let cm;
    while ((cm = cellRe.exec(cellsXml)) !== null) {
      const refCol = cm[1] ?? cm[4];
      const attrs = (cm[2] ?? cm[5] ?? "");
      const inner = cm[3] ?? "";
      const ci = colRefToIndex(refCol);
      if (ci < 0) continue;
      const tMatch = attrs.match(/\bt="([^"]+)"/);
      const t = tMatch ? tMatch[1] : "";
      let value = null;
      if (t === "inlineStr") {
        const texts = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decodeXml(x[1]));
        const s = texts.join("");
        value = s === "" ? null : s;
      } else if (t === "s") {
        value = null;
      } else {
        const vMatch = inner.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        if (vMatch) {
          const raw = decodeXml(vMatch[1]);
          if (t === "str") value = raw === "" ? null : raw;
          else value = raw === "" ? null : Number.isFinite(Number(raw)) ? Number(raw) : raw;
        }
      }
      row[ci] = value;
    }
    grid[rowIdx] = row;
  }
  return grid.map((r) => (r ? Array.from(r, (c) => (c === undefined ? null : c)) : []));
}

const cellStr = (c) => (c == null ? "" : String(c)).trim();
const toNum = (c) => {
  if (c == null || c === "") return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
};

function metaBelow(grid, label) {
  const want = label.trim().toUpperCase();
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (cellStr(row[c]).toUpperCase() === want) return grid[r + 1]?.[c] ?? null;
    }
  }
  return null;
}

function aggregatePackingRowsByBase(rows) {
  const byBase = new Map();
  for (const r of rows) {
    const base = r.baseTracking || baseTrackingOf(r.tracking);
    let agg = byBase.get(base);
    if (!agg) {
      agg = {
        baseTracking: base, code: r.code, productType: r.productType,
        width: r.width, length: r.length, height: r.height, cg: r.cg,
        parcelCount: null, totalWeight: null, totalCbm: null, subTrackings: [],
      };
      byBase.set(base, agg);
    }
    agg.subTrackings.push(r.tracking);
    if (r.parcelCount != null) agg.parcelCount = (agg.parcelCount ?? 0) + r.parcelCount;
    if (r.totalWeight != null) agg.totalWeight = (agg.totalWeight ?? 0) + r.totalWeight;
    if (r.totalCbm != null) agg.totalCbm = (agg.totalCbm ?? 0) + r.totalCbm;
  }
  return Array.from(byBase.values());
}

function parseMomoPackingXlsx(buf) {
  const warnings = [];
  const empty = {
    listTitle: null, container: null, containerCode: null,
    totals: { trackingCount: null, qty: null, totalWeight: null, totalCbm: null },
    transportHint: null, rows: [], aggregated: [], warnings,
  };
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let xml = null;
  try {
    xml = readZipEntry(b, "xl/worksheets/sheet1.xml");
  } catch (e) {
    warnings.push("อ่านไฟล์ .xlsx ไม่สำเร็จ (แตกไฟล์ ZIP ไม่ได้)");
    return empty;
  }
  if (!xml) { warnings.push("ไม่พบชีตในไฟล์ (xl/worksheets/sheet1.xml)"); return empty; }

  const grid = parseSheetGrid(xml.toString("utf8"));

  let listTitle = null;
  for (const row of grid) {
    const first = cellStr(row?.[0]);
    if (/^PACKING LIST/i.test(first)) { listTitle = first; break; }
  }

  const container = cellStr(metaBelow(grid, "CONTAINER NAME:")) || null;
  const containerCode = cellStr(metaBelow(grid, "CONTAINER CODE:")) || null;
  const totals = {
    trackingCount: toNum(metaBelow(grid, "TRACKING:")),
    qty: toNum(metaBelow(grid, "QUANTITY:")),
    totalWeight: toNum(metaBelow(grid, "TOTAL WEIGHT:")),
    totalCbm: toNum(metaBelow(grid, "TOTAL CBM:")),
  };

  let headerRowIdx = -1;
  for (let r = 0; r < grid.length; r++) {
    const cells = (grid[r] ?? []).map((c) => cellStr(c).toLowerCase());
    if (cells.some((c) => c === "tracking") && cells.some((c) => c === "code")) { headerRowIdx = r; break; }
  }
  if (headerRowIdx < 0) {
    warnings.push("MOMO export ว่าง/ไม่มีข้อมูลพัสดุ (คิวมั่ว)");
    return { ...empty, listTitle, container, containerCode, totals };
  }

  const headerRow = grid[headerRowIdx] ?? [];
  const headerText = headerRow.map((c) => cellStr(c));
  const norm = (s) => s.toLowerCase().replace(/[\s.()_-]/g, "");
  const col = (...names) => {
    const wanted = names.map(norm);
    for (let c = 0; c < headerText.length; c++) if (wanted.includes(norm(headerText[c]))) return c;
    return -1;
  };
  const cType = col("type");
  const cCode = col("code");
  const cTracking = col("tracking");
  const cWidth = col("width");
  const cLength = col("length");
  const cHeight = col("height");
  const cParcel = col("parcelcount", "parcel count");
  const cWeight = col("weightkg", "weight(kg)", "weight");
  const cCbm = col("cbm");
  const cTotalWt = col("totalweight", "total weight");
  const cTotalCbm = col("totalcbm", "total cbm");
  const cCg = col("cg");

  const rows = [];
  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const firstCell = cellStr(row.find((c) => cellStr(c) !== "") ?? "");
    if (/^GRAND\s*TOTAL/i.test(firstCell)) continue;
    const tracking = cTracking >= 0 ? cellStr(row[cTracking]) : "";
    if (!tracking) continue;
    rows.push({
      tracking,
      baseTracking: baseTrackingOf(tracking),
      code: cCode >= 0 ? cellStr(row[cCode]) || null : null,
      productType: cType >= 0 ? cellStr(row[cType]) || null : null,
      width: cWidth >= 0 ? toNum(row[cWidth]) : null,
      length: cLength >= 0 ? toNum(row[cLength]) : null,
      height: cHeight >= 0 ? toNum(row[cHeight]) : null,
      parcelCount: cParcel >= 0 ? toNum(row[cParcel]) : null,
      weightKg: cWeight >= 0 ? toNum(row[cWeight]) : null,
      cbm: cCbm >= 0 ? toNum(row[cCbm]) : null,
      totalWeight: cTotalWt >= 0 ? toNum(row[cTotalWt]) : null,
      totalCbm: cTotalCbm >= 0 ? toNum(row[cTotalCbm]) : null,
      cg: cCg >= 0 ? cellStr(row[cCg]) || null : null,
    });
  }
  if (rows.length === 0) warnings.push("MOMO export ว่าง/ไม่มีข้อมูลพัสดุ (คิวมั่ว)");

  const transportHint = deriveTransportHint(container, rows);
  return { listTitle, container, containerCode, totals, transportHint, rows, aggregated: aggregatePackingRowsByBase(rows), warnings };
}

function deriveTransportHint(container, rows) {
  const hay = [
    (container ?? "").toUpperCase(),
    ...rows.slice(0, 3).flatMap((r) => [(r.productType ?? "").toUpperCase(), (r.tracking ?? "").toUpperCase()]),
  ].join(" ");
  if (hay.includes("GZS") || hay.includes("SEA")) return "SEA";
  if (hay.includes("GZE") || hay.includes("EK")) return "EK";
  return null;
}

// container name → ftransporttype ("1" รถ · "2" เรือ · "3" อากาศ)  (port of cabinet-transport.ts)
function transportModeFromCabinetName(name) {
  const n = (name ?? "").toUpperCase();
  if (!n) return null;
  if (n.includes("GZS") || n.includes("SEA")) return "2";
  if (n.includes("GZA") || n.includes("AIR")) return "3";
  if (n.includes("GZE") || n.includes("EK")) return "1";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-BOX matching helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Box index from a sub-tracking, relative to its base: bare base → 1, "-i"/"-i/n" → i, else null. */
function boxIndexOf(tracking, base) {
  const t = String(tracking ?? "").trim();
  if (t === base) return 1;
  if (t.startsWith(base)) {
    const rest = t.slice(base.length);
    const m = rest.match(/^-(\d+)(?:\/\d+)?$/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

const n2 = (v) => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const f2 = (v) => (v == null ? "—" : Number(v).toFixed(2));
const f6 = (v) => (v == null ? "—" : Number(v).toFixed(6));

// ─────────────────────────────────────────────────────────────────────────────
// SELF-TEST (parser fidelity · no DB)
// ─────────────────────────────────────────────────────────────────────────────
function selftest() {
  const file = path.join(PACKING_DIR, "GZS260624-1.xlsx");
  const buf = fs.readFileSync(file);
  const p = parseMomoPackingXlsx(buf);
  console.log(`\n== SELFTEST GZS260624-1 ==`);
  console.log(`container=${p.container} · bases=${p.aggregated.length} · rawRows=${p.rows.length} · warnings=${JSON.stringify(p.warnings)}`);
  const target = p.aggregated.find((a) => a.baseTracking === "1782110296");
  if (!target) { console.error("FAIL: base 1782110296 not found"); process.exit(1); }
  console.log(`base 1782110296 → boxes=${target.parcelCount} · totalWeight=${target.totalWeight} · totalCbm=${f6(target.totalCbm)} · subs=${target.subTrackings.length}`);
  console.log(`  subTrackings: ${target.subTrackings.join(", ")}`);
  const okBoxes = target.parcelCount === 6;
  const okWt = Math.abs((target.totalWeight ?? 0) - 82.5) < 0.01;
  console.log(`  EXPECT 6 boxes / 82.5kg → ${okBoxes && okWt ? "✅ PASS" : "❌ FAIL"} (boxes=${okBoxes}, wt=${okWt})`);
  if (!(okBoxes && okWt)) process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAN BUILDER  (per file)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the write-plan for one base's siblings from its แต้ม data.
 * Returns { verdict, alignment, planRows:[{fid, wt, cbm, amt, box_mark}], taemTotal }.
 * Guarantee: Σ(planRows wt/cbm/amt) === แต้ม total (SINGLE = the agg; SPLIT = per-box).
 */
function buildBasePlan(agg, taemSubs, nonBilled, base, cgMark) {
  const taemTotal = {
    wt: agg.totalWeight, cbm: agg.totalCbm, box: agg.parcelCount,
  };
  // SINGLE — one non-billed target → the aggregate Σ.
  if (nonBilled.length === 1) {
    return {
      verdict: "SINGLE",
      alignment: "single",
      planRows: [{ fid: nonBilled[0].id, wt: agg.totalWeight, cbm: agg.totalCbm, amt: agg.parcelCount, box_mark: cgMark }],
      taemTotal,
    };
  }
  // SPLIT — per-box.
  const fwByIdx = new Map();
  let fwDupIdx = false;
  for (const s of nonBilled) {
    const i = boxIndexOf(s.ftrackingchn ?? "", base);
    if (i == null) { fwDupIdx = true; continue; } // unindexable sibling → force collapse
    if (fwByIdx.has(i)) fwDupIdx = true;
    else fwByIdx.set(i, s);
  }
  const taemByIdx = new Map();
  let taemDupIdx = false;
  for (const t of taemSubs) {
    const i = boxIndexOf(t.tracking, base);
    if (i == null) { taemDupIdx = true; continue; }
    if (taemByIdx.has(i)) taemDupIdx = true;
    else taemByIdx.set(i, t);
  }

  const fwIdx = [...fwByIdx.keys()].sort((a, b) => a - b);
  const taemIdx = [...taemByIdx.keys()].sort((a, b) => a - b);
  const sameCount = nonBilled.length === taemSubs.length;
  const idxAligned =
    !fwDupIdx && !taemDupIdx &&
    fwIdx.length === taemIdx.length &&
    fwIdx.every((i, k) => i === taemIdx[k]);

  // Case A — index-aligned: per-box by suffix.
  if (idxAligned) {
    const planRows = fwIdx.map((i) => {
      const t = taemByIdx.get(i);
      return { fid: fwByIdx.get(i).id, wt: t.totalWeight, cbm: t.totalCbm, amt: t.parcelCount ?? 1, box_mark: t.cg ?? cgMark };
    });
    return { verdict: "SPLIT", alignment: "A-index", planRows, taemTotal };
  }
  // Case B — same count, index misaligned: by-order zip (sorted by idx).
  if (sameCount && !fwDupIdx && !taemDupIdx) {
    const fwSorted = fwIdx.map((i) => fwByIdx.get(i));
    const taemSorted = taemIdx.map((i) => taemByIdx.get(i));
    const planRows = fwSorted.map((s, k) => {
      const t = taemSorted[k];
      return { fid: s.id, wt: t.totalWeight, cbm: t.totalCbm, amt: t.parcelCount ?? 1, box_mark: t.cg ?? cgMark };
    });
    return { verdict: "SPLIT", alignment: "B-order", planRows, taemTotal };
  }
  // Case C — count/index mismatch: COLLAPSE Σ onto box-1 (lowest-id non-billed), zero the rest.
  const sortedById = [...nonBilled].sort((a, b) => a.id - b.id);
  const head = sortedById[0];
  const planRows = [
    { fid: head.id, wt: agg.totalWeight, cbm: agg.totalCbm, amt: agg.parcelCount, box_mark: cgMark },
    ...sortedById.slice(1).map((s) => ({ fid: s.id, wt: 0, cbm: 0, amt: 0, box_mark: null })),
  ];
  return { verdict: "SPLIT_COLLAPSE", alignment: "C-collapse", planRows, taemTotal };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  if (SELFTEST) { selftest(); return; }
  selftest(); // always self-check the parser before touching the DB

  const pgMod = await import("pg");
  const pg = pgMod.default;
  const PW = process.env.PROD_DB_PW || process.env.SUPABASE_DB_PASSWORD;
  if (!PW) { console.error("\nPROD_DB_PW not set"); process.exit(1); }
  const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432, user: "postgres.yzljakczhwrpbxflnmco", password: PW, database: "postgres", ssl: { rejectUnauthorized: false } });
  await c.connect();

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let files = fs.readdirSync(PACKING_DIR).filter((f) => f.toLowerCase().endsWith(".xlsx"));
  if (LIMIT_FILE) files = files.filter((f) => f.includes(LIMIT_FILE));
  files.sort();

  console.log(`\n${"═".repeat(78)}`);
  console.log(`แต้ม PACKING → tb_forwarder  ·  ${APPLY ? "🔴 APPLY (เขียนจริง)" : "DRY-RUN (ไม่เขียน)"}  ·  ${files.length} files`);
  console.log(`${"═".repeat(78)}`);

  // Global accumulators
  const G = {
    files: 0, parseFailed: [], bases: 0, phantom: 0,
    single: 0, splitA: 0, splitB: 0, splitC: 0,
    billed: 0, missing: 0, crossContainer: 0,
    curWtWritable: 0, taemWtWritable: 0, curCbmWritable: 0, taemCbmWritable: 0,
    advance: 0, cabFix: 0,
  };
  const backup = [];
  const writePlan = []; // {fid, wt, cbm, amt, box_mark, cab, transport, zeroPrice}
  const advancePlan = []; // fids to move 1/2 → 3
  const sampleLines = [];
  const crossLines = []; // CROSS-CONTAINER bases (one tracking across >1 sailing) — manual

  // A phantom base = a re-captured section header / blank row (multi-section files
  // repeat the "Tracking|Code" header, which the parser reads as a data row with
  // tracking="Tracking"). No metrics → never a real parcel. Skip (don't count MISSING).
  const isPhantomBase = (a) =>
    !a.baseTracking || a.baseTracking === "Tracking" ||
    (a.parcelCount == null && a.totalWeight == null && a.totalCbm == null);

  // ── PASS 1: parse every file · build the cross-container base index ──────────
  // A base that appears in >1 packing FILE = one tracking whose boxes shipped
  // across several sailings (verified: 1783582423 = GZS260710-1/-2 + GZS260712-1,
  // Σ = the fw total). Collapsing it per-file would clobber the other portions and
  // LOSE weight → it's flagged CROSS-CONTAINER and left for manual physical split.
  const parsedFiles = [];
  const baseFiles = new Map(); // base → Set(fname)
  for (const fname of files) {
    const container = fname.replace(/\.xlsx$/i, "");
    const transport = transportModeFromCabinetName(container);
    const buf = fs.readFileSync(path.join(PACKING_DIR, fname));
    const parsed = parseMomoPackingXlsx(buf);
    if (!parsed.aggregated.length) {
      G.parseFailed.push(`${fname} — ${parsed.warnings.join("; ") || "no data"}`);
      console.log(`\n[!] ${fname}  ${parsed.warnings.join("; ") || "no aggregated rows"}`);
      continue;
    }
    parsedFiles.push({ fname, container, transport, parsed });
    for (const a of parsed.aggregated) {
      if (isPhantomBase(a)) continue;
      if (!baseFiles.has(a.baseTracking)) baseFiles.set(a.baseTracking, new Set());
      baseFiles.get(a.baseTracking).add(fname);
    }
  }
  const crossBases = new Set([...baseFiles].filter(([, s]) => s.size > 1).map(([b]) => b));

  // ── PASS 2: process each file ────────────────────────────────────────────────
  for (const { fname, container, transport, parsed } of parsedFiles) {
    G.files += 1;

    // Fetch all candidate fw rows for this file's bases+subs in one query.
    const candidates = Array.from(new Set([
      ...parsed.aggregated.map((a) => a.baseTracking),
      ...parsed.rows.map((r) => r.tracking),
    ].filter(Boolean)));
    const sysByBase = new Map();
    if (candidates.length) {
      // Match base OR ^base-[0-9] for every base, plus exact sub trackings.
      const orPattern = "^(" + parsed.aggregated.map((a) => esc(a.baseTracking)).join("|") + ")-[0-9]";
      const { rows: fwRows } = await c.query(
        `select id, ftrackingchn, fstatus, fweight, fvolume, famount, famountcount, fwidth, flength, fheight,
                fcabinetnumber, ftransporttype, fbox_mark, frefrate, frefprice, ftotalprice, userid
           from tb_forwarder
          where ftrackingchn = any($1) or ftrackingchn ~ $2
          limit 20000`,
        [candidates, orPattern]
      );
      for (const r of fwRows) {
        const b = baseTrackingOf(r.ftrackingchn ?? "");
        if (!b) continue;
        if (!sysByBase.has(b)) sysByBase.set(b, []);
        sysByBase.get(b).push(r);
      }
    }

    let fCurWt = 0, fTaemWt = 0, fCurCbm = 0, fTaemCbm = 0;
    const perFileLines = [];

    for (const agg of parsed.aggregated) {
      if (isPhantomBase(agg)) { G.phantom += 1; continue; }
      G.bases += 1;
      const base = agg.baseTracking;
      const siblings = sysByBase.get(base) ?? [];
      const nonBilled = siblings.filter((s) => !BILLED.has(String(s.fstatus)));
      const billed = siblings.filter((s) => BILLED.has(String(s.fstatus)));
      const taemSubs = parsed.rows.filter((r) => (r.baseTracking || baseTrackingOf(r.tracking)) === base);

      // CROSS-CONTAINER: this tracking's boxes shipped across >1 sailing (>1 file).
      // Too dangerous to auto-write per-file (would clobber other portions) → report,
      // no write, exclude from the delta. Owner/warehouse splits the fw rows manually.
      if (crossBases.has(base)) {
        G.crossContainer += 1;
        const others = [...baseFiles.get(base)].filter((f) => f !== fname);
        crossLines.push(`  CROSS  ${base} [${agg.code ?? "?"}] ${fname} แต้ม ${agg.parcelCount}box/${f2(agg.totalWeight)}kg  · also in: ${others.join(", ")}  · fw ${siblings.length}row/${f2(siblings.reduce((a,s)=>a+(n2(s.fweight)??0),0))}kg — MANUAL`);
        continue;
      }

      if (siblings.length === 0) {
        G.missing += 1;
        perFileLines.push(`  MISSING     ${base} [${agg.code ?? "?"}] แต้ม ${agg.parcelCount}box/${f2(agg.totalWeight)}kg — ไม่มีใน tb_forwarder`);
        continue;
      }
      if (nonBilled.length === 0) {
        G.billed += 1;
        perFileLines.push(`  BILLED      ${base} [${agg.code ?? "?"}] frozen (${billed.length} row · fstatus ${billed.map((s) => s.fstatus).join("/")}) — skip`);
        continue;
      }

      const cgMark = agg.cg ?? null;
      const plan = buildBasePlan(agg, taemSubs, nonBilled, base, cgMark);

      // Verdict counters
      if (plan.verdict === "SINGLE") G.single += 1;
      else if (plan.alignment === "A-index") G.splitA += 1;
      else if (plan.alignment === "B-order") G.splitB += 1;
      else G.splitC += 1;

      // Money delta accumulation over WRITABLE (non-billed matched) bases.
      const nonBilledCurWt = nonBilled.reduce((a, s) => a + (n2(s.fweight) ?? 0), 0);
      const nonBilledCurCbm = nonBilled.reduce((a, s) => a + (n2(s.fvolume) ?? 0), 0);
      const planWt = plan.planRows.reduce((a, p) => a + (p.wt ?? 0), 0);
      const planCbm = plan.planRows.reduce((a, p) => a + (p.cbm ?? 0), 0);
      fCurWt += nonBilledCurWt; fTaemWt += planWt;
      fCurCbm += nonBilledCurCbm; fTaemCbm += planCbm;
      G.curWtWritable += nonBilledCurWt; G.taemWtWritable += planWt;
      G.curCbmWritable += nonBilledCurCbm; G.taemCbmWritable += planCbm;

      // Build the concrete write rows.
      const curById = new Map(nonBilled.map((s) => [s.id, s]));
      for (const p of plan.planRows) {
        const cur = curById.get(p.fid);
        const wtChanged = Math.abs((n2(cur?.fweight) ?? 0) - (p.wt ?? 0)) > WT_EPS;
        const cbmChanged = Math.abs((n2(cur?.fvolume) ?? 0) - (p.cbm ?? 0)) > VOL_EPS;
        const cabChanged = (cur?.fcabinetnumber ?? "").trim() !== container.trim();
        if (cabChanged) G.cabFix += 1;
        writePlan.push({
          fid: p.fid, wt: p.wt, cbm: p.cbm, amt: p.amt,
          box_mark: p.box_mark, cab: container, transport,
          zeroPrice: wtChanged || cbmChanged,
        });
        if (APPLY) backup.push({
          id: p.fid,
          fweight: cur?.fweight ?? null, fvolume: cur?.fvolume ?? null, famount: cur?.famount ?? null,
          famountcount: cur?.famountcount ?? null, fwidth: cur?.fwidth ?? null, flength: cur?.flength ?? null, fheight: cur?.fheight ?? null,
          fcabinetnumber: cur?.fcabinetnumber ?? null, ftransporttype: cur?.ftransporttype ?? null, fbox_mark: cur?.fbox_mark ?? null,
          frefrate: cur?.frefrate ?? null, frefprice: cur?.frefprice ?? null, ftotalprice: cur?.ftotalprice ?? null,
        });
        void wtChanged; void cbmChanged;
      }

      // Status advance 1/2 → 3 (ปิดตู้ = กำลังส่งมาไทย) on early non-billed siblings.
      const early = nonBilled.filter((s) => ["1", "2"].includes(String(s.fstatus).trim()));
      for (const s of early) { advancePlan.push(s.id); G.advance += 1; }

      perFileLines.push(
        `  ${plan.verdict === "SINGLE" ? "SINGLE  " : plan.alignment === "A-index" ? "SPLIT-A " : plan.alignment === "B-order" ? "SPLIT-B " : "SPLIT-C "}` +
        `   ${base} [${agg.code ?? "?"}] แต้ม ${agg.parcelCount}box/${f2(agg.totalWeight)}kg/${f6(agg.totalCbm)}cbm  ` +
        `│ fw ${nonBilled.length}row/${f2(nonBilledCurWt)}kg` +
        `${billed.length ? ` (+${billed.length} billed)` : ""}` +
        `  → Δ${(planWt - nonBilledCurWt >= 0 ? "+" : "")}${(planWt - nonBilledCurWt).toFixed(2)}kg`
      );
    }

    const dWt = fTaemWt - fCurWt;
    console.log(`\n▶ ${fname}  (${container} · ${transport === "2" ? "เรือ" : transport === "1" ? "รถ" : "?"})  bases=${parsed.aggregated.length}`);
    console.log(`  Σ writable: fw ${f2(fCurWt)}kg → แต้ม ${f2(fTaemWt)}kg  = Δ ${dWt >= 0 ? "+" : ""}${dWt.toFixed(2)}kg   |   cbm ${f6(fCurCbm)} → ${f6(fTaemCbm)}`);
    for (const l of perFileLines) {
      console.log(l);
      if (sampleLines.length < 15) sampleLines.push(l.trim());
    }
  }

  // ── APPLY ──────────────────────────────────────────────────────────────────
  let wrote = 0, advanced = 0;
  if (APPLY) {
    fs.writeFileSync(BACKUP_PATH, JSON.stringify({ at: new Date().toISOString(), rows: backup }, null, 2));
    console.log(`\n💾 backup → ${BACKUP_PATH} (${backup.length} rows)`);
    for (const w of writePlan) {
      const sets = ["famountcount = '1'"];
      const vals = [];
      let i = 1;
      const push = (col, v) => { sets.push(`${col} = $${i++}`); vals.push(v); };
      if (w.wt != null) push("fweight", w.wt);
      if (w.cbm != null) push("fvolume", w.cbm);
      if (w.amt != null) push("famount", w.amt);
      if (w.box_mark != null) push("fbox_mark", String(w.box_mark).slice(0, 100));
      push("fcabinetnumber", w.cab);
      if (w.transport) push("ftransporttype", w.transport);
      if (w.zeroPrice) { sets.push("frefrate = 0", "frefprice = 0", "ftotalprice = 0"); }
      vals.push(w.fid);
      const { rowCount } = await c.query(
        `update tb_forwarder set ${sets.join(", ")} where id = $${i} and fstatus not in ('5','6','7')`,
        vals
      );
      wrote += rowCount;
    }
    const nowIso = new Date().toISOString();
    for (const fid of advancePlan) {
      const { rowCount } = await c.query(
        `update tb_forwarder set fstatus = '3', fdatestatus3 = $1 where id = $2 and fstatus in ('1','2')`,
        [nowIso, fid]
      );
      advanced += rowCount;
    }
  }

  // ── SUMMARY ──────────────────────────────────────────────────────────────────
  const dWtAll = G.taemWtWritable - G.curWtWritable;
  const dCbmAll = G.taemCbmWritable - G.curCbmWritable;
  console.log(`\n${"═".repeat(78)}`);
  console.log(`SUMMARY  ·  ${APPLY ? "APPLIED" : "DRY-RUN"}`);
  console.log(`${"═".repeat(78)}`);
  console.log(`files parsed OK ............ ${G.files}/${files.length}`);
  if (G.parseFailed.length) { console.log(`files FAILED/empty ........ ${G.parseFailed.length}`); G.parseFailed.forEach((f) => console.log(`    ⚠️  ${f}`)); }
  console.log(`bases seen (real) ......... ${G.bases}   (+${G.phantom} phantom header/blank rows skipped)`);
  console.log(`  SINGLE (agg → 1 row) .... ${G.single}`);
  console.log(`  SPLIT-A (per-box index) . ${G.splitA}`);
  console.log(`  SPLIT-B (per-box order) . ${G.splitB}`);
  console.log(`  SPLIT-C (collapse) ...... ${G.splitC}   ← WRITABLE: fw split ≠ แต้ม box-count → Σ collapsed to แต้ม total`);
  console.log(`  CROSS-CONTAINER ......... ${G.crossContainer}   ← 🔴 MANUAL: 1 tracking across >1 sailing → NOT written`);
  console.log(`  BILLED (frozen · skip) .. ${G.billed}`);
  console.log(`  MISSING (not in system) . ${G.missing}   ← new/unlinked parcel (report only · not created)`);
  console.log(`rows to write ............. ${writePlan.length}   (cabinet-fix on ${G.cabFix})`);
  console.log(`status 1/2 → 3 advance .... ${G.advance}`);
  if (crossLines.length) {
    console.log(`${"─".repeat(78)}`);
    console.log(`🔴 CROSS-CONTAINER bases (${crossLines.length} · owner splits fw rows across sailings manually):`);
    crossLines.forEach((l) => console.log(l));
  }
  console.log(`${"─".repeat(78)}`);
  console.log(`💰 MONEY IMPACT (writable · non-billed matched):`);
  console.log(`   weight  fw ${f2(G.curWtWritable)}kg  →  แต้ม ${f2(G.taemWtWritable)}kg   = Δ ${dWtAll >= 0 ? "+" : ""}${dWtAll.toFixed(2)}kg  (${((dWtAll / (G.curWtWritable || 1)) * 100).toFixed(1)}%)`);
  console.log(`   cbm     fw ${f6(G.curCbmWritable)}   →  แต้ม ${f6(G.taemCbmWritable)}    = Δ ${dCbmAll >= 0 ? "+" : ""}${dCbmAll.toFixed(6)}`);
  console.log(`   ⚠️  applying แต้ม truth ${dWtAll < 0 ? "LOWERS" : "RAISES"} the measured weight → prices re-derive lower/higher on re-price.`);
  if (APPLY) console.log(`\n✅ WROTE ${wrote} rows · advanced ${advanced} rows. Re-price via /review or the cron.`);
  else console.log(`\n(dry-run · no writes. Re-run with --apply after owner sign-off.)`);
  console.log(`${"═".repeat(78)}\n`);

  console.log(`SAMPLE (first 15 base lines):`);
  sampleLines.forEach((l) => console.log(`  ${l}`));

  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
