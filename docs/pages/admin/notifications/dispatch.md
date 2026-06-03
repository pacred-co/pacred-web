# `/admin/notifications/dispatch`

**ส่งการแจ้งเตือน**

> **Auth:** 🛡 Admin — roles: `super`, `ops`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/notifications/dispatch/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`notifications`](../../../database/native/notifications.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/notifications`
- API route: `/api/cron/dispatch-line-notify`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminNotificationsDispatchPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
