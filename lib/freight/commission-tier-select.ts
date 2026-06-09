/**
 * Freight commission tier selection — pure, testable logic extracted from
 * `actions/admin/freight-commission.ts` (audit S2).
 *
 * THE money-safety invariant (S2): only OWNER-CONFIRMED active tiers may mint
 * commission, and confirmation is filtered BEFORE the newest-per-scope pick.
 * If we picked "newest active" first, a newer *unconfirmed* tier would shadow
 * an older *confirmed* one — that scope would silently stop accruing real
 * money. So: filter `is_owner_confirmed` → then newest `effective_from` wins
 * per `service_kind`.
 *
 * Pure (no IO) + order-independent: callers may pass rows in any order; this
 * sorts internally, so the result doesn't depend on the DB `.order()` clause.
 */

export type CommissionTierRow = {
  service_kind: string;
  is_owner_confirmed: boolean;
  /** ISO timestamp; null sorts oldest. */
  effective_from: string | null;
};

/**
 * Returns the newest owner-confirmed tier per `service_kind`. Unconfirmed rows
 * are dropped entirely (they never mint money). At most one row per scope.
 */
export function selectActiveConfirmedTiers<T extends CommissionTierRow>(
  rows: readonly T[],
): T[] {
  const confirmed = rows.filter((r) => Boolean(r.is_owner_confirmed));
  // Newest effective_from first, grouped by scope (stable, order-independent).
  const sorted = [...confirmed].sort((a, b) => {
    if (a.service_kind !== b.service_kind) {
      return a.service_kind < b.service_kind ? -1 : 1;
    }
    const af = a.effective_from ?? "";
    const bf = b.effective_from ?? "";
    return af < bf ? 1 : af > bf ? -1 : 0; // desc
  });
  const seen = new Set<string>();
  const latest: T[] = [];
  for (const r of sorted) {
    if (seen.has(r.service_kind)) continue;
    seen.add(r.service_kind);
    latest.push(r);
  }
  return latest;
}
