# `/sales/report`

**รายงานยอดขาย**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/sales/report/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`profiles`](../../database/native/profiles.md)
- [`tb_forwarder`](../../database/legacy/tb_forwarder.md)
- [`tb_user_sales`](../../database/legacy/tb_user_sales.md)
- [`tb_users`](../../database/legacy/tb_users.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/get-user`
- `lib/supabase/admin`

## Exports / functions

- `SalesReportPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
