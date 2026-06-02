# `/admin/hr/policies`

**นโยบายบริษัท**

> **Auth:** 🛡 Admin — roles: any admin role
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/hr/policies/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`policies`](../../../database/native/policies.md)
- [`policy_acknowledgments`](../../../database/native/policy_acknowledgments.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/admin/policies`

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

- `AdminHRPoliciesPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
