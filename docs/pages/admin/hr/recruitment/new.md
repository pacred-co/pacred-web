# `/admin/hr/recruitment/new`

**เพิ่มประกาศ/ผู้สมัคร**

> **Auth:** 🛡 Admin — roles: any admin role · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/hr/recruitment/new/page.tsx`

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

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-admin`

## Exports / functions

- `NewRecruitmentPostingPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
