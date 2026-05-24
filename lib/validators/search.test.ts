/**
 * Unit tests for search-history validators (G8 — D1 customer-backend
 * gap #8). Locks the contract for actions/search.ts:
 *   - saveSearchQuerySchema:  query 1-500 chars trimmed · source/
 *     resultCount optional · resultCount non-negative int
 *   - getMyRecentSearchesSchema: limit 1-100 int, optional
 *
 * Pattern matches lib/validators/auth.test.ts.
 */

import {
  saveSearchQuerySchema,
  getMyRecentSearchesSchema,
  SEARCH_SOURCES,
} from "./search";

let pass = 0;
let fail = 0;

function assertOk(label: string, schema: { safeParse: (v: unknown) => { success: boolean } }, input: unknown) {
  const res = schema.safeParse(input);
  if (res.success) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: success\n    got: ${JSON.stringify(res)}`); }
}

function assertFail(label: string, schema: { safeParse: (v: unknown) => { success: boolean } }, input: unknown) {
  const res = schema.safeParse(input);
  if (!res.success) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: failure\n    got: success`); }
}

function section(name: string) {
  console.log(`\n${name}`);
}

// ════════════════════════════════════════════════════════════════════
// saveSearchQuerySchema
// ════════════════════════════════════════════════════════════════════

section("saveSearchQuerySchema — query required + bounds");

assertOk  ("happy path keyword",        saveSearchQuerySchema, { query: "iphone 15" });
assertOk  ("with source",               saveSearchQuerySchema, { query: "iphone", source: "china-search.keyword" });
assertOk  ("with resultCount = 0",      saveSearchQuerySchema, { query: "iphone", resultCount: 0 });
assertOk  ("with resultCount > 0",      saveSearchQuerySchema, { query: "iphone", resultCount: 24 });
assertOk  ("source null allowed",       saveSearchQuerySchema, { query: "iphone", source: null });
assertOk  ("resultCount null allowed",  saveSearchQuerySchema, { query: "iphone", resultCount: null });
assertOk  ("pasted URL as query",       saveSearchQuerySchema, {
  query: "https://item.taobao.com/item.htm?id=123456",
  source: "china-search.url",
});
assertOk  ("Thai keyword",              saveSearchQuerySchema, { query: "เสื้อยืดสีดำ" });
assertOk  ("query at 500 chars",        saveSearchQuerySchema, { query: "x".repeat(500) });
assertOk  ("source at 100 chars",       saveSearchQuerySchema, { query: "x", source: "x".repeat(100) });

assertFail("missing query",             saveSearchQuerySchema, {});
assertFail("empty query",               saveSearchQuerySchema, { query: "" });
assertFail("query is whitespace only",  saveSearchQuerySchema, { query: "   " });
assertFail("query > 500 chars",         saveSearchQuerySchema, { query: "x".repeat(501) });
assertFail("query is not a string",     saveSearchQuerySchema, { query: 42 });
assertFail("resultCount negative",      saveSearchQuerySchema, { query: "x", resultCount: -1 });
assertFail("resultCount float",         saveSearchQuerySchema, { query: "x", resultCount: 1.5 });
assertFail("resultCount string",        saveSearchQuerySchema, { query: "x", resultCount: "24" });
assertFail("source > 100 chars",        saveSearchQuerySchema, { query: "x", source: "x".repeat(101) });
assertFail("source empty string",       saveSearchQuerySchema, { query: "x", source: "" });

// ────────────────────────────────────────────────────────────
section("saveSearchQuerySchema — trims query whitespace");
// ────────────────────────────────────────────────────────────

{
  const res = saveSearchQuerySchema.safeParse({ query: "  iphone  " });
  if (res.success && res.data.query === "iphone") {
    pass++; console.log("  ✓ leading + trailing whitespace stripped");
  } else {
    fail++; console.error("  ✗ trim() not applied to query");
  }
}

// ════════════════════════════════════════════════════════════════════
// getMyRecentSearchesSchema
// ════════════════════════════════════════════════════════════════════

section("getMyRecentSearchesSchema — optional limit 1-100");

assertOk  ("empty input (default limit)",  getMyRecentSearchesSchema, {});
assertOk  ("limit = 1",                    getMyRecentSearchesSchema, { limit: 1 });
assertOk  ("limit = 10 (default)",         getMyRecentSearchesSchema, { limit: 10 });
assertOk  ("limit = 100 (max)",            getMyRecentSearchesSchema, { limit: 100 });

assertFail("limit = 0",                    getMyRecentSearchesSchema, { limit: 0 });
assertFail("limit negative",               getMyRecentSearchesSchema, { limit: -1 });
assertFail("limit > 100",                  getMyRecentSearchesSchema, { limit: 101 });
assertFail("limit float",                  getMyRecentSearchesSchema, { limit: 5.5 });
assertFail("limit string",                 getMyRecentSearchesSchema, { limit: "10" });

// ════════════════════════════════════════════════════════════════════
// SEARCH_SOURCES constants
// ════════════════════════════════════════════════════════════════════

section("SEARCH_SOURCES — known surfaces");

if (SEARCH_SOURCES.length === 3) {
  pass++; console.log("  ✓ SEARCH_SOURCES has 3 entries (keyword/url/url-detail)");
} else {
  fail++; console.error(`  ✗ SEARCH_SOURCES length mismatch — got ${SEARCH_SOURCES.length}, expected 3`);
}

if ((SEARCH_SOURCES as readonly string[]).includes("china-search.keyword")) {
  pass++; console.log("  ✓ SEARCH_SOURCES includes china-search.keyword");
} else {
  fail++; console.error("  ✗ SEARCH_SOURCES missing china-search.keyword");
}

// ────────────────────────────────────────────────────────────
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
