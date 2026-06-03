# `/admin/containers/[id]`

**รายละเอียดตู้**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `warehouse`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/containers/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admins`](../../../database/native/admins.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-admin`

## Exports / functions

- `LegacyContainerDetailRedirect`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
