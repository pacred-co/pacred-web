# `/admin/reports/user-sales-history/[customer_id]`

**ประวัติยอดขายของลูกค้ารายหนึ่ง**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `accounting`, `sales_admin`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/reports/user-sales-history/[customer_id]/page.tsx`

## Request data (params)

- **route param** `customer_id`

## Database tables

- [`admins`](../../../../database/native/admins.md)
- [`tb_forwarder`](../../../../database/legacy/tb_forwarder.md)
- [`tb_header_order`](../../../../database/legacy/tb_header_order.md)
- [`tb_payment`](../../../../database/legacy/tb_payment.md)
- [`tb_users`](../../../../database/legacy/tb_users.md)
- [`tb_wallet`](../../../../database/legacy/tb_wallet.md)
- [`tb_wallet_hs`](../../../../database/legacy/tb_wallet_hs.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `UserSalesHistoryDrillIn`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
