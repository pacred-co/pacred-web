# `/admin/board`

**กระดานงาน (work-board)**

> **Auth:** 🛡 Admin — roles: any admin role
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/board/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../database/native/admins.md)
- [`profiles`](../../database/native/profiles.md)
- [`work_items`](../../database/native/work_items.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/work-items`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`
- `lib/validators/work-item`

## Exports / functions

- `AdminBoardPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
