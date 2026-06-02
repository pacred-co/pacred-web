# `/admin/reports/containers-hs`

**ตู้แยกตาม HS code**

> **Auth:** 🛡 Admin — roles: any admin role
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/reports/containers-hs/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`container_hs_lines`](../../../database/native/container_hs_lines.md)

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

- `lib/supabase/admin`

## Exports / functions

- `ContainerHsReportPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
