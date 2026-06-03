# `/admin/hr/training`

**อบรมพนักงาน**

> **Auth:** 🛡 Admin — roles: any admin role
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/hr/training/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`training_courses`](../../../database/native/training_courses.md)
- [`training_enrollments`](../../../database/native/training_enrollments.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/admin/learning`

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

- `AdminHRTrainingPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
