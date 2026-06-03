# `/register`

**สมัครสมาชิกใหม่ (+ assign sales rep รอบ round-robin)**

> **Auth:** 👤 Guests only (signed-in users redirected to `/`)
> **Group:** `(auth)` · **Source:** `app/[locale]/(auth)/register/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../database/native/admins.md)
- [`corporate`](../database/native/corporate.md)
- [`documents`](../database/native/documents.md)
- [`otp_codes`](../database/native/otp_codes.md)
- [`profiles`](../database/native/profiles.md)

## Components

- `components/auth/otp-input`
- `components/hcaptcha-invisible`
- `components/sections/navbar`

## Server Actions / internal APIs

- action: `actions/auth`
- action: `actions/otp`
- API route: `/api/dbd/[taxId]`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `EMERGENCY_OTP_BYPASS`
- `NEXT_PUBLIC_GTM_ID`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NODE_ENV`
- `OTP_BYPASS`
- `OTP_PEPPER`
- `OTP_PEPPER_NEXT`

## Lib modules

- `lib/analytics`
- `lib/auth/get-user`
- `lib/supabase/server`

## Exports / functions

- `RegisterPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
