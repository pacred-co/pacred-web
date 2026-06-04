/**
 * Unit tests for lib/etax/build-xml.ts — the RD Code 86 e-Tax XML builder.
 * Pure, no IO. (EtaxInvoiceRow is a type-only import → erased at runtime, so
 * the "use server" source is never loaded under tsx.)
 *
 * Run:  pnpm tsx lib/etax/build-xml.test.ts   (wired into pnpm test:unit)
 */

import { buildEtaxXml } from "./build-xml";
import type { EtaxInvoiceRow } from "@/actions/admin/etax-export";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function assertTrue(label: string, cond: boolean) { assertEq(label, cond, true); }
function section(name: string) { console.log(`\n${name}`); }

function rowFixture(o: Partial<EtaxInvoiceRow> = {}): EtaxInvoiceRow {
  return {
    id: 42, serial_no: "TI-2026-0007", issued_at: "2026-06-05T08:30:00Z", status: "issued",
    buyer_name: "บจก. ทดสอบ", buyer_tax_id: "0105500001234", buyer_branch: "สำนักงานใหญ่",
    buyer_address: "1 ถนนทดสอบ", is_juristic: true,
    base_transport: 1000, base_transport_intl: 0, base_service: 500, base_rental: 0,
    base_goods: 0, base_total: 1500, vatable_base: 1500,
    vat_pct: 7, vat_amount: 105, wht_total: 10,
    gross_before_wht: 1605, net_payable: 1595,
    userid: "PR123", rid: "RID-1", receipt_id: 9, issued_by: "admin_pee",
    ...o,
  } as EtaxInvoiceRow;
}

section("structure + Pacred seller identity");
const xml = buildEtaxXml(rowFixture());
assertTrue("declares Code 86", xml.includes("<DocumentCode>86</DocumentCode>"));
assertTrue("Pacred seller TaxID hardcoded", xml.includes("<TaxID>0105564077716</TaxID>"));
assertTrue("valid XML prolog", xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
assertTrue("unsigned-preview marker (MVP)", xml.includes("<Status>unsigned-preview</Status>"));

section("serial + date");
assertTrue("uses serial_no when present", xml.includes("<SerialNo>TI-2026-0007</SerialNo>"));
assertTrue("falls back to TI-<id> when serial_no null",
  buildEtaxXml(rowFixture({ serial_no: null })).includes("<SerialNo>TI-42</SerialNo>"));
assertTrue("IssueDate is the date slice (no time)", xml.includes("<IssueDate>2026-06-05</IssueDate>"));

section("XML escaping (injection-safe)");
const evil = buildEtaxXml(rowFixture({ buyer_name: 'A & B <script> "x" \'y\'' }));
assertTrue("escapes & < > \" '", evil.includes("<Name>A &amp; B &lt;script&gt; &quot;x&quot; &apos;y&apos;</Name>"));
assertEq("no raw <script> leaks into the XML", evil.includes("<script>"), false);

section("money + flags");
assertTrue("money formatted to 2dp", buildEtaxXml(rowFixture({ base_total: 1234.5 })).includes("<Total>1234.50</Total>"));
assertTrue("VAT pct .toFixed(2)", xml.includes('<Vat pct="7.00">105.00</Vat>'));
assertTrue("is_juristic true → 'true'", xml.includes("<IsJuristic>true</IsJuristic>"));
assertTrue("is_juristic false → 'false'", buildEtaxXml(rowFixture({ is_juristic: false })).includes("<IsJuristic>false</IsJuristic>"));
assertTrue("intl transport zero-rated note present", xml.includes('note="zero-rated VAT 0%"'));

console.log(`\n${fail === 0 ? "✅" : "❌"} etax/build-xml: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
