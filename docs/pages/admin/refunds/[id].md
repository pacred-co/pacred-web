# `/admin/refunds/[id]`

**รายละเอียดคืนเงิน**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`, `ops`, `sales_admin`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/refunds/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admin_audit_log`](../../../database/native/admin_audit_log.md)
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

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`
- `lib/validators/refund`

## Exports / functions

- `AdminRefundDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
