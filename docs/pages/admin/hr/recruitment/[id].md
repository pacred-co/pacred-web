# `/admin/hr/recruitment/[id]`

**รายละเอียดผู้สมัคร**

> **Auth:** 🛡 Admin — roles: any admin role
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/hr/recruitment/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admins`](../../../../database/native/admins.md)
- [`job_applicants`](../../../../database/native/job_applicants.md)
- [`tb_post_job`](../../../../database/legacy/tb_post_job.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/admin/recruitment`

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

- `PostingDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
