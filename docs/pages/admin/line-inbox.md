# `/admin/line-inbox`

**กล่องข้อความ LINE (อ่านข้อมูลจาก Worker)**

> **Auth:** 🛡 Admin — roles: any admin role
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/line-inbox/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../database/native/admins.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/line-inbox`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/admin/line-inbox-types`
- `lib/auth/require-admin`
- `lib/utils/relative-time`

## Exports / functions

- `AdminLineInboxPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
