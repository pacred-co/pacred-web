# `/profile`

**โปรไฟล์ลูกค้า**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/profile/page.tsx`

## Database tables

- [`profiles`](../database/native/profiles.md)
- [`tb_address`](../database/legacy/tb_address.md)
- [`tb_address_main`](../database/legacy/tb_address_main.md)
- [`tb_forwarder`](../database/legacy/tb_forwarder.md)
- [`tb_header_order`](../database/legacy/tb_header_order.md)
- [`tb_payment`](../database/legacy/tb_payment.md)
- [`tb_users`](../database/legacy/tb_users.md)
- [`tb_wallet`](../database/legacy/tb_wallet.md)

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

- `lib/auth/get-user`
- `lib/supabase/admin`

## Exports / functions

- `ProfilePage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
