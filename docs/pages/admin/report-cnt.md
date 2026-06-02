# `/admin/report-cnt`

**รายงานตู้ (per-container)**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `accounting`, `warehouse`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/report-cnt/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../database/native/admins.md)
- [`tb_cnt_item`](../../database/legacy/tb_cnt_item.md)
- [`tb_forwarder`](../../database/legacy/tb_forwarder.md)

## Components

- `components/admin/top-menu-report`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/admin/forwarder-status`
- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminReportCntPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
