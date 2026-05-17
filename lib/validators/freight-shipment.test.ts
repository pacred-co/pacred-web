/**
 * V-E1 — freight-shipment validator + ADR-0016 value-block math unit tests.
 *
 * Covers the Zod contract + the value-derivation helper. A regression here
 * mis-prices a customs entry or breaks the ADR-0016 audit-trail refines:
 *
 *   1. FREIGHT_SHIPMENT_STATUSES / TRANSPORT_MODES / INCOTERMS / INVOICE
 *      enums + their *_LABEL maps
 *   2. roundThb           — 2dp cents rounding
 *   3. computeValueBlock  — ADR-0016 derivation:
 *        commercial_value_thb = usd × rate
 *        duty   = dutyBase × dutyPct%   (dutyBase = declared ?? commercial)
 *        vat_base = dutyBase + duty   (override-able)
 *        vat    = vat_base × 7%
 *   4. createFreightShipmentSchema — the two .refine rules
 *        (usd/rate paired · declared needs a basis)
 *   5. upsertPartySchema  — 13-digit tax-id regex
 *   6. addInvoiceLineSchema — positive qty, unit default
 *   7. cancelShipmentSchema — cancel reason ≥3 chars
 *
 * No DB / network / file IO. Runs in <50ms.
 */

import {
  FREIGHT_SHIPMENT_STATUSES,
  FREIGHT_SHIPMENT_STATUS_LABEL,
  FREIGHT_TRANSPORT_MODES,
  FREIGHT_TRANSPORT_MODE_LABEL,
  INCOTERMS,
  FREIGHT_INVOICE_STATUSES,
  FREIGHT_INVOICE_STATUS_LABEL,
  FREIGHT_LINE_UNITS,
  roundThb,
  computeValueBlock,
  createFreightShipmentSchema,
  updateFreightShipmentSchema,
  upsertPartySchema,
  addInvoiceLineSchema,
  cancelShipmentSchema,
  cancelInvoiceSchema,
} from "./freight-shipment";

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

console.log("freight-shipment validators (V-E1)");

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-9222-222222222222";

// ────────────────────────────────────────────────────────────
// (a) enum sets + label maps
// ────────────────────────────────────────────────────────────
console.log("  (a) enum sets + label maps");
{
  assert("6 shipment statuses",   FREIGHT_SHIPMENT_STATUSES.length === 6);
  assert("4 transport modes",     FREIGHT_TRANSPORT_MODES.length === 4);
  assert("11 incoterms",          INCOTERMS.length === 11);
  assert("incoterms include FOB", (INCOTERMS as readonly string[]).includes("FOB"));
  assert("3 invoice statuses",    FREIGHT_INVOICE_STATUSES.length === 3);
  assert("line units include PCS",(FREIGHT_LINE_UNITS as readonly string[]).includes("PCS"));
  assert("every shipment status has a label",
    FREIGHT_SHIPMENT_STATUSES.every((s) => FREIGHT_SHIPMENT_STATUS_LABEL[s]?.length > 0));
  assert("every transport mode has a label",
    FREIGHT_TRANSPORT_MODES.every((m) => FREIGHT_TRANSPORT_MODE_LABEL[m]?.length > 0));
  assert("every invoice status has a label",
    FREIGHT_INVOICE_STATUSES.every((s) => FREIGHT_INVOICE_STATUS_LABEL[s]?.length > 0));
}

// ────────────────────────────────────────────────────────────
// (b) roundThb — 2dp cents
// ────────────────────────────────────────────────────────────
console.log("  (b) roundThb — 2dp rounding");
{
  assert("12.345 → 12.35",  roundThb(12.345) === 12.35);
  assert("integer untouched", roundThb(100) === 100);
}

// ────────────────────────────────────────────────────────────
// (c) computeValueBlock — ADR-0016 derivation
// ────────────────────────────────────────────────────────────
console.log("  (c) computeValueBlock — ADR-0016 value derivation");
{
  // Full happy path: usd 10000 × rate 36 = 360000 commercial.
  // declared not set → dutyBase = commercial. duty 10% = 36000.
  // vat_base = 360000 + 36000 = 396000. vat = 396000 × 7% = 27720.
  const full = computeValueBlock({
    commercial_value_usd: 10000, exchange_rate: 36, duty_rate_pct: 10,
  });
  assert("commercial = usd × rate", full.commercial_value_thb === 360000);
  assert("duty = commercial × 10%", full.duty_thb === 36000);
  assert("vat_base = commercial + duty", full.vat_base_thb === 396000);
  assert("vat = vat_base × 7%", full.vat_thb === 27720);

  // declared overrides commercial as the duty base.
  const withDeclared = computeValueBlock({
    commercial_value_usd: 10000, exchange_rate: 36,
    declared_customs_value_thb: 100000, duty_rate_pct: 10,
  });
  assert("commercial still computed", withDeclared.commercial_value_thb === 360000);
  assert("duty uses declared base not commercial", withDeclared.duty_thb === 10000);
  assert("vat_base from declared base", withDeclared.vat_base_thb === 110000);

  // No usd/rate → commercial null. No declared → duty base null → all null.
  const empty = computeValueBlock({ duty_rate_pct: 10 });
  assert("no inputs → commercial null", empty.commercial_value_thb === null);
  assert("no inputs → duty null", empty.duty_thb === null);
  assert("no inputs → vat_base null", empty.vat_base_thb === null);
  assert("no inputs → vat null", empty.vat_thb === null);

  // usd set but rate missing → commercial stays null (both-or-neither).
  const halfPaired = computeValueBlock({ commercial_value_usd: 5000, duty_rate_pct: 5 });
  assert("usd without rate → commercial null", halfPaired.commercial_value_thb === null);

  // declared set, no commercial → duty still derives off declared.
  const declaredOnly = computeValueBlock({
    declared_customs_value_thb: 200000, duty_rate_pct: 5,
  });
  assert("declared-only → commercial null", declaredOnly.commercial_value_thb === null);
  assert("declared-only → duty derives", declaredOnly.duty_thb === 10000);
  assert("declared-only → vat_base derives", declaredOnly.vat_base_thb === 210000);

  // duty_rate omitted → defaults to 0 → duty 0 (but base still present).
  const noRate = computeValueBlock({ commercial_value_usd: 1000, exchange_rate: 36 });
  assert("no duty_rate → duty 0", noRate.duty_thb === 0);
  assert("no duty_rate → vat_base == commercial", noRate.vat_base_thb === 36000);

  // vat_base override wins over the computed base.
  const override = computeValueBlock({
    commercial_value_usd: 10000, exchange_rate: 36, duty_rate_pct: 10,
    vat_base_thb_override: 500000,
  });
  assert("vat_base override is honoured", override.vat_base_thb === 500000);
  assert("vat computed off the override", override.vat_thb === 35000);

  // Rounding: a value that needs 2dp rounding.
  const rounding = computeValueBlock({ commercial_value_usd: 100.005, exchange_rate: 1 });
  assert("commercial rounds to 2dp", rounding.commercial_value_thb === 100.01);
}

// ────────────────────────────────────────────────────────────
// (d) createFreightShipmentSchema — the two refines
// ────────────────────────────────────────────────────────────
console.log("  (d) createFreightShipmentSchema — paired-value refines");
{
  // Minimal valid shipment.
  const ok = createFreightShipmentSchema.parse({
    profile_id: UUID_A, transport_mode: "sea_fcl",
  });
  assert("minimal shipment parses", ok.transport_mode === "sea_fcl");
  assert("origin_country defaults to CHINA", ok.origin_country === "CHINA");

  // usd + rate together → valid.
  const paired = createFreightShipmentSchema.parse({
    profile_id: UUID_A, transport_mode: "air",
    commercial_value_usd: 5000, exchange_rate: 36,
  });
  assert("usd + rate paired parses", paired.exchange_rate === 36);

  // usd WITHOUT rate → refine throws.
  assertThrows("usd without rate throws",
    () => createFreightShipmentSchema.parse({
      profile_id: UUID_A, transport_mode: "air", commercial_value_usd: 5000,
    }));
  // rate WITHOUT usd → refine throws.
  assertThrows("rate without usd throws",
    () => createFreightShipmentSchema.parse({
      profile_id: UUID_A, transport_mode: "air", exchange_rate: 36,
    }));

  // declared_customs_value WITHOUT a basis → refine throws (ADR-0016 audit).
  assertThrows("declared value without basis throws",
    () => createFreightShipmentSchema.parse({
      profile_id: UUID_A, transport_mode: "truck", declared_customs_value_thb: 100000,
    }));
  // declared_customs_value WITH a basis → valid.
  const declared = createFreightShipmentSchema.parse({
    profile_id: UUID_A, transport_mode: "truck",
    declared_customs_value_thb: 100000, declared_value_basis: "invoice from supplier",
  });
  assert("declared value + basis parses", declared.declared_customs_value_thb === 100000);

  // bad transport_mode rejected.
  assertThrows("rejects bad transport_mode",
    () => createFreightShipmentSchema.parse({
      profile_id: UUID_A, transport_mode: "rocket",
    }));
  // non-uuid profile_id rejected.
  assertThrows("rejects non-uuid profile_id",
    () => createFreightShipmentSchema.parse({
      profile_id: "x", transport_mode: "sea_lcl",
    }));
}

// ────────────────────────────────────────────────────────────
// (e) updateFreightShipmentSchema
// ────────────────────────────────────────────────────────────
console.log("  (e) updateFreightShipmentSchema");
{
  const ok = updateFreightShipmentSchema.parse({ id: UUID_A, bl_no: "BL-2026-001" });
  assert("update parses", ok.bl_no === "BL-2026-001");
  assertThrows("update rejects missing id", () => updateFreightShipmentSchema.parse({ bl_no: "x" }));
  assertThrows("update rejects bad incoterm",
    () => updateFreightShipmentSchema.parse({ id: UUID_A, incoterm: "ZZZ" }));
}

// ────────────────────────────────────────────────────────────
// (f) upsertPartySchema — 13-digit tax-id regex
// ────────────────────────────────────────────────────────────
console.log("  (f) upsertPartySchema — tax-id regex");
{
  const ok = upsertPartySchema.parse({
    freight_shipment_id: UUID_A, role: "shipper",
    name: "ผู้ส่งออก", address: "เลขที่ 1 กรุงเทพ", tax_id: "1234567890123",
  });
  assert("party with valid tax_id parses", ok.tax_id === "1234567890123");

  // tax_id may be omitted / null.
  const noTax = upsertPartySchema.parse({
    freight_shipment_id: UUID_A, role: "consignee",
    name: "ผู้รับ", address: "เลขที่ 2 เชียงใหม่",
  });
  assert("party without tax_id parses", noTax.role === "consignee");

  assertThrows("rejects 12-digit tax_id",
    () => upsertPartySchema.parse({
      freight_shipment_id: UUID_A, role: "shipper",
      name: "n", address: "a", tax_id: "123456789012",
    }));
  assertThrows("rejects non-numeric tax_id",
    () => upsertPartySchema.parse({
      freight_shipment_id: UUID_A, role: "shipper",
      name: "n", address: "a", tax_id: "12345678901AB",
    }));
  assertThrows("rejects bad role",
    () => upsertPartySchema.parse({
      freight_shipment_id: UUID_A, role: "broker", name: "n", address: "a",
    }));
  assertThrows("rejects empty name",
    () => upsertPartySchema.parse({
      freight_shipment_id: UUID_A, role: "shipper", name: "", address: "a",
    }));
}

// ────────────────────────────────────────────────────────────
// (g) addInvoiceLineSchema + cancel schemas
// ────────────────────────────────────────────────────────────
console.log("  (g) addInvoiceLineSchema + cancel schemas");
{
  const line = addInvoiceLineSchema.parse({
    freight_invoice_id: UUID_B, description: "Cotton t-shirts",
    qty: 500, unit_price_usd: 3.5,
  });
  assert("invoice line parses", line.qty === 500);
  assert("invoice line unit defaults to PCS", line.unit === "PCS");

  assertThrows("rejects zero qty",
    () => addInvoiceLineSchema.parse({
      freight_invoice_id: UUID_B, description: "x", qty: 0, unit_price_usd: 1,
    }));
  assertThrows("rejects negative unit price",
    () => addInvoiceLineSchema.parse({
      freight_invoice_id: UUID_B, description: "x", qty: 1, unit_price_usd: -1,
    }));

  // cancel reasons ≥3 chars.
  const cs = cancelShipmentSchema.parse({ id: UUID_A, cancelled_reason: "ลูกค้ายกเลิก" });
  assert("cancel shipment parses", cs.cancelled_reason === "ลูกค้ายกเลิก");
  assertThrows("cancel shipment rejects 2-char reason",
    () => cancelShipmentSchema.parse({ id: UUID_A, cancelled_reason: "ab" }));
  const ci = cancelInvoiceSchema.parse({ id: UUID_A, cancellation_reason: "ออกผิด" });
  assert("cancel invoice parses", ci.cancellation_reason === "ออกผิด");
  assertThrows("cancel invoice rejects 2-char reason",
    () => cancelInvoiceSchema.parse({ id: UUID_A, cancellation_reason: "ab" }));
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
