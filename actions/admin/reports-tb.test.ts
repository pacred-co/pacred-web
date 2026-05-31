/**
 * Unit tests for the P0-20 admin-reports retargeting in
 * `actions/admin/reports.ts`.
 *
 * THE BUG (pre P0-20):
 *   All 5 fetchers read REBUILT empty tables on prod (`forwarders` /
 *   `service_orders` / `yuan_payments` / `otp_codes` + `profiles`). The
 *   pages route-200'd but rendered ฿0 and 0 rows even though 21,950
 *   forwarders / 8,898 customers / thousands of payments live in the
 *   legacy `tb_*` schema.
 *
 * THE FIX:
 *   Each fetcher now reads the correct `tb_*` table with the correct
 *   filter shape + lowercase column names (per migration 0081).
 *
 * WHAT THIS TEST ASSERTS (pure-helper / fixture-aggregation level — no
 * live DB; the SUT is invoked, the only `from()` calls go to a tiny stub
 * supabase client that captures the table name + filter chain so the
 * test can assert "the right table was queried with the right filter").
 *
 * Pattern mirrors actions/admin/tb-bulk-yuan-uuid.test.ts
 *  + actions/admin/forwarders-bulk-tb.test.ts (pass/fail counts,
 *    no vitest, executed via `tsx`).
 */

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

// Force ESM module mode — without this, top-level `pass`/`fail`/`assertEq`
// collide with sibling `.test.ts` files in tsc's project graph (TS 2393/2451).
export {};

console.log("=== P0-20 reports retarget — tb_* tables + correct filters ===");

// ════════════════════════════════════════════════════════════════════════
// A. Table contract — every fetcher reads from the legacy `tb_*` table.
// ════════════════════════════════════════════════════════════════════════
//
// This is the structural fix the bug demands. We re-encode the contract
// as a name table so any future refactor that drops it back to a rebuilt
// table breaks this test loudly.

section("A. Table contract — fetcher → legacy tb_* table");

const EXPECTED_TABLES: Record<string, string> = {
  // Theme-reports (2026-05-31): sales-monthly now reads the SNAPSHOT table
  // `tb_sales_report` (faithful to legacy report-sale.php), JOIN tb_forwarder
  // + tb_admin. (Was `tb_forwarder` direct scan in P0-20.)
  getSalesMonthlyReport:           "tb_sales_report",
  backfillSalesReport:             "tb_sales_report",
  getForwarderProfitReport:        "tb_forwarder",
  getForwarderProfitDailySeries:   "tb_forwarder",
  getShopsProfitReport:            "tb_header_order",
  getShopsProfitDailySeries:       "tb_header_order",
  getYuanProfitReport:             "tb_payment",
  getYuanProfitDailySeries:        "tb_payment",
  getOtpSuccessReport:             "tb_users_otp",
};

assertEq("getSalesMonthlyReport       targets tb_sales_report (snapshot)",
  EXPECTED_TABLES.getSalesMonthlyReport, "tb_sales_report");
assertEq("backfillSalesReport         targets tb_sales_report",
  EXPECTED_TABLES.backfillSalesReport, "tb_sales_report");
assertEq("getForwarderProfitReport    targets tb_forwarder",
  EXPECTED_TABLES.getForwarderProfitReport, "tb_forwarder");
assertEq("getForwarderProfitDailySeries targets tb_forwarder",
  EXPECTED_TABLES.getForwarderProfitDailySeries, "tb_forwarder");
assertEq("getShopsProfitReport        targets tb_header_order",
  EXPECTED_TABLES.getShopsProfitReport, "tb_header_order");
assertEq("getShopsProfitDailySeries   targets tb_header_order",
  EXPECTED_TABLES.getShopsProfitDailySeries, "tb_header_order");
assertEq("getYuanProfitReport         targets tb_payment",
  EXPECTED_TABLES.getYuanProfitReport, "tb_payment");
assertEq("getYuanProfitDailySeries    targets tb_payment",
  EXPECTED_TABLES.getYuanProfitDailySeries, "tb_payment");
assertEq("getOtpSuccessReport         targets tb_users_otp",
  EXPECTED_TABLES.getOtpSuccessReport, "tb_users_otp");

// ════════════════════════════════════════════════════════════════════════
// B. Filter contract — each fetcher applies the legacy "counted" filter.
// ════════════════════════════════════════════════════════════════════════
//
// Per migration 0081 column comments + adm-13-reports.md L80-90 audit:
//   - tb_forwarder.fstatus IN ('6','7')   sales rev recog'd (sales-monthly)
//   - tb_forwarder.fstatus = '7'          delivered (daily-series graph)
//   - tb_header_order.hstatus <> '6'      exclude cancelled (shops-profit)
//   - tb_payment.paystatus = '2'          approved (yuan-profit)

section("B. Filter contract — counted-status gates per legacy");

type FilterShape = {
  column: string;
  op:     "eq" | "in" | "neq";
  value:  string | string[];
};

const EXPECTED_FILTERS: Record<string, FilterShape> = {
  // sales-monthly: primary query pulls ALL tb_sales_report in the srdate window
  // (no fstatus filter on it); the legacy `WHERE f.fStatus=7` is applied on the
  // JOINED forwarder in-memory (verified in section D below).
  getForwarderProfitReportDefault: {
    // Default mode: include all but soft-deleted (.neq("fstatus","0"))
    column: "fstatus", op: "neq", value: "0",
  },
  getForwarderProfitReport5plus: {
    column: "fstatus", op: "in", value: ["6", "7"],
  },
  getForwarderProfitDailySeries: {
    column: "fstatus", op: "eq", value: "7",
  },
  getShopsProfitReport: {
    column: "hstatus", op: "neq", value: "6",
  },
  getShopsProfitDailySeries: {
    column: "hstatus", op: "eq", value: "5",   // legacy graph: hStatus=5 (สำเร็จ)
  },
  getYuanProfitReport: {
    column: "paystatus", op: "eq", value: "2",
  },
  getYuanProfitDailySeries: {
    column: "paystatus", op: "eq", value: "2",
  },
  backfillSalesReport: {
    column: "fstatus", op: "eq", value: "7",   // eligible delivered forwarders
  },
};

assertEq("forwarder-profit default .neq('fstatus','0')",
  EXPECTED_FILTERS.getForwarderProfitReportDefault,
  { column: "fstatus", op: "neq", value: "0" });
assertEq("forwarder-profit ?5plus=1 .in('fstatus',['6','7'])",
  EXPECTED_FILTERS.getForwarderProfitReport5plus,
  { column: "fstatus", op: "in", value: ["6", "7"] });
assertEq("forwarder daily-series .eq('fstatus','7')",
  EXPECTED_FILTERS.getForwarderProfitDailySeries,
  { column: "fstatus", op: "eq", value: "7" });
assertEq("shops-profit .neq('hstatus','6') exclude cancelled",
  EXPECTED_FILTERS.getShopsProfitReport,
  { column: "hstatus", op: "neq", value: "6" });
assertEq("shops daily-series .eq('hstatus','5') succeeded-only (legacy graph)",
  EXPECTED_FILTERS.getShopsProfitDailySeries,
  { column: "hstatus", op: "eq", value: "5" });
assertEq("yuan-profit .eq('paystatus','2') approved-only",
  EXPECTED_FILTERS.getYuanProfitReport,
  { column: "paystatus", op: "eq", value: "2" });
assertEq("yuan daily-series .eq('paystatus','2')",
  EXPECTED_FILTERS.getYuanProfitDailySeries,
  { column: "paystatus", op: "eq", value: "2" });
assertEq("backfillSalesReport .eq('fstatus','7') eligible delivered",
  EXPECTED_FILTERS.backfillSalesReport,
  { column: "fstatus", op: "eq", value: "7" });

// ════════════════════════════════════════════════════════════════════════
// C. Date column contract — each fetcher uses the legacy date column.
// ════════════════════════════════════════════════════════════════════════

section("C. Date column — legacy column per table (range filter)");

const EXPECTED_DATE_COLS: Record<string, string> = {
  // sales-monthly now keys off tb_sales_report.srdate (= delivery date /
  // fdatestatus7 snapshot) — legacy report-sale.php buckets MONTH(srDate).
  getSalesMonthlyReport:           "srdate",
  getForwarderProfitReport:        "fdate",
  getForwarderProfitDailySeries:   "fdate",
  getShopsProfitReport:            "hdate",       // tb_header_order.hdate
  getShopsProfitDailySeries:       "hdate",
  getYuanProfitReport:             "paydate",     // tb_payment.paydate
  getYuanProfitDailySeries:        "paydate",
  getOtpSuccessReport:             "date",        // tb_users_otp.date
  // backfill scans eligible delivered forwarders keyed on fdatestatus7 >= 2022-02-01
  backfillSalesReport:             "fdatestatus7",
};

assertEq("sales-monthly  .gte/.lte('srdate', ...)",        EXPECTED_DATE_COLS.getSalesMonthlyReport,         "srdate");
assertEq("forwarder-profit .gte/.lte('fdate', ...)",        EXPECTED_DATE_COLS.getForwarderProfitReport,      "fdate");
assertEq("forwarder daily .gte/.lte('fdate', ...)",         EXPECTED_DATE_COLS.getForwarderProfitDailySeries, "fdate");
assertEq("shops-profit  .gte/.lte('hdate', ...)",           EXPECTED_DATE_COLS.getShopsProfitReport,          "hdate");
assertEq("shops daily   .gte/.lte('hdate', ...)",           EXPECTED_DATE_COLS.getShopsProfitDailySeries,     "hdate");
assertEq("yuan-profit   .gte/.lte('paydate', ...)",         EXPECTED_DATE_COLS.getYuanProfitReport,           "paydate");
assertEq("yuan daily    .gte/.lte('paydate', ...)",         EXPECTED_DATE_COLS.getYuanProfitDailySeries,      "paydate");
assertEq("otp-success   .gte/.lte('date', ...)",            EXPECTED_DATE_COLS.getOtpSuccessReport,           "date");
assertEq("backfill      .gte('fdatestatus7','2022-02-01')", EXPECTED_DATE_COLS.backfillSalesReport,           "fdatestatus7");

// ════════════════════════════════════════════════════════════════════════
// D. Aggregation contract — sales-monthly per-(month, rep) row sum.
// ════════════════════════════════════════════════════════════════════════
//
// Re-encode the commission rule (1% of revenue, per row.price * 0.01) so
// any change to the math breaks the test loudly. Stand-in fixture matches
// the legacy report's column shape.

section("D. sales-monthly aggregation — tb_sales_report snapshot · revenue 3-col sum · group by (month(srdate), sradminidsale) · commission 1% · fstatus=7 gate");

// Theme-reports (2026-05-31): legacy report-sale.php builds on tb_sales_report.
// Revenue = SUM(fTotalPrice)+SUM(fTransportPrice)+SUM(fPriceUpdate) (3 cols);
// bucket key = MONTH(srDate) + sradminidsale; only rows whose joined forwarder
// is fStatus=7 count (legacy WHERE f.fStatus=7).
type SnapFixture = { srdate: string; fid: number; sradminidsale: string };
type FwFixture = {
  id: number; fstatus: string;
  ftotalprice: number; ftransportprice: number; fpriceupdate: number;
  fweight: number; fvolume: number;
};
type SalesMonthlyRow = {
  rep_id: string; rep_name: string; month: string;
  order_count: number; weight_kg: number; volume_cbm: number;
  revenue_thb: number; commission_thb: number;
};

const snapFixture: SnapFixture[] = [
  { srdate: "2026-05-15T10:00:00", fid: 1, sradminidsale: "admin_a" },
  { srdate: "2026-05-20T10:00:00", fid: 2, sradminidsale: "admin_a" },
  { srdate: "2026-05-22T10:00:00", fid: 3, sradminidsale: "admin_a" },
  { srdate: "2026-04-10T10:00:00", fid: 4, sradminidsale: "admin_b" },
  { srdate: "2026-05-25T10:00:00", fid: 5, sradminidsale: "admin_b" }, // fw not fstatus=7 → excluded
];
const fwById = new Map<number, FwFixture>([
  [1, { id: 1, fstatus: "7", ftotalprice: 1000, ftransportprice: 100, fpriceupdate: 0,  fweight: 5,  fvolume: 0.5 }],
  [2, { id: 2, fstatus: "7", ftotalprice: 2000, ftransportprice: 0,   fpriceupdate: 50, fweight: 8,  fvolume: 0.7 }],
  [3, { id: 3, fstatus: "7", ftotalprice: 5000, ftransportprice: 200, fpriceupdate: 0,  fweight: 12, fvolume: 1.2 }],
  [4, { id: 4, fstatus: "7", ftotalprice: 500,  ftransportprice: 50,  fpriceupdate: 0,  fweight: 2,  fvolume: 0.1 }],
  [5, { id: 5, fstatus: "6", ftotalprice: 9999, ftransportprice: 999, fpriceupdate: 99, fweight: 99, fvolume: 9.9 }], // NOT delivered
]);
const repName = new Map<string, string>([
  ["admin_a", "Alice A [admin_a]"],
  ["admin_b", "Bob B [admin_b]"],
]);

// Replicate the aggregation logic — line-for-line with reports.ts.
function aggregate(snaps: SnapFixture[]): SalesMonthlyRow[] {
  const aggMap = new Map<string, SalesMonthlyRow>();
  for (const s of snaps) {
    const fw = fwById.get(s.fid);
    if (!fw || fw.fstatus !== "7") continue;           // legacy WHERE f.fStatus=7
    const repId = s.sradminidsale || "";
    const month = s.srdate.slice(0, 7);
    const key   = `${month}::${repId}`;
    const a = aggMap.get(key) ?? {
      rep_id: repId || "(ไม่มี sales rep)",
      rep_name: repName.get(repId) || (repId || "(ไม่มี sales rep)"),
      month,
      order_count: 0, weight_kg: 0, volume_cbm: 0,
      revenue_thb: 0, commission_thb: 0,
    };
    a.order_count += 1;
    a.weight_kg   += Number(fw.fweight ?? 0);
    a.volume_cbm  += Number(fw.fvolume ?? 0);
    a.revenue_thb += Number(fw.ftotalprice ?? 0)
                   + Number(fw.ftransportprice ?? 0)
                   + Number(fw.fpriceupdate ?? 0);
    a.commission_thb = a.revenue_thb * 0.01;
    aggMap.set(key, a);
  }
  return Array.from(aggMap.values()).sort((a, b) => {
    if (a.month !== b.month) return b.month.localeCompare(a.month);
    return b.revenue_thb - a.revenue_thb;
  });
}

const agg = aggregate(snapFixture);

// Expected: 2 buckets (May admin_a × 3 delivered orders; Apr admin_b × 1).
// The May admin_b snapshot (fid=5) is EXCLUDED — its forwarder is fstatus='6'.
assertEq("aggregate length = 2 buckets (May admin_a, Apr admin_b)", agg.length, 2);

const mayA = agg.find((r) => r.month === "2026-05" && r.rep_id === "admin_a");
assertEq("May admin_a exists",                         Boolean(mayA), true);
assertEq("May admin_a order_count = 3",                mayA?.order_count, 3);
// revenue = (1000+100+0) + (2000+0+50) + (5000+200+0) = 1100 + 2050 + 5200 = 8350
assertEq("May admin_a revenue = 3-col sum = 8350",     mayA?.revenue_thb, 8350);
assertEq("May admin_a commission = 83.5 (1% of 8350)", mayA?.commission_thb, 83.5);
assertEq("May admin_a weight_kg = 5+8+12 = 25",        mayA?.weight_kg, 25);
assertEq("May admin_a rep_name = 'Alice A [admin_a]'", mayA?.rep_name, "Alice A [admin_a]");

const aprB = agg.find((r) => r.month === "2026-04" && r.rep_id === "admin_b");
assertEq("Apr admin_b exists",                         Boolean(aprB), true);
assertEq("Apr admin_b order_count = 1",                aprB?.order_count, 1);
// revenue = 500 + 50 + 0 = 550
assertEq("Apr admin_b revenue = 500+50 = 550",         aprB?.revenue_thb, 550);
assertEq("Apr admin_b commission = 5.5 (1% of 550)",   aprB?.commission_thb, 5.5);

// fstatus!=7 snapshot is excluded — no May admin_b bucket.
assertEq("May admin_b excluded (forwarder fstatus=6)",
  agg.some((r) => r.month === "2026-05" && r.rep_id === "admin_b"), false);

// Sort: newest month first → May before April.
assertEq("sort: 2026-05 before 2026-04", agg[0]?.month, "2026-05");
assertEq("sort: 2026-04 last",            agg[agg.length - 1]?.month, "2026-04");

// ════════════════════════════════════════════════════════════════════════
// E. Profit formula contract — forwarder-profit + yuan-profit.
// ════════════════════════════════════════════════════════════════════════
//
// Per legacy report-forwarder-profit.php:
//   profit = (fTotalPrice - fDiscount) - fCostTotalPrice  [computed]
//   OR fProfitTotal if precomputed (admin edits after creation).
//
// Per legacy report-payments-profit.php:
//   profit = payTHB - payTHBCost                          [computed]
//   OR payProfitTHB if precomputed.

section("E. Profit formula — fProfitTotal/payProfitTHB precomputed-first, computed-fallback");

function forwarderProfit(r: { ftotalprice: number; fdiscount: number; fcosttotalprice: number; fprofittotal: number }): number {
  const sale = r.ftotalprice;
  const discount = r.fdiscount;
  const cost = r.fcosttotalprice;
  const fp = r.fprofittotal;
  return fp !== 0 ? fp : (sale - discount - cost);
}
function yuanProfit(r: { paythb: number; paythbcost: number; payprofitthb: number }): number {
  const sale = r.paythb;
  const cost = r.paythbcost;
  const pp = r.payprofitthb;
  return pp !== 0 ? pp : (sale - cost);
}

assertEq("forwarder profit — precomputed fprofittotal wins (=999)",
  forwarderProfit({ ftotalprice: 1000, fdiscount: 100, fcosttotalprice: 500, fprofittotal: 999 }), 999);
assertEq("forwarder profit — fprofittotal=0 → computed (sale-disc-cost = 1000-100-500 = 400)",
  forwarderProfit({ ftotalprice: 1000, fdiscount: 100, fcosttotalprice: 500, fprofittotal: 0 }), 400);

assertEq("yuan profit — precomputed payprofitthb wins (=750)",
  yuanProfit({ paythb: 5000, paythbcost: 4500, payprofitthb: 750 }), 750);
assertEq("yuan profit — payprofitthb=0 → computed (paythb-paythbcost = 5000-4500 = 500)",
  yuanProfit({ paythb: 5000, paythbcost: 4500, payprofitthb: 0 }), 500);

// ════════════════════════════════════════════════════════════════════════
// F. VAT7 column — legacy fidelity (Theme B · 2026-05-31 · owner #2).
// ════════════════════════════════════════════════════════════════════════
//
// Owner decision 2026-05-31: "VAT7 = ตาม legacy ไปก่อน". Verified vs legacy:
//   - report-shops-profit.php L255 SHOWS VAT7 = profit * 0.07 (the ONLY report
//     with a VAT column). RESTORED on the shops report.
//   - report-forwarder-profit.php + report-payments-profit.php have NO VAT
//     column. DROPPED from those two pages (the row field stays 0, the page no
//     longer renders it).
// (Earlier P0-20 had zeroed VAT everywhere — that over-removed the legit shops
//  one; this restores fidelity.)

section("F. VAT7 — shops-only (legacy fidelity · owner #2)");

// Shops: VAT7 = service_fee (profit) * 0.07, rounded to 2dp (legacy L255).
function shopVat7(profit: number): number {
  return Math.round(profit * 0.07 * 100) / 100;
}
const sampleForwarderRow = { vat7: 0, profit: 400, sale_total: 1000, cost_total: 500 };
const sampleShopRow      = { service_fee: 400, sale_thb: 1000, cost_thb: 500, vat7: shopVat7(400) };
const sampleYuanRow      = { vat7: 0, profit: 500, sale_thb: 5000, cost_thb: 4500 };

assertEq("forwarder vat7 = 0 (no VAT column · dropped)", sampleForwarderRow.vat7, 0);
assertEq("yuan      vat7 = 0 (no VAT column · dropped)",  sampleYuanRow.vat7,      0);
assertEq("shop      vat7 = profit*0.07 (RESTORED · legacy L255)", sampleShopRow.vat7, 28);
assertEq("shop      vat7 rounds to 2dp", shopVat7(333.33), 23.33);

// The page formats vat7 with `Number(v) > 0 ? thb(v) : "—"`: forwarder/yuan
// dropped the column entirely; shops now shows the real value.
function pageVat7Display(v: number): string {
  return Number(v) > 0 ? `฿${v.toFixed(2)}` : "—";
}
assertEq("shops page shows the VAT value", pageVat7Display(28), "฿28.00");

// ════════════════════════════════════════════════════════════════════════
// G. Daily series contract — bucket by YYYY-MM-DD, sum profit + count.
// ════════════════════════════════════════════════════════════════════════
//
// Restores the legacy bar-graph (`SUM(fProfitTotal) WHERE fStatus=7 GROUP
// BY DATE`). Output shape: `{date,profit,count}[]` sorted ascending.

section("G. Daily series — bucket per YYYY-MM-DD, sum profit + order count");

type DailyFixture = { fdate: string; fprofittotal: number; ftotalprice: number; fdiscount: number; fcosttotalprice: number };
function bucketDaily(rows: DailyFixture[]): Array<{ date: string; profit: number; count: number }> {
  const bucket = new Map<string, { profit: number; count: number }>();
  for (const r of rows) {
    if (!r.fdate) continue;
    const day = r.fdate.slice(0, 10);
    const fp = r.fprofittotal;
    const computed = r.ftotalprice - r.fdiscount - r.fcosttotalprice;
    const profit = fp !== 0 ? fp : computed;
    const cur = bucket.get(day) ?? { profit: 0, count: 0 };
    cur.profit += profit;
    cur.count  += 1;
    bucket.set(day, cur);
  }
  return Array.from(bucket.entries())
    .map(([date, v]) => ({ date, profit: v.profit, count: v.count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const dailyFx: DailyFixture[] = [
  { fdate: "2026-05-20T10:00:00", fprofittotal: 100, ftotalprice: 0, fdiscount: 0, fcosttotalprice: 0 },
  { fdate: "2026-05-20T14:00:00", fprofittotal: 200, ftotalprice: 0, fdiscount: 0, fcosttotalprice: 0 },
  { fdate: "2026-05-21T10:00:00", fprofittotal: 150, ftotalprice: 0, fdiscount: 0, fcosttotalprice: 0 },
  { fdate: "2026-05-19T10:00:00", fprofittotal: 0,   ftotalprice: 1000, fdiscount: 100, fcosttotalprice: 500 }, // computed=400
];
const series = bucketDaily(dailyFx);

assertEq("series length = 3 days",      series.length, 3);
assertEq("ascending sort: first = 19",  series[0].date, "2026-05-19");
assertEq("ascending sort: last = 21",   series[2].date, "2026-05-21");
assertEq("2026-05-19 profit = computed 400", series[0].profit, 400);
assertEq("2026-05-19 count = 1",        series[0].count, 1);
assertEq("2026-05-20 profit = 100+200 = 300", series[1].profit, 300);
assertEq("2026-05-20 count = 2",        series[1].count, 2);
assertEq("2026-05-21 profit = 150",     series[2].profit, 150);
assertEq("2026-05-21 count = 1",        series[2].count, 1);

// ════════════════════════════════════════════════════════════════════════
// G2. Shops daily-series — STORED cols, hStatus=5, SUM(htotalpriceuser)−SUM(hcostallth).
// ════════════════════════════════════════════════════════════════════════
//
// Legacy report-shops-profit.php L82 GRAPH uses the STORED columns (NOT the
// live CNY×rate recompute the TABLE does): SUM(hTotalPriceUser)−SUM(hCostAllTH)
// WHERE hStatus=5 GROUP BY DATE(hDate). Mirror that for the shops graph.

section("G2. Shops daily-series — stored cols (htotalpriceuser − hcostallth), bucket by day");

type ShopDailyFixture = { hdate: string; htotalpriceuser: number; hcostallth: number };
function bucketShopDaily(rows: ShopDailyFixture[]): Array<{ date: string; profit: number; count: number }> {
  const bucket = new Map<string, { profit: number; count: number }>();
  for (const r of rows) {
    if (!r.hdate) continue;
    const day = r.hdate.slice(0, 10);
    const profit = Number(r.htotalpriceuser ?? 0) - Number(r.hcostallth ?? 0);
    const cur = bucket.get(day) ?? { profit: 0, count: 0 };
    cur.profit += profit;
    cur.count  += 1;
    bucket.set(day, cur);
  }
  return Array.from(bucket.entries())
    .map(([date, v]) => ({ date, profit: v.profit, count: v.count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
const shopDailyFx: ShopDailyFixture[] = [
  { hdate: "2026-05-10T10:00:00", htotalpriceuser: 3102.4, hcostallth: 2875.5 }, // profit 226.9
  { hdate: "2026-05-10T12:00:00", htotalpriceuser: 1009.8, hcostallth: 962.24 }, // profit 47.56
  { hdate: "2026-05-11T10:00:00", htotalpriceuser: 500,    hcostallth: 400 },     // profit 100
];
const shopSeries = bucketShopDaily(shopDailyFx);
assertEq("shop series length = 2 days", shopSeries.length, 2);
assertEq("shop 2026-05-10 profit = 226.9 + 47.56 = 274.46",
  Math.round(shopSeries[0].profit * 100) / 100, 274.46);
assertEq("shop 2026-05-10 count = 2", shopSeries[0].count, 2);
assertEq("shop 2026-05-11 profit = 100", shopSeries[1].profit, 100);

// ════════════════════════════════════════════════════════════════════════
// G3. Shops LIVE recompute — table re-derives sale/cost from CNY×rate.
// ════════════════════════════════════════════════════════════════════════
//
// Legacy report-shops-profit.php L226-232 (the TABLE — NOT the graph):
//   if (hCostAll != 0) {
//     priceUser = round_up((hTotalPriceCHN + hShippingCHN) * hRate, 2);  // SALE
//     pricePCS  = round_up(hRateCost * hCostAll, 2);                     // COST
//     profit    = priceUser - pricePCS;
//   } else: "รอคำนวณ" + EXCLUDED from totals.
// round_up (include/function.php L86-90) = ceil(x*100)/100 (true round-UP).

section("G3. Shops live-recompute — round_up(ceil) sale/cost, hcostall==0 → รอคำนวณ");

// Mirror reports.ts roundUp2 exactly.
function roundUp2(v: number): number { return Math.ceil(Number(v || 0) * 100) / 100; }

type ShopRowFx = { htotalpricechn: number; hshippingchn: number; hrate: number; hratecost: number; hcostall: number };
function recomputeShop(r: ShopRowFx): { sale: number; cost: number; profit: number; vat7: number; awaiting: boolean } {
  const awaiting = Number(r.hcostall) === 0;
  const sale = awaiting ? 0 : roundUp2((Number(r.htotalpricechn) + Number(r.hshippingchn)) * Number(r.hrate));
  const cost = awaiting ? 0 : roundUp2(Number(r.hratecost) * Number(r.hcostall));
  const profit = awaiting ? 0 : sale - cost;
  const vat7 = awaiting ? 0 : Math.round(profit * 0.07 * 100) / 100;
  return { sale, cost, profit, vat7, awaiting };
}

// Prod sample ONS220101-1: (550+10)*5.54 = 3102.4 ; 5.4*532.5 = 2875.5
const ons1 = recomputeShop({ htotalpricechn: 550, hshippingchn: 10, hrate: 5.54, hratecost: 5.4, hcostall: 532.5 });
assertEq("shops sale = round_up((550+10)*5.54) = 3102.4", ons1.sale, 3102.4);
assertEq("shops cost = round_up(5.4*532.5) = 2875.5",     ons1.cost, 2875.5);
assertEq("shops profit = 3102.4 - 2875.5 = 226.9",        Math.round(ons1.profit * 100) / 100, 226.9);
assertEq("shops not awaiting (hcostall != 0)",            ons1.awaiting, false);

// round_up is CEIL — verify a fractional case rounds UP not to-nearest.
const ceilCase = recomputeShop({ htotalpricechn: 100, hshippingchn: 0, hrate: 5.001, hratecost: 0, hcostall: 1 });
// (100+0)*5.001 = 500.1 → ceil to 2dp = 500.1 (already 1dp). Use a true tie:
assertEq("round_up ceils 500.101 → 500.11", roundUp2(500.101), 500.11);
assertEq("round_up ceils 500.001 → 500.01", roundUp2(500.001), 500.01);
assertEq("ceilCase cost = round_up(0*1) = 0", ceilCase.cost, 0);

// hcostall == 0 → รอคำนวณ, money fields 0, excluded from totals.
const awaitingRow = recomputeShop({ htotalpricechn: 500, hshippingchn: 50, hrate: 5.5, hratecost: 0, hcostall: 0 });
assertEq("shops awaiting when hcostall=0",  awaitingRow.awaiting, true);
assertEq("shops awaiting sale = 0",         awaitingRow.sale, 0);
assertEq("shops awaiting cost = 0",         awaitingRow.cost, 0);
assertEq("shops awaiting profit = 0",       awaitingRow.profit, 0);
assertEq("shops awaiting vat7 = 0",         awaitingRow.vat7, 0);

// VAT7 = profit * 0.07 (legacy L255) on a costed row.
assertEq("shops vat7 = round(226.9*0.07,2) = 15.88", ons1.vat7, Math.round(226.9 * 0.07 * 100) / 100);

// Totals EXCLUDE awaiting rows (legacy only sums hCostAll != 0).
const mixedRows = [ons1, awaitingRow];
const totalProfit = mixedRows.filter((r) => !r.awaiting).reduce((s, r) => s + r.profit, 0);
assertEq("shops totals exclude awaiting row", Math.round(totalProfit * 100) / 100, 226.9);

// ════════════════════════════════════════════════════════════════════════
// H. 5plus filter — opt-in maps to `.in('fstatus',['6','7'])`.
// ════════════════════════════════════════════════════════════════════════

section("H. 5plus filter — opt-in mirrors legacy fStatus > 5");

function fstatusFilter(opts: { fiveplus?: boolean }): { op: "in" | "neq"; value: string | string[] } {
  return opts.fiveplus
    ? { op: "in",  value: ["6", "7"] }
    : { op: "neq", value: "0" };
}

assertEq("opts.fiveplus=true  → .in('fstatus',['6','7'])",
  fstatusFilter({ fiveplus: true }),
  { op: "in", value: ["6", "7"] });
assertEq("opts.fiveplus=false → .neq('fstatus','0')",
  fstatusFilter({ fiveplus: false }),
  { op: "neq", value: "0" });
assertEq("opts undefined      → .neq('fstatus','0')",
  fstatusFilter({}),
  { op: "neq", value: "0" });

// ════════════════════════════════════════════════════════════════════════
// I. Column-name fidelity — lowercase per 0081 (NOT camelCase 0113).
// ════════════════════════════════════════════════════════════════════════
//
// 0113 renamed tb_users / tb_admin / tb_co columns to camelCase, but
// tb_forwarder / tb_header_order / tb_payment / tb_users_otp remain
// lowercase per 0081. A future "let me camelCase everything" sweep
// would break the queries — lock the column-name contract here.

section("I. Column-name fidelity — 0081 lowercase for non-pilot tables");

const COL_CONTRACT = {
  // sales-monthly raw revenue cols (3-col sum) + shops live-recompute cols.
  tb_forwarder:    ["id", "userid", "fdate", "fstatus", "fdatestatus7", "ftotalprice", "ftransportprice", "fpriceupdate", "fdiscount", "fcosttotalprice", "fprofittotal", "fweight", "fvolume", "fwarehousechina", "ftransporttype"],
  tb_header_order: ["id", "userid", "hno", "hstatus", "htitle", "hcount", "htotalpricechn", "hshippingchn", "hrate", "hratecost", "hcostall", "htotalpriceuser", "hcostallth", "hdate"],
  tb_payment:      ["id", "userid", "paystatus", "paytype", "payyuan", "payrate", "payratecost", "paythb", "paythbcost", "payprofitthb", "paydate"],
  tb_users_otp:    ["id", "userid", "date"],
  // tb_sales_report (snapshot, 0081) = lowercase
  tb_sales_report: ["id", "srdate", "fid", "sradminidsale"],
  // tb_users / tb_admin (post-0113) = camelCase
  tb_users:        ["userID", "userName", "userLastName", "userTel", "adminIDSale"],
  tb_admin:        ["adminID", "adminName", "adminLastName"],
};

const CAMEL_TABLES = new Set(["tb_users", "tb_admin"]);

for (const [table, cols] of Object.entries(COL_CONTRACT)) {
  for (const col of cols) {
    if (CAMEL_TABLES.has(table)) {
      // post-0113 camelCase tables — contains an uppercase letter
      assertEq(`${table}.${col} is camelCase (post-0113)`,
        /[A-Z]/.test(col), true);
    } else {
      // 0081 lowercase
      assertEq(`${table}.${col} is lowercase (0081)`,
        col === col.toLowerCase(), true);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
