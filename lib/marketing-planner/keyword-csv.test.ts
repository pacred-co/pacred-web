import assert from "node:assert/strict";
import { collapseThaiSpaces, parseKeywordCsv, tierFromVolume } from "./keyword-csv";

let pass = 0;
function t(name: string, fn: () => void) {
  fn();
  pass += 1;
  console.log(`  ✓ ${name}`);
}

console.log("lib/marketing-planner/keyword-csv");

// A minimal Google-Keyword-Planner-shaped export: TAB-delimited, TWO preamble
// lines (title + date range) before the header, then data rows.
const HEADER = [
  "Keyword", "Currency", "Avg. monthly searches", "การเปลี่ยนแปลงใน 3 เดือน",
  "การเปลี่ยนแปลงเมื่อเทียบกับปีก่อนหน้า", "Competition", "Competition (indexed value)",
  "Top of page bid (low range)", "Top of page bid (high range)",
].join("\t");
const SAMPLE = [
  "Keyword Stats 2026-07-02 at 23_59_07",
  "1 มิถุนายน ค.ศ. 2025 - 31 พฤษภาคม ค.ศ. 2026",
  HEADER,
  ["นำ เข้า สินค้า จีน", "THB", "500", "0%", "-90%", "สูง", "69", "24.24", "89.46"].join("\t"),
  ["ขนส่ง จาก จีน", "THB", "5,000", "0%", "0%", "สูง", "71", "20.54", "82.42"].join("\t"),
  ["china import", "THB", "50", "0%", "0%", "ต่ำ", "10", "", "5"].join("\t"),
  "", // blank line — skipped
  "\t\t\t\t\t\t\t\t", // empty-keyword row — skipped
].join("\n");

t("finds the header past the 2 preamble lines + skips blank/empty rows", () => {
  const r = parseKeywordCsv(SAMPLE);
  assert.equal(r.headerFound, true);
  assert.equal(r.rows.length, 3);
});

t("collapses Google's inter-Thai spaces, keeps non-Thai spacing", () => {
  assert.equal(collapseThaiSpaces("นำ เข้า สินค้า จีน"), "นำเข้าสินค้าจีน");
  assert.equal(collapseThaiSpaces("ก ข ค"), "กขค"); // adjacent single tokens too
  assert.equal(collapseThaiSpaces("china import"), "china import");
  assert.equal(collapseThaiSpaces("จีน import"), "จีน import");
  const r = parseKeywordCsv(SAMPLE);
  assert.equal(r.rows[0].keyword, "นำเข้าสินค้าจีน");
  assert.equal(r.rows[2].keyword, "china import");
});

t("maps volume (commas stripped), difficulty (indexed), cpc (bid midpoint)", () => {
  const r = parseKeywordCsv(SAMPLE);
  assert.equal(r.rows[0].volume, 500);
  assert.equal(r.rows[0].difficulty, 69);
  assert.equal(r.rows[0].cpc, 56.85); // (24.24 + 89.46) / 2
  assert.equal(r.rows[1].volume, 5000); // "5,000" → 5000
});

t("cpc falls back to the single present bid when one side is blank", () => {
  const r = parseKeywordCsv(SAMPLE);
  assert.equal(r.rows[2].cpc, 5); // low blank · high 5
});

t("derives tier from volume (≥1000 primary · ≥100 secondary · else longtail)", () => {
  assert.equal(tierFromVolume(5000), "primary");
  assert.equal(tierFromVolume(500), "secondary");
  assert.equal(tierFromVolume(50), "longtail");
  assert.equal(tierFromVolume(undefined), "longtail");
});

t("returns headerFound=false for a non-Keyword-Planner file", () => {
  const r = parseKeywordCsv("some,random\nfile,content");
  assert.equal(r.headerFound, false);
  assert.equal(r.rows.length, 0);
});

console.log(`\n${pass} passed`);
