# `/admin/reports/credit-pending`

**เครดิตที่รออนุมัติ**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `accounting` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/reports/credit-pending/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

- `components/admin/csv-button`
- `components/admin/date-filter`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/forwarder/outstanding`
- `lib/legacy-status-map`
- `lib/supabase/admin`

## Exports / functions

- `CreditPendingReport`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
