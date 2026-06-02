# `/admin/api-forwarder-momo`

**เชื่อม API MOMO forwarder**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `warehouse`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/api-forwarder-momo/page.tsx`

## Database tables

- [`admins`](../../database/native/admins.md)
- [`momo_import_tracks`](../../database/native/momo_import_tracks.md)
- [`momo_sync_logs`](../../database/native/momo_sync_logs.md)
- [`tb_forwarder`](../../database/legacy/tb_forwarder.md)

## Components

- `components/admin/page-top-menubar`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminApiForwarderMomoPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
