# `/admin/yuan-payments/[id]`

**รายละเอียด/อนุมัติรายการฝากโอน**

> **Auth:** 🛡 Admin — roles: `ops`, `accounting`, `super`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/yuan-payments/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_payment`](../../../database/legacy/tb_payment.md)
- [`tb_users`](../../../database/legacy/tb_users.md)
- [`tb_wallet_hs`](../../../database/legacy/tb_wallet_hs.md)

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

- `lib/auth/require-admin`
- `lib/legacy-paystatus-map`
- `lib/storage/legacy-resolver`
- `lib/supabase/admin`

## Exports / functions

- `AdminYuanPaymentDetail`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
