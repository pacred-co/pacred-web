# `/admin/hr/org-chart`

**ผังองค์กร (chart)**

> **Auth:** 🛡 Admin — roles: any admin role
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/hr/org-chart/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`org_assignments`](../../../database/native/org_assignments.md)
- [`org_branches`](../../../database/native/org_branches.md)
- [`org_positions`](../../../database/native/org_positions.md)
- [`org_sections`](../../../database/native/org_sections.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

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

- `OrgChartPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
