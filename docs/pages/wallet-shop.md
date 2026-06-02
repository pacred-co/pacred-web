# `/wallet-shop`

**กระเป๋าเงินร้านค้า**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/wallet-shop/page.tsx`

## Database tables

- [`tb_shop_transactions`](../database/legacy/tb_shop_transactions.md)
- [`tb_wallet_shop`](../database/legacy/tb_wallet_shop.md)
- [`wallet_transactions`](../database/native/wallet_transactions.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/affiliate-shop-wallet`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-auth`

## Exports / functions

- `WalletShopPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
