# `/book/[service]/[route]/confirmation`

**ยืนยันการจองสำเร็จ**

> **Auth:** 🌐 Public (no auth)
> **Group:** `(public)` · **Source:** `app/[locale]/(public)/book/[service]/[route]/confirmation/page.tsx`

## Request data (params)

- **route param** `service`
- **route param** `route`
- reads **`searchParams`** (query string)

## Database tables

- [`booking_options`](../../../../database/native/booking_options.md)
- [`bookings`](../../../../database/native/bookings.md)

## Components

- `components/sections/footer`
- `components/seo/site`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/booking/service-config`
- `lib/supabase/admin`

## Exports / functions

- `BookingConfirmationPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
