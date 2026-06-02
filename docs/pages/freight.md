# `/freight`

**Landing freight (FCL/LCL/AIR ระหว่างประเทศ)**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/freight/page.tsx`

## Database tables

- [`freight_invoices`](../database/native/freight_invoices.md)
- [`freight_quotes`](../database/native/freight_quotes.md)
- [`freight_shipments`](../database/native/freight_shipments.md)

## Components

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
- `lib/validators/freight-quote`
- `lib/validators/freight-shipment`

## Exports / functions

- `CustomerFreightHubPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
