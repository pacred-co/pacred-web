# `/bookings`

**รายการการจองของลูกค้า**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/bookings/page.tsx`

## Database tables

- [`admins`](../database/native/admins.md)
- [`booking_options`](../database/native/booking_options.md)
- [`booking_rates`](../database/native/booking_rates.md)
- [`bookings`](../database/native/bookings.md)
- [`documents`](../database/native/documents.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/bookings`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/booking/service-config`

## Exports / functions

- `MyBookingsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
