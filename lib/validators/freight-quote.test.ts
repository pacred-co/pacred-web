/**
 * V-E6 — freight-quote validator + quote-total math unit tests.
 *
 * Covers the contract surface for the freight-quotation workflow:
 *
 *   1. QUOTE_STATUSES / TRANSPORT_MODES / INCOTERMS / QUOTE_UNITS — enum sets
 *   2. roundThb               — 2dp cents rounding
 *   3. computeQuoteTotals     — subtotal + VAT + grand-total math
 *      (the load-bearing helper — the quote detail page + the action's
 *      recompute both read it; a regression mis-prices every quote)
 *   4. createFreightQuoteSchema — Zod contract (transport_mode required,
 *      13-digit tax-id regex, vat_pct bounds, valid_until date format)
 *   5. createQuoteItemSchema  — line-item contract (positive quantity)
 *   6. rejectQuoteSchema      — reject reason ≥3 chars
 *
 * No DB / network / file IO. Runs in <50ms.
 */

import {
  QUOTE_STATUSES,
  TRANSPORT_MODES,
  INCOTERMS,
  QUOTE_UNITS,
  roundThb,
  computeQuoteTotals,
  createFreightQuoteSchema,
  createQuoteItemSchema,
  rejectQuoteSchema,
} from "./freight-quote";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ✓", label); }
  else      { fail++; console.error("  ✗", label); }
}
function assertThrows(label: string, fn: () => unknown): void {
  try {
    fn();
    fail++; console.error("  ✗", label, "(expected to throw, didn't)");
  } catch {
    pass++; console.log("  ✓", label);
  }
}

console.log("freight-quote validators (V-E6)");

// Valid RFC-4122 v4 UUIDs (Zod v4 .uuid() checks the version nibble).
const QUOTE_ID = "11111111-1111-4111-8111-111111111111";

// ────────────────────────────────────────────────────────────
// (a) enum sets
// ────────────────────────────────────────────────────────────
console.log("  (a) enum sets — statuses / modes / incoterms / units");
{
  assert("7 quote statuses",         QUOTE_STATUSES.length === 7);
  assert("statuses include draft + accepted + expired",
    (QUOTE_STATUSES as readonly string[]).includes("draft") &&
    (QUOTE_STATUSES as readonly string[]).includes("accepted") &&
    (QUOTE_STATUSES as readonly string[]).includes("expired"));
  assert("4 transport modes",        TRANSPORT_MODES.length === 4);
  assert("modes include sea_fcl/sea_lcl/truck/air",
    (TRANSPORT_MODES as readonly string[]).includes("sea_fcl") &&
    (TRANSPORT_MODES as readonly string[]).includes("sea_lcl") &&
    (TRANSPORT_MODES as readonly string[]).includes("truck") &&
    (TRANSPORT_MODES as readonly string[]).includes("air"));
  assert("11 incoterms",             INCOTERMS.length === 11);
  assert("incoterms include FOB + CIF + DDP",
    (INCOTERMS as readonly string[]).includes("FOB") &&
    (INCOTERMS as readonly string[]).includes("CIF") &&
    (INCOTERMS as readonly string[]).includes("DDP"));
  assert("9 quote units",            QUOTE_UNITS.length === 9);
  assert("units include CBM + KGM + TEU",
    (QUOTE_UNITS as readonly string[]).includes("CBM") &&
    (QUOTE_UNITS as readonly string[]).includes("KGM") &&
    (QUOTE_UNITS as readonly string[]).includes("TEU"));
}

// ────────────────────────────────────────────────────────────
// (b) roundThb — 2dp cents
// ────────────────────────────────────────────────────────────
console.log("  (b) roundThb — 2dp cents rounding");
{
  assert("1234.567 → 1234.57",  roundThb(1234.567) === 1234.57);
  assert("0.005 → 0.01",        roundThb(0.005) === 0.01);
  assert("integer untouched",   roundThb(7500) === 7500);
}

// ────────────────────────────────────────────────────────────
// (c) computeQuoteTotals — the load-bearing pricing helper
// ────────────────────────────────────────────────────────────
console.log("  (c) computeQuoteTotals — subtotal + VAT + total math");
{
  // Single line, 7% VAT.
  const t1 = computeQuoteTotals({
    items:   [{ quantity: 2, unit_price_thb: 5000 }],
    vat_pct: 7,
  });
  assert("subtotal = 2 × 5000 = 10000",  t1.subtotal === 10000);
  assert("vat = 7% of 10000 = 700",      t1.vat_amount === 700);
  assert("total = 10700",                t1.total === 10700);

  // Multiple lines.
  const t2 = computeQuoteTotals({
    items: [
      { quantity: 1,  unit_price_thb: 12000 },
      { quantity: 3,  unit_price_thb: 1500  },
      { quantity: 10, unit_price_thb: 250   },
    ],
    vat_pct: 7,
  });
  assert("multi-line subtotal = 19000",  t2.subtotal === 12000 + 4500 + 2500);
  assert("multi-line vat = 1330",        t2.vat_amount === roundThb(19000 * 0.07));
  assert("multi-line total = 20330",     t2.total === 19000 + 1330);

  // Zero VAT (vat_pct = 0).
  const t3 = computeQuoteTotals({
    items:   [{ quantity: 1, unit_price_thb: 8000 }],
    vat_pct: 0,
  });
  assert("0% VAT → vat_amount 0",        t3.vat_amount === 0);
  assert("0% VAT → total == subtotal",   t3.total === t3.subtotal);

  // Empty item list.
  const t4 = computeQuoteTotals({ items: [], vat_pct: 7 });
  assert("empty items → subtotal 0",     t4.subtotal === 0);
  assert("empty items → total 0",        t4.total === 0);

  // Fractional — must round to 2dp at each step.
  const t5 = computeQuoteTotals({
    items:   [{ quantity: 3, unit_price_thb: 333.33 }],
    vat_pct: 7,
  });
  assert("fractional subtotal rounds",   t5.subtotal === roundThb(3 * 333.33));
  assert("fractional total = sub + vat", t5.total === roundThb(t5.subtotal + t5.vat_amount));
}

// ────────────────────────────────────────────────────────────
// (d) createFreightQuoteSchema — happy paths
// ────────────────────────────────────────────────────────────
console.log("  (d) createFreightQuoteSchema — accepts valid input");
{
  // Minimal cold quote (no profile_id).
  const cold = createFreightQuoteSchema.parse({
    buyer_name_snapshot: "บริษัท ทดสอบ จำกัด",
    transport_mode:      "sea_fcl",
  });
  assert("cold quote parses",            cold.buyer_name_snapshot === "บริษัท ทดสอบ จำกัด");
  assert("currency defaults to THB",     cold.currency === "THB");
  assert("vat_pct defaults to 7",        cold.vat_pct === 7);

  // Full quote with all optionals.
  const full = createFreightQuoteSchema.parse({
    profile_id:            QUOTE_ID,
    buyer_name_snapshot:   "ลูกค้า A",
    buyer_tax_id_snapshot: "0105564077716",
    transport_mode:        "air",
    incoterm:              "CIF",
    currency:              "USD",
    vat_pct:               0,
    valid_until:           "2026-06-30",
  });
  assert("full quote parses",            full.transport_mode === "air");
  assert("tax id (13 digit) accepted",   full.buyer_tax_id_snapshot === "0105564077716");
}

// ────────────────────────────────────────────────────────────
// (e) createFreightQuoteSchema — rejections
// ────────────────────────────────────────────────────────────
console.log("  (e) createFreightQuoteSchema — rejects bad input");
{
  assertThrows("rejects missing buyer name",
    () => createFreightQuoteSchema.parse({ transport_mode: "truck" }));
  assertThrows("rejects empty buyer name",
    () => createFreightQuoteSchema.parse({ buyer_name_snapshot: "", transport_mode: "truck" }));
  assertThrows("rejects bogus transport_mode",
    () => createFreightQuoteSchema.parse({ buyer_name_snapshot: "A", transport_mode: "rocket" }));
  assertThrows("rejects bogus incoterm",
    () => createFreightQuoteSchema.parse({ buyer_name_snapshot: "A", transport_mode: "truck", incoterm: "ZZZ" }));
  assertThrows("rejects tax id != 13 digits",
    () => createFreightQuoteSchema.parse({ buyer_name_snapshot: "A", transport_mode: "truck", buyer_tax_id_snapshot: "123" }));
  assertThrows("rejects vat_pct > 30",
    () => createFreightQuoteSchema.parse({ buyer_name_snapshot: "A", transport_mode: "truck", vat_pct: 50 }));
  assertThrows("rejects negative vat_pct",
    () => createFreightQuoteSchema.parse({ buyer_name_snapshot: "A", transport_mode: "truck", vat_pct: -1 }));
  assertThrows("rejects malformed valid_until",
    () => createFreightQuoteSchema.parse({ buyer_name_snapshot: "A", transport_mode: "truck", valid_until: "30-06-2026" }));
}

// ────────────────────────────────────────────────────────────
// (f) createQuoteItemSchema — line-item contract
// ────────────────────────────────────────────────────────────
console.log("  (f) createQuoteItemSchema — line item rules");
{
  const ok = createQuoteItemSchema.parse({
    freight_quote_id: QUOTE_ID,
    description:      "ค่าระวางเรือ Shanghai → Laem Chabang",
    quantity:         1,
    unit:             "TEU",
    unit_price_thb:   45000,
  });
  assert("valid line item parses",       ok.unit === "TEU");

  // unit defaults to JOB.
  const dft = createQuoteItemSchema.parse({
    freight_quote_id: QUOTE_ID,
    description:      "ค่าดำเนินพิธีการ",
    quantity:         1,
    unit_price_thb:   3500,
  });
  assert("unit defaults to JOB",         dft.unit === "JOB");

  assertThrows("rejects zero quantity",
    () => createQuoteItemSchema.parse({ freight_quote_id: QUOTE_ID, description: "x", quantity: 0, unit_price_thb: 100 }));
  assertThrows("rejects negative quantity",
    () => createQuoteItemSchema.parse({ freight_quote_id: QUOTE_ID, description: "x", quantity: -1, unit_price_thb: 100 }));
  assertThrows("rejects negative unit price",
    () => createQuoteItemSchema.parse({ freight_quote_id: QUOTE_ID, description: "x", quantity: 1, unit_price_thb: -1 }));
  assertThrows("rejects empty description",
    () => createQuoteItemSchema.parse({ freight_quote_id: QUOTE_ID, description: "", quantity: 1, unit_price_thb: 100 }));
  assertThrows("rejects bogus unit",
    () => createQuoteItemSchema.parse({ freight_quote_id: QUOTE_ID, description: "x", quantity: 1, unit: "BOX", unit_price_thb: 100 }));
  assertThrows("rejects non-uuid quote id",
    () => createQuoteItemSchema.parse({ freight_quote_id: "x", description: "x", quantity: 1, unit_price_thb: 100 }));
}

// ────────────────────────────────────────────────────────────
// (g) rejectQuoteSchema — reject reason ≥3 chars
// ────────────────────────────────────────────────────────────
console.log("  (g) rejectQuoteSchema — reject reason required");
{
  const ok = rejectQuoteSchema.parse({ id: QUOTE_ID, rejected_reason: "ราคาสูงเกินไป" });
  assert("valid reject parses",          ok.rejected_reason === "ราคาสูงเกินไป");
  assertThrows("rejects empty reason",   () => rejectQuoteSchema.parse({ id: QUOTE_ID, rejected_reason: "" }));
  assertThrows("rejects < 3 char reason",() => rejectQuoteSchema.parse({ id: QUOTE_ID, rejected_reason: "no" }));
  assertThrows("rejects non-uuid id",    () => rejectQuoteSchema.parse({ id: "x", rejected_reason: "valid" }));
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
