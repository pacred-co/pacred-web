# `/admin/hr/attendance/leaves`

**การลา**

> **Auth:** 🛡 Admin — roles: any admin role
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/hr/attendance/leaves/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../../database/native/admins.md)
- [`tas_holiday`](../../../../database/native/tas_holiday.md)
- [`tas_leave`](../../../../database/native/tas_leave.md)
- [`tb_admin`](../../../../database/legacy/tb_admin.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/admin/attendance`

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

- `AdminHRLeavesPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
