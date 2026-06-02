# `/profile/security/change-phone`

**เปลี่ยนเบอร์โทร (มี OTP)**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/profile/security/change-phone/page.tsx`

## Database tables

- [`profiles`](../../../database/native/profiles.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/security`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

## Lib modules

- `lib/auth/get-user`
- `lib/supabase/server`

## Exports / functions

- `ChangePhonePage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
