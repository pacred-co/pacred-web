# `/admin/tax-invoices/[id]`

**รายละเอียดใบกำกับภาษี**

> **Auth:** 🛡 Admin — roles: `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/tax-invoices/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`forwarders`](../../../database/native/forwarders.md)
- [`freight_invoices`](../../../database/native/freight_invoices.md)
- [`service_orders`](../../../database/native/service_orders.md)
- [`tax_invoice_lines`](../../../database/native/tax_invoice_lines.md)
- [`tax_invoices`](../../../database/native/tax_invoices.md)
- [`withholding_tax_entries`](../../../database/native/withholding_tax_entries.md)

## Components

- `components/ui/tooltip`

## Server Actions / internal APIs

- action: `actions/admin/tax-invoices`
- action: `actions/admin/wht`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`
- `lib/validators/withholding-tax`

## Exports / functions

- `AdminTaxInvoiceDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
