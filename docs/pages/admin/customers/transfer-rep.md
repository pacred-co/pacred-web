# `/admin/customers/transfer-rep`

**ย้ายเซล (รายเดียว)**

> **Auth:** 🛡 Admin — roles: `sales_admin`, `super` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/customers/transfer-rep/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admin_contact_extras`](../../../database/native/admin_contact_extras.md)
- [`admins`](../../../database/native/admins.md)
- [`profiles`](../../../database/native/profiles.md)
- [`tb_admin`](../../../database/legacy/tb_admin.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/admins`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `TransferSalesRepPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
