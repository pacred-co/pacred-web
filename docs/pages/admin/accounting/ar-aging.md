# `/admin/accounting/ar-aging`

**ลูกหนี้คงค้างตามอายุ (AR-aging · canonical)**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`, `sales_admin`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/accounting/ar-aging/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_admin`](../../../database/legacy/tb_admin.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_sales_report`](../../../database/legacy/tb_sales_report.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

- `components/admin/csv-button`
- `components/admin/page-top-menubar`

## Server Actions / internal APIs

- action: `actions/admin/ar-aging`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/admin/accounting-menubar`
- `lib/auth/require-admin`

## Exports / functions

- `AdminARAgingPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
