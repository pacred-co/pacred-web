/**
 * Tests for selectActiveConfirmedTiers (audit S2) — the money-safety invariant
 * that a newer UNCONFIRMED freight commission tier must never shadow an older
 * CONFIRMED one (which would silently stop that scope accruing commission).
 *
 * Run: npx tsx lib/freight/commission-tier-select.test.ts
 */

import { selectActiveConfirmedTiers, type CommissionTierRow } from "./commission-tier-select";

let pass = 0;
let fail = 0;
function assert(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
}
function eq<T>(name: string, got: T, want: T) {
  assert(`${name} (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));
}

type Row = CommissionTierRow & { id: string };
const row = (id: string, service_kind: string, effective_from: string | null, is_owner_confirmed: boolean): Row =>
  ({ id, service_kind, effective_from, is_owner_confirmed });

console.log("freight commission-tier-select (S2)");

// ── 1) THE S2 regression: newer UNCONFIRMED must not shadow older CONFIRMED ──
{
  const rows = [
    row("new", "freight", "2026-06-01", false), // newer, NOT confirmed
    row("old", "freight", "2026-01-01", true),  // older, confirmed
  ];
  const got = selectActiveConfirmedTiers(rows);
  eq("picks the older CONFIRMED tier, not the newer unconfirmed", got.map((r) => r.id), ["old"]);
}

// ── 2) Among confirmed, newest effective_from wins ──
{
  const rows = [
    row("mid", "freight", "2026-03-01", true),
    row("new", "freight", "2026-06-01", true),
    row("old", "freight", "2026-01-01", true),
  ];
  const got = selectActiveConfirmedTiers(rows);
  eq("newest confirmed wins per scope", got.map((r) => r.id), ["new"]);
}

// ── 3) One row per service_kind, all scopes represented ──
{
  const rows = [
    row("f1", "freight", "2026-06-01", true),
    row("f0", "freight", "2026-01-01", true),
    row("c1", "customs", "2026-05-01", true),
    row("d1", "doc", "2026-04-01", true),
  ];
  const got = selectActiveConfirmedTiers(rows);
  eq("one newest-confirmed per scope", new Set(got.map((r) => r.service_kind)).size, 3);
  eq("freight scope resolves to newest", got.find((r) => r.service_kind === "freight")?.id, "f1");
}

// ── 4) Order-independent (DB .order() must not be load-bearing) ──
{
  const rows = [
    row("old", "freight", "2026-01-01", true),
    row("new", "freight", "2026-06-01", true),
  ];
  const shuffled = [...rows].reverse();
  eq("same result regardless of input order",
     selectActiveConfirmedTiers(rows).map((r) => r.id),
     selectActiveConfirmedTiers(shuffled).map((r) => r.id));
}

// ── 5) Zero confirmed → empty (a scope with only unconfirmed tiers mints nothing) ──
{
  const rows = [
    row("u1", "freight", "2026-06-01", false),
    row("u2", "customs", "2026-05-01", false),
  ];
  eq("no confirmed tiers → empty (no accrual)", selectActiveConfirmedTiers(rows).length, 0);
}

// ── 6) null effective_from sorts oldest (a dated confirmed tier beats an undated one) ──
{
  const rows = [
    row("dated", "freight", "2026-01-01", true),
    row("undated", "freight", null, true),
  ];
  eq("dated confirmed beats null-dated", selectActiveConfirmedTiers(rows).map((r) => r.id), ["dated"]);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} commission-tier-select: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
