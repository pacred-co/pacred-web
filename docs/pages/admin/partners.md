# `/admin/partners`

**ไดเรกทอรีพันธมิตร (logistics/business partners · CRUD)**

> **Auth:** 🛡 Admin — roles: `super`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/partners/page.tsx`

## Database tables

- [`admins`](../../database/native/admins.md)
- [`partners`](../../database/native/partners.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/partners`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminPartnersPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
