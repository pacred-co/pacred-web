# `/admin/api-forwarder-momo/sync`

**sync ข้อมูล MOMO (พรีวิว/ดึง)**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `warehouse`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/api-forwarder-momo/sync/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`momo_container_closed`](../../../database/native/momo_container_closed.md)
- [`momo_import_tracks`](../../../database/native/momo_import_tracks.md)
- [`momo_sack_infos`](../../../database/native/momo_sack_infos.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- API route: `/api/admin/momo/sync`
- API route: `/api/admin/momo/sync-preview`

## 3rd-party / services

- MOMO/JMF partner API
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/integrations/momo-isolated/types`
- `lib/supabase/admin`

## Exports / functions

- `AdminMomoSyncPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
