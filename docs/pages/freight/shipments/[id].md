# `/freight/shipments/[id]`

**รายละเอียด shipment freight**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/freight/shipments/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`freight_invoice_payments`](../../../database/native/freight_invoice_payments.md)
- [`freight_invoices`](../../../database/native/freight_invoices.md)
- [`freight_parties`](../../../database/native/freight_parties.md)
- [`freight_shipments`](../../../database/native/freight_shipments.md)
- [`withholding_tax_entries`](../../../database/native/withholding_tax_entries.md)

## Components

- `components/customer-wht-upload-panel`
- `components/seo/site`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

## Lib modules

- `lib/supabase/server`
- `lib/validators/freight-payment`
- `lib/validators/freight-shipment`

## Exports / functions

- `CustomerFreightShipmentDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
