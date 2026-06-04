# `/service-order`

**ฝากสั่งซื้อ — รายการออเดอร์สั่งซื้อ**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/service-order/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`profiles`](../database/native/profiles.md)
- [`tb_corporate`](../database/legacy/tb_corporate.md)
- [`tb_header_order`](../database/legacy/tb_header_order.md)
- [`tb_promotion`](../database/legacy/tb_promotion.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_LEGACY_MEMBER_BASE`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/get-user`
- `lib/legacy-image`
- `lib/supabase/admin`

## Exports / functions

- `ServiceOrderPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
