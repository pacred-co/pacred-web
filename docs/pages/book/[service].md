# `/book/[service]`

**เลือกบริการที่จะจอง**

> **Auth:** 🌐 Public (no auth)
> **Group:** `(public)` · **Source:** `app/[locale]/(public)/book/[service]/page.tsx`

## Request data (params)

- **route param** `service`
- reads **`searchParams`** (query string)

## Database tables

- [`booking_rates`](../../database/native/booking_rates.md)

## Components

- `components/booking/BookingDetailPage`
- `components/sections/footer`
- `components/sections/navbar`
- `components/seo/json-ld`
- `components/seo/schemas`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

## Lib modules

- `lib/booking/page-data`
- `lib/booking/service-config`
- `lib/supabase/server`

## Exports / functions

- `generateMetadata`
- `BookServicePage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
