# `/admin/organization-email`

**อีเมลองค์กร**

> **Auth:** 🛡 Admin — roles: any admin role
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/organization-email/page.tsx`

## Database tables

- [`admins`](../../database/native/admins.md)
- [`tb_organization_email`](../../database/legacy/tb_organization_email.md)

## Components

- `components/ui/pacred-dialog`

## Server Actions / internal APIs

- action: `actions/admin/organization-email`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `OrgEmailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
