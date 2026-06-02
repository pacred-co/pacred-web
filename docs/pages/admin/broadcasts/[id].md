# `/admin/broadcasts/[id]`

**รายละเอียด broadcast**

> **Auth:** 🛡 Admin — roles: `super`, `sales_admin`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/broadcasts/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`broadcasts`](../../../database/native/broadcasts.md)
- [`notifications`](../../../database/native/notifications.md)
- [`profiles`](../../../database/native/profiles.md)
- [`tb_admin`](../../../database/legacy/tb_admin.md)
- [`tb_notify`](../../../database/legacy/tb_notify.md)
- [`tb_notify_read`](../../../database/legacy/tb_notify_read.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/broadcasts`
- API route: `/api/cron/send-scheduled-broadcasts`

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

- `AdminBroadcastDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
