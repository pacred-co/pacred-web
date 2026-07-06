/**
 * lib/admin/reassign-member-code.ts — PURE core for "รันเลข PR ลูกค้าใหม่".
 *
 * Owner 2026-07-06 — re-assign a customer a NEW PR code = the LOWEST VACANT PR
 * number (fill the lowest gap), MOVE ALL of the customer's data to the new
 * code, FREE the old code (it becomes vacant again), and preserve login +
 * everything (receipts etc.) — only the PR number changes.
 *
 * This module is PURE + testable — NO DB, NO `server-only` — so it can be
 * imported by the unit test, the dry-run script, AND the server action alike.
 * The DB-executing move lives in `scripts/reassign-member-code.mjs` (dry-run
 * default) + `actions/admin/reassign-customer-code.ts` (ultra-gated). Both share
 * the same invariants encoded here.
 *
 * PR code shape (matches migration 0114 `generate_member_code` + the swap
 * precedents scripts/swap-userid-pr10683-pr121.mjs / move-userid-pr999-pr168):
 *   ^PR[0-9]+$  ·  minimum 3 digits, zero-padded  ·  e.g. PR034, PR168, PR10794.
 * The numeric part is what defines "the lowest vacant gap".
 */

/** Canonical PR-code regex — "PR" + one-or-more digits (case-insensitive). */
export const PR_CODE_RE = /^PR[0-9]+$/i;

/** Minimum digit width when formatting a PR code (PR + ≥3 digits). */
export const PR_MIN_DIGITS = 3;

/** Format a numeric PR index into a canonical PR code (min 3 digits, padded). */
export function formatPrCode(n: number): string {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`formatPrCode: expected positive integer, got ${n}`);
  }
  return "PR" + String(n).padStart(PR_MIN_DIGITS, "0");
}

/** Parse the numeric part of a PR code (returns null for a non-PR string). */
export function parsePrIndex(code: string | null | undefined): number | null {
  if (!code) return null;
  const m = /^PR0*([0-9]+)$/i.exec(code.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * Compute the LOWEST VACANT PR code (fill the lowest gap) given the full set of
 * already-used codes across BOTH registries (tb_users."userID" PK +
 * profiles.member_code UNIQUE) — mirrors the precedent scripts' gap search.
 *
 *   - `existingCodes` may contain any strings (non-PR entries are ignored).
 *   - The scan starts at 1 and returns the first index with NO existing code.
 *   - Result is padded to ≥3 digits (PR001 … PR999 … PR10794 …).
 *
 * Examples (see the unit test):
 *   ["PR001","PR002","PR004"]  → "PR003"   (fills the gap at 3)
 *   ["PR001","PR002","PR003"]  → "PR004"   (no gap → next)
 *   []                         → "PR001"
 *   ["PR1","PR002"]            → "PR003"   (PR1 == index 1 == PR001)
 *
 * NOTE: this only guarantees the code is unused in the registries passed in.
 * The DB mover ADDITIONALLY verifies the candidate has ZERO rows in every
 * userid table before committing (see the "clean gap" step) — a belt-and-braces
 * check the precedents use so a stale orphan row can never collide.
 */
export function computeLowestVacantPrCode(existingCodes: Iterable<string | null | undefined>): string {
  const used = new Set<number>();
  for (const code of existingCodes) {
    const n = parsePrIndex(code);
    if (n !== null) used.add(n);
  }
  for (let n = 1; n < 1_000_000; n++) {
    if (!used.has(n)) return formatPrCode(n);
  }
  // Unreachable in practice (a million PR codes) — fail loud rather than loop.
  throw new Error("computeLowestVacantPrCode: no vacant PR code below 1,000,000");
}

/**
 * The synthetic auth.users email for a migrated customer, keyed on their PR
 * code. MUST stay byte-identical to `legacySyntheticEmail` in
 * lib/auth/pcs-legacy-password.ts — the NATIVE login path (actions/auth.ts
 * `legacySyntheticEmail(code)`) resolves the login email this way, so the move
 * MUST realign the auth email to the NEW code or login breaks (exactly the
 * PR168 bug that scripts/fix-auth-email-pr168-pr540 fixed). Duplicated here as a
 * pure helper so the mover/action/script don't pull the server-only auth
 * runtime; kept in lock-step by a unit assertion.
 */
export function reassignSyntheticEmail(code: string): string {
  return `pcs-legacy-${code.trim().toLowerCase()}@users.pacred.invalid`;
}

/**
 * A serializable description of the move plan — what the DRY-RUN prints and the
 * server action returns. `tables` is the introspected list of every userid
 * reference to rewrite; `authEmail` is the new synthetic login email.
 */
export type ReassignPlan = {
  fromCode: string;
  toCode: string;
  /** Per-table userid-column rewrite plan (introspected, not hardcoded). */
  tables: { table: string; column: string; rows: number }[];
  totalRows: number;
  /** The new synthetic auth email login must be realigned to. */
  authEmailFrom: string | null;
  authEmailTo: string;
};

/** Build the plan description from an introspected per-table row count. */
export function describeReassignPlan(args: {
  fromCode: string;
  toCode: string;
  tables: { table: string; column: string; rows: number }[];
  authEmailFrom: string | null;
}): ReassignPlan {
  const tables = args.tables.filter((t) => t.rows > 0);
  return {
    fromCode: args.fromCode,
    toCode: args.toCode,
    tables,
    totalRows: tables.reduce((s, t) => s + t.rows, 0),
    authEmailFrom: args.authEmailFrom,
    authEmailTo: reassignSyntheticEmail(args.toCode),
  };
}
