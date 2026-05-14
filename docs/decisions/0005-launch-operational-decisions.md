# ADR-0005 — Launch operational decisions (K-4..K-7)

**Status:** Accepted
**Date:** 2026-05-16
**Phase:** Pre-beta launch
**Owner:** เดฟ + ก๊อต (per `docs/team.md` §6)

---

## Context

Four operational decisions had to land before beta launch to unblock ภูม's
backend work + ก๊อต's review queue. They share the trait of being
"decide-once, implement-many" choices — small enough that one ADR with
four sub-decisions beats four separate ADRs.

Bundled here:

- **K-4 (D-8)**: HS code variants — keep as separate rows in the rate
  table, or merge into the existing tier system?
- **K-5 (D-9)**: Payroll module — ship as a standalone module, or extend
  the existing HR module?
- **K-6**: Tax invoice numbering format — what's the canonical pattern
  for the running number?
- **K-7**: Wallet-deposit approver role — which admin role(s) can
  approve a customer's deposit slip?

---

## K-4 (D-8) — HS code variants: keep separate

**Decision:** Keep `hs_codes` + `container_hs_lines` as separate tables;
do **not** merge variants into the tier table.

**Rationale:**
- ภูม shipped this design in P-20 (commit `dda663c`, 2026-05-14). The
  schema is already live + tested + admin UI ships HS codes via the
  separate-rows pattern.
- Merging into tier would conflate two unrelated dimensions: tier is a
  **customer-volume discount**, HS is a **product-classification surcharge
  / tax**. They have different reviewers (sales sets tier; accounting +
  customs sets HS) and different rate-change frequencies (tier rarely;
  HS quarterly per Customs Department).
- Merging would require a multi-day re-migration with no offsetting
  win — the JOIN cost is negligible at Pacred scale (< 10 K orders/day).

**Implementation impact:** none — already done. This ADR just locks the
schema choice so a future engineer doesn't propose a "let's merge them"
refactor.

---

## K-5 (D-9) — Payroll module: extend HR

**Decision:** Extend the existing HR module (`/admin/hr/employees` +
`/admin/hr/attendance` + `/admin/hr/policies` + `admin_contact_extras`)
rather than create a standalone `/admin/payroll/` module.

**Rationale:**
- The Pacred team is small (8-15 staff). A separate payroll module would
  duplicate employee CRUD, role enforcement, and attendance reads.
- HR already owns the canonical employee record (`admins` table + 
  `admin_contact_extras`). Payroll = aggregation over attendance +
  fixed compensation fields + tax withholding. Natural extension.
- `is_admin(["accounting"])` already routes correctly; payroll needs the
  same gate.
- When Pacred grows past ~50 staff and payroll specialists need a UI
  divorced from HR's attendance flow, re-evaluate (see triggers below).

**Implementation impact:** Future payroll work lives at `/admin/hr/payroll/`
and reuses `admin_contact_extras` for per-employee fields like
`base_salary`, `tax_rate`, `bank_account`. New table likely
`payroll_periods` + `payroll_lines` referencing both
`admin_contact_extras.profile_id` and a date-bounded period.

**Re-evaluation triggers:**
- Pacred grows past 50 employees
- Pacred hires a dedicated payroll specialist with a different access
  surface from HR
- Compliance requires payroll-only audit trails separate from HR

---

## K-6 — Tax invoice numbering: `INV-YYYYMM-NNNN`

**Decision:** Tax invoice running number uses the format
**`INV-YYYYMM-NNNN`** with monthly reset of the 4-digit counter.

**Examples:**
- First invoice issued in May 2026: `INV-202605-0001`
- 47th invoice issued in May 2026: `INV-202605-0047`
- First invoice issued in June 2026: `INV-202606-0001` (counter resets)

**Rationale:**
- Monthly reset matches Thai accounting period convention (the Revenue
  Department's monthly `ภ.พ. 30` filing aggregates per month).
- 4-digit suffix → 9,999 invoices/month headroom. Pacred is far below
  that ceiling; well-sized for the next 5+ years.
- `YYYYMM` prefix is sortable lexicographically (Postgres `text` column
  is fine; no need for compound types or generated columns).
- "INV" prefix distinguishes tax invoices from internal receipt numbers
  (`f_no` for forwarders, `h_no` for shop orders).
- Concurrent issuance handled via row-level lock on a `tax_invoice_seq`
  table (period_yyyymm UNIQUE) — same pattern as `forwarders.f_no` +
  `service_orders.h_no` generators.

**Sub-decision (counter reset):**
- **Monthly reset** chosen over yearly because Thai tax filings are
  monthly. Yearly counters get unwieldy (>10K/year easily).

**Implementation impact:** When K-8 (ADR-0006 tax invoice flow) is
drafted, it inherits this format. Spec:
```sql
create table tax_invoice_seq (
  period_yyyymm text primary key,
  next_seq int not null default 1
);
-- Generator: SELECT + UPDATE in a single CTE / function, returning the
-- formatted INV-YYYYMM-NNNN.
```

---

## K-7 — Wallet-deposit approver role: super OR accounting

**Decision:** Either `super` **or** `accounting` admin role can approve a
customer wallet deposit slip. Ops cannot (out of scope for accounting
review).

**Rationale:**
- `super` = full powers, can do anything — they need approve.
- `accounting` = the role explicitly responsible for the money side —
  this is their primary work.
- `ops` (warehouse + driver coordination) shouldn't touch money flows.
  Adds compliance risk; nothing in their job requires it.
- `sales_admin` = sales rep approver, also out of scope for slip
  approval.

**Implementation impact:** `actions/admin/wallet.ts::adminUpdateWalletTransaction`
already uses `withAdmin([...roles], ...)`. Confirm the roles array is
`["super", "accounting"]` (no `ops`, no `sales_admin`). Pre-existing
code passes through — no change required unless it currently uses
`["super"]` only, in which case widen to add accounting.

**Audit-log requirement:** every approval logs `admin_id` + reason via
the existing `logAdminAction()` wrapper. No new audit infra needed.

**Re-evaluation trigger:** if Pacred's accounting practice splits into
junior + senior bookkeeper (so juniors review but seniors approve),
introduce a `wallet_approver` granular role rather than overloading
existing roles.

---

## Cross-decision considerations

- **K-4** = no work; just a "don't refactor" lock.
- **K-5** = path for future payroll module; no work until needed.
- **K-6** = inputs into K-8 (ADR-0006 tax invoice flow draft).
- **K-7** = potentially 1-line code fix if the admin wrapper's role
  list needs widening.

After this ADR ships, ก๊อต's pending-decision queue drops from 7 items to 3
(K-3 PCS scrub plan — also addressed today by the
[scrub runbook](../runbook/pcs-scrub-plan.md); K-8 tax invoice ADR; K-11
OWASP audit).

## References

- `docs/PORT_PLAN.md` Part S2 K-4 through K-7
- `docs/decisions/0002-admin-architecture.md` — role + RBAC source for K-7
- ภูม commit `dda663c` (P-20) — HS code rates + container HS lines schema
- `actions/admin/wallet.ts::adminUpdateWalletTransaction` — wallet approve
  action whose role gate K-7 binds
- Future ADR-0006 tax invoice flow — depends on K-6 format
