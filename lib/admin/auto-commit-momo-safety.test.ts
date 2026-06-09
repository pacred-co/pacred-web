/**
 * Auto-commit MOMO safety predicates — pure-function tests.
 *
 * Covers the predicates that decide whether a row is safe for cron to
 * INSERT into tb_forwarder. These live OUTSIDE auto-commit-momo.ts
 * precisely so they can be exercised here — that module's transitive
 * `import "server-only"` throws under tsx.
 *
 * Run:  pnpm tsx lib/admin/auto-commit-momo-safety.test.ts
 *   (and via `pnpm test:unit` once wired into package.json)
 */

import {
  checkUserGroupMatchesCompany,
  checkNotDuplicateTracking,
  checkUnderDailyPerUserCap,
  checkPlausibleMetrics,
  computeRejectionRate,
  shouldAlertOnRejectionRate,
  nowMs,
  nowIso,
  todayIsoDateUtc,
  MAX_AUTO_COMMITS_PER_USER_PER_DAY,
  MAX_REASONABLE_WEIGHT_KG,
  MAX_REASONABLE_CBM,
} from "./auto-commit-momo-safety";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`  ok ${label}`);
    pass++;
  } else {
    console.log(`  FAIL ${label}${detail ? `\n      ${detail}` : ""}`);
    fail++;
  }
}

console.log("=== auto-commit-momo-safety ===");

// ── checkUserGroupMatchesCompany ──────────────────────────────────────
console.log("\n-- checkUserGroupMatchesCompany --");
check(
  "null userGroup → ok (nothing to cross-check)",
  checkUserGroupMatchesCompany(null, "0").ok === true,
);
check(
  "undefined userGroup → ok",
  checkUserGroupMatchesCompany(undefined, "1").ok === true,
);
check(
  "empty userGroup → ok",
  checkUserGroupMatchesCompany("", "1").ok === true,
);
check(
  "PR + individual (userCompany=0) → ok",
  checkUserGroupMatchesCompany("PR", "0").ok === true,
);
check(
  "PR + null userCompany → ok (treat as individual)",
  checkUserGroupMatchesCompany("PR", null).ok === true,
);
{
  const r = checkUserGroupMatchesCompany("PR", "1");
  check(
    "PR + company (userCompany=1) → mismatch",
    !r.ok && r.reason === "user_company_mismatch",
    JSON.stringify(r),
  );
}
check(
  "AIGA + company → ok",
  checkUserGroupMatchesCompany("AIGA", "1").ok === true,
);
{
  const r = checkUserGroupMatchesCompany("AIGA", "0");
  check(
    "AIGA + individual → mismatch",
    !r.ok && r.reason === "user_company_mismatch",
    JSON.stringify(r),
  );
}
{
  const r = checkUserGroupMatchesCompany("AIGA", null);
  check(
    "AIGA + null userCompany → mismatch (null != '1')",
    !r.ok && r.reason === "user_company_mismatch",
    JSON.stringify(r),
  );
}
check(
  "case-insensitive: pr + individual → ok",
  checkUserGroupMatchesCompany("pr", "0").ok === true,
);
check(
  "case-insensitive: aiga + company → ok",
  checkUserGroupMatchesCompany("aiga", "1").ok === true,
);
check(
  "trimmed: '  PR  ' + individual → ok",
  checkUserGroupMatchesCompany("  PR  ", "0").ok === true,
);
check(
  "unknown group → pass-through (legacy/partner-internal)",
  checkUserGroupMatchesCompany("XYZ", "0").ok === true,
);
check(
  "unknown group + company → pass-through",
  checkUserGroupMatchesCompany("XYZ", "1").ok === true,
);

// ── checkNotDuplicateTracking ─────────────────────────────────────────
console.log("\n-- checkNotDuplicateTracking --");
check(
  "no existing row → ok",
  checkNotDuplicateTracking(null).ok === true,
);
check(
  "existing fstatus=0 (canceled) → ok",
  checkNotDuplicateTracking("0").ok === true,
);
check(
  "existing empty fstatus → ok",
  checkNotDuplicateTracking("").ok === true,
);
{
  const r = checkNotDuplicateTracking("2");
  check(
    "existing fstatus=2 (live row) → duplicate",
    !r.ok && r.reason === "duplicate_tracking",
    JSON.stringify(r),
  );
}
{
  const r = checkNotDuplicateTracking("5");
  check(
    "existing fstatus=5 (paid) → duplicate",
    !r.ok && r.reason === "duplicate_tracking",
    JSON.stringify(r),
  );
}
{
  const r = checkNotDuplicateTracking("7");
  check(
    "existing fstatus=7 (delivered) → duplicate",
    !r.ok && r.reason === "duplicate_tracking",
    JSON.stringify(r),
  );
}

// ── checkUnderDailyPerUserCap ─────────────────────────────────────────
console.log("\n-- checkUnderDailyPerUserCap --");
check(
  "0 today → ok",
  checkUnderDailyPerUserCap(0).ok === true,
);
check(
  "1 today → ok",
  checkUnderDailyPerUserCap(1).ok === true,
);
check(
  "29 today (= cap-1) → ok",
  checkUnderDailyPerUserCap(MAX_AUTO_COMMITS_PER_USER_PER_DAY - 1).ok === true,
);
{
  const r = checkUnderDailyPerUserCap(MAX_AUTO_COMMITS_PER_USER_PER_DAY);
  check(
    "30 today (= cap) → over-cap",
    !r.ok && r.reason === "daily_per_user_cap",
    JSON.stringify(r),
  );
}
{
  const r = checkUnderDailyPerUserCap(100);
  check(
    "100 today → over-cap",
    !r.ok && r.reason === "daily_per_user_cap",
    JSON.stringify(r),
  );
}
check(
  "custom cap=5, current=4 → ok",
  checkUnderDailyPerUserCap(4, 5).ok === true,
);
{
  const r = checkUnderDailyPerUserCap(5, 5);
  check(
    "custom cap=5, current=5 → over-cap",
    !r.ok && r.reason === "daily_per_user_cap",
    JSON.stringify(r),
  );
}

// ── checkPlausibleMetrics ─────────────────────────────────────────────
console.log("\n-- checkPlausibleMetrics --");
check(
  "0/0 → ok (defaults are plausible)",
  checkPlausibleMetrics(0, 0).ok === true,
);
check(
  "5kg / 0.5cbm → ok",
  checkPlausibleMetrics(5, 0.5).ok === true,
);
check(
  "9999kg / 199cbm → ok (just under)",
  checkPlausibleMetrics(9999, 199).ok === true,
);
check(
  "10000kg = cap → ok (not exceeded)",
  checkPlausibleMetrics(MAX_REASONABLE_WEIGHT_KG, 0).ok === true,
);
{
  const r = checkPlausibleMetrics(MAX_REASONABLE_WEIGHT_KG + 1, 0);
  check(
    "10001kg → implausible_weight",
    !r.ok && r.reason === "implausible_weight",
    JSON.stringify(r),
  );
}
{
  const r = checkPlausibleMetrics(50000, 0);
  check(
    "50000kg → implausible_weight",
    !r.ok && r.reason === "implausible_weight",
    JSON.stringify(r),
  );
}
{
  const r = checkPlausibleMetrics(5, MAX_REASONABLE_CBM + 1);
  check(
    "201cbm → implausible_volume",
    !r.ok && r.reason === "implausible_volume",
    JSON.stringify(r),
  );
}
{
  // weight check fires first when both exceed
  const r = checkPlausibleMetrics(99999, 9999);
  check(
    "both exceed → weight reported first",
    !r.ok && r.reason === "implausible_weight",
    JSON.stringify(r),
  );
}

// ── computeRejectionRate ──────────────────────────────────────────────
console.log("\n-- computeRejectionRate --");
check(
  "scanned=0 → 0 (no div-by-zero)",
  computeRejectionRate(0, 0, 0) === 0,
);
check(
  "scanned=10, none rejected → 0",
  computeRejectionRate(10, 0, 0) === 0,
);
check(
  "scanned=10, 5 skipped, 0 failed → 0.5",
  computeRejectionRate(10, 5, 0) === 0.5,
);
check(
  "scanned=10, 0 skipped, 5 failed → 0.5",
  computeRejectionRate(10, 0, 5) === 0.5,
);
check(
  "scanned=10, 3 skipped, 2 failed → 0.5",
  computeRejectionRate(10, 3, 2) === 0.5,
);
check(
  "scanned=10, all rejected → 1.0",
  computeRejectionRate(10, 10, 0) === 1.0,
);
check(
  "scanned=10, skipped+failed > scanned → clamp at 1.0",
  computeRejectionRate(10, 15, 5) === 1.0,
);
check(
  "negative scanned → 0",
  computeRejectionRate(-1, 0, 0) === 0,
);

// ── shouldAlertOnRejectionRate ────────────────────────────────────────
console.log("\n-- shouldAlertOnRejectionRate --");
check(
  "tiny sample (5 scanned, all skipped) → no alert (below minSample=10)",
  shouldAlertOnRejectionRate(5, 5, 0) === false,
);
check(
  "100 scanned, 10 skipped → no alert (10% < 50% threshold)",
  shouldAlertOnRejectionRate(100, 10, 0) === false,
);
check(
  "100 scanned, 50 skipped → no alert (exactly at threshold, not >)",
  shouldAlertOnRejectionRate(100, 50, 0) === false,
);
check(
  "100 scanned, 51 skipped → ALERT (above 50%)",
  shouldAlertOnRejectionRate(100, 51, 0) === true,
);
check(
  "20 scanned, 11 skipped, 0 failed → ALERT (55% > 50%, sample=20 >= 10)",
  shouldAlertOnRejectionRate(20, 11, 0) === true,
);
check(
  "20 scanned, 11 skipped, 0 failed, custom minSample=25 → no alert",
  shouldAlertOnRejectionRate(20, 11, 0, 0.5, 25) === false,
);
check(
  "100 scanned, 30 skipped, 25 failed → ALERT (55%)",
  shouldAlertOnRejectionRate(100, 30, 25) === true,
);
check(
  "custom threshold 0.3, 100 scanned, 31 rejected → ALERT",
  shouldAlertOnRejectionRate(100, 31, 0, 0.3) === true,
);

// ── nowMs / nowIso / todayIsoDateUtc ──────────────────────────────────
console.log("\n-- time wrappers --");
check(
  "nowMs returns a finite positive integer",
  Number.isFinite(nowMs()) && nowMs() > 0,
);
check(
  "nowIso matches ISO 8601 format",
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(nowIso()),
);
check(
  "todayIsoDateUtc matches YYYY-MM-DD",
  /^\d{4}-\d{2}-\d{2}$/.test(todayIsoDateUtc()),
);
check(
  "nowMs ≈ Date.parse(nowIso()) within 5s",
  Math.abs(Date.parse(nowIso()) - nowMs()) < 5000,
);

// ── exported constants are sane ───────────────────────────────────────
console.log("\n-- exported constants --");
check(
  "MAX_AUTO_COMMITS_PER_USER_PER_DAY > 0",
  MAX_AUTO_COMMITS_PER_USER_PER_DAY > 0 && Number.isInteger(MAX_AUTO_COMMITS_PER_USER_PER_DAY),
);
check(
  "MAX_REASONABLE_WEIGHT_KG > 1000 (small package upper bound is < 1000)",
  MAX_REASONABLE_WEIGHT_KG > 1000,
);
check(
  "MAX_REASONABLE_CBM > 20 (one ลัง upper bound is < 20)",
  MAX_REASONABLE_CBM > 20,
);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
