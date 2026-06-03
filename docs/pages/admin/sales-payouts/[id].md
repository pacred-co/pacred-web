# `/admin/sales-payouts/[id]`

**รายละเอียดจ่ายคอมเซล**

> **Auth:** 🛡 Admin — roles: `accounting`, `sales_admin`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/sales-payouts/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`slips`](../../../database/native/slips.md)
- [`tb_admin`](../../../database/legacy/tb_admin.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_user_sales`](../../../database/legacy/tb_user_sales.md)
- [`tb_user_sales_admin_pay`](../../../database/legacy/tb_user_sales_admin_pay.md)
- [`tb_user_sales_pay`](../../../database/legacy/tb_user_sales_pay.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/sales-payouts-tb`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-admin`
- `lib/storage/upload`

## Exports / functions

- `AdminSalesPayoutDetail`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
