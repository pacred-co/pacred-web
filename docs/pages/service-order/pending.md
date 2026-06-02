# `/service-order/pending`

**ออเดอร์ฝากสั่งซื้อที่รอดำเนินการ**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/service-order/pending/page.tsx`

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

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/service-order`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Exports / functions

- `ServiceOrderPendingPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
