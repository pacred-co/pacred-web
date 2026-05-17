/**
 * Thai 13-digit tax-id validation unit tests (audit C-4).
 *
 * Covers:
 *   1. THAI_TAX_ID_RE        — pure 13-digit shape gate
 *   2. isValidThaiTaxId      — format + mod-11 check-digit
 *   3. thaiTaxIdSchema       — the reusable Zod schema (required form)
 *   4. requestTaxInvoiceSchema.buyer_tax_id — C-4: the tax-invoice request
 *      validator now rejects a malformed (bad-checksum) id, not just a
 *      wrong-length one.
 *
 * Valid fixtures are real-shaped 13-digit ids whose 13th digit is the correct
 * mod-11 check digit (hand-derived) — `0105564077716` is Pacred's own juristic
 * registration number, a known-good juristic tax id.
 *
 * No DB / network / file IO. Runs in <50ms.
 */

import {
  THAI_TAX_ID_RE,
  isValidThaiTaxId,
  thaiTaxIdSchema,
} from "./thai-tax-id";
import { requestTaxInvoiceSchema } from "./tax-invoice";

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

console.log("thai-tax-id validators (C-4)");

// Valid 13-digit ids — 13th digit is the correct mod-11 checksum.
const VALID_JURISTIC = "0105564077716"; // Pacred's real registration no.
const VALID_B        = "1234567890121";
const VALID_C        = "1111111111119";

// ────────────────────────────────────────────────────────────
// (a) THAI_TAX_ID_RE — shape only
// ────────────────────────────────────────────────────────────
console.log("  (a) THAI_TAX_ID_RE — 13-digit shape");
{
  assert("accepts 13 digits",          THAI_TAX_ID_RE.test("0000000000000"));
  assert("rejects 12 digits",          !THAI_TAX_ID_RE.test("000000000000"));
  assert("rejects 14 digits",          !THAI_TAX_ID_RE.test("00000000000000"));
  assert("rejects letters",            !THAI_TAX_ID_RE.test("12345678901AB"));
  assert("rejects dashes",             !THAI_TAX_ID_RE.test("1-2345678-9012"));
  assert("rejects empty string",       !THAI_TAX_ID_RE.test(""));
}

// ────────────────────────────────────────────────────────────
// (b) isValidThaiTaxId — format + checksum
// ────────────────────────────────────────────────────────────
console.log("  (b) isValidThaiTaxId — format + mod-11 checksum");
{
  assert("accepts valid juristic id",  isValidThaiTaxId(VALID_JURISTIC));
  assert("accepts valid id B",         isValidThaiTaxId(VALID_B));
  assert("accepts valid id C",         isValidThaiTaxId(VALID_C));

  // Same digits as a valid id but a wrong 13th digit → checksum fails.
  assert("rejects bad check digit",    !isValidThaiTaxId("0105564077710"));
  assert("rejects all-zeros",          !isValidThaiTaxId("0000000000000"));
  assert("rejects 1234567890123",      !isValidThaiTaxId("1234567890123"));

  // Shape failures short-circuit before the checksum.
  assert("rejects wrong length",       !isValidThaiTaxId("123"));
  assert("rejects 12 digits",          !isValidThaiTaxId("010556407771"));
  assert("rejects non-numeric",        !isValidThaiTaxId("010556407771X"));
  assert("rejects empty string",       !isValidThaiTaxId(""));
}

// ────────────────────────────────────────────────────────────
// (c) thaiTaxIdSchema — reusable required Zod schema
// ────────────────────────────────────────────────────────────
console.log("  (c) thaiTaxIdSchema — Zod schema");
{
  assert("parses a valid id",          thaiTaxIdSchema.parse(VALID_JURISTIC) === VALID_JURISTIC);
  // trims surrounding whitespace before validating.
  assert("trims then parses",          thaiTaxIdSchema.parse(`  ${VALID_B}  `) === VALID_B);

  assertThrows("rejects wrong length", () => thaiTaxIdSchema.parse("123"));
  assertThrows("rejects bad checksum", () => thaiTaxIdSchema.parse("1234567890123"));
  assertThrows("rejects letters",      () => thaiTaxIdSchema.parse("12345678901AB"));

  // safeParse surfaces a Thai-language message for a bad checksum.
  const r = thaiTaxIdSchema.safeParse("1234567890123");
  assert("bad-checksum message is Thai",
    !r.success && /เลขประจำตัวผู้เสียภาษี/.test(r.error.issues[0]?.message ?? ""));
}

// ────────────────────────────────────────────────────────────
// (d) requestTaxInvoiceSchema.buyer_tax_id — C-4 end-to-end
// ────────────────────────────────────────────────────────────
console.log("  (d) requestTaxInvoiceSchema — C-4 buyer_tax_id gate");
{
  const base = {
    order_type: "service_order" as const,
    order_id:   "H123456",
    buyer_name: "บริษัท ทดสอบ จำกัด",
    buyer_address: "เลขที่ 1 ถนนทดสอบ กรุงเทพ 10100",
  };

  const ok = requestTaxInvoiceSchema.parse({ ...base, buyer_tax_id: VALID_JURISTIC });
  assert("valid request parses",        ok.buyer_tax_id === VALID_JURISTIC);
  assert("buyer_branch defaults",       ok.buyer_branch === "สำนักงานใหญ่");

  // C-4: a 13-digit but bad-checksum id is now rejected (was accepted before).
  assertThrows("rejects bad-checksum buyer_tax_id",
    () => requestTaxInvoiceSchema.parse({ ...base, buyer_tax_id: "1234567890123" }));
  // wrong length still rejected.
  assertThrows("rejects 12-digit buyer_tax_id",
    () => requestTaxInvoiceSchema.parse({ ...base, buyer_tax_id: "010556407771" }));
  assertThrows("rejects non-numeric buyer_tax_id",
    () => requestTaxInvoiceSchema.parse({ ...base, buyer_tax_id: "12345678901AB" }));
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
