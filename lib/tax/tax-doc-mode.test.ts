// Unit tests for the 3-mode tax-document engine (lib/tax/tax-doc-mode.ts).
// Run: tsx lib/tax/tax-doc-mode.test.ts
//
// The 3 modes (Global Trade Group §3 + ADR-0027) and their VAT-7% base:
//   tax_invoice (ใบกำกับ)  → VAT on GOODS VALUE (full vatable base, intl zero-rated)
//   customs     (ใบขน)     → VAT on SERVICE FEE only (goods excluded)
//   none        (ไม่รับฯ)   → no customer VAT; margin = taxable profit (internal)
import {
  computeTaxForMode,
  computeMarginVat,
  modeFromPref,
  prefFromMode,
  modeRequiresBillingSnapshot,
  mapTaxDocColumns,
  TAX_DOC_MODES,
  TAX_DOC_MODE_META,
  type ModeTaxableParts,
} from "./tax-doc-mode";

let pass = 0,
  fail = 0;
function eq(label: string, got: number, want: number, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  console.log(`${ok ? "✓" : "✗"} ${label}  got=${got} want=${want}`);
  if (ok) pass++;
  else fail++;
}
function is(label: string, got: unknown, want: unknown) {
  const ok = got === want;
  console.log(`${ok ? "✓" : "✗"} ${label}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  if (ok) pass++;
  else fail++;
}

// ── pref ↔ mode coercion ──
is("modeFromPref('tax_invoice')", modeFromPref("tax_invoice"), "tax_invoice");
is("modeFromPref('customs')", modeFromPref("customs"), "customs");
is("modeFromPref('receipt')", modeFromPref("receipt"), "none");
is("modeFromPref(null) → none (fail-safe)", modeFromPref(null), "none");
is("modeFromPref('') → none", modeFromPref(""), "none");
is("modeFromPref('garbage') → none", modeFromPref("garbage"), "none");
is("prefFromMode('tax_invoice')", prefFromMode("tax_invoice"), "tax_invoice");
is("prefFromMode('customs')", prefFromMode("customs"), "customs");
is("prefFromMode('none') → receipt", prefFromMode("none"), "receipt");
is("modeRequiresBillingSnapshot(tax_invoice)", modeRequiresBillingSnapshot("tax_invoice"), true);
is("modeRequiresBillingSnapshot(customs)", modeRequiresBillingSnapshot("customs"), true);
is("modeRequiresBillingSnapshot(none)", modeRequiresBillingSnapshot("none"), false);
is("TAX_DOC_MODES length 3", TAX_DOC_MODES.length, 3);
is("meta none pref = receipt", TAX_DOC_MODE_META.none.pref, "receipt");

// A shop-order-shaped bill: goods 10000 + dom transport 500 + service 200
// (e.g. ค่าบริการ/ตีลังไม้), intl transport 1000 (zero-rated leg).
const shopParts: ModeTaxableParts = {
  transportDomestic: 500,
  transportIntl: 1000,
  service: 200,
  rental: 0,
  goods: 10000,
  discount: 0,
};

// ── tax_invoice (ใบกำกับ): VAT on goods + dom transport + service; intl excluded ──
{
  const t = computeTaxForMode("tax_invoice", shopParts, { isJuristic: true });
  // vatable = total(11700) − intl(1000) = 10700
  eq("ใบกำกับ: base.total", t.base.total, 11700);
  eq("ใบกำกับ: vatable = 10700 (goods+dom+service, intl excluded)", t.base.vatable, 10700);
  eq("ใบกำกับ: VAT 7% of 10700 = 749", t.vat, 749);
  // WHT: transport (1500 × 1%) = 15 · service (200 × 3%) = 6 · goods 0
  eq("ใบกำกับ: WHT transport", t.wht.transport, 15);
  eq("ใบกำกับ: WHT service", t.wht.service, 6);
  eq("ใบกำกับ: WHT goods = 0", t.wht.goods, 0);
  eq("ใบกำกับ: WHT total = 21", t.wht.total, 21);
  eq("ใบกำกับ: grossBeforeWht = 11700+749", t.grossBeforeWht, 12449);
  eq("ใบกำกับ: netPayable = 12449-21", t.netPayable, 12428);
}

// ── customs (ใบขน) = "Non" per D5 (owner 2026-06-21): NO customer VAT line.
//    The 7% VAT is internal margin-VAT (computeMarginVat), not on the bill. ──
{
  const t = computeTaxForMode("customs", shopParts, { isJuristic: true });
  eq("ใบขน: base.total unchanged (11700)", t.base.total, 11700);
  // vatable base is still computed (informational) but NO VAT is charged (vat=0,
  // like `none`) — the customer ใบขน has no VAT line; 7% is internal margin-VAT.
  eq("ใบขน: VAT = 0 (Non · margin-VAT internal · D5)", t.vat, 0);
  // WHT identical to ใบกำกับ — WHT does not depend on doc mode
  eq("ใบขน: WHT total = 21 (same as ใบกำกับ)", t.wht.total, 21);
  eq("ใบขน: grossBeforeWht = base.total (no VAT)", t.grossBeforeWht, 11700);
  eq("ใบขน: netPayable = 11700-21", t.netPayable, 11679);
}

// ── customs has NO customer VAT (0) — ใบขน=Non per D5; ใบกำกับ keeps its VAT ──
{
  const ti = computeTaxForMode("tax_invoice", shopParts, { isJuristic: true });
  const cu = computeTaxForMode("customs", shopParts, { isJuristic: true });
  const ok = cu.vat === 0 && ti.vat > 0;
  console.log(`${ok ? "✓" : "✗"} customs VAT (${cu.vat}) = 0 · tax_invoice VAT (${ti.vat}) > 0`);
  if (ok) pass++;
  else fail++;
}

// ── none (ไม่รับเอกสาร): no customer VAT ──
{
  const t = computeTaxForMode("none", shopParts, { isJuristic: true });
  eq("ไม่รับฯ: vat = 0 (no customer-facing VAT)", t.vat, 0);
  eq("ไม่รับฯ: vatable irrelevant — gross has no VAT", t.grossBeforeWht, 11700);
  eq("ไม่รับฯ: WHT still applies (juristic) = 21", t.wht.total, 21);
  eq("ไม่รับฯ: netPayable = 11700-21", t.netPayable, 11679);
}

// ── none personal: no VAT, no WHT ──
{
  const t = computeTaxForMode("none", shopParts, { isJuristic: false });
  eq("ไม่รับฯ personal: vat=0", t.vat, 0);
  eq("ไม่รับฯ personal: wht=0", t.wht.total, 0);
  eq("ไม่รับฯ personal: net = base total", t.netPayable, 11700);
}

// ── computeMarginVat (internal margin VAT for the `none` mode) ──
eq("marginVat(1000) = 70", computeMarginVat(1000), 70);
eq("marginVat(1000, vatPct=10) = 100", computeMarginVat(1000, 10), 100);
eq("marginVat(0) = 0", computeMarginVat(0), 0);
eq("marginVat(-500) = 0 (no VAT on a loss)", computeMarginVat(-500), 0);
eq("marginVat(2120*5.01 profit≈?) sanity: marginVat(3000)=210", computeMarginVat(3000), 210);

// ── customs (ใบขน) = Non per D5: NO customer VAT even on a pure-service order;
//    ใบกำกับ charges the customer VAT. ──
{
  const svcOnly: ModeTaxableParts = {
    transportDomestic: 0, transportIntl: 0, service: 1000, rental: 0, goods: 0, discount: 0,
  };
  const ti = computeTaxForMode("tax_invoice", svcOnly, { isJuristic: true });
  const cu = computeTaxForMode("customs", svcOnly, { isJuristic: true });
  eq("svc-only: tax_invoice VAT = 70 (customer doc)", ti.vat, 70);
  eq("svc-only: customs VAT = 0 (ใบขน=Non · margin-VAT internal)", cu.vat, 0);
}

// ── mapTaxDocColumns (GAP 3 · the form→tb_payment.tax_doc_* capture mapper) ──
{
  // tax_invoice (VAT-bearing) keeps the billing snapshot; address = "name · addr"
  const ti = mapTaxDocColumns({
    taxDocPref: "tax_invoice", taxDocTaxId: "0105564077716",
    taxDocBillingName: "บจก. แพคเรด", taxDocAddress: "123 ถนนสุขุมวิท",
  });
  is("map: tax_invoice pref", ti.tax_doc_pref, "tax_invoice");
  is("map: tax_invoice tax_id kept", ti.tax_doc_tax_id, "0105564077716");
  is("map: tax_invoice address combined", ti.tax_doc_address, "บจก. แพคเรด · 123 ถนนสุขุมวิท");

  // customs (VAT-bearing) — same billing retention
  const cu = mapTaxDocColumns({ taxDocPref: "customs", taxDocTaxId: "1234567890123", taxDocBillingName: "A", taxDocAddress: "B" });
  is("map: customs pref", cu.tax_doc_pref, "customs");
  is("map: customs address combined", cu.tax_doc_address, "A · B");

  // receipt / none — billing DROPPED (no VAT doc → no snapshot kept)
  const rc = mapTaxDocColumns({ taxDocPref: "receipt", taxDocTaxId: "1234567890123", taxDocBillingName: "X", taxDocAddress: "Y" });
  is("map: receipt pref", rc.tax_doc_pref, "receipt");
  is("map: receipt drops tax_id", rc.tax_doc_tax_id, null);
  is("map: receipt drops address", rc.tax_doc_address, null);

  // empty / undefined pref → receipt (the safe default · no billing)
  const empty = mapTaxDocColumns({});
  is("map: empty pref → receipt", empty.tax_doc_pref, "receipt");
  is("map: empty → null tax_id", empty.tax_doc_tax_id, null);
  is("map: empty → null address", empty.tax_doc_address, null);

  // tax_invoice but blank billing → null (never persist a bare " · ")
  const blank = mapTaxDocColumns({ taxDocPref: "tax_invoice", taxDocTaxId: "", taxDocBillingName: "", taxDocAddress: "" });
  is("map: tax_invoice blank tax_id → null", blank.tax_doc_tax_id, null);
  is("map: tax_invoice blank billing → null (not '·')", blank.tax_doc_address, null);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
