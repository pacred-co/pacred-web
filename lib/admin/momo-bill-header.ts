/**
 * ════════════════════════════════════════════════════════════════════════
 * MOMO "หัวบิล" (bill-header) detection — drop the placeholder from box-count Σ.
 *
 * WHY THIS EXISTS
 * ───────────────
 * When the MOMO carrier SPLITS one parcel it commits, into tb_forwarder, a
 * BARE tracking with no numeric suffix (e.g. "1780555730") that carries the
 * WHOLE-shipment AGGREGATE:
 *   - `famount` = the DECLARED box count (e.g. 6), and
 *   - `fweight`  = the AGGREGATE weight — often 0 (a bill-OPEN placeholder) BUT
 *                  SOMETIMES the Σ of every box (an aggregate-weight bare base ·
 *                  verified prod 1783582989/52559 fweight 58 = Σ its 4 boxes),
 * PLUS the real boxes as `-N/M` siblings ("1780555730-1/6" … "-6/6", famount=1
 * each, with real weight). Summing the bare header WITH its box siblings
 * DOUBLE-COUNTS boxes (6 + 6 = 12 for a 6-box parcel) — AND double-counts weight
 * when the bare carries the aggregate weight.
 *
 * THE RULE (money-guard-primary · 2026-07-16 · mirrors the forwarders-list
 * `countableGroupMembers` / `trackingSuffix`):
 *   Within a parcel group — rows sharing (baseTracking, userid) — when ANY
 *   member carries a box suffix (`-N` or `-N/M`), a BARE member (no suffix) is a
 *   หัวบิล placeholder to DROP unless it carries billable money:
 *     • money accessor present → a bare-with-siblings row is a header IFF it
 *       carries NO money (money ≤ 0), REGARDLESS of weight. A redundant aggregate
 *       has NO SELL freight (the freight lives on the real box rows), whether its
 *       weight is 0 or the aggregate Σ. A row that DOES carry money is a real
 *       priced anchor (or a MOMO box-split anchor whose own box is dims-only) →
 *       NEVER dropped, so no money-sum ever loses a baht.
 *     • money accessor ABSENT → the conservative legacy rule: only a ZERO-WEIGHT
 *       bare-with-siblings row is a header. This backstops a caller that forgets
 *       to pass money from ever dropping a weight-carrying anchor. Every count +
 *       money caller in this repo passes a money accessor (ftotalprice / gross /
 *       composite) so they get the money-aware rule.
 *
 *   A bare row WITH box-suffixed siblings but its own money>0 is a REAL row → KEPT.
 *   A group with no box-suffixed sibling is untouched (no header to drop).
 *
 * SCOPE: COUNT display only. This NEVER changes selling / cost / declared /
 * commission. A dropped หัวบิล carries NO SELL freight (money ≤ 0 · the drop
 * signal), so a MONEY Σ is unaffected; only the box-count (famount) Σ + the
 * aggregate-weight double-count get fixed.
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
  /**
   * OPTIONAL — the billable money on the row. When PRESENT it is the SOLE keep-signal:
   * a bare-with-siblings row is a หัวบิล placeholder IFF money ≤ 0 (weight ignored), so an
   * aggregate-weight bare base (fweight = Σ boxes but NO freight) is correctly dropped from
   * the box count while a row that carries money — a real priced anchor, or a MOMO box-SPLIT
   * anchor whose own box is dims-only (fweight=0 · has ftotalprice) — is NEVER dropped from a
   * MONEY Σ (owner/ภูม 2026-07-03 · money review). Callers pass what "money" means for THEM:
   * the box-count/display surfaces pass ftotalprice (the SELL freight · a เหมาๆ-only aggregate
   * has ftotalprice=0 → dropped from the count); billing/ยอดเก็บจริง pass the full gross /
   * composite so a เหมาๆ-bearing row stays in the money sum. Count-only callers that OMIT it
   * fall back to the legacy zero-weight rule.
   */
  money?: (row: T) => number | null | undefined;
};

/**
 * Return only the rows that should feed a box-count Σ — dropping MOMO
 * หัวบิล placeholders. Order-preserving. Pure.
 *
 * A row is dropped IFF, within its parcel group (same baseTracking + userid):
 *   - it is bare (trackingSuffix === 0), AND
 *   - at least one OTHER member of the group carries a box suffix (> 0), AND
 *   - it carries no money  (money accessor present → money ≤ 0 · weight ignored),
 *     OR  its weight is 0/null  (money accessor absent → legacy zero-weight rule).
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
/**
 * ≈-equality for shipment weight/คิว values — the SAME tolerance family the
 * split/absorb/backlink machinery uses (2% relative · 0.5 absolute floor so
 * tiny parcels don't false-differ on rounding). Pure.
 */
export function approxEqualValue(a: number, b: number, relTol = 0.02, absTol = 0.5): boolean {
  const av = Number(a) || 0;
  const bv = Number(b) || 0;
  const diff = Math.abs(av - bv);
  if (diff <= absTol) return true;
  const denom = Math.max(Math.abs(av), Math.abs(bv));
  return denom > 0 && diff / denom <= relTol;
}

/**
 * DISJOINT-LOTS discriminator (owner + CS 2026-07-21 · 908007350691 = 6 กล่อง).
 *
 * MOMO sometimes keys ONE shipment as TWO REAL LOTS: the BARE tracking is its own
 * multi-box lot (e.g. 908007350691 = 5 กล่อง · 112.5kg) and a suffixed sibling is a
 * SEPARATE lot (908007350691-2 = 1 กล่อง · 10.5kg) → the family truly has
 * bare.qty + Σ siblings = 6 กล่อง (same class as prod 60527103087: bare 48/624 +
 * "-2" 12/156 = คนละล็อตจริง). The legacy display rule "bare-with-siblings = หัวบิล
 * → drop" UNDER-COUNTS this shape (5 หาย → Σ 1), and treating the bare as an
 * aggregate header would zero real value.
 *
 * A bare is an ADDITIVE LOT (count it ALONGSIDE its suffixed siblings) IFF:
 *   1. it carries its OWN value (bareValue > 0), AND
 *   2. MOMO's box_detail reports the bare AS ITS OWN BOX LINE (bareHasOwnBox —
 *      an aggregate header is never listed as a box of itself), AND
 *   3. its value is DISJOINT from the Σ of its suffixed siblings — NOT ≈ equal
 *      (a bare ≈ Σ siblings is the classic aggregate/residue header → still drop).
 *
 * Fail-CLOSED: any missing signal → false → callers keep the proven drop-the-bare
 * behaviour, so this can only ever ADD a corroborated real lot, never resurrect a
 * placeholder. Pure · display/count + commit-guard shared brain.
 */
export function isAdditiveLotBare(input: {
  /** the bare row's own weight (kg) — the staged/stored shipment value */
  bareValue: number;
  /** Σ weight of the suffixed sibling ROWS (staged or live) of the same family */
  siblingValueSum: number;
  /** momo_box_detail has a box line keyed by the BARE tracking itself */
  bareHasOwnBox: boolean;
}): boolean {
  const bare = Number(input.bareValue) || 0;
  const sibs = Number(input.siblingValueSum) || 0;
  if (!(bare > 0)) return false;              // empty header → never additive
  if (!input.bareHasOwnBox) return false;     // no own box line → can't corroborate
  return !approxEqualValue(bare, sibs);       // ≈ Σ siblings = aggregate header
}

export function isMomoBillHeader<T>(
  row: T,
  acc: ForwarderCountAccessors<T>,
  groupHasBoxSibling: ReadonlySet<string>,
): boolean {
  // Only a BARE (suffix 0) row within a group that has a box-suffixed sibling can be a header.
  if (trackingSuffix(acc.tracking(row)) !== 0) return false;
  const base = baseTracking(acc.tracking(row));
  if (base == null) return false;
  if (!groupHasBoxSibling.has(`${base}::${acc.userid(row) ?? ""}`)) return false;

  // Money-guard is the SOLE keep-signal when the caller supplies it. A bare-with-siblings row
  // that carries NO money is a redundant aggregate/placeholder → header (drop) REGARDLESS of
  // weight — this is what fixes the aggregate-weight bare base (fweight = Σ boxes, no freight)
  // that the old zero-weight-only rule wrongly KEPT (owner 2026-07-16 · 1783582989/52559). A
  // row that carries money is a REAL order/box (priced anchor, or a box-split anchor whose own
  // box is dims-only → ftotalprice>0) → NEVER a placeholder, so no money Σ loses a baht.
  if (acc.money) return (acc.money(row) || 0) <= 0;

  // No money accessor → conservative legacy rule: only a ZERO-WEIGHT bare-with-siblings row is
  // a header. Backstops a caller that forgets money from ever dropping a weight-carrying anchor.
  return (acc.weight(row) || 0) === 0;
}
