# `/sales/report/add`

**เพิ่มรายงานยอดขาย**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/sales/report/add/page.tsx`

## Database tables

- [`profiles`](../../../database/native/profiles.md)
- [`slips`](../../../database/native/slips.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_user_sales`](../../../database/legacy/tb_user_sales.md)
- [`tb_user_sales_admin_pay`](../../../database/legacy/tb_user_sales_admin_pay.md)
- [`tb_user_sales_pay`](../../../database/legacy/tb_user_sales_pay.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/commissions-tb`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/get-user`
- `lib/sales-commission/calc`
- `lib/supabase/admin`

## Exports / functions

- `SalesReportAddPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
