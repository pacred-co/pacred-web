# `/admin/accounting/withdraw/comm-sale`

**เบิกคอมเซล**

> **Auth:** 🛡 Admin — roles: `accounting`, `sales_admin`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/accounting/withdraw/comm-sale/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../../database/native/admins.md)
- [`tb_forwarder`](../../../../database/legacy/tb_forwarder.md)
- [`tb_header_order`](../../../../database/legacy/tb_header_order.md)

## Components

- `components/admin/csv-button`
- `components/admin/page-top-menubar`

## Server Actions / internal APIs

- action: `actions/admin/withdraw-comm-batch`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/admin/disbursement-menubar`
- `lib/auth/require-admin`

## Exports / functions

- `AdminWithdrawCommSalePage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
