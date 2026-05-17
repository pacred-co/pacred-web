/**
 * V-E11 — customs-declaration validator + line-tax math unit tests.
 *
 * Covers the Zod contract + the duty/VAT helper for customs declarations.
 * A regression mislabels a declaration or mis-computes Thai customs tax:
 *
 *   1. CUSTOMS_DECLARATION_STATUSES / _TYPES / OFFICES / LINE_UNITS — enums
 *      + their *_LABEL maps (every key needs a label)
 *   2. roundThb            — 2dp cents rounding
 *   3. computeLineTaxes    — duty = value × rate%, vat = (value+duty) × 7%;
 *      defensive clamping of negative value + out-of-range rate
 *   4. createDeclarationSchema / updateDeclarationHeaderSchema — contracts
 *   5. addDeclarationLineSchema — ISO-2 country regex, qty bounds, unit default
 *   6. submitDeclarationSchema — customs_office required at submit
 *   7. cancelDeclarationSchema — cancel reason ≥3 chars
 *
 * No DB / network / file IO. Runs in <50ms.
 */

import {
  CUSTOMS_DECLARATION_STATUSES,
  CUSTOMS_DECLARATION_STATUS_LABEL,
  CUSTOMS_DECLARATION_TYPES,
  CUSTOMS_DECLARATION_TYPE_LABEL,
  CUSTOMS_OFFICES,
  CUSTOMS_OFFICE_LABEL,
  CUSTOMS_LINE_UNITS,
  roundThb,
  computeLineTaxes,
  createDeclarationSchema,
  updateDeclarationHeaderSchema,
  addDeclarationLineSchema,
  submitDeclarationSchema,
  markDeclarationAcceptedSchema,
  cancelDeclarationSchema,
} from "./customs-declaration";

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

console.log("customs-declaration validators (V-E11)");

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-9222-222222222222";

// ────────────────────────────────────────────────────────────
// (a) enum sets + label maps
// ────────────────────────────────────────────────────────────
console.log("  (a) enum sets + label maps");
{
  assert("5 declaration statuses", CUSTOMS_DECLARATION_STATUSES.length === 5);
  assert("3 declaration types",    CUSTOMS_DECLARATION_TYPES.length === 3);
  assert("offices include OTHER",  (CUSTOMS_OFFICES as readonly string[]).includes("OTHER"));
  assert("line units include PCS", (CUSTOMS_LINE_UNITS as readonly string[]).includes("PCS"));
  assert("every status has a label",
    CUSTOMS_DECLARATION_STATUSES.every((s) => CUSTOMS_DECLARATION_STATUS_LABEL[s]?.length > 0));
  assert("every type has a label",
    CUSTOMS_DECLARATION_TYPES.every((t) => CUSTOMS_DECLARATION_TYPE_LABEL[t]?.length > 0));
  assert("every office has a label",
    CUSTOMS_OFFICES.every((o) => CUSTOMS_OFFICE_LABEL[o]?.length > 0));
}

// ────────────────────────────────────────────────────────────
// (b) roundThb — 2dp cents
// ────────────────────────────────────────────────────────────
console.log("  (b) roundThb — 2dp rounding");
{
  assert("100.005 → 100.01", roundThb(100.005) === 100.01);
  assert("integer untouched", roundThb(5000) === 5000);
}

// ────────────────────────────────────────────────────────────
// (c) computeLineTaxes — duty + VAT (Thai customs convention)
// ────────────────────────────────────────────────────────────
console.log("  (c) computeLineTaxes — duty + VAT math");
{
  // 100000 declared, 10% duty → duty 10000, vat = (110000)×7% = 7700.
  const t = computeLineTaxes({ declared_value_thb: 100000, duty_rate_pct: 10 });
  assert("duty = value × rate%", t.duty_thb === 10000);
  assert("vat = (value+duty) × 7%", t.vat_thb === 7700);

  // 0% duty → duty 0, vat = value × 7%.
  const zeroDuty = computeLineTaxes({ declared_value_thb: 50000, duty_rate_pct: 0 });
  assert("0% duty → duty 0", zeroDuty.duty_thb === 0);
  assert("0% duty → vat = value × 7%", zeroDuty.vat_thb === 3500);

  // Zero declared value → both 0.
  const zeroVal = computeLineTaxes({ declared_value_thb: 0, duty_rate_pct: 20 });
  assert("0 value → duty 0", zeroVal.duty_thb === 0);
  assert("0 value → vat 0", zeroVal.vat_thb === 0);

  // Defensive: negative declared value clamps to 0.
  const neg = computeLineTaxes({ declared_value_thb: -999, duty_rate_pct: 10 });
  assert("negative value clamps → duty 0", neg.duty_thb === 0);
  assert("negative value clamps → vat 0", neg.vat_thb === 0);

  // Defensive: a >100 duty rate clamps to 100.
  const overRate = computeLineTaxes({ declared_value_thb: 1000, duty_rate_pct: 250 });
  assert("rate >100 clamps to 100% → duty == value", overRate.duty_thb === 1000);

  // Defensive: a negative rate clamps to 0.
  const negRate = computeLineTaxes({ declared_value_thb: 1000, duty_rate_pct: -5 });
  assert("negative rate clamps to 0 → duty 0", negRate.duty_thb === 0);

  // Defensive: NaN-ish inputs treated as 0.
  const nan = computeLineTaxes({
    declared_value_thb: Number("x") as number, duty_rate_pct: Number("y") as number,
  });
  assert("NaN value → duty 0", nan.duty_thb === 0);
  assert("NaN value → vat 0", nan.vat_thb === 0);

  // Result rounds to 2dp.
  const r = computeLineTaxes({ declared_value_thb: 333.33, duty_rate_pct: 7 });
  assert("duty rounds to 2dp", r.duty_thb === roundThb(333.33 * 0.07));
}

// ────────────────────────────────────────────────────────────
// (d) createDeclarationSchema / updateDeclarationHeaderSchema
// ────────────────────────────────────────────────────────────
console.log("  (d) create + update-header schemas");
{
  const ok = createDeclarationSchema.parse({
    freight_shipment_id: UUID_A, declaration_type: "import",
  });
  assert("create declaration parses", ok.declaration_type === "import");
  assertThrows("rejects bad declaration_type",
    () => createDeclarationSchema.parse({ freight_shipment_id: UUID_A, declaration_type: "smuggle" }));
  assertThrows("rejects non-uuid shipment id",
    () => createDeclarationSchema.parse({ freight_shipment_id: "x", declaration_type: "import" }));

  // Header update: optional fields, id required.
  const hdr = updateDeclarationHeaderSchema.parse({
    id: UUID_A, broker_name: "บริษัทตัวแทนออกของ", ship_or_truck_arrival_date: "2026-05-20",
  });
  assert("header update parses", hdr.broker_name === "บริษัทตัวแทนออกของ");
  assertThrows("rejects bad arrival date format",
    () => updateDeclarationHeaderSchema.parse({ id: UUID_A, ship_or_truck_arrival_date: "20-05-2026" }));
  assertThrows("rejects negative other-taxes",
    () => updateDeclarationHeaderSchema.parse({ id: UUID_A, total_other_taxes_thb: -1 }));
}

// ────────────────────────────────────────────────────────────
// (e) addDeclarationLineSchema — country regex + qty + unit default
// ────────────────────────────────────────────────────────────
console.log("  (e) addDeclarationLineSchema — line contract");
{
  const ok = addDeclarationLineSchema.parse({
    declaration_id: UUID_B, description: "เครื่องใช้ไฟฟ้า", qty: 100,
    country_of_origin: "CN",
  });
  assert("line parses", ok.qty === 100);
  assert("unit defaults to PCS", ok.unit === "PCS");
  assert("declared_value defaults to 0", ok.declared_value_thb === 0);
  assert("duty_rate defaults to 0", ok.duty_rate_pct === 0);

  // country_of_origin must be ISO-2 uppercase.
  assertThrows("rejects lowercase country",
    () => addDeclarationLineSchema.parse({
      declaration_id: UUID_B, description: "x", qty: 1, country_of_origin: "cn",
    }));
  assertThrows("rejects 3-letter country",
    () => addDeclarationLineSchema.parse({
      declaration_id: UUID_B, description: "x", qty: 1, country_of_origin: "CHN",
    }));
  // description required (≥1 char).
  assertThrows("rejects empty description",
    () => addDeclarationLineSchema.parse({
      declaration_id: UUID_B, description: "", qty: 1,
    }));
  // qty must be ≥ 0; negative rejected.
  assertThrows("rejects negative qty",
    () => addDeclarationLineSchema.parse({
      declaration_id: UUID_B, description: "x", qty: -1,
    }));
  // bad unit rejected.
  assertThrows("rejects bogus unit",
    () => addDeclarationLineSchema.parse({
      declaration_id: UUID_B, description: "x", qty: 1, unit: "TONNE",
    }));
}

// ────────────────────────────────────────────────────────────
// (f) status-flip schemas
// ────────────────────────────────────────────────────────────
console.log("  (f) submit / accept / cancel schemas");
{
  // submit requires a non-empty customs_office.
  const sub = submitDeclarationSchema.parse({
    id: UUID_A, customs_office: "BANGKOK_PORT_CUSTOMS_HOUSE",
  });
  assert("submit parses with office", sub.customs_office === "BANGKOK_PORT_CUSTOMS_HOUSE");
  assertThrows("submit rejects empty office",
    () => submitDeclarationSchema.parse({ id: UUID_A, customs_office: "" }));

  // accepted: control_no optional.
  const acc = markDeclarationAcceptedSchema.parse({ id: UUID_A });
  assert("accept parses without control_no", acc.id === UUID_A);

  // cancel reason ≥3 chars.
  const can = cancelDeclarationSchema.parse({ id: UUID_A, cancelled_reason: "ผิด" });
  assert("cancel parses", can.cancelled_reason === "ผิด");
  assertThrows("cancel rejects 2-char reason",
    () => cancelDeclarationSchema.parse({ id: UUID_A, cancelled_reason: "ab" }));
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
