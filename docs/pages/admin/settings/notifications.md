# `/admin/settings/notifications`

**ตั้งค่าการแจ้งเตือน**

> **Auth:** 🛡 Admin — roles: any admin role
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/settings/notifications/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`corporate`](../../../database/native/corporate.md)
- [`profiles`](../../../database/native/profiles.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/profile`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminNotificationsSettingsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
