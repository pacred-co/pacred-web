# `/admin/customers/transfer-bulk`

**ย้ายเซลแบบกลุ่ม**

> **Auth:** 🛡 Admin — roles: `sales_admin`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/customers/transfer-bulk/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`profiles`](../../../database/native/profiles.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/customer-transfer-bulk`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `TransferBulkPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
