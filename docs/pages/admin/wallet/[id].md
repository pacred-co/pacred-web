# `/admin/wallet/[id]`

**กระเป๋าเงินลูกค้ารายคน (เติม/สลิป)**

> **Auth:** 🛡 Admin — roles: `ops`, `accounting`, `super`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/wallet/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_admin`](../../../database/legacy/tb_admin.md)
- [`tb_cash_back`](../../../database/legacy/tb_cash_back.md)
- [`tb_cash_back_hs`](../../../database/legacy/tb_cash_back_hs.md)
- [`tb_credit`](../../../database/legacy/tb_credit.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_header_order`](../../../database/legacy/tb_header_order.md)
- [`tb_users`](../../../database/legacy/tb_users.md)
- [`tb_wallet`](../../../database/legacy/tb_wallet.md)
- [`tb_wallet_hs`](../../../database/legacy/tb_wallet_hs.md)
- [`tb_wallet_paydeposit`](../../../database/legacy/tb_wallet_paydeposit.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/wallet-hs`
- action: `actions/admin/wallet-trans`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/storage/legacy-resolver`
- `lib/supabase/admin`

## Exports / functions

- `AdminWalletDetail`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
