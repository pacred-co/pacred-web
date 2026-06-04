# `/admin/freight/shipments`

**shipment freight (admin)**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `sales_admin`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/freight/shipments/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`freight_shipments`](../../../database/native/freight_shipments.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`
- `lib/validators/freight-shipment`

## Exports / functions

- `AdminFreightShipmentsListPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
