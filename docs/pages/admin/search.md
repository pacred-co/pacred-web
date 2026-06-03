# `/admin/search`

**ค้นหาข้ามระบบ (admin)**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `accounting`, `sales_admin`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/search/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../database/native/admins.md)
- [`forwarders`](../../database/native/forwarders.md)
- [`freight_quotes`](../../database/native/freight_quotes.md)
- [`freight_shipments`](../../database/native/freight_shipments.md)
- [`profiles`](../../database/native/profiles.md)
- [`refund_requests`](../../database/native/refund_requests.md)
- [`service_orders`](../../database/native/service_orders.md)
- [`tax_invoices`](../../database/native/tax_invoices.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

_None._

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

- `AdminGlobalSearchPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
