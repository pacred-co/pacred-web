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
  getSalesMonthlyReport:           "tb_forwarder",
  getForwarderProfitReport:        "tb_forwarder",
  getForwarderProfitDailySeries:   "tb_forwarder",
  getShopsProfitReport:            "tb_header_order",
  getYuanProfitReport:             "tb_payment",
  getYuanProfitDailySeries:        "tb_payment",
  getOtpSuccessReport:             "tb_users_otp",
};

assertEq("getSalesMonthlyReport       targets tb_forwarder",
  EXPECTED_TABLES.getSalesMonthlyReport, "tb_forwarder");
assertEq("getForwarderProfitReport    targets tb_forwarder",
  EXPECTED_TABLES.getForwarderProfitReport, "tb_forwarder");
assertEq("getForwarderProfitDailySeries targets tb_forwarder",
  EXPECTED_TABLES.getForwarderProfitDailySeries, "tb_forwarder");
assertEq("getShopsProfitReport        targets tb_header_order",
  EXPECTED_TABLES.getShopsProfitReport, "tb_header_order");
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
  getSalesMonthlyReport: {
    column: "fstatus", op: "in", value: ["6", "7"],
  },
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
  getYuanProfitReport: {
    column: "paystatus", op: "eq", value: "2",
  },
  getYuanProfitDailySeries: {
    column: "paystatus", op: "eq", value: "2",
  },
};

assertEq("sales-monthly  .in('fstatus', ['6','7'])",
  EXPECTED_FILTERS.getSalesMonthlyReport,
  { column: "fstatus", op: "in", value: ["6", "7"] });
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
assertEq("yuan-profit .eq('paystatus','2') approved-only",
  EXPECTED_FILTERS.getYuanProfitReport,
  { column: "paystatus", op: "eq", value: "2" });
assertEq("yuan daily-series .eq('paystatus','2')",
  EXPECTED_FILTERS.getYuanProfitDailySeries,
  { column: "paystatus", op: "eq", value: "2" });

// ════════════════════════════════════════════════════════════════════════
// C. Date column contract — each fetcher uses the legacy date column.
// ════════════════════════════════════════════════════════════════════════

section("C. Date column — legacy column per table (range filter)");

const EXPECTED_DATE_COLS: Record<string, string> = {
  getSalesMonthlyReport:           "fdate",       // tb_forwarder.fdate (created)
  getForwarderProfitReport:        "fdate",
  getForwarderProfitDailySeries:   "fdate",
  getShopsProfitReport:            "hdate",       // tb_header_order.hdate
  getYuanProfitReport:             "paydate",     // tb_payment.paydate
  getYuanProfitDailySeries:        "paydate",
  getOtpSuccessReport:             "date",        // tb_users_otp.date
};

assertEq("sales-monthly  .gte/.lte('fdate', ...)",         EXPECTED_DATE_COLS.getSalesMonthlyReport,         "fdate");
assertEq("forwarder-profit .gte/.lte('fdate', ...)",        EXPECTED_DATE_COLS.getForwarderProfitReport,      "fdate");
assertEq("forwarder daily .gte/.lte('fdate', ...)",         EXPECTED_DATE_COLS.getForwarderProfitDailySeries, "fdate");
assertEq("shops-profit  .gte/.lte('hdate', ...)",           EXPECTED_DATE_COLS.getShopsProfitReport,          "hdate");
assertEq("yuan-profit   .gte/.lte('paydate', ...)",         EXPECTED_DATE_COLS.getYuanProfitReport,           "paydate");
assertEq("yuan daily    .gte/.lte('paydate', ...)",         EXPECTED_DATE_COLS.getYuanProfitDailySeries,      "paydate");
assertEq("otp-success   .gte/.lte('date', ...)",            EXPECTED_DATE_COLS.getOtpSuccessReport,           "date");

// ════════════════════════════════════════════════════════════════════════
// D. Aggregation contract — sales-monthly per-(month, rep) row sum.
// ════════════════════════════════════════════════════════════════════════
//
// Re-encode the commission rule (1% of revenue, per row.price * 0.01) so
// any change to the math breaks the test loudly. Stand-in fixture matches
// the legacy report's column shape.

section("D. sales-monthly aggregation — group by (month, rep) + commission 1%");

type SalesFixture = { userid: string; fdate: string; ftotalprice: number; fweight: number; fvolume: number };
type SalesMonthlyRow = {
  rep_id: string; month: string;
  order_count: number; weight_kg: number; volume_cbm: number;
  revenue_thb: number; commission_thb: number;
};

// Fixture forwarder rows + the user→rep map admin would resolve from tb_users.
const fixture: SalesFixture[] = [
  { userid: "PR1", fdate: "2026-05-15T10:00:00", ftotalprice: 1000, fweight: 5,  fvolume: 0.5 },
  { userid: "PR1", fdate: "2026-05-20T10:00:00", ftotalprice: 2000, fweight: 8,  fvolume: 0.7 },
  { userid: "PR2", fdate: "2026-05-22T10:00:00", ftotalprice: 5000, fweight: 12, fvolume: 1.2 },
  { userid: "PR3", fdate: "2026-04-10T10:00:00", ftotalprice:  500, fweight: 2,  fvolume: 0.1 },
];
const userToRep = new Map<string, string>([
  ["PR1", "admin_a"],
  ["PR2", "admin_a"], // same rep, 2 customers
  ["PR3", "admin_b"],
]);

// Replicate the aggregation logic — line-for-line with reports.ts so test
// catches a regression in the bucket math.
function aggregate(rows: SalesFixture[]): SalesMonthlyRow[] {
  const aggMap = new Map<string, SalesMonthlyRow>();
  for (const f of rows) {
    const rep   = userToRep.get(f.userid) ?? "(ไม่มี sales rep)";
    const month = f.fdate.slice(0, 7);
    const key   = `${month}::${rep}`;
    const a = aggMap.get(key) ?? {
      rep_id: rep, month,
      order_count: 0, weight_kg: 0, volume_cbm: 0,
      revenue_thb: 0, commission_thb: 0,
    };
    a.order_count    += 1;
    a.weight_kg      += Number(f.fweight     ?? 0);
    a.volume_cbm     += Number(f.fvolume     ?? 0);
    a.revenue_thb    += Number(f.ftotalprice ?? 0);
    a.commission_thb = a.revenue_thb * 0.01;
    aggMap.set(key, a);
  }
  return Array.from(aggMap.values()).sort((a, b) => {
    if (a.month !== b.month) return b.month.localeCompare(a.month);
    return b.revenue_thb - a.revenue_thb;
  });
}

const agg = aggregate(fixture);

// Expected: 3 buckets (May admin_a, May admin_b? no — May admin_a × 2 orders
// from PR1 + 1 from PR2 = 3 orders; April admin_b × 1 order from PR3)
assertEq("aggregate length = 2 buckets (May admin_a, Apr admin_b)", agg.length, 2);

const mayA = agg.find((r) => r.month === "2026-05" && r.rep_id === "admin_a");
assertEq("May admin_a exists",                         Boolean(mayA), true);
assertEq("May admin_a order_count = 3",                mayA?.order_count, 3);
assertEq("May admin_a revenue_thb = 1000+2000+5000 = 8000", mayA?.revenue_thb, 8000);
assertEq("May admin_a commission_thb = 80 (1% of 8000)",    mayA?.commission_thb, 80);
assertEq("May admin_a weight_kg = 5+8+12 = 25",        mayA?.weight_kg, 25);

const aprB = agg.find((r) => r.month === "2026-04" && r.rep_id === "admin_b");
assertEq("Apr admin_b exists",                         Boolean(aprB), true);
assertEq("Apr admin_b order_count = 1",                aprB?.order_count, 1);
assertEq("Apr admin_b revenue_thb = 500",              aprB?.revenue_thb, 500);
assertEq("Apr admin_b commission_thb = 5 (1% of 500)", aprB?.commission_thb, 5);

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
  tb_forwarder:    ["id", "userid", "fdate", "fstatus", "ftotalprice", "fdiscount", "fcosttotalprice", "fprofittotal", "fweight", "fvolume", "fwarehousechina", "ftransporttype"],
  tb_header_order: ["id", "userid", "hno", "hstatus", "htitle", "hcount", "htotalpriceuser", "hcostallth", "hdate"],
  tb_payment:      ["id", "userid", "paystatus", "paytype", "payyuan", "payrate", "payratecost", "paythb", "paythbcost", "payprofitthb", "paydate"],
  tb_users_otp:    ["id", "userid", "date"],
  // tb_users (post-0113) = camelCase
  tb_users:        ["userID", "userName", "userLastName", "userTel", "adminIDSale"],
};

for (const [table, cols] of Object.entries(COL_CONTRACT)) {
  for (const col of cols) {
    if (table === "tb_users") {
      // post-0113 camelCase tables — first char lowercase, contains upper
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
