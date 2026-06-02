# `/admin/settings/promos`

**จัดการโปรโมชัน + อัปโหลดรูปแบนเนอร์**

> **Auth:** 🛡 Admin — roles: `super`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/settings/promos/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`business_config`](../../../database/native/business_config.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/promo-banners`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-admin`
- `lib/promo/banners`

## Exports / functions

- `AdminPromosPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
