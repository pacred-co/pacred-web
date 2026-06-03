# `/admin/refunds/new`

**สร้างคำขอคืนเงิน**

> **Auth:** 🛡 Admin — roles: `super`, `accounting` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/refunds/new/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`forwarders`](../../../database/native/forwarders.md)
- [`profiles`](../../../database/native/profiles.md)
- [`refund_requests`](../../../database/native/refund_requests.md)
- [`service_orders`](../../../database/native/service_orders.md)
- [`wallet_transactions`](../../../database/native/wallet_transactions.md)
- [`yuan_payments`](../../../database/native/yuan_payments.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/refunds`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-admin`
- `lib/validators/refund`

## Exports / functions

- `NewAdminRefundPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
