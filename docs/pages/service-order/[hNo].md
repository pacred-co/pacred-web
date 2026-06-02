# `/service-order/[hNo]`

**รายละเอียดออเดอร์ฝากสั่งซื้อ**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/service-order/[hNo]/page.tsx`

## Request data (params)

- **route param** `hNo`

## Database tables

- [`profiles`](../../database/native/profiles.md)
- [`tb_cash_back`](../../database/legacy/tb_cash_back.md)
- [`tb_corporate`](../../database/legacy/tb_corporate.md)
- [`tb_header_order`](../../database/legacy/tb_header_order.md)
- [`tb_order`](../../database/legacy/tb_order.md)
- [`tb_users`](../../database/legacy/tb_users.md)
- [`tb_wallet`](../../database/legacy/tb_wallet.md)
- [`tb_wallet_hs`](../../database/legacy/tb_wallet_hs.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/service-order`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/legacy-status-map`
- `lib/supabase/admin`
- `lib/supabase/server`

## Exports / functions

- `ServiceOrderDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
