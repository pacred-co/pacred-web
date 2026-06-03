# `/admin/reports/agent-payouts`

**รายงานจ่ายคอมตัวแทน**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`, `sales_admin`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/reports/agent-payouts/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_user_sales`](../../../database/legacy/tb_user_sales.md)
- [`tb_user_sales_admin_pay`](../../../database/legacy/tb_user_sales_admin_pay.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

- `components/admin/csv-button`
- `components/admin/reports/report-shell`

## Server Actions / internal APIs

- action: `actions/admin/reports-agent-payouts`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/admin/reports/types`
- `lib/auth/require-admin`

## Exports / functions

- `AgentPayoutsReportPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
