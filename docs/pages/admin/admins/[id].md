# `/admin/admins/[id]`

**รายละเอียดผู้ดูแลรายคน**

> **Auth:** 🛡 Admin — roles: any admin role
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/admins/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admin_contact_extras`](../../../database/native/admin_contact_extras.md)
- [`admins`](../../../database/native/admins.md)
- [`profiles`](../../../database/native/profiles.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminProfilePage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
