# `/admin/settings/business-config`

**ตั้งค่าธุรกิจ (key-value)**

> **Auth:** 🛡 Admin — roles: `super`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/settings/business-config/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`business_config`](../../../database/native/business_config.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/business-config`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-admin`
- `lib/business-config`

## Exports / functions

- `AdminBusinessConfigPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
