# `/reset-password`

**ตั้งรหัสผ่านใหม่ (จากลิงก์รีเซ็ต)**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(misc)` · **Source:** `app/[locale]/reset-password/page.tsx`

## Database tables

- [`admins`](../database/native/admins.md)
- [`corporate`](../database/native/corporate.md)
- [`documents`](../database/native/documents.md)
- [`profiles`](../database/native/profiles.md)

## Components

- `components/sections/navbar`
- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/auth`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED`

## Lib modules

- `lib/auth/get-user`

## Exports / functions

- `ResetPasswordPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
