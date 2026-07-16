// ════════════════════════════════════════════════════════════════════════════
// CURRENCY-SYMBOL audit — the symbol must match the FIELD's currency.
// owner 2026-07-16: "สกุลเงินที่วงให้ดู แสดงผลไม่ตรง · เช็คจุดอื่นๆด้วย · อย่าให้เกิดอีก"
//
// THE BUG THIS PREVENTS (prod · service-order/[hNo]/page.tsx):
//   <Row label="ค่าขนส่งในจีน" value={`฿${Number(o.domestic_china_cny).toFixed(2)}`} />
//   → the field IS yuan (the 1688 总运费 ¥53.90) but rendered "฿53.90". The ยอดรวม
//   was right (it converts ¥×rate = ฿274.89) — only the LINE lied to the customer.
//
// THE CLASS: a hardcoded ฿/¥ glued to a value whose currency comes from the field
// name. Nothing typed it, so nothing caught it. This audit is that check.
//
// RULES (conservative — flags only an unambiguous mismatch):
//   1. `฿${…}` whose expression names a CNY/yuan field  → BAHT-ON-YUAN
//   2. `¥${…}` whose expression names a THB/baht field   → YUAN-ON-BAHT
// NOT flagged (verified-legit shapes):
//   • a RATE line — `฿${rate}/¥` (baht per yuan · the expression mentions rate)
//   • a CONVERSION — the expression multiplies (`*`) e.g. `฿${yuan * rate}`
//   • a formatter call `thb(` / `cny(` / `fcur(` — those are 2-dp number formatters
//     on this codebase (misleading names), not conversions; the field decides.
//   • any line carrying an explicit `currency-ok` comment (the escape hatch).
//
// RUN:  node scripts/currency-symbol-audit.mjs      (wired into pnpm audit:all)
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib", "actions"];
const EXT = /\.(tsx|ts)$/;
const SKIP_DIR = /node_modules|\.next|dist|build/;

/** Field-name tokens that mean the VALUE is in yuan / in baht. */
const YUAN_FIELD = /(_cny\b|cny[A-Z_]|\bcny\b|yuan|Yuan|YUAN|pricechn\b|_chn\b)/;
const BAHT_FIELD = /(_thb\b|thb[A-Z_]|Thb|THB|\bbaht\b|Baht|BAHT|priceuser\b|total_thb)/;
/** Shapes that make a ฿/¥ next to the other currency legitimate. */
const RATE_HINT = /rate|Rate|RATE/;
const CONVERTED = /\*/;                       // yuan * rate → baht
const FORMATTER = /\b(thb|cny|fcur|numberFormat|money2?|fmt)\s*\(/;
const ESCAPE = /currency-ok/;

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (SKIP_DIR.test(p)) continue;
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (EXT.test(p)) out.push(p);
  }
  return out;
}

/** Pull the `${…}` expression that immediately follows a ฿ or ¥ inside a template. */
function scanLine(line) {
  const hits = [];
  const re = /(฿|¥)\$\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
  let m;
  while ((m = re.exec(line))) hits.push({ sym: m[1], expr: m[2] });
  return hits;
}

const files = ROOTS.flatMap((r) => walk(r));
const problems = [];
for (const f of files) {
  let src;
  try { src = readFileSync(f, "utf8"); } catch { continue; }
  if (!src.includes("฿$") && !src.includes("¥$")) continue;
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (ESCAPE.test(line)) return;
    for (const { sym, expr } of scanLine(line)) {
      if (RATE_HINT.test(expr) || CONVERTED.test(expr)) continue; // rate / converted → fine
      const inFormatter = FORMATTER.test(expr);
      // An expression naming BOTH currencies (e.g. `yuanRowsThbTotal` = the BAHT paid
      // on a yuan-transfer row) is explicit about its own unit — the matching symbol
      // wins, no flag. Only a one-sided name with the opposite symbol is a mismatch.
      const namesYuan = YUAN_FIELD.test(expr);
      const namesBaht = BAHT_FIELD.test(expr);
      if (namesYuan && namesBaht) continue;
      if (sym === "฿" && YUAN_FIELD.test(expr)) {
        problems.push({ f, n: i + 1, kind: "BAHT-ON-YUAN", expr: expr.trim().slice(0, 70), line: line.trim().slice(0, 100) });
      } else if (sym === "¥" && BAHT_FIELD.test(expr) && !inFormatter) {
        problems.push({ f, n: i + 1, kind: "YUAN-ON-BAHT", expr: expr.trim().slice(0, 70), line: line.trim().slice(0, 100) });
      }
    }
  });
}

console.log("Pacred currency-symbol audit (฿/¥ must match the field's currency)");
if (problems.length === 0) {
  console.log(`✓ scanned ${files.length} files — no ฿-on-yuan / ¥-on-baht mismatch`);
  process.exit(0);
}
console.error(`\n✗ ${problems.length} currency-symbol mismatch(es):\n`);
for (const p of problems) {
  console.error(`  ${p.kind}  ${p.f}:${p.n}`);
  console.error(`     ${p.line}`);
  console.error(`     → the field is ${p.kind === "BAHT-ON-YUAN" ? "CNY/yuan but the symbol says ฿" : "THB/baht but the symbol says ¥"}.`);
  console.error(`       Fix the symbol, convert the value, or add a "currency-ok" comment if it is genuinely correct.\n`);
}
process.exit(1);
