# `/commissions/me/[id]`

**รายละเอียดคอมมิชชันรายการหนึ่ง**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/commissions/me/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`commission_withdrawal_items`](../../../database/native/commission_withdrawal_items.md)
- [`commission_withdrawals`](../../../database/native/commission_withdrawals.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

## Lib modules

- `lib/auth/require-admin`
- `lib/auth/require-auth`
- `lib/supabase/server`
- `lib/validators/commission`

## Exports / functions

- `MyWithdrawalDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
