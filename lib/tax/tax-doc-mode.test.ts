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

// ── customs (ใบขน): VAT on SERVICE FEE only — goods EXCLUDED from VAT base ──
{
  const t = computeTaxForMode("customs", shopParts, { isJuristic: true });
  // VAT base = service(200) + dom transport(500) = 700 (goods 10000 & intl 1000 excluded)
  eq("ใบขน: base.total unchanged (11700)", t.base.total, 11700);
  eq("ใบขน: vatable = 700 (service+dom, goods+intl excluded)", t.base.vatable, 700);
  eq("ใบขน: VAT 7% of 700 = 49", t.vat, 49);
  // WHT identical to ใบกำกับ — WHT does not depend on doc mode
  eq("ใบขน: WHT total = 21 (same as ใบกำกับ)", t.wht.total, 21);
  // gross = base.total(11700) + customs VAT(49)
  eq("ใบขน: grossBeforeWht = 11700+49", t.grossBeforeWht, 11749);
  eq("ใบขน: netPayable = 11749-21", t.netPayable, 11728);
}

// ── customs VAT < tax_invoice VAT (goods excluded) — the load-bearing diff ──
{
  const ti = computeTaxForMode("tax_invoice", shopParts, { isJuristic: true });
  const cu = computeTaxForMode("customs", shopParts, { isJuristic: true });
  const ok = cu.vat < ti.vat;
  console.log(`${ok ? "✓" : "✗"} customs VAT (${cu.vat}) < tax_invoice VAT (${ti.vat})`);
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

// ── customs with NO goods (pure service order) == tax_invoice (no goods to exclude) ──
{
  const svcOnly: ModeTaxableParts = {
    transportDomestic: 0, transportIntl: 0, service: 1000, rental: 0, goods: 0, discount: 0,
  };
  const ti = computeTaxForMode("tax_invoice", svcOnly, { isJuristic: true });
  const cu = computeTaxForMode("customs", svcOnly, { isJuristic: true });
  eq("no-goods: tax_invoice VAT == customs VAT (70)", ti.vat, cu.vat);
  eq("no-goods: customs VAT 7% of 1000", cu.vat, 70);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
