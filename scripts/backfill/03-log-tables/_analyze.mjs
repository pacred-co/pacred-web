// Stream the dump line-by-line and tally INSERT counts + total bytes per table.
// Run: node _analyze.mjs
//
// Sandbox blocked node execution from this Claude session — ภูม runs this
// locally to verify the 3 deferred tables match the runbook expectations
// (tb_web_hs 657 MB · tb_history_key 62 MB · tb_history 59 MB).
import { createReadStream, statSync } from "node:fs";
import { createInterface } from "node:readline";

const DUMP = "C:\\Users\\Admin\\pcscargo\\newdata\\2026-05-18-1358-pcsc_main.sql";

const sizeMB = (statSync(DUMP).size / 1024 / 1024).toFixed(1);
console.log(`Dump size: ${sizeMB} MB`);

const tables = new Map(); // name -> { inserts, bytes, firstLine, lastLine }
const insertRe = /^INSERT INTO `([^`]+)`/;

let lineNo = 0;
let inInsertBlock = null;
let blockBytes = 0;

const rl = createInterface({
  input: createReadStream(DUMP, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

for await (const line of rl) {
  lineNo++;
  const m = insertRe.exec(line);
  if (m) {
    inInsertBlock = m[1];
    let t = tables.get(inInsertBlock);
    if (!t) {
      t = { inserts: 0, bytes: 0, firstLine: lineNo, lastLine: lineNo };
      tables.set(inInsertBlock, t);
    }
    t.inserts++;
    t.lastLine = lineNo;
    t.bytes += Buffer.byteLength(line, "utf8") + 1; // +1 for newline
  } else if (inInsertBlock && line.length > 0) {
    // Continuation lines (multi-row VALUES) belong to the current block.
    const t = tables.get(inInsertBlock);
    t.bytes += Buffer.byteLength(line, "utf8") + 1;
    t.lastLine = lineNo;
    // End of block: a `;` at end of line and next line is non-data
    if (line.trimEnd().endsWith(";")) {
      // We'll let the next INSERT or "-- Table structure" naturally close it.
    }
  } else if (line.length === 0 && inInsertBlock) {
    // Blank line breaks the run
    inInsertBlock = null;
  }
}

const ranked = [...tables.entries()]
  .map(([name, t]) => ({ name, ...t, mb: (t.bytes / 1024 / 1024).toFixed(2) }))
  .sort((a, b) => b.bytes - a.bytes);

console.log("\nTop 20 by bytes:");
console.log("Rank | Table | INSERTs | MB | LineRange");
for (let i = 0; i < Math.min(20, ranked.length); i++) {
  const r = ranked[i];
  console.log(`${i + 1} | ${r.name} | ${r.inserts} | ${r.mb} MB | ${r.firstLine}-${r.lastLine}`);
}

console.log(`\nTotal tables with INSERTs: ${tables.size}`);
const totalMB = ranked.reduce((s, r) => s + parseFloat(r.mb), 0);
console.log(`Total INSERT bytes: ${totalMB.toFixed(2)} MB`);
