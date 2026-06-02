# `/login`

**เข้าสู่ระบบ (เบอร์/อีเมล + รหัสผ่าน · รองรับ legacy PCS login)**

> **Auth:** 👤 Guests only (signed-in users redirected to `/`)
> **Group:** `(auth)` · **Source:** `app/[locale]/(auth)/login/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../database/native/admins.md)
- [`corporate`](../database/native/corporate.md)
- [`documents`](../database/native/documents.md)
- [`profiles`](../database/native/profiles.md)

## Components

- `components/icons/social-icons`
- `components/sections/navbar`

## Server Actions / internal APIs

- action: `actions/auth`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_GTM_ID`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED`
- `NODE_ENV`

## Lib modules

- `lib/analytics`

## Exports / functions

- `LoginPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
