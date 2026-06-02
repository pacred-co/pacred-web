# `/admin/admins/[id]/edit`

**แก้ไขข้อมูลผู้ดูแล**

> **Auth:** 🛡 Admin — roles: `super` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/admins/[id]/edit/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admin_contact_extras`](../../../../database/native/admin_contact_extras.md)
- [`admins`](../../../../database/native/admins.md)
- [`profiles`](../../../../database/native/profiles.md)
- [`tb_users`](../../../../database/legacy/tb_users.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/admins`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-admin`
- `lib/validators/admin-form`

## Exports / functions

- `AdminEditPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
