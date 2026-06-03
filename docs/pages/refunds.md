# `/refunds`

**คำขอคืนเงินของลูกค้า**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/refunds/page.tsx`

## Database tables

- [`admin_audit_log`](../database/native/admin_audit_log.md)
- [`forwarders`](../database/native/forwarders.md)
- [`refund_requests`](../database/native/refund_requests.md)
- [`service_orders`](../database/native/service_orders.md)
- [`yuan_payments`](../database/native/yuan_payments.md)

## Components

- `components/seo/site`

## Server Actions / internal APIs

- action: `actions/refunds`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

## Lib modules

- `lib/auth/require-auth`
- `lib/supabase/server`
- `lib/validators/refund`

## Exports / functions

- `CustomerRefundsHubPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
