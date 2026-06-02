# `/admin/drivers/[id]`

**รายละเอียดคนขับ**

> **Auth:** 🛡 Admin — roles: `ops`, `super`, `driver`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/drivers/[id]/page.tsx`

## Request data (params)

- **route param** `id`

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

- action: `actions/admin/driver-batches`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/storage/upload`
- `lib/supabase/admin`

## Exports / functions

- `AdminDriverBatchDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
