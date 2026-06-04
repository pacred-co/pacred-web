# `/admin/yuan-payments`

**รายการฝากโอนหยวน (admin)**

> **Auth:** 🛡 Admin — roles: `ops`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/yuan-payments/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../database/native/admins.md)
- [`tb_admin`](../../database/legacy/tb_admin.md)
- [`tb_forwarder`](../../database/legacy/tb_forwarder.md)
- [`tb_payment`](../../database/legacy/tb_payment.md)
- [`tb_users`](../../database/legacy/tb_users.md)
- [`tb_wallet`](../../database/legacy/tb_wallet.md)
- [`tb_wallet_hs`](../../database/legacy/tb_wallet_hs.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/tb-bulk`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminYuanPaymentsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
