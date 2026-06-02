# `/service-import`

**ฝากนำเข้า — รายการออเดอร์นำเข้าของลูกค้า**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/service-import/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`forwarder_cost_adjustments`](../database/native/forwarder_cost_adjustments.md)
- [`forwarders`](../database/native/forwarders.md)
- [`profiles`](../database/native/profiles.md)
- [`slips`](../database/native/slips.md)
- [`tb_address`](../database/legacy/tb_address.md)
- [`tb_address_main`](../database/legacy/tb_address_main.md)
- [`tb_cash_back`](../database/legacy/tb_cash_back.md)
- [`tb_corporate`](../database/legacy/tb_corporate.md)
- [`tb_credit`](../database/legacy/tb_credit.md)
- [`tb_forwarder`](../database/legacy/tb_forwarder.md)
- [`tb_forwarder_driver_item`](../database/legacy/tb_forwarder_driver_item.md)
- [`tb_promotion`](../database/legacy/tb_promotion.md)
- [`tb_users`](../database/legacy/tb_users.md)
- [`tb_wallet_hs`](../database/legacy/tb_wallet_hs.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/forwarder`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `PROMPTPAY_ID`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/get-user`
- `lib/promo/banners`
- `lib/supabase/admin`

## Exports / functions

- `ServiceImportPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
