/**
 * lib/freight-commission/calc-v2.ts — the pure FREIGHT staff-commission math.
 *
 * WAVE 6 · 2026-06-09 · 💰 MONEY-CRITICAL.
 *
 * The AX-JOB commission model (docs/learnings/freight-erp-model.md §4 +
 * lib/freight/rate-model.ts FREIGHT_COMMISSION):
 *
 *   - FREIGHT (ค่าเฟรท) revenue line   → 1%  commission, − 3% WHT
 *   - CUSTOMS (พิธีการ) revenue line   → 5%  commission, − 3% WHT
 *   - DOC (เอกสาร) handling line       → 5%  commission, − 3% WHT
 *   - flat per-shipment (EK/AIR doc)   → 20฿ flat        (no WHT by default)
 *
 * A WITHDRAWAL then applies WHT 15% on the gross when gross > 5,000฿ (Thai
 * Revenue Code §50(1)).
 *
 * ── Why the RATES are an argument, not a constant ──
 *   The owner has NOT confirmed the rate values in writing. The rates live as
 *   EDITABLE DATA in freight_commission_tiers (mig 0167) flagged is_owner_confirmed.
 *   This module is a PURE function over the tiers the caller looked up — so the
 *   single source of truth is the DB row, and the calc can never drift from a
 *   stale hardcoded constant. The legacy 1%-only cargo calc in
 *   lib/sales-commission/calc.ts is UNTOUCHED (different product line).
 *
 * Pure: no IO, no Supabase, no Next imports — safe to import from both the
 * server action (actions/admin/freight-commission.ts) and the tsx unit test.
 */

/** Round to 2 decimals (THB cents), dodging float-representation surprises. */
export function round2(n: number): number {
  const safe = Number.isFinite(n) ? n : 0;
  return Math.round((safe + Number.EPSILON) * 100) / 100;
}

/** The freight commission revenue buckets — one per service_kind tier. */
export type FreightCommissionScope =
  | "freight_quote"
  | "freight_customs"
  | "freight_doc"
  | "freight_flat";

export const FREIGHT_SCOPE_LABEL: Record<FreightCommissionScope, string> = {
  freight_quote:   "ค่าเฟรท (Freight)",
  freight_customs: "พิธีการศุลกากร (Customs)",
  freight_doc:     "เอกสาร (Doc)",
  freight_flat:    "เหมาจ่าย/ชิปเมนต์ (Flat)",
};

/** Thai-law thresholds. */
/** WHT 15% per Revenue Code §50(1). */
export const FREIGHT_WITHDRAWAL_WHT_RATE_PCT = 15;
/** Threshold above which the 15% withdrawal WHT applies. */
export const FREIGHT_WITHDRAWAL_WHT_THRESHOLD_THB = 5000;

/**
 * A commission tier as the calc consumes it (a row of freight_commission_tiers).
 * Exactly one of rate_pct / flat_thb is non-null. is_owner_confirmed/active are
 * gates the CALLER resolves (the action only passes active+confirmed tiers when
 * the master flag is on) — they're carried here for the breakdown's honesty flag.
 */
export type FreightCommissionTier = {
  service_kind: FreightCommissionScope;
  rate_pct: number | null;
  flat_thb: number | null;
  /** the WHT % withheld on THIS commission line (3% on the AX freight comm). */
  wht_pct: number;
  is_owner_confirmed: boolean;
};

/** Per-scope base revenue (THB) the commission rates apply to. */
export type FreightCommissionBases = {
  /** ค่าเฟรท revenue (the freight line). */
  freightThb?: number;
  /** พิธีการ revenue (the customs-clearance line). */
  customsThb?: number;
  /** เอกสาร revenue (the doc-handling line). */
  docThb?: number;
  /** number of shipments — the flat fee multiplies by this (EK/AIR). */
  shipmentCount?: number;
};

/**
 * Bucket a freight quote's line items into the three commission revenue bases by
 * their `commission_scope` (the SOLE source-of-truth mapping for what revenue
 * accrues which commission). Extracted from the freight-invoice accrual hook so a
 * re-label regression (e.g. renaming a scope, or a new scope silently bucketing
 * to zero) is caught by a test rather than silently changing accrual amounts
 * (audit 2026-06-14 test-gap #2).
 *
 *   freight      → freightThb
 *   thai_customs → customsThb
 *   origin       → docThb        (origin/doc revenue → doc commission)
 *   anything else (thai_transport · import_tax · null) → NO commission
 *
 * Pure. `shipmentCount` defaults to 1 (one invoice = one shipment).
 */
export function bucketCommissionBases(
  items: ReadonlyArray<{ commission_scope: string | null; line_total_thb: number | string | null }>,
): Required<Omit<FreightCommissionBases, "shipmentCount">> & { shipmentCount: number } {
  const bases = { freightThb: 0, customsThb: 0, docThb: 0, shipmentCount: 1 };
  for (const it of items) {
    const amt = Number(it.line_total_thb ?? 0);
    if (!Number.isFinite(amt)) continue;
    switch (it.commission_scope) {
      case "freight":      bases.freightThb += amt; break;
      case "thai_customs": bases.customsThb += amt; break;
      case "origin":       bases.docThb     += amt; break;
      default: break; // thai_transport / import_tax / null → no commission
    }
  }
  return bases;
}

/** One line of the commission breakdown. */
export type FreightCommissionLine = {
  scope: FreightCommissionScope;
  /** the base revenue (or shipment count for flat) the rate applied to. */
  base_thb: number;
  rate_pct: number | null;
  flat_thb: number | null;
  /** gross commission BEFORE the per-line WHT. */
  gross_thb: number;
  wht_pct: number;
  /** the per-line WHT amount. */
  wht_thb: number;
  /** net commission for this line = gross − wht. */
  net_thb: number;
  /** true → this line's tier is NOT owner-confirmed (advisory only). */
  pending_owner_confirm: boolean;
};

/** The full commission computation for one source (e.g. a freight invoice). */
export type FreightCommissionResult = {
  lines: FreightCommissionLine[];
  /** Σ gross over all lines. */
  gross_thb: number;
  /** Σ per-line WHT. */
  wht_thb: number;
  /** Σ net (what the earner is owed) = gross − wht. */
  net_thb: number;
  /** the total base revenue the commission was computed on. */
  base_thb: number;
  /** a blended WHT % over the gross (for the accrual snapshot · 0 if gross=0). */
  blended_wht_pct: number;
  /** true → at least one line uses a tier that is NOT owner-confirmed. */
  any_pending_owner_confirm: boolean;
};

const SCOPE_TO_BASE: Record<
  FreightCommissionScope,
  (b: FreightCommissionBases) => number
> = {
  freight_quote:   (b) => Number(b.freightThb ?? 0),
  freight_customs: (b) => Number(b.customsThb ?? 0),
  freight_doc:     (b) => Number(b.docThb ?? 0),
  // For a flat tier the "base" is the shipment count (the multiplier).
  freight_flat:    (b) => Number(b.shipmentCount ?? 0),
};

/**
 * Compute the FREIGHT commission split.
 *
 * Reads the tier definitions (from freight_commission_tiers) + the per-scope
 * revenue bases, and produces a line-per-scope breakdown with the 3%-WHT
 * (per-tier) split + the rolled-up gross/wht/net totals.
 *
 * Determinism: a scope with no tier, or a zero base, contributes 0. A flat tier
 * multiplies flat_thb × shipmentCount. Every money figure is rounded to 2dp so
 * the stored accrual matches what the staffer sees.
 */
export function computeFreightCommission(args: {
  tiers: readonly FreightCommissionTier[];
  bases: FreightCommissionBases;
}): FreightCommissionResult {
  const { tiers, bases } = args;
  const lines: FreightCommissionLine[] = [];

  for (const tier of tiers) {
    const toBase = SCOPE_TO_BASE[tier.service_kind];
    if (!toBase) continue; // unknown service_kind → skip (defensive)
    const base = round2(toBase(bases));
    if (base <= 0) continue;

    let gross: number;
    if (tier.flat_thb != null) {
      // flat fee × the base (shipment count for the flat scope).
      gross = round2(tier.flat_thb * base);
    } else if (tier.rate_pct != null) {
      gross = round2(base * (tier.rate_pct / 100));
    } else {
      gross = 0;
    }
    if (gross <= 0) continue;

    const whtPct = Number(tier.wht_pct ?? 0);
    const wht = round2(gross * (whtPct / 100));
    const net = round2(gross - wht);

    lines.push({
      scope: tier.service_kind,
      base_thb: base,
      rate_pct: tier.rate_pct,
      flat_thb: tier.flat_thb,
      gross_thb: gross,
      wht_pct: whtPct,
      wht_thb: wht,
      net_thb: net,
      pending_owner_confirm: !tier.is_owner_confirmed,
    });
  }

  const gross_thb = round2(lines.reduce((s, l) => s + l.gross_thb, 0));
  const wht_thb = round2(lines.reduce((s, l) => s + l.wht_thb, 0));
  const net_thb = round2(gross_thb - wht_thb);
  const base_thb = round2(lines.reduce((s, l) => s + l.base_thb, 0));
  const blended_wht_pct = gross_thb > 0 ? round2((wht_thb / gross_thb) * 100) : 0;
  const any_pending_owner_confirm = lines.some((l) => l.pending_owner_confirm);

  return {
    lines,
    gross_thb,
    wht_thb,
    net_thb,
    base_thb,
    blended_wht_pct,
    any_pending_owner_confirm,
  };
}

/**
 * Compute the WHT + net for a WITHDRAWAL of accrued commission.
 *
 * Per Thai Revenue Code §50(1): when gross > 5,000฿ AND wht_rate > 0, withhold
 * gross × rate / 100. Otherwise withhold 0. (Staff can override wht_rate_pct = 0
 * for taxable-elsewhere cases — audited.)
 */
export function computeFreightWithdrawalNumbers(args: {
  gross_thb: number;
  wht_rate_pct?: number;
}): { wht_thb: number; net_thb: number; wht_rate_pct: number } {
  const gross = round2(args.gross_thb);
  const rate =
    args.wht_rate_pct === undefined || args.wht_rate_pct === null
      ? FREIGHT_WITHDRAWAL_WHT_RATE_PCT
      : args.wht_rate_pct;
  const wht_thb =
    gross > FREIGHT_WITHDRAWAL_WHT_THRESHOLD_THB && rate > 0
      ? round2(gross * (rate / 100))
      : 0;
  const net_thb = round2(gross - wht_thb);
  return { wht_thb, net_thb, wht_rate_pct: rate };
}
