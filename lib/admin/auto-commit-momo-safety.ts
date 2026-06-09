/**
 * Auto-commit MOMO — pure safety predicates (NO `server-only` import).
 *
 * WHY A SEPARATE MODULE
 * ─────────────────────
 * `auto-commit-momo.ts` transitively imports `commit-momo-row-core.ts`, which
 * is `server-only` (it does DB writes). That makes it impossible to unit-test
 * the eligibility/safety logic under plain `tsx`. So the predicates that
 * decide *whether* a row is safe to auto-commit live HERE — pure
 * `(inputs) → decision` functions, exercised by the test harness directly.
 *
 * The risk we're defending against (money-path):
 *   - MOMO_CRON_AUTOCOMMIT=true means cron INSERTs into tb_forwarder
 *     unattended. A wrong user_code → wrong customer billed. A row that
 *     was already committed via another path → duplicate. A burst of
 *     auto-commits to one customer in a single day → either a real surge
 *     or (more likely) a MOMO data-quality regression.
 *
 * Each predicate returns `{ ok: boolean; reason?: string }` so the caller
 * can branch on outcome AND get a stable machine-readable reason for the
 * admin board / audit log / LINE alert.
 *
 * @see lib/admin/auto-commit-momo.ts             — the consumer
 * @see lib/admin/auto-commit-momo-safety.test.ts — the unit tests
 * @see docs/runbook/momo-autocommit-activation.md — activation runbook
 */

/** Maximum auto-commits per customer per day (cron context). */
export const MAX_AUTO_COMMITS_PER_USER_PER_DAY = 30;

/** Sanity ceiling on raw package weight (kg) — beyond this signals bad data. */
export const MAX_REASONABLE_WEIGHT_KG = 10_000;

/** Sanity ceiling on raw package volume (cbm) — beyond this signals bad data. */
export const MAX_REASONABLE_CBM = 200;

/** Skipped-rate above which the cron run is flagged as a health regression. */
export const REJECTION_RATE_WARN_THRESHOLD = 0.5;

/** Stable reason codes for the admin board / audit log / metrics. */
export type SafetyReason =
  | "no_guessed_userid"
  | "unknown_user"
  | "user_company_mismatch"
  | "duplicate_tracking"
  | "duplicate_already_committed"
  | "daily_per_user_cap"
  | "implausible_weight"
  | "implausible_volume";

export type SafetyDecision =
  | { ok: true }
  | { ok: false; reason: SafetyReason; detail?: string };

/**
 * MOMO user_group convention:
 *   - "PR"    → individual customer (Pacred default · userCompany="0")
 *   - "AIGA"  → company customer    (userCompany="1")
 *
 * If we see an explicit user_group that contradicts the matched tb_users
 * row's userCompany flag, refuse — the user_code resolved but the
 * partner has tagged it with the wrong company class, which means
 * downstream billing / tax-invoice could go wrong.
 */
export function checkUserGroupMatchesCompany(
  userGroup: string | null | undefined,
  userCompanyFlag: string | null | undefined,
): SafetyDecision {
  if (!userGroup) return { ok: true }; // no explicit group → nothing to cross-check
  const group = userGroup.trim().toUpperCase();
  const isCompany = userCompanyFlag === "1";

  // Only enforce on the two well-known groups; other groups (legacy or
  // partner-internal) pass through — the resolved tb_users row is the
  // source of truth for company/individual class anyway.
  if (group === "PR" && isCompany) {
    return {
      ok: false,
      reason: "user_company_mismatch",
      detail: `user_group="PR" (individual) but tb_users.userCompany="1" (company)`,
    };
  }
  if (group === "AIGA" && !isCompany) {
    return {
      ok: false,
      reason: "user_company_mismatch",
      detail: `user_group="AIGA" (company) but tb_users.userCompany!="1" (individual)`,
    };
  }
  return { ok: true };
}

/**
 * Duplicate-prevention: a tb_forwarder row with this tracking-no already
 * exists in any non-zero status. The base auto-commit eligibility already
 * filters `committed_at IS NULL` on momo_import_tracks, but a parallel
 * admin commit (manual /review click) or a legacy `api-forwarder-manual`
 * insert could have landed the same tracking from another source.
 *
 * Pass `existingForwarderStatus` from a separate `tb_forwarder` lookup;
 * `null` = no row exists.
 */
export function checkNotDuplicateTracking(
  existingForwarderStatus: string | null,
): SafetyDecision {
  if (existingForwarderStatus == null) return { ok: true };
  // fstatus "0" = canceled/cleared — treat as "no live row" (safe to recommit).
  if (existingForwarderStatus === "0" || existingForwarderStatus === "") return { ok: true };
  return {
    ok: false,
    reason: "duplicate_tracking",
    detail: `tb_forwarder already has this tracking (fstatus=${existingForwarderStatus})`,
  };
}

/**
 * Daily-cap: refuse to auto-commit more than N rows for the same customer
 * in a single calendar day. A real surge is unusual; a spike usually
 * means MOMO data is mis-tagging a bulk batch to one user_code.
 *
 * Pass `committedTodayForUser` from a separate `tb_forwarder` head-count
 * (count where adminid='momo-cron' AND userid=X AND fdate >= today).
 */
export function checkUnderDailyPerUserCap(
  committedTodayForUser: number,
  cap: number = MAX_AUTO_COMMITS_PER_USER_PER_DAY,
): SafetyDecision {
  if (committedTodayForUser < cap) return { ok: true };
  return {
    ok: false,
    reason: "daily_per_user_cap",
    detail: `already ${committedTodayForUser} auto-commits today (cap=${cap})`,
  };
}

/**
 * Sanity-cap on MOMO raw metrics: a single row reporting > 10,000kg or
 * > 200cbm is almost certainly bad partner data (unit confusion / decimal
 * misplaced). Skip + flag so admin checks the row manually at /review.
 */
export function checkPlausibleMetrics(
  weightKg: number,
  cbm: number,
): SafetyDecision {
  if (weightKg > MAX_REASONABLE_WEIGHT_KG) {
    return {
      ok: false,
      reason: "implausible_weight",
      detail: `weight=${weightKg}kg exceeds sanity cap ${MAX_REASONABLE_WEIGHT_KG}`,
    };
  }
  if (cbm > MAX_REASONABLE_CBM) {
    return {
      ok: false,
      reason: "implausible_volume",
      detail: `cbm=${cbm} exceeds sanity cap ${MAX_REASONABLE_CBM}`,
    };
  }
  return { ok: true };
}

/**
 * Compute the rejection (skip+fail) rate for a single cron run.
 * Returns 0 when nothing was scanned (so the caller never divides by zero).
 */
export function computeRejectionRate(
  scanned: number,
  skipped: number,
  failed: number,
): number {
  if (scanned <= 0) return 0;
  const rejected = skipped + failed;
  return Math.min(1, Math.max(0, rejected / scanned));
}

/**
 * Decide whether the rejection rate warrants a health alert.
 * - Requires a minimum sample so a single bad row in a sparse run doesn't
 *   alert (e.g. 1/1 = 100% but only 1 row → not actionable).
 */
export function shouldAlertOnRejectionRate(
  scanned: number,
  skipped: number,
  failed: number,
  threshold: number = REJECTION_RATE_WARN_THRESHOLD,
  minSampleSize: number = 10,
): boolean {
  if (scanned < minSampleSize) return false;
  return computeRejectionRate(scanned, skipped, failed) > threshold;
}

/** Wall-clock now in ms — wrapper so callers don't sprinkle Date.now() inline
 *  (Next 16 react-hooks/purity discourages raw Date.now() inside render-graph
 *  modules; the wrapper is the single audit point). */
export function nowMs(): number {
  return Date.now();
}

/** Wall-clock now in ISO 8601 — wrapper around new Date().toISOString(). */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Today's date as YYYY-MM-DD (UTC) — used for the per-user-per-day cap query. */
export function todayIsoDateUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
