# `/admin/service-orders/cart/add`

**เพิ่มสินค้าในตะกร้า (admin)**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `sales_admin` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/service-orders/cart/add/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../../database/native/admins.md)
- [`tb_admin`](../../../../database/legacy/tb_admin.md)
- [`tb_cart`](../../../../database/legacy/tb_cart.md)
- [`tb_header_order`](../../../../database/legacy/tb_header_order.md)
- [`tb_order`](../../../../database/legacy/tb_order.md)
- [`tb_settings`](../../../../database/legacy/tb_settings.md)
- [`tb_users`](../../../../database/legacy/tb_users.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/cart`
- action: `actions/admin/product-search`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`
- `lib/validators/admin-cart`

## Exports / functions

- `AdminCartAddPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
