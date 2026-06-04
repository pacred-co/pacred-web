# `/admin/team-leaders`

**หัวหน้าทีม**

> **Auth:** 🛡 Admin — roles: `accounting`, `sales_admin` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/team-leaders/page.tsx`

## Database tables

- [`admins`](../../database/native/admins.md)
- [`customer_groups`](../../database/native/customer_groups.md)
- [`profiles`](../../database/native/profiles.md)
- [`team_leaders`](../../database/native/team_leaders.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/admin/team-leaders`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminTeamLeadersPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
