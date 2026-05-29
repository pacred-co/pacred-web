/**
 * Wave 30.5 · momo-raw-helpers — pure function tests.
 *
 * Covers the two MOMO raw→field derivations that feed the tb_forwarder
 * commit (deriveTransportTypeFromMomoRaw · extractMetricsFromMomoRaw). These
 * live OUTSIDE commit-momo-row-core.ts precisely so they can be exercised
 * here — that module's `import "server-only"` throws under tsx.
 *
 * Run:  pnpm tsx lib/admin/momo-raw-helpers.test.ts
 *   (and via `pnpm test:unit` once wired into package.json)
 */

import {
  deriveTransportTypeFromMomoRaw,
  extractMetricsFromMomoRaw,
} from "./momo-raw-helpers";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
    fail++;
  }
}

console.log("=== Wave 30.5 · momo-raw-helpers ===");

// ── deriveTransportTypeFromMomoRaw — defaults to "1" ────────────────
check("null → '1'", deriveTransportTypeFromMomoRaw(null) === "1");
check("undefined → '1'", deriveTransportTypeFromMomoRaw(undefined) === "1");
check("string raw → '1'", deriveTransportTypeFromMomoRaw("ship") === "1");
check("number raw → '1'", deriveTransportTypeFromMomoRaw(42) === "1");
check("empty object → '1'", deriveTransportTypeFromMomoRaw({}) === "1");
check("no ship_by key → '1'", deriveTransportTypeFromMomoRaw({ kg: 5 }) === "1");

// ── deriveTransportTypeFromMomoRaw — ship → "2" (case-insensitive) ──
check('{ship_by:"ship"} → "2"', deriveTransportTypeFromMomoRaw({ ship_by: "ship" }) === "2");
check('{ship_by:"SHIP"} → "2"', deriveTransportTypeFromMomoRaw({ ship_by: "SHIP" }) === "2");
check('{ship_by:"Ship"} → "2"', deriveTransportTypeFromMomoRaw({ ship_by: "Ship" }) === "2");

// ── deriveTransportTypeFromMomoRaw — everything else → "1" ──────────
check('{ship_by:"car"} → "1"', deriveTransportTypeFromMomoRaw({ ship_by: "car" }) === "1");
check('{ship_by:"air"} → "1" (air buckets to truck)', deriveTransportTypeFromMomoRaw({ ship_by: "air" }) === "1");
check('{ship_by:"truck"} → "1" (unknown)', deriveTransportTypeFromMomoRaw({ ship_by: "truck" }) === "1");
check('{ship_by:""} → "1"', deriveTransportTypeFromMomoRaw({ ship_by: "" }) === "1");
check("{ship_by:123} non-string → '1'", deriveTransportTypeFromMomoRaw({ ship_by: 123 }) === "1");
check('{ship_by:"  ship  "} padded → "1" (no trim by design)', deriveTransportTypeFromMomoRaw({ ship_by: "  ship  " }) === "1");

// ── extractMetricsFromMomoRaw — null / non-object → zero-metrics ────
const e1 = extractMetricsFromMomoRaw(null);
check("null → all zero, qty 1", e1.weight === 0 && e1.cbm === 0 && e1.width === 0 && e1.length === 0 && e1.height === 0 && e1.qty === 1);
const e2 = extractMetricsFromMomoRaw("nope");
check("string raw → zero-metrics", e2.weight === 0 && e2.qty === 1);
const e3 = extractMetricsFromMomoRaw({});
check("empty object → zero-metrics", e3.weight === 0 && e3.cbm === 0 && e3.qty === 1);

// ── extractMetricsFromMomoRaw — happy path (numbers) ────────────────
const m = extractMetricsFromMomoRaw({ kg: 5, cbm: 0.5, width: 10, length: 20, height: 30, quantity: 4 });
check("kg → weight 5", m.weight === 5);
check("cbm → 0.5", m.cbm === 0.5);
check("width → 10", m.width === 10);
check("length → 20", m.length === 20);
check("height → 30", m.height === 30);
check("quantity 4 → qty 4", m.qty === 4);

// ── extractMetricsFromMomoRaw — numeric strings coerce ──────────────
const s = extractMetricsFromMomoRaw({ kg: "5.5", cbm: "0.25", quantity: "3" });
check('kg "5.5" → 5.5', s.weight === 5.5);
check('cbm "0.25" → 0.25', s.cbm === 0.25);
check('quantity "3" → qty 3', s.qty === 3);

// ── extractMetricsFromMomoRaw — non-numeric / non-finite → 0 ────────
const bad = extractMetricsFromMomoRaw({ kg: "abc", cbm: NaN, width: Infinity, length: null, height: {} });
check('kg "abc" → 0', bad.weight === 0);
check("cbm NaN → 0", bad.cbm === 0);
check("width Infinity → 0", bad.width === 0);
check("length null → 0", bad.length === 0);
check("height object → 0", bad.height === 0);

// ── extractMetricsFromMomoRaw — qty floor + rounding ────────────────
check("quantity 0 → qty 1 (floor)", extractMetricsFromMomoRaw({ quantity: 0 }).qty === 1);
check("quantity -5 → qty 1 (floor)", extractMetricsFromMomoRaw({ quantity: -5 }).qty === 1);
check("quantity 2.4 → qty 2 (round down)", extractMetricsFromMomoRaw({ quantity: 2.4 }).qty === 2);
check("quantity 2.6 → qty 3 (round up)", extractMetricsFromMomoRaw({ quantity: 2.6 }).qty === 3);
check("quantity missing → qty 1", extractMetricsFromMomoRaw({ kg: 9 }).qty === 1);
check('quantity "abc" → qty 1 (NaN→0→floor 1)', extractMetricsFromMomoRaw({ quantity: "abc" }).qty === 1);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
