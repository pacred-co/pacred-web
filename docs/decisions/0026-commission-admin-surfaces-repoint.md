# ADR-0026 — Admin commission surfaces repoint to `tb_user_sales*` (extends ADR-0020)

**Status:** Accepted 2026-06-02 (ภูม · admin-backend lane · per `docs/briefs/poom-wave-2026-06-01.md` §1 + §5a)
**Extends:** [ADR-0020](0020-commission-sot.md) — locked **customer** side onto `tb_user_sales` family (Path A). This ADR closes the loop for **admin** read surfaces.
**Mirrors:** [ADR-0018](0018-wallet-sot.md) (wallet SOT) + [ADR-0019](0019-customer-backend-arch-decisions-2026-05-30.md) — same "delete the dead twin · ratify the live legacy" stance.
**Closes audit gates:** `docs/research/big-audit-2026-06-01/_MASTER-PLAN.md` §3 + `04-billing-tax-sales.md` U4/U8 + Potemkin findings on `/admin/commissions` + `/admin/forwarder-sales`.

## Context

ADR-0020 locked the customer write-path on the legacy `tb_user_sales` family. The matching admin payout side (`/admin/sales-payouts` + `actions/admin/sales-payouts-tb.ts`) was also repointed (P0-23 batch 2). **BUT 2 older admin surfaces still read the dead rebuilt stack:**

| Page | Reads NOW (DEAD · 0 rows on prod) | Should read (LIVE · with real data) |
|---|---|---|
| `/admin/commissions/page.tsx` | `commission_withdrawals` + `commission_accruals` + `profiles` join | `tb_user_sales` (4,104 earns) + `tb_user_sales_admin_pay` (payouts) |
| `/admin/forwarder-sales/page.tsx` | `sales_commissions` + `team_leaders` + `profiles` join | `tb_user_sales` + `tb_sales_report` (17,027 rep-attribution rows) |
| `actions/admin/commissions.ts` (8 fns) | writes `commission_*` (DEAD) | tombstone |

Concrete impact: staff open `/admin/commissions` → see *"ไม่มี commission"* on a money screen → walk away thinking ค่าคอม system broken. Real state on prod = **4,104 unpaid `tb_user_sales` earns** sitting in the live legacy table. Worse than a missing page (silent wrong-data per AGENTS.md §0e).

## Decision

### D-1 — Admin canonical read surface: `tb_user_sales` + `tb_user_sales_admin_pay` (unchanged from ADR-0020)

Both admin surfaces read the same legacy family ADR-0020 already names canonical for the customer side. No new tables. No migration. No new write contract. Just repoint the SELECT statements + the JOIN target.

### D-2 — Per-page repoint plan

**`/admin/commissions/page.tsx`** (V-E8 admin queue):

3-panel rewrite:

1. **Top earners panel** — replace `commission_accruals` SUM with `tb_user_sales` aggregation:
   ```sql
   SELECT useridmain, COUNT(*) as accrual_count
   FROM tb_user_sales
   WHERE usstatus = '1'
   GROUP BY useridmain
   ```
   Then per group, JOIN to `tb_forwarder` (by `idf` IN the group's id list) to compute gross = Σ(`ftotalprice` − `fdiscount`) × 1% (the rate ADR-0020 + `lib/sales-commission/calc.ts` locked at 0.01).

2. **Pending withdrawals panel** — reuse `getPendingSalesPayoutsTb()` from `actions/admin/sales-payouts-tb.ts` (already faithful). Status filter chips map to `tb_user_sales_admin_pay.status`: pending=`'2'` · paid=`'3'`.

3. **History panel** — same query as #2 but `status='3'` (paid out).

Row links → `/admin/sales-payouts/[id]` (the canonical detail page from P0-23 batch 2) — DO NOT keep the `/admin/commissions/[id]` detail (also Potemkin · redirect to canonical).

**`/admin/forwarder-sales/page.tsx`** (forwarder sales attribution):

Repoint from `sales_commissions` (DEAD) → `tb_user_sales` (joined to `tb_forwarder` for the per-row cargo metrics + `tb_users.coid` for team attribution). The leader-picker dropdown is sourced from the 4 hardcoded VIP team codes (THADA.VIP · SIN.VIP · OOAEOM.VIP · SWAN — ADR-0020 D-1) instead of the empty `team_leaders` table.

Status filter chips map to `tb_user_sales.usstatus`: unpaid=`'1'` · pending=`'2'` · paid=`'3'`.

### D-3 — Tombstone the dead writer

`actions/admin/commissions.ts` (8 functions writing `commission_withdrawals` / `commission_accruals`) gets a tombstone comment + a guard that returns `{ ok: false, error: "tombstoned: use sales-payouts-tb.ts" }` on call. The file stays (some stale imports) but no longer mutates. Schedule full delete + `commission_*` table drop in a follow-up cleanup ADR.

### D-4 — Sidebar / dashboard cards / menubar (AGENTS.md §0d reachability)

After repoint, audit + fix any sidebar/dashboard card/menubar entries that ship to the old surfaces:
- `components/admin/dashboards/accounting-dashboard.tsx`
- `components/admin/dashboards/sales-admin-dashboard.tsx`
- `components/admin/dashboards/interpreter-dashboard.tsx`
- `lib/admin/disbursement-menubar.ts`

Ensure: clicking from sidebar → reaches the new `tb_user_sales`-backed page in ≤3 clicks · no link points at a tombstoned action.

### D-5 — Migration / schema deltas

**None.** Path A reuses the existing `tb_user_sales*` schema (0081 L5705/5726/5791 — see ADR-0020 D-4). `NEXT FREE` migration number stays at 0135 per `docs/runbook/migration-ledger.md`.

## Consequences

- **Trust win** — staff opening `/admin/commissions` see the **4,104 real earns + the actual pending-payout queue** instead of "ไม่มี commission" misleading screen. Worst-case dead-write trap eliminated.
- **Code surface shrinks** — one canonical read pattern (`sales-payouts-tb.ts`) covers all admin commission UIs; the rebuilt `commission_*` / `sales_*` stack is dead-locked.
- **Unblocks brief §2** (port `tb_withdraw_comm_sale_*` + `_interpreter_*` batch payouts) — `/admin/commissions` can later host the batch-payout sub-screens with the same pattern.
- **Future cleanup** — when `/sales/*` (rebuilt customer-side commission page) gets killed too, drop tables `commission_withdrawals` · `commission_accruals` · `sales_commissions` · `sales_payouts` · `team_leaders` · `commission_tiers` · `commission_tier_history` (7 dead tables) in a single migration.

## References

- ADR-0020 — customer SOT lock (Path A canonical)
- `docs/briefs/poom-wave-2026-06-01.md` §1 + §5a — the task brief
- `docs/research/big-audit-2026-06-01/04-billing-tax-sales.md` — the Potemkin findings
- Template code: `actions/admin/sales-payouts-tb.ts` + `actions/commissions-tb.ts` + `lib/sales-commission/calc.ts`
- Schema: `supabase/migrations/0081_pcs_legacy_schema.sql` L5705-5821 (`tb_user_sales` family)
- Affected files:
  - REPOINT: `app/[locale]/(admin)/admin/commissions/page.tsx` · `app/[locale]/(admin)/admin/forwarder-sales/page.tsx`
  - TOMBSTONE: `actions/admin/commissions.ts` (8 fns)
  - REDIRECT: `app/[locale]/(admin)/admin/commissions/[id]/page.tsx` → `/admin/sales-payouts/[id]`
  - WIRE: 4 dashboard/menubar files (D-4)
