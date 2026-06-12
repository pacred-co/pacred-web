/**
 * ════════════════════════════════════════════════════════════════════════
 * MOMO "หัวบิล" (bill-header) detection — drop the placeholder from box-count Σ.
 *
 * WHY THIS EXISTS
 * ───────────────
 * When the MOMO carrier SPLITS one parcel it commits, into tb_forwarder, a
 * BARE tracking with no numeric suffix (e.g. "1780555730") whose:
 *   - `famount` = the DECLARED box count (e.g. 6), and
 *   - `fweight` = 0  (no real weight — it's a bill-OPEN placeholder, not a parcel)
 * PLUS the real boxes as `-N/M` siblings ("1780555730-1/6" … "-6/6", famount=1
 * each, with real weight). Summing the bare header WITH its box siblings
 * DOUBLE-COUNTS boxes (6 + 6 = 12 for a 6-box parcel).
 *
 * THE RULE (mirrors the forwarders-list fix in
 * app/[locale]/(admin)/admin/forwarders/forwarders-table.tsx ·
 * `countableGroupMembers` / `trackingSuffix`):
 *   Within a parcel group — rows sharing (baseTracking, userid) — if ANY
 *   member carries a box suffix (`-N` or `-N/M`), DROP any BARE member
 *   (no suffix) whose weight is 0. That bare member is the หัวบิล.
 *
 *   A bare row WITH weight is a REAL legacy order (legacy "-1" groups, or a
 *   normal un-split parcel) → KEEP it. No regression.
 *   A group with no box-suffixed sibling is untouched (no header to drop).
 *
 * SCOPE: COUNT display only. This NEVER changes selling / cost / declared /
 * commission. The หัวบิล's weight + price are 0, so weight/cbm/money Σ are
 * already correct — only the box-count (famount) Σ over-counts.
 *
 * SAFETY — pure · no DB · no IO · unit-tested. Runs in test:unit.
 *
 * RUN:  pnpm tsx lib/admin/momo-bill-header.test.ts
 * ════════════════════════════════════════════════════════════════════════
 */

/**
 * Strip ONE trailing sibling suffix so box-siblings collapse to a base:
 *   "1780555730-3"     → "1780555730"   (the "-N" form)
 *   "302098539663-1/7" → "302098539663" (the "-N/M" box-of-boxes form)
 * A value with no suffix keeps itself. Empty/null/"-" → null (never groups).
 */
export function baseTracking(tracking: string | null | undefined): string | null {
  if (!tracking) return null;
  const t = tracking.trim();
  if (!t || t === "-") return null;
  return t.replace(/-\d+(?:\/\d+)?$/, "");
}

/**
 * Numeric sibling suffix (the box number). No suffix → 0 (the base/หัวบิล row).
 * Handles both "-3" and "-3/7" (captures the box number 3).
 */
export function trackingSuffix(tracking: string | null | undefined): number {
  const m = (tracking ?? "").trim().match(/-(\d+)(?:\/\d+)?$/);
  return m ? Number(m[1]) : 0;
}

/**
 * How a caller reads (tracking, weight, userid) off its own row shape. Each
 * surface has a different column name (ftrackingchn / tracking_chn, fweight /
 * weight_kg, userid), so the helper is shape-agnostic.
 */
export type ForwarderCountAccessors<T> = {
  tracking: (row: T) => string | null | undefined;
  weight: (row: T) => number | null | undefined;
  userid: (row: T) => string | null | undefined;
};

/**
 * Return only the rows that should feed a box-count Σ — dropping MOMO
 * หัวบิล placeholders. Order-preserving. Pure.
 *
 * A row is dropped IFF, within its parcel group (same baseTracking + userid):
 *   - it is bare (trackingSuffix === 0), AND
 *   - its weight is 0/null, AND
 *   - at least one OTHER member of the group carries a box suffix (> 0).
 *
 * Rows whose tracking doesn't group (empty / "-") are always kept — a null
 * tracking can't be a split-parcel header.
 */
export function filterCountableForwarderRows<T>(
  rows: readonly T[],
  acc: ForwarderCountAccessors<T>,
): T[] {
  if (rows.length === 0) return [];

  // Which (base::userid) groups contain a box-suffixed sibling.
  const groupHasBoxSibling = new Set<string>();
  for (const r of rows) {
    if (trackingSuffix(acc.tracking(r)) <= 0) continue;
    const base = baseTracking(acc.tracking(r));
    if (base == null) continue;
    groupHasBoxSibling.add(`${base}::${acc.userid(r) ?? ""}`);
  }

  if (groupHasBoxSibling.size === 0) return [...rows];

  return rows.filter((r) => !isMomoBillHeader(r, acc, groupHasBoxSibling));
}

/**
 * True when `row` is a MOMO หัวบิล placeholder that should be excluded from a
 * box-count Σ. Exposed for callers that already group rows themselves (e.g. a
 * per-cabinet rollup) and want to test a single row against a precomputed
 * "groups that have a box sibling" set.
 */
export function isMomoBillHeader<T>(
  row: T,
  acc: ForwarderCountAccessors<T>,
  groupHasBoxSibling: ReadonlySet<string>,
): boolean {
  // Only a BARE (suffix 0) zero-weight row can be a header.
  if (trackingSuffix(acc.tracking(row)) !== 0) return false;
  if ((acc.weight(row) || 0) !== 0) return false;
  const base = baseTracking(acc.tracking(row));
  if (base == null) return false;
  return groupHasBoxSibling.has(`${base}::${acc.userid(row) ?? ""}`);
}
