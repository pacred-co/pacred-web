# `/admin/forwarder-sales`

**คอมมิชชันการขายจากออเดอร์นำเข้า**

> **Auth:** 🛡 Admin — roles: `accounting`, `sales_admin` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/forwarder-sales/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../database/native/admins.md)
- [`tb_admin`](../../database/legacy/tb_admin.md)
- [`tb_forwarder`](../../database/legacy/tb_forwarder.md)
- [`tb_sales_report`](../../database/legacy/tb_sales_report.md)
- [`tb_users`](../../database/legacy/tb_users.md)

## Components

- `components/admin/csv-button`
- `components/admin/date-filter`
- `components/admin/page-top-menubar`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/admin/disbursement-menubar`
- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminForwarderSalesPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
