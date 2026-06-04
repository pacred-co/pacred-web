# `/admin/accounting/shop`

**บัญชีฝั่งร้านค้า**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/accounting/shop/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_header_order`](../../../database/legacy/tb_header_order.md)
- [`tb_order`](../../../database/legacy/tb_order.md)
- [`tb_users`](../../../database/legacy/tb_users.md)
- [`tb_wallet_hs`](../../../database/legacy/tb_wallet_hs.md)

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

- `AdminAccountingShopPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
