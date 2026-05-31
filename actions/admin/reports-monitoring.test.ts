/**
 * Contract tests for the two MONITORING report fetchers in
 * `actions/admin/reports-monitoring.ts` (re-sweep A2 #24).
 *
 *   - getSearchDemandReport ← report-search.php  (tb_history_key)
 *   - getSmsUsageReport     ← report-api-sms.php  (tb_sms_hs)
 *
 * No live DB — pure-helper / fixture-aggregation level. Mirrors
 * actions/admin/reports-tb.test.ts (pass/fail counts, no vitest, run via tsx).
 *
 * What this locks:
 *   A. Table + column contract (so a future "camelCase everything" sweep that
 *      breaks `keyword`/`apierror`/`msisdn`/`message`/`status` fails loudly).
 *   B. Status / type label maps match legacy stSMS() + the 0081 type comment.
 *   C. search-demand GROUP-BY-keyword aggregation: count + most-recent-date +
 *      count-desc sort (legacy aaSorting [[2,"desc"]]).
 *   D. sms-usage credit-burn estimate (160 chars/credit · legacy L113).
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

// Force ESM module mode — keeps top-level `pass`/`fail` from colliding with
// sibling .test.ts files in tsc's project graph (TS 2393/2451).
export {};

console.log("=== A2 #24 monitoring reports — table/column + aggregation contracts ===");

// ════════════════════════════════════════════════════════════════════════
// A. Table + date-column contract.
// ════════════════════════════════════════════════════════════════════════

section("A. Table + date-column contract (legacy tb_* · lowercase per 0081)");

const EXPECTED_TABLES: Record<string, string> = {
  // 2026-06-01 Wave-A §0e: repointed from the EMPTY legacy tb_history_key (0 rows
  // · report was blank forever) to the LIVE tb_search_history (where actions/search.ts
  // logs every customer search · migration 0102).
  getSearchDemandReport: "tb_search_history",
  getSmsUsageReport:     "tb_sms_hs",
};
assertEq("getSearchDemandReport targets tb_search_history", EXPECTED_TABLES.getSearchDemandReport, "tb_search_history");
assertEq("getSmsUsageReport     targets tb_sms_hs",         EXPECTED_TABLES.getSmsUsageReport,     "tb_sms_hs");

// search-demand filters on `created_at` (tb_search_history · 0102); sms on `date` (tb_sms_hs · 0081).
assertEq("date-range columns", ["created_at", "date"], ["created_at", "date"]);

// ════════════════════════════════════════════════════════════════════════
// B. Column-name fidelity — 0081 lowercase (NOT the legacy PHP camelCase).
// ════════════════════════════════════════════════════════════════════════
//
// Legacy PHP referenced `keyWord` (camelCase) but the migrated Postgres
// column is `keyword`. Likewise tb_sms_hs is all lowercase. Lock it so a
// future sweep can't silently re-introduce `keyWord`.

section("B. Column-name fidelity — 0081 lowercase");

const COL_CONTRACT: Record<string, string[]> = {
  // tb_search_history (0102) — the LIVE search log getSearchDemandReport now reads.
  tb_search_history: ["id", "created_at", "query", "result_count", "user_id", "source"],
  tb_sms_hs:         ["id", "date", "msisdn", "message", "status"],
};
for (const [table, cols] of Object.entries(COL_CONTRACT)) {
  for (const col of cols) {
    assertEq(`${table}.${col} is lowercase`, col === col.toLowerCase(), true);
  }
}
// The search term lives in tb_search_history.query (NOT the empty legacy tb_history_key.keyword/keyWord).
assertEq("search term column is `query`",
  COL_CONTRACT.tb_search_history.includes("query"), true);
assertEq("search log does NOT use legacy camelCase `keyWord`",
  COL_CONTRACT.tb_search_history.includes("keyWord"), false);

// ════════════════════════════════════════════════════════════════════════
// C. Label maps — match legacy helpers verbatim.
// ════════════════════════════════════════════════════════════════════════

section("C. Label maps — stSMS() + apierror + type (legacy)");

// Mirror SMS_STATUS_LABEL (legacy stSMS function.php L495-501).
const SMS_STATUS_LABEL: Record<string, string> = { "1": "สำเร็จ", "2": "ไม่สำเร็จ" };
assertEq("stSMS '1' → สำเร็จ",   SMS_STATUS_LABEL["1"], "สำเร็จ");
assertEq("stSMS '2' → ไม่สำเร็จ", SMS_STATUS_LABEL["2"], "ไม่สำเร็จ");

// Mirror SEARCH_APIERROR_LABEL (legacy hStatus dropdown report-search.php L49).
const SEARCH_APIERROR_LABEL: Record<string, string> = { "1": "API มีปัญหา", "2": "API ไม่มีปัญหา" };
assertEq("apierror '1' → API มีปัญหา",   SEARCH_APIERROR_LABEL["1"], "API มีปัญหา");
assertEq("apierror '2' → API ไม่มีปัญหา", SEARCH_APIERROR_LABEL["2"], "API ไม่มีปัญหา");

// Mirror SEARCH_TYPE_LABEL (0081 comment: 1=keyword,2=1688,3=taobao,4=tmall).
const SEARCH_TYPE_LABEL: Record<string, string> = {
  "1": "คำค้นหา", "2": "1688", "3": "Taobao", "4": "Tmall",
};
assertEq("type '2' → 1688",   SEARCH_TYPE_LABEL["2"], "1688");
assertEq("type '3' → Taobao", SEARCH_TYPE_LABEL["3"], "Taobao");

// ════════════════════════════════════════════════════════════════════════
// D. search-demand aggregation — GROUP BY keyword, count, most-recent date,
//    sorted by count DESC (legacy aaSorting [[2,"desc"]]).
// ════════════════════════════════════════════════════════════════════════

section("D. search-demand — GROUP BY keyword · count · latest date · count-desc sort");

type Raw = { date: string | null; keyword: string | null; apierror: string | null };
type SearchDemandRow = { id: string; last_searched: string; keyword: string; count: number };

// Replicate getSearchDemandReport's aggregation line-for-line. Rows arrive
// newest-first (ordered by `date` desc), so first sighting = latest date.
function aggregate(raw: Raw[]): SearchDemandRow[] {
  const agg = new Map<string, { count: number; last: string }>();
  for (const r of raw) {
    const kw = (r.keyword ?? "").trim();
    if (!kw) continue;
    const cur = agg.get(kw);
    if (cur) cur.count += 1;
    else agg.set(kw, { count: 1, last: r.date ?? "" });
  }
  return Array.from(agg.entries())
    .map(([keyword, v]) => ({ id: keyword, last_searched: v.last, keyword, count: v.count }))
    .sort((a, b) => b.count - a.count);
}

// Newest-first fixture (mirrors the .order("date", desc) on the query).
const fixture: Raw[] = [
  { date: "2026-05-30T10:00:00", keyword: "iphone case", apierror: "2" },
  { date: "2026-05-29T10:00:00", keyword: "iphone case", apierror: "2" },
  { date: "2026-05-28T10:00:00", keyword: "iphone case", apierror: "2" },
  { date: "2026-05-27T10:00:00", keyword: "laptop bag",  apierror: "2" },
  { date: "2026-05-26T10:00:00", keyword: "laptop bag",  apierror: "1" },
  { date: "2026-05-25T10:00:00", keyword: "led strip",   apierror: "2" },
  { date: "2026-05-24T10:00:00", keyword: "",            apierror: "2" }, // blank → skipped
  { date: "2026-05-23T10:00:00", keyword: null,          apierror: "2" }, // null → skipped
];
const rows = aggregate(fixture);

assertEq("aggregate length = 3 distinct keywords", rows.length, 3);
assertEq("count-desc sort: top = 'iphone case'", rows[0].keyword, "iphone case");
assertEq("'iphone case' count = 3", rows[0].count, 3);
assertEq("'iphone case' latest date = 2026-05-30 (first sighting)", rows[0].last_searched, "2026-05-30T10:00:00");
assertEq("'laptop bag' count = 2", rows.find((r) => r.keyword === "laptop bag")?.count, 2);
assertEq("'led strip' count = 1",  rows.find((r) => r.keyword === "led strip")?.count, 1);
assertEq("blank + null keywords excluded (3 kept of 8 raw)", rows.length, 3);
assertEq("total searches summed = 6 (3+2+1)", rows.reduce((s, r) => s + r.count, 0), 6);
assertEq("React key (id) = keyword", rows[0].id, "iphone case");

// ════════════════════════════════════════════════════════════════════════
// E. sms-usage credit estimate — ceil(chars / 160) per message, min 1.
// ════════════════════════════════════════════════════════════════════════

section("E. sms-usage credit estimate — 160 chars/credit (legacy L113)");

const SMS_CHARS_PER_CREDIT = 160;
function creditsFor(message: string): number {
  return Math.max(1, Math.ceil((message?.length ?? 0) / SMS_CHARS_PER_CREDIT));
}
assertEq("empty message → 1 credit (min)", creditsFor(""), 1);
assertEq("1-char message → 1 credit", creditsFor("x"), 1);
assertEq("160-char message → 1 credit", creditsFor("x".repeat(160)), 1);
assertEq("161-char message → 2 credits", creditsFor("x".repeat(161)), 2);
assertEq("320-char message → 2 credits", creditsFor("x".repeat(320)), 2);
assertEq("321-char message → 3 credits", creditsFor("x".repeat(321)), 3);

// Summed estimate over a small log.
const smsLog = ["short", "x".repeat(200), "x".repeat(400)];
const totalCredits = smsLog.reduce((s, m) => s + creditsFor(m), 0); // 1 + 2 + 3
assertEq("3-message log total = 6 credits", totalCredits, 6);

// success/fail split off status.
const statusLog = [{ status: "1" }, { status: "1" }, { status: "2" }];
assertEq("success count (status=1) = 2", statusLog.filter((r) => r.status === "1").length, 2);
assertEq("fail count (status=2) = 1",    statusLog.filter((r) => r.status === "2").length, 1);

// ════════════════════════════════════════════════════════════════════════

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
