# `/wallet/withdraw`

**ถอนเงินจากกระเป๋า**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/wallet/withdraw/page.tsx`

## Database tables

- [`admin_audit_log`](../../database/native/admin_audit_log.md)
- [`profiles`](../../database/native/profiles.md)
- [`slips`](../../database/native/slips.md)
- [`tb_wallet`](../../database/legacy/tb_wallet.md)
- [`tb_wallet_hs`](../../database/legacy/tb_wallet_hs.md)
- [`wallet_transactions`](../../database/native/wallet_transactions.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/wallet`
- action: `actions/wallet-tb`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_GTM_ID`
- `NODE_ENV`

## Lib modules

- `lib/analytics`
- `lib/auth/get-user`

## Exports / functions

- `WalletWithdrawPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
