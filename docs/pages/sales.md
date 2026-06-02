# `/sales`

**หน้าเซล (ตัวแทน/พนักงานขาย)**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/sales/page.tsx`

## Database tables

- [`profiles`](../database/native/profiles.md)
- [`tb_address`](../database/legacy/tb_address.md)
- [`tb_address_main`](../database/legacy/tb_address_main.md)
- [`tb_corporate`](../database/legacy/tb_corporate.md)
- [`tb_rate_custom_cbm`](../database/legacy/tb_rate_custom_cbm.md)
- [`tb_users`](../database/legacy/tb_users.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_LEGACY_MEMBER_BASE`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/get-user`
- `lib/legacy-image`
- `lib/supabase/admin`

## Exports / functions

- `SalesTeamMembersPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
