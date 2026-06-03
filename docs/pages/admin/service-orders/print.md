# `/admin/service-orders/print`

**พิมพ์ออเดอร์ฝากสั่งซื้อ**

> **Auth:** 🛡 Admin — roles: any admin role · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/service-orders/print/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_corporate`](../../../database/legacy/tb_corporate.md)
- [`tb_header_order`](../../../database/legacy/tb_header_order.md)
- [`tb_order`](../../../database/legacy/tb_order.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

- `components/print-button`

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

- `AdminServiceOrderPrintPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
