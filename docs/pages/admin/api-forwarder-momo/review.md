# `/admin/api-forwarder-momo/review`

**ตรวจ/commit ข้อมูล MOMO**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `warehouse`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/api-forwarder-momo/review/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`momo_import_tracks`](../../../database/native/momo_import_tracks.md)
- [`momo_sync_logs`](../../../database/native/momo_sync_logs.md)
- [`tb_address`](../../../database/legacy/tb_address.md)
- [`tb_address_main`](../../../database/legacy/tb_address_main.md)
- [`tb_admin`](../../../database/legacy/tb_admin.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/momo-commit`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/admin/commit-momo-row-core`
- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminMomoReviewPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
