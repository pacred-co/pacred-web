# `/freight/quotes/[quote_no]`

**ใบเสนอราคา freight ของลูกค้า**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/freight/quotes/[quote_no]/page.tsx`

## Request data (params)

- **route param** `quote_no`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`freight_quote_items`](../../../database/native/freight_quote_items.md)
- [`freight_quotes`](../../../database/native/freight_quotes.md)
- [`tb_receipt`](../../../database/legacy/tb_receipt.md)

## Components

- `components/seo/site`

## Server Actions / internal APIs

- action: `actions/freight`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

## Lib modules

- `lib/supabase/server`
- `lib/validators/freight-quote`

## Exports / functions

- `CustomerFreightQuoteDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
