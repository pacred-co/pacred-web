# `/admin/shop-payouts`

**จ่ายเงินร้านค้า**

> **Auth:** 🛡 Admin — roles: `accounting`, `ops`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/shop-payouts/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../database/native/admins.md)
- [`tb_shop_transactions`](../../database/legacy/tb_shop_transactions.md)

## Components

- `components/admin/page-top-menubar`
- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/admin/shop-payouts`

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

- `AdminShopPayoutsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
