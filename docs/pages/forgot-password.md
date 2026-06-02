# `/forgot-password`

**ขอรีเซ็ตรหัสผ่าน**

> **Auth:** 👤 Guests only (signed-in users redirected to `/`)
> **Group:** `(auth)` · **Source:** `app/[locale]/(auth)/forgot-password/page.tsx`

## Database tables

- [`admins`](../database/native/admins.md)
- [`corporate`](../database/native/corporate.md)
- [`documents`](../database/native/documents.md)
- [`profiles`](../database/native/profiles.md)

## Components

- `components/hcaptcha-invisible`
- `components/sections/navbar`
- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/auth`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED`

## Exports / functions

- `ForgotPasswordPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
