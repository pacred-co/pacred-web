# `/admin/freight/shipments/[id]`

**รายละเอียด shipment freight**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `sales_admin`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/freight/shipments/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admin_audit_log`](../../../../database/native/admin_audit_log.md)
- [`admins`](../../../../database/native/admins.md)
- [`customs_declaration_lines`](../../../../database/native/customs_declaration_lines.md)
- [`customs_declarations`](../../../../database/native/customs_declarations.md)
- [`freight_invoice_lines`](../../../../database/native/freight_invoice_lines.md)
- [`freight_invoice_payments`](../../../../database/native/freight_invoice_payments.md)
- [`freight_invoices`](../../../../database/native/freight_invoices.md)
- [`freight_parties`](../../../../database/native/freight_parties.md)
- [`freight_shipments`](../../../../database/native/freight_shipments.md)
- [`hs_codes`](../../../../database/native/hs_codes.md)
- [`profiles`](../../../../database/native/profiles.md)
- [`wallet_transactions`](../../../../database/native/wallet_transactions.md)
- [`withholding_tax_entries`](../../../../database/native/withholding_tax_entries.md)
- [`work_items`](../../../../database/native/work_items.md)

## Components

- `components/admin/work-item-thread`

## Server Actions / internal APIs

- action: `actions/admin/customs-declarations`
- action: `actions/admin/freight-invoice-payments`
- action: `actions/admin/freight-invoices`
- action: `actions/admin/freight-shipments`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`
- `lib/validators/customs-declaration`
- `lib/validators/freight-payment`
- `lib/validators/freight-shipment`

## Exports / functions

- `AdminFreightShipmentDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
