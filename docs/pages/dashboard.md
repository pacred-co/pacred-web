# `/dashboard`

**แดชบอร์ดลูกค้า — สรุปออเดอร์/กระเป๋าเงิน/แจ้งเตือน**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/dashboard/page.tsx`

## Database tables

- [`profiles`](../database/native/profiles.md)
- [`tb_corporate`](../database/legacy/tb_corporate.md)
- [`tb_forwarder`](../database/legacy/tb_forwarder.md)
- [`tb_header_order`](../database/legacy/tb_header_order.md)
- [`tb_payment`](../database/legacy/tb_payment.md)
- [`tb_wallet`](../database/legacy/tb_wallet.md)

## Components

- `components/legacy/pcs-carousel`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/get-user`
- `lib/supabase/admin`

## Exports / functions

- `DashboardPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
