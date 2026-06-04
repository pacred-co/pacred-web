# `/bookings/[bookingNo]`

**รายละเอียดการจอง**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/bookings/[bookingNo]/page.tsx`

## Request data (params)

- **route param** `bookingNo`

## Database tables

- [`admins`](../../database/native/admins.md)
- [`booking_options`](../../database/native/booking_options.md)
- [`booking_rates`](../../database/native/booking_rates.md)
- [`bookings`](../../database/native/bookings.md)
- [`documents`](../../database/native/documents.md)
- [`freight_quotes`](../../database/native/freight_quotes.md)

## Components

- `components/seo/site`

## Server Actions / internal APIs

- action: `actions/bookings`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

## Lib modules

- `lib/booking/service-config`
- `lib/supabase/server`

## Exports / functions

- `BookingDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
