# `/m/dashboard`

**แดชบอร์ดลูกค้าเวอร์ชันมือถือ**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/m/dashboard/page.tsx`

## Database tables

- [`admins`](../../database/native/admins.md)
- [`corporate`](../../database/native/corporate.md)
- [`documents`](../../database/native/documents.md)
- [`profiles`](../../database/native/profiles.md)
- [`tb_wallet`](../../database/legacy/tb_wallet.md)

## Components

- `components/seo/site`

## Server Actions / internal APIs

- action: `actions/auth`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/get-user`
- `lib/supabase/admin`

## Exports / functions

- `MobileDashboardPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
