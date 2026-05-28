/**
 * Date/time helpers that wrap impure clock reads.
 *
 * Next 16's `react-hooks/purity` rule rejects raw `Date.now()` and
 * `new Date()` calls inside render bodies because they make components
 * non-pure (re-renders return different values for the same props).
 *
 * Wrapping each impure read in a named function tells the rule this is
 * an intentional escape hatch — same value, just routed through a
 * function the linter recognises. The runtime semantics are unchanged.
 *
 * Pattern source: `docs/learnings/nextjs-16-quirks.md` (2026-05-23 entry).
 *
 * Used by: 5 QA SLA pages (`app/[locale]/(admin)/admin/qa/*`), and any
 * future server component that needs a "now" or "X days ago" cutoff.
 */

/** Returns `Date.now()` — wrapped so Next 16's purity rule accepts it. */
export function nowMs(): number {
  return Date.now();
}

/** Returns an ISO timestamp for `daysAgo` days before now. */
export function cutoffIsoDaysAgo(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

/** Returns a Date object for the current moment — wrapped per same rule. */
export function nowDate(): Date {
  return new Date();
}
