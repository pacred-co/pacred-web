# `/book-start`

**จุดเริ่มจอง (auth-gated)**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(public)` · **Source:** `app/[locale]/(public)/book-start/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

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

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

## Lib modules

- `lib/supabase/server`

## Exports / functions

- `BookStartPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
