# `/admin/accounting/margin-monitor`

**มอนิเตอร์กำไรขั้นต้น (CEO ≤15k/ตู้)**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`, `sales_admin`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/accounting/margin-monitor/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_sales_report`](../../../database/legacy/tb_sales_report.md)

## Components

- `components/admin/csv-button`
- `components/admin/page-top-menubar`

## Server Actions / internal APIs

- action: `actions/admin/margin-monitor`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/admin/accounting-menubar`
- `lib/auth/require-admin`

## Exports / functions

- `AdminMarginMonitorPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
