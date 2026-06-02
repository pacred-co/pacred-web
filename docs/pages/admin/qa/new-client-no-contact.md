# `/admin/qa/new-client-no-contact`

**QA: ลูกค้าใหม่ยังไม่ติดต่อ**

> **Auth:** 🛡 Admin — roles: `ops`, `accounting`, `super`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/qa/new-client-no-contact/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

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
- `lib/datetime-helpers`
- `lib/supabase/admin`

## Exports / functions

- `NewClientNoContactPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
