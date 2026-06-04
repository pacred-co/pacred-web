# `/admin/freight/quotes/[id]`

**รายละเอียดใบเสนอราคา freight**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `sales_admin`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/freight/quotes/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admin_audit_log`](../../../../database/native/admin_audit_log.md)
- [`admins`](../../../../database/native/admins.md)
- [`freight_quote_items`](../../../../database/native/freight_quote_items.md)
- [`freight_quotes`](../../../../database/native/freight_quotes.md)
- [`freight_shipments`](../../../../database/native/freight_shipments.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/freight-quotes`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`
- `lib/validators/freight-quote`

## Exports / functions

- `AdminFreightQuoteDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
