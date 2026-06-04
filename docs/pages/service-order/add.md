# `/service-order/add`

**สร้างออเดอร์ฝากสั่งซื้อใหม่**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/service-order/add/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`profiles`](../../database/native/profiles.md)
- [`tb_address`](../../database/legacy/tb_address.md)
- [`tb_cart`](../../database/legacy/tb_cart.md)
- [`tb_cash_back`](../../database/legacy/tb_cash_back.md)
- [`tb_corporate`](../../database/legacy/tb_corporate.md)
- [`tb_header_order`](../../database/legacy/tb_header_order.md)
- [`tb_order`](../../database/legacy/tb_order.md)
- [`tb_pro_valentine`](../../database/legacy/tb_pro_valentine.md)
- [`tb_promotion`](../../database/legacy/tb_promotion.md)
- [`tb_promotion33`](../../database/legacy/tb_promotion33.md)
- [`tb_settings`](../../database/legacy/tb_settings.md)
- [`tb_users`](../../database/legacy/tb_users.md)
- [`tb_wallet`](../../database/legacy/tb_wallet.md)
- [`tb_wallet_hs`](../../database/legacy/tb_wallet_hs.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/cart`
- action: `actions/product-search`
- action: `actions/service-order`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_LEGACY_MEMBER_BASE`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/get-user`
- `lib/legacy-image`
- `lib/supabase/admin`
- `lib/supabase/server`
- `lib/wallet/balance`

## Exports / functions

- `ServiceOrderAddPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
