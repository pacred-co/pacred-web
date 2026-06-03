# `/admin/payment-reconciliation`

**กระทบยอดการชำระ**

> **Auth:** 🛡 Admin — roles: `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/payment-reconciliation/page.tsx`

## Database tables

- [`admins`](../../database/native/admins.md)
- [`forwarders`](../../database/native/forwarders.md)
- [`wallet_transactions`](../../database/native/wallet_transactions.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/payment-reconciliation`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-admin`

## Exports / functions

- `PaymentReconciliationPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
