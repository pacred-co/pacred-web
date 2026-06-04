# `/admin/reports/sales-by-rep`

**ยอดขายแยกตามเซล**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `accounting`, `sales_admin`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/reports/sales-by-rep/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`vw_sales_by_rep`](../../../database/native/vw_sales_by_rep.md)

## Components

- `components/admin/csv-button`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/datetime-helpers`
- `lib/supabase/admin`

## Exports / functions

- `SalesByRepReport`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
