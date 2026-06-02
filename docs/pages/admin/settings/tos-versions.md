# `/admin/settings/tos-versions`

**จัดการเวอร์ชันข้อกำหนด**

> **Auth:** 🛡 Admin — roles: `super`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/settings/tos-versions/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tos_acceptances`](../../../database/native/tos_acceptances.md)
- [`tos_versions`](../../../database/native/tos_versions.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/tos-versions`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`
- `lib/validators/tos-version`

## Exports / functions

- `AdminTosVersionsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
