# `/admin/csv-imports`

**งานนำเข้า CSV**

> **Auth:** 🛡 Admin — roles: any admin role · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/csv-imports/page.tsx`

## Database tables

- [`csv_imports`](../../database/native/csv_imports.md)
- [`forwarders`](../../database/native/forwarders.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/admin/csv-imports`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/admin/csv-import-sweep`
- `lib/supabase/admin`

## Exports / functions

- `AdminCsvImportsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
