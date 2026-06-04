# `/admin/reports/containers-awaiting-th`

**ตู้ที่รอถึงไทย**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `warehouse`, `accounting` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/reports/containers-awaiting-th/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)

## Components

- `components/admin/csv-button`
- `components/admin/date-filter`

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

- `ContainersAwaitingThReport`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
