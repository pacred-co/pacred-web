# `/book/[service]/[route]/review`

**ทบทวนรายการก่อนยืนยันการจอง**

> **Auth:** 🌐 Public (no auth)
> **Group:** `(public)` · **Source:** `app/[locale]/(public)/book/[service]/[route]/review/page.tsx`

## Request data (params)

- **route param** `service`
- **route param** `route`
- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../../database/native/admins.md)
- [`booking_options`](../../../../database/native/booking_options.md)
- [`booking_rates`](../../../../database/native/booking_rates.md)
- [`bookings`](../../../../database/native/bookings.md)
- [`documents`](../../../../database/native/documents.md)
- [`profiles`](../../../../database/native/profiles.md)

## Components

- `components/booking/BookingDocUploader`
- `components/sections/footer`
- `components/seo/site`

## Server Actions / internal APIs

- action: `actions/bookings`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/booking/service-config`
- `lib/supabase/admin`
- `lib/supabase/server`

## Exports / functions

- `BookingReviewPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
