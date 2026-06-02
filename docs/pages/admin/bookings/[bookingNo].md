# `/admin/bookings/[bookingNo]`

**รายละเอียดการจอง**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `sales_admin`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/bookings/[bookingNo]/page.tsx`

## Request data (params)

- **route param** `bookingNo`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`booking_options`](../../../database/native/booking_options.md)
- [`booking_rates`](../../../database/native/booking_rates.md)
- [`bookings`](../../../database/native/bookings.md)
- [`documents`](../../../database/native/documents.md)
- [`freight_quotes`](../../../database/native/freight_quotes.md)
- [`work_items`](../../../database/native/work_items.md)

## Components

- `components/admin/work-item-thread`

## Server Actions / internal APIs

- action: `actions/admin/bookings`
- action: `actions/bookings`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/booking/service-config`
- `lib/supabase/admin`
- `lib/validators/booking`

## Exports / functions

- `AdminBookingDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
