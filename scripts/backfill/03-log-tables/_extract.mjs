// Extract one of the 3 deferred log tables from the MySQL dump and emit a
// PostgreSQL-ready .sql file (chunked into <= MAX_CHUNK_MB parts so the
// Supabase SQL-editor paste UI doesn't freeze on >100MB).
//
// CRITICAL: chunks split only on INSERT-statement boundaries (after a `;`).
// Splitting mid-INSERT would emit half a VALUES list — a syntax error.
//
// USAGE (run on the host where the dump exists; sandbox blocked it from the
// Claude session itself):
//   node _extract.mjs tb_history
//   node _extract.mjs tb_history_key
//   node _extract.mjs tb_web_hs
//
// Or run all three:
//   node _extract.mjs all
//
// Output: <table>-part-001.sql, <table>-part-002.sql, ... in this dir.

import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DUMP = "C:\\Users\\Admin\\pcscargo\\newdata\\2026-05-18-1358-pcsc_main.sql";
const MAX_CHUNK_MB = 90; // < 100 MB cap so Supabase SQL editor stays responsive

// Verified 2026-05-21 against the 2026-05-18-1358 dump (898 MB):
//   tb_history       lines 392095 → 561145  · 1069 INSERTs · ~59 MB  · max id 167966
//   tb_history_key   lines 561149 → 898241  · 869 INSERTs  · ~62 MB  · max id 336214
//   tb_web_hs        lines 1454997 → 3794712 · 11929 INSERTs · ~657 MB · max id 2327765
const TABLES = {
  tb_history: {
    rebrandUserid: false, // adminid is admin code; action is free-text audit
    expectedMaxId: 167966,
    expectedRowsApprox: 167966,
  },
  tb_history_key: {
    rebrandUserid: true, // userid IS member code (varchar(10))
    expectedMaxId: 336214,
    expectedRowsApprox: 336214,
  },
  tb_web_hs: {
    rebrandUserid: true, // userid IS member code (varchar(30))
    expectedMaxId: 2327765,
    expectedRowsApprox: 2327765,
  },
};

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node _extract.mjs <table | all>");
  process.exit(1);
}

const targets = arg === "all" ? Object.keys(TABLES) : [arg];
for (const t of targets) {
  if (!TABLES[t]) {
    console.error(`Unknown table: ${t}`);
    process.exit(1);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Transformations
// ────────────────────────────────────────────────────────────────────────────

function transformInsertLine(line) {
  // Backticks → no quote · lowercase column names (PG schema uses lowercase).
  // `INSERT INTO \`tb_X\` (\`Col1\`, \`Col2\`) VALUES` →
  //   `INSERT INTO public.tb_x (col1, col2) VALUES`
  return line.replace(/^INSERT INTO `([^`]+)` \(([^)]+)\) VALUES/, (_, table, cols) => {
    const tName = `public.${table.toLowerCase()}`;
    const cList = cols
      .split(",")
      .map((c) => c.trim().replace(/`/g, "").toLowerCase())
      .join(", ");
    return `INSERT INTO ${tName} (${cList}) VALUES`;
  });
}

function transformValuesLine(line, spec) {
  // Walk the line char-by-char, tracking string-literal state.
  // Inside a single-quoted string convert MySQL → PG escapes:
  //   \'  → ''      (PG with standard_conforming_strings=on rejects \')
  //   \\  → \\      (preserved; std_conf_str=on treats this as 2 literal \)
  //                  — note this means MySQL's "byte 0x5C" round-trips correctly
  //   \"  → "       (drop the unnecessary escape)
  //   \n  → newline (literal)
  //   \r  → CR      (literal)
  //   \t  → TAB     (literal)
  //   \0  → (drop)  (PG text rejects NUL)
  //   \Z  → (drop)  (Ctrl-Z; never in these tables, defensive)
  //   \X  → X       (unknown escape — drop backslash, keep char)
  let out = "";
  let i = 0;
  const len = line.length;
  let inStr = false;

  while (i < len) {
    const ch = line[i];
    if (!inStr) {
      if (ch === "'") {
        inStr = true;
        out += "'";
        i++;
        continue;
      }
      out += ch;
      i++;
      continue;
    }
    // Inside a single-quoted string.
    if (ch === "\\" && i + 1 < len) {
      const next = line[i + 1];
      if (next === "'") { out += "''"; i += 2; continue; }
      if (next === "\\") { out += "\\\\"; i += 2; continue; }
      if (next === '"') { out += '"'; i += 2; continue; }
      if (next === "n") { out += "\n"; i += 2; continue; }
      if (next === "r") { out += "\r"; i += 2; continue; }
      if (next === "t") { out += "\t"; i += 2; continue; }
      if (next === "0") { i += 2; continue; }
      if (next === "Z") { i += 2; continue; }
      out += next; i += 2; continue;
    }
    if (ch === "'") {
      inStr = false;
      out += "'";
      i++;
      continue;
    }
    out += ch;
    i++;
  }

  // Zero-date → NULL.
  out = out.replace(/'0000-00-00( 00:00:00)?'/g, "NULL");

  // Defensive: strip MySQL's _binary prefix (none in these 3 tables).
  out = out.replace(/\b_binary '/g, "'");

  // PCS<n> → PR<n> rebrand · ONLY for tables whose member-code column is
  // listed as rebrandable. tb_history's `action` column stores audit SQL
  // strings that mention PCS<n> — those stay verbatim per runbook §3
  // ("never to filenames / free text").
  if (spec.rebrandUserid) {
    // A standalone 'PCS<digits>' tuple element (preceded by `,` or `(`, followed by `,` or `)`).
    out = out.replace(/(['"\(,]\s*)'(PCS|pcs|Pcs)(\d+)'(\s*[,\)])/g, (_, pre, _pref, num, post) => {
      return `${pre}'PR${num}'${post}`;
    });
    // The 8 special non-numeric PCS<letters> codes per runbook Q3.
    out = out.replace(/(['"\(,]\s*)'(PCS|pcs|Pcs)(TT|CARGO|ARNON|FAM)'(\s*[,\)])/gi, (_, pre, _pref, suf, post) => {
      return `${pre}'PR${suf.toUpperCase()}'${post}`;
    });
  }

  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Main per-table extractor
// ────────────────────────────────────────────────────────────────────────────

async function extractTable(tableName) {
  const spec = TABLES[tableName];
  const outBase = join(__dirname, tableName);

  console.log(`\n=== ${tableName} ===`);
  console.log(`Streaming dump for INSERTs into \`${tableName}\` ...`);

  const rl = createInterface({
    input: createReadStream(DUMP, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  const startRe = new RegExp(`^INSERT INTO \`${tableName}\` `);
  const anyInsertRe = /^INSERT INTO `([^`]+)`/;
  const tableStructRe = /^-- Table structure for table /;

  let chunkIdx = 0;
  let chunkBytes = 0;
  const chunkLimit = MAX_CHUNK_MB * 1024 * 1024;
  let currentStream = null;
  let totalRows = 0;
  let totalBytesOut = 0;
  let insideOurInsert = false;

  // The INSERT-block buffer. Lines accumulate here until the block ends
  // (a line whose trimmed end is `;`). Only then do we flush, ensuring
  // a chunk break never splits a VALUES list mid-tuple.
  let blockBuffer = [];
  let blockBytes = 0;
  let blockRows = 0;

  function openChunk() {
    chunkIdx++;
    const path = `${outBase}-part-${String(chunkIdx).padStart(3, "0")}.sql`;
    currentStream = createWriteStream(path, { encoding: "utf8" });
    chunkBytes = 0;
    const header =
      `-- Pacred Wave-4 backfill · ${tableName} · part ${chunkIdx}\n` +
      `-- Source: ${DUMP}\n` +
      `-- Generated: ${new Date().toISOString()}\n` +
      `-- Run order: paste each part sequentially in Supabase SQL editor.\n` +
      `-- CREATE TABLE already exists from migration 0081 — this is data only.\n` +
      `--\n` +
      `BEGIN;\n\n`;
    currentStream.write(header);
    chunkBytes += Buffer.byteLength(header);
    console.log(`  -> opened ${path}`);
  }

  function closeChunk() {
    if (!currentStream) return;
    const footer = `\nCOMMIT;\n`;
    currentStream.write(footer);
    chunkBytes += Buffer.byteLength(footer);
    currentStream.end();
    totalBytesOut += chunkBytes;
    console.log(`  -> closed chunk ${chunkIdx} · ${(chunkBytes / 1024 / 1024).toFixed(2)} MB`);
    currentStream = null;
  }

  function flushBlock() {
    if (blockBuffer.length === 0) return;
    // Decision: does this block fit in the current chunk?
    if (currentStream === null) openChunk();
    if (chunkBytes + blockBytes > chunkLimit && chunkBytes > 0) {
      closeChunk();
      openChunk();
    }
    for (const ln of blockBuffer) {
      currentStream.write(ln);
      chunkBytes += Buffer.byteLength(ln);
    }
    totalRows += blockRows;
    blockBuffer = [];
    blockBytes = 0;
    blockRows = 0;
  }

  for await (const line of rl) {
    if (startRe.test(line)) {
      // A new INSERT into our target table starts.
      // Flush any prior block (shouldn't happen — INSERTs end with `;` — but defensive).
      flushBlock();
      insideOurInsert = true;
      const transformed = transformInsertLine(line);
      const out = transformed + "\n";
      blockBuffer.push(out);
      blockBytes += Buffer.byteLength(out);
      continue;
    }

    // Different table's INSERT or table-structure marker → end our block.
    if (insideOurInsert && anyInsertRe.test(line) && !startRe.test(line)) {
      flushBlock();
      insideOurInsert = false;
      continue;
    }
    if (insideOurInsert && tableStructRe.test(line)) {
      flushBlock();
      insideOurInsert = false;
      continue;
    }

    if (insideOurInsert) {
      const transformed = transformValuesLine(line, spec);
      const out = transformed + "\n";
      blockBuffer.push(out);
      blockBytes += Buffer.byteLength(out);
      // Count tuple-rows: lines starting with `(` (after trim).
      if (/^\s*\(/.test(transformed)) blockRows++;
      // End-of-block detection: a `;` at end of line marks the end of this
      // INSERT statement (mysqldump always emits `;` on a row line, never alone).
      if (line.trimEnd().endsWith(";")) {
        flushBlock();
        insideOurInsert = false;
      }
    }
  }

  // Catch any unterminated block (defensive — mysqldump always closes).
  flushBlock();
  closeChunk();

  console.log(`\n${tableName}: ${totalRows} tuples written · ${(totalBytesOut / 1024 / 1024).toFixed(2)} MB total · ${chunkIdx} chunk(s)`);
  if (spec.expectedRowsApprox) {
    const pct = ((totalRows / spec.expectedRowsApprox) * 100).toFixed(1);
    console.log(`Expected ~${spec.expectedRowsApprox} rows · got ${totalRows} (${pct}%)`);
    if (Math.abs(totalRows - spec.expectedRowsApprox) > spec.expectedRowsApprox * 0.01) {
      console.warn(`  WARNING: row count differs from expected by more than 1%`);
    }
  }
}

(async () => {
  for (const t of targets) {
    await extractTable(t);
  }
  console.log("\nDone.");
  console.log("\nNext steps:");
  console.log("  1. Open Supabase SQL editor on prod (yzljakczhwrpbxflnmco)");
  console.log("  2. Paste each *.sql file in order: tb_history, tb_history_key, tb_web_hs");
  console.log("  3. Run the sequence resets + verification queries from README.md §7");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
