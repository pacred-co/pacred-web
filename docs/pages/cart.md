# `/cart`

**ตะกร้าฝากสั่งซื้อ**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/cart/page.tsx`

## Database tables

- [`profiles`](../database/native/profiles.md)
- [`tb_address`](../database/legacy/tb_address.md)
- [`tb_address_main`](../database/legacy/tb_address_main.md)
- [`tb_cart`](../database/legacy/tb_cart.md)
- [`tb_corporate`](../database/legacy/tb_corporate.md)
- [`tb_forwarder`](../database/legacy/tb_forwarder.md)
- [`tb_header_order`](../database/legacy/tb_header_order.md)
- [`tb_order`](../database/legacy/tb_order.md)
- [`tb_pro_valentine`](../database/legacy/tb_pro_valentine.md)
- [`tb_promotion`](../database/legacy/tb_promotion.md)
- [`tb_promotion33`](../database/legacy/tb_promotion33.md)
- [`tb_settings`](../database/legacy/tb_settings.md)
- [`tb_users`](../database/legacy/tb_users.md)

## Components

- `components/seo/site`

## Server Actions / internal APIs

- action: `actions/cart`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_LEGACY_MEMBER_BASE`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/get-user`
- `lib/cart/ship-by-eligibility`
- `lib/legacy-image`
- `lib/supabase/admin`

## Exports / functions

- `CartPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
