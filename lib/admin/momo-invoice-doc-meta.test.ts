/**
 * Locks the ใบวางบิล MOMO metadata that lands on the upload-history row (mig 0283):
 * the invoice DATE (derived from the doc NO, so a history row can be read at a glance)
 * and the SUPPLIER label.
 *
 * The invariant that matters: a date we cannot trust must come back **null**, never a
 * silently-shifted date (20260231 → 2026-03-03 would put an invoice in the wrong month
 * on the accountant's history).
 *
 * Run: tsx lib/admin/momo-invoice-doc-meta.test.ts
 */
import assert from "node:assert/strict";
import { invoiceDateFromNo, supplierFromInvoiceText, MOMO_SUPPLIER_LABEL } from "./momo-invoice-doc-meta";

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("invoiceDateFromNo");

ok("real prod invoice numbers → ISO date", () => {
  assert.equal(invoiceDateFromNo("INV-20260708-0002"), "2026-07-08");
  assert.equal(invoiceDateFromNo("INV-20260618-0003"), "2026-06-18");
  assert.equal(invoiceDateFromNo("INV-20260714-0001"), "2026-07-14");
  assert.equal(invoiceDateFromNo("INV-20260717-0003"), "2026-07-17");
});

ok("pads single-digit month/day (a date column needs 2 digits)", () => {
  assert.equal(invoiceDateFromNo("INV-20260101-0001"), "2026-01-01");
  assert.equal(invoiceDateFromNo("INV-20261231-9999"), "2026-12-31");
});

ok("case-insensitive + tolerates surrounding whitespace", () => {
  assert.equal(invoiceDateFromNo("  inv-20260708-0002  "), "2026-07-08");
});

ok("a date that does not exist → null (never shifts the month)", () => {
  assert.equal(invoiceDateFromNo("INV-20260231-0001"), null); // 31 ก.พ.
  assert.equal(invoiceDateFromNo("INV-20260931-0001"), null); // 31 ก.ย.
  assert.equal(invoiceDateFromNo("INV-20260230-0001"), null);
});

ok("leap-year Feb 29 is accepted only when real", () => {
  assert.equal(invoiceDateFromNo("INV-20240229-0001"), "2024-02-29"); // leap
  assert.equal(invoiceDateFromNo("INV-20260229-0001"), null); // not leap
});

ok("out-of-range month/day/year → null", () => {
  assert.equal(invoiceDateFromNo("INV-20261301-0001"), null); // month 13
  assert.equal(invoiceDateFromNo("INV-20260700-0001"), null); // day 0
  assert.equal(invoiceDateFromNo("INV-20260732-0001"), null); // day 32
  assert.equal(invoiceDateFromNo("INV-19990708-0001"), null); // year < 2000
});

ok("a receipt NO or anything not INV-… → null (never guess)", () => {
  assert.equal(invoiceDateFromNo("REC-20260718-0002"), null);
  assert.equal(invoiceDateFromNo("INV-2026078-0002"), null); // 7 digits
  assert.equal(invoiceDateFromNo("INV-20260708-002"), null); // 3-digit seq
  assert.equal(invoiceDateFromNo("บิล MOMO"), null);
  assert.equal(invoiceDateFromNo(""), null);
  assert.equal(invoiceDateFromNo(null), null);
  assert.equal(invoiceDateFromNo(undefined), null);
});

ok("does NOT fish a NO out of a longer text (that is momo-doc-name's job)", () => {
  assert.equal(invoiceDateFromNo("NO: INV-20260708-0002 Date: ..."), null);
});

console.log("\nsupplierFromInvoiceText");

ok("Thai heading (ฮุย / ไท่ต๋า) → the one canonical label", () => {
  assert.equal(supplierFromInvoiceText("บริษัท ฮุย ไท่ ต๋า จำกัด"), MOMO_SUPPLIER_LABEL);
  assert.equal(supplierFromInvoiceText("ผู้ขาย: ไท่ต๋า"), MOMO_SUPPLIER_LABEL);
});

ok("English heading (HUI TAI DA, any spacing/case) → same label", () => {
  assert.equal(supplierFromInvoiceText("HUI TAI DA CO.,LTD"), MOMO_SUPPLIER_LABEL);
  assert.equal(supplierFromInvoiceText("huitaida logistics"), MOMO_SUPPLIER_LABEL);
});

ok("unknown supplier → null (a 2nd supplier must not be mislabelled)", () => {
  assert.equal(supplierFromInvoiceText("บริษัท อื่น จำกัด NO: INV-20260708-0002"), null);
  assert.equal(supplierFromInvoiceText(""), null);
  assert.equal(supplierFromInvoiceText(null), null);
  assert.equal(supplierFromInvoiceText(undefined), null);
});

console.log(`\n✅ momo-invoice-doc-meta: ${passed} assertions passed`);
