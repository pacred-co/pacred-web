# Port-spec — CargoAndFreight role dashboards (V-E12)

> **Status:** 🟡 spec by เดฟ — Phase I2 backend prep for ภูม + ก๊อต (role-mapping decisions). Read-only dashboards per role; mostly aggregation queries on existing data.
> **Date:** 2026-05-16 night · **Owner:** ภูม (impl) · ก๊อต (RBAC + scope) · **Source:** PORT_PLAN Part V `V-E12` + deep-sweep audit §5.1 C.
>
> **Read with:**
> [`docs/decisions/0002-admin-architecture.md`](../decisions/0002-admin-architecture.md) (admins.role enum) ·
> [`docs/briefs/ops-roles.md`](../briefs/ops-roles.md) (14 STAFF role workspaces) ·
> [`docs/audit/php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md) §5.1 C-D.

---

## Context

PHP `home/CargoAndFreight/` + `home/Freight/` directories define **per-role landing dashboards** that show role-specific KPIs the moment a staff member logs in. Sub-dashboards:

| Dashboard | PHP path | What it shows |
|---|---|---|
| **Accounting** | `home/CargoAndFreight/Accounting/{AdminAccounting,AccountingManager}.php` | Monthly closing summary · pending invoices · receipt totals · WHT credits |
| **QA/QC** | `home/CargoAndFreight/QAAndQC/{QA,QC,QAManager}.php` | Today's inspection queue · pass/fail rate · open rework cases |
| **CEO** (combined) | `home/CargoAndFreight/CEO.php` | Cross-business KPI summary · revenue · top customers · alerts |
| **HR** | `home/CargoAndFreight/HR/{HR,HRManager,Maid}.php` | Cross-link to existing `/admin/hr/*` (already shipped) |
| **Marketing** | `home/CargoAndFreight/Marketing/{SalesAll,Pricing,ManagerMarketing}.php` | Campaign tracking · pricing promo · lead-source analytics |
| **ITDT** (IT/Data/Tech) | `home/CargoAndFreight/ITDT/{BackEnd,FrontEnd,FullStack}.php` | System health · backup status · deployment log · audit-log volume |
| **Freight Import** | `home/Freight/FreightImport/*` | Pending arrivals · cleared today · QA fails · D/O letters issued |
| **Freight Export** | `home/Freight/FreightExport/*` | Pending dispatches · Form E queue · pending broker handoffs |
| **Freight CEO** | `home/Freight/CEO.php` | Freight-specific revenue · top consignees |
| **Sale Freight** | `home/Freight/SaleFreight/{Sales,SalesManager}.php` | Per-rep freight order count · commission earned · pipeline |

Pacred has `/admin/dashboard` (single generic dashboard, per ภูม night-1) — works for `super` + `ops` but doesn't role-pivot.

---

## Design — per-role dashboard system

Rather than 10 separate route trees, propose **one `/admin/dashboard` route** that **dispatches to a role-specific layout based on the signed-in admin's primary role**:

```
/admin/dashboard (router; reads admin's role, renders one of:)
  ├── components/dashboards/SuperDashboard.tsx          (super sees everything; default)
  ├── components/dashboards/AccountingDashboard.tsx
  ├── components/dashboards/WarehouseDashboard.tsx      (QA + warehouse ops)
  ├── components/dashboards/SalesAdminDashboard.tsx
  ├── components/dashboards/DriverDashboard.tsx
  ├── components/dashboards/InterpreterDashboard.tsx    (per V-H1 if role added)
  └── components/dashboards/OpsDashboard.tsx            (generic ops; fallback)
```

Single-route design simplifies routing/permissions; the layout-switch happens server-side via `requireAdmin()` + role read.

Multi-role admins (a profile may have multiple `admins` rows with different roles per [ADR-0002](../decisions/0002-admin-architecture.md)) → primary-role selector dropdown in NavBar; default to "most powerful" role on first login.

---

## KPI catalog per dashboard

Each dashboard is a composition of **KPI cards** + **action queues** + **alert lists**. Specs below list the KPI types — actual numeric queries are 1-2 SQL/RPC calls per card.

### `SuperDashboard.tsx`
Cross-business overview:
- Revenue (THB) today / week / month / vs prev period
- Active customers (signed-up last 30d / placed-order-in-30d)
- Pending approvals across all queues (deposits / withdrawals / yuan / tax invoices / freight quotes / commission withdrawals)
- System alerts (Sentry error count / SMS balance low / cron failures / Vercel deploys)
- Quick links to all admin routes

### `AccountingDashboard.tsx`
- Pending freight invoices count + total outstanding
- Pending freight payments awaiting confirmation
- Monthly close status (open / pending_close / closed) — current month + last 3
- WHT credits accumulated (this month + total — for ภ.ง.ด credit tracking)
- VAT collected this month (cross-check vs ภ.พ.30)
- Top 5 overdue invoices (with days-overdue + customer)
- "ปิดงวด" CTA for currently-open closeable period

### `WarehouseDashboard.tsx`
- Today's inspections queue (count: pending + in-progress + completed)
- Pass / fail rate (last 7d)
- Open rework cases (fail_major + no resolution)
- Containers due to open (`close_at` countdown — per V-C3)
- Shipments waiting to bind to container (orphaned `cargo_shipments` without `cargo_container_id`)
- Bulletin generator link (per W-1 chat audit)

### `SalesAdminDashboard.tsx`
- Pending freight quotes (per-sales-rep view)
- This month's commission accrual (per the rep + team)
- Sales pipeline (quotes by status / value)
- Top 5 customers by revenue (last 30d)
- Lead routing queue (incoming `contact_messages` not yet claimed)

### `DriverDashboard.tsx`
- Today's pickup assignments
- Open deliveries (out_for_delivery)
- Completed today (count + total cargo)
- Vehicle status (if vehicle module exists — future)

### `InterpreterDashboard.tsx`
- This month's commission accrual + unpaid balance
- Active orders being negotiated (if linkage column exists per V-E8 Q2 — `interpreter_admin_id` on service_orders / forwarders)
- Customer satisfaction score (post-delivery survey — future)

### `OpsDashboard.tsx` (fallback)
- Container operations summary (V-D spine)
- Pending forwarder approvals
- Driver assignment queue
- Today's bulletin

---

## Data model

### `dashboard_kpi_snapshots` (optional — for slow expensive queries)

If a KPI query takes > 1s, cache via materialized snapshot:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `kpi_key` | text | `accounting.outstanding_invoices_total` · `super.revenue_mtd` · etc. |
| `scope_role` | text | which role(s) see this KPI. |
| `value_numeric` | numeric(14,2) nullable | for scalar KPIs. |
| `value_jsonb` | jsonb nullable | for tabular/list KPIs. |
| `computed_at` | timestamptz | |
| `ttl_seconds` | int default 300 | refresh-after window. |

Cron job `/api/cron/refresh-dashboard-snapshots` runs every 5 min — re-compute slow KPIs in bulk.

V1: skip the cache table; just write efficient queries (use existing indexes). Add caching only if a specific KPI is observed slow in production.

---

## Server actions / queries outline

`actions/admin/dashboards.ts`:

```ts
// Each KPI = one function. Composed via the dashboard component.
getRevenueByPeriod(scope: 'today'|'week'|'month', kind?: 'cargo'|'freight'): Promise<{ thb: number; delta_pct: number }>
getPendingApprovalCounts(): Promise<{ deposits; withdrawals; yuan; tax_invoices; freight_quotes; commissions }>
getOpenInvoicesAccountingView(): Promise<InvoiceSummary[]>
getInspectionQueueWarehouseView(): Promise<...>
getCommissionPipelineSalesView(adminId: string): Promise<...>
getSystemHealthSnapshot(): Promise<...>  // queries Sentry / SMS balance / cron heartbeats
// ... one function per KPI card
```

All queries gated via `withAdmin([allowed_roles])` matching the dashboard role.

---

## UI implementation

`/admin/dashboard/page.tsx` server component:
1. `await requireAdmin()` → reads admin's primary role (or selected role from cookie/URL param)
2. Switch-render the appropriate dashboard component
3. Each dashboard component runs its KPI queries in parallel via `Promise.all`
4. KPI cards use existing `components/admin/kpi-card.tsx` pattern (per ภูม T-P5 batch — `/admin/accounting` already uses this)

**Layout primitives** (reusable across all dashboards):
- `KpiCard` — title + value + delta + sparkline
- `QueueList` — pending count + top-3 with quick-action button
- `AlertList` — system alerts with severity coloring
- `LinkGrid` — quick-nav grid

---

## Migration note

Optional table only (`dashboard_kpi_snapshots`) — V1 can skip. No schema changes if we go without caching. ภูม assigns when needed; likely `0052+`.

---

## Acceptance

- A super logs in → sees cross-business KPI overview
- An accounting logs in → sees accounting-specific dashboard with pending invoices + monthly close
- A warehouse logs in → sees inspection queue + container ops summary
- A sales_admin logs in → sees own pipeline + commission accrual
- Multi-role admin (e.g. both `super` + `accounting`) → can switch view via NavBar selector
- Each dashboard loads in < 2s (V1 target; cache table if needed for V1.1)
- Drill-down: KPI card → click → relevant filtered list page
- Mobile-responsive (warehouse + driver staff use tablets)

---

## Cross-references

- Schedule → [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V `V-E12`
- RBAC role enum → [ADR-0002](../decisions/0002-admin-architecture.md) + V-H1 interpreter addition
- Staff role workspaces (the 14-role mapping ก๊อต locked) → [`docs/briefs/ops-roles.md`](../briefs/ops-roles.md)
- Existing dashboard pattern → `/admin/dashboard/page.tsx` + `/admin/accounting/page.tsx` (T-P5 — uses KPI cards)
- Forensics context → [`docs/audit/php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md) §5.1 C-D
- Legacy PHP source → `/Users/dev/Desktop/pcscargo/member/pcs-admin/include/pages/home/{CargoAndFreight,Freight}/`

**End of V-E12 spec.** ก๊อต: confirm role-pivot strategy (single-route dispatch vs. multi-route) + which roles get which KPIs. ภูม: implement incrementally — start with `SuperDashboard` (already most of `/admin/dashboard`) + `AccountingDashboard` extension; add others as new roles activate. Total estimated effort across all 7 dashboards: ~30-40h (most reuses existing KPI patterns).
