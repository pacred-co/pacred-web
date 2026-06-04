# `/wallet/history`

**ประวัติเดินบัญชีกระเป๋าเงิน**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/wallet/history/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admin_audit_log`](../../database/native/admin_audit_log.md)
- [`profiles`](../../database/native/profiles.md)
- [`slips`](../../database/native/slips.md)
- [`tb_credit`](../../database/legacy/tb_credit.md)
- [`tb_users`](../../database/legacy/tb_users.md)
- [`tb_wallet`](../../database/legacy/tb_wallet.md)
- [`tb_wallet_hs`](../../database/legacy/tb_wallet_hs.md)
- [`wallet_transactions`](../../database/native/wallet_transactions.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/credit`
- action: `actions/wallet`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/get-user`

## Exports / functions

- `WalletHistoryPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
