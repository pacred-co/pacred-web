# `/wallet`

**กระเป๋าเงินลูกค้า (ยอดคงเหลือ)**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/wallet/page.tsx`

## Database tables

- [`profiles`](../database/native/profiles.md)
- [`tb_users`](../database/legacy/tb_users.md)
- [`tb_wallet`](../database/legacy/tb_wallet.md)
- [`tb_wallet_hs`](../database/legacy/tb_wallet_hs.md)

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

- `WalletPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
