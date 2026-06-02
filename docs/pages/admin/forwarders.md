# `/admin/forwarders`

**รายการออเดอร์ฝากนำเข้า (admin)**

> **Auth:** 🛡 Admin — roles: `ops`, `accounting` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/forwarders/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../database/native/admins.md)
- [`forwarders`](../../database/native/forwarders.md)
- [`tb_corporate`](../../database/legacy/tb_corporate.md)
- [`tb_forwarder`](../../database/legacy/tb_forwarder.md)
- [`tb_forwarder_driver_item`](../../database/legacy/tb_forwarder_driver_item.md)
- [`tb_log_forwarder_status`](../../database/legacy/tb_log_forwarder_status.md)
- [`tb_rate_custom_cbm`](../../database/legacy/tb_rate_custom_cbm.md)
- [`tb_users`](../../database/legacy/tb_users.md)

## Components

- `components/admin/page-top-menubar`

## Server Actions / internal APIs

- action: `actions/admin/forwarders`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/admin/default-queue-filter`
- `lib/auth/require-admin`
- `lib/forwarder/outstanding`
- `lib/storage/legacy-resolver`
- `lib/supabase/admin`

## Exports / functions

- `AdminForwardersPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
