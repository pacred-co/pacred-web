# `/admin/freight/declarations/[id]`

**รายละเอียดใบขนสินค้า**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/freight/declarations/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admin_audit_log`](../../../../database/native/admin_audit_log.md)
- [`admins`](../../../../database/native/admins.md)
- [`customs_declaration_lines`](../../../../database/native/customs_declaration_lines.md)
- [`customs_declarations`](../../../../database/native/customs_declarations.md)
- [`freight_invoice_lines`](../../../../database/native/freight_invoice_lines.md)
- [`freight_invoices`](../../../../database/native/freight_invoices.md)
- [`freight_shipments`](../../../../database/native/freight_shipments.md)
- [`hs_codes`](../../../../database/native/hs_codes.md)
- [`profiles`](../../../../database/native/profiles.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/customs-declarations`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`
- `lib/validators/customs-declaration`

## Exports / functions

- `AdminCustomsDeclarationDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
