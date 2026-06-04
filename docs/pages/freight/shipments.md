# `/freight/shipments`

**รายการ shipment freight ของลูกค้า**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/freight/shipments/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`freight_invoices`](../../database/native/freight_invoices.md)
- [`freight_shipments`](../../database/native/freight_shipments.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

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

- `CustomerFreightShipmentsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
