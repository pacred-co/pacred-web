# `/admin/wallet`

**จัดการกระเป๋าเงินลูกค้า (admin)**

> **Auth:** 🛡 Admin — roles: `ops`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/wallet/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../database/native/admins.md)
- [`tb_cash_back`](../../database/legacy/tb_cash_back.md)
- [`tb_users`](../../database/legacy/tb_users.md)
- [`tb_wallet`](../../database/legacy/tb_wallet.md)
- [`tb_wallet_hs`](../../database/legacy/tb_wallet_hs.md)

## Components

- `components/admin/page-top-menubar`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/admin/default-queue-filter`
- `lib/auth/require-admin`
- `lib/storage/legacy-resolver`
- `lib/supabase/admin`

## Exports / functions

- `AdminWalletPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
