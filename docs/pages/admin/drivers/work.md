# `/admin/drivers/work`

**งานคนขับ**

> **Auth:** 🛡 Admin — roles: `driver`, `ops`, `super` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/drivers/work/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`profiles`](../../../database/native/profiles.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_forwarder_driver`](../../../database/legacy/tb_forwarder_driver.md)
- [`tb_forwarder_driver_item`](../../../database/legacy/tb_forwarder_driver_item.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/driver-work`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/storage/upload`
- `lib/supabase/admin`
- `lib/supabase/server`

## Exports / functions

- `DriverWorkPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
