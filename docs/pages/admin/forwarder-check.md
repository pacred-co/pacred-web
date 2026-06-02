# `/admin/forwarder-check`

**ตรวจ/ออกบิลแบบกลุ่ม (bulk-bill)**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/forwarder-check/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../database/native/admins.md)
- [`tb_check_forwarder`](../../database/legacy/tb_check_forwarder.md)
- [`tb_forwarder`](../../database/legacy/tb_forwarder.md)
- [`tb_forwarder_import2`](../../database/legacy/tb_forwarder_import2.md)
- [`tb_promotion`](../../database/legacy/tb_promotion.md)
- [`tb_users`](../../database/legacy/tb_users.md)

## Components

- `components/admin/top-menu-report`

## Server Actions / internal APIs

- action: `actions/admin/forwarder-check`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/admin/default-queue-filter`
- `lib/auth/require-admin`
- `lib/forwarder/outstanding`
- `lib/storage/legacy-resolver`
- `lib/supabase/admin`

## Exports / functions

- `AdminForwarderCheckPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
