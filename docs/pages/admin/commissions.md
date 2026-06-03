# `/admin/commissions`

**คอมมิชชัน (admin · live tb_user_sales)**

> **Auth:** 🛡 Admin — roles: `super`, `accounting` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/commissions/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../database/native/admins.md)
- [`tb_forwarder`](../../database/legacy/tb_forwarder.md)
- [`tb_user_sales`](../../database/legacy/tb_user_sales.md)
- [`tb_user_sales_admin_pay`](../../database/legacy/tb_user_sales_admin_pay.md)

## Components

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
- `lib/sales-commission/calc`
- `lib/supabase/admin`

## Exports / functions

- `AdminCommissionsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
