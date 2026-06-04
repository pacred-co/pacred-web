# `/admin/sales-payouts`

**จ่ายคอมเซล**

> **Auth:** 🛡 Admin — roles: `accounting`, `sales_admin` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/sales-payouts/page.tsx`

## Database tables

- [`admins`](../../database/native/admins.md)
- [`slips`](../../database/native/slips.md)
- [`tb_admin`](../../database/legacy/tb_admin.md)
- [`tb_forwarder`](../../database/legacy/tb_forwarder.md)
- [`tb_user_sales`](../../database/legacy/tb_user_sales.md)
- [`tb_user_sales_admin_pay`](../../database/legacy/tb_user_sales_admin_pay.md)
- [`tb_user_sales_pay`](../../database/legacy/tb_user_sales_pay.md)

## Components

- `components/admin/page-top-menubar`

## Server Actions / internal APIs

- action: `actions/admin/sales-payouts-tb`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/admin/disbursement-menubar`
- `lib/auth/require-admin`

## Exports / functions

- `AdminSalesPayoutsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
