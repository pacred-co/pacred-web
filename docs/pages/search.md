# `/search`

**ค้นหาสินค้าจีน (China-search · วางลิงก์/รูป)**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/search/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`profiles`](../database/native/profiles.md)
- [`tb_address`](../database/legacy/tb_address.md)
- [`tb_cart`](../database/legacy/tb_cart.md)
- [`tb_header_order`](../database/legacy/tb_header_order.md)
- [`tb_order`](../database/legacy/tb_order.md)
- [`tb_pro_valentine`](../database/legacy/tb_pro_valentine.md)
- [`tb_product`](../database/legacy/tb_product.md)
- [`tb_promotion`](../database/legacy/tb_promotion.md)
- [`tb_promotion33`](../database/legacy/tb_promotion33.md)
- [`tb_search_history`](../database/legacy/tb_search_history.md)
- [`tb_settings`](../database/legacy/tb_settings.md)
- [`tb_users`](../database/legacy/tb_users.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/cart`
- action: `actions/search`
- API route: `/api/china-search/image`

## 3rd-party / services

- China-search vendors (Laonet/Akucargo/TAMIT)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `PACRED_AKUCARGO_API_URL`
- `PACRED_TAMIT_DETAIL_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/get-user`
- `lib/china-search`
- `lib/china-search/akucargo`
- `lib/china-search/akucargo-helpers`
- `lib/supabase/admin`
- `lib/validators/cart`

## Exports / functions

- `SearchPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
