# `/service-import/pending`

**ออเดอร์นำเข้าที่รอดำเนินการ**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/service-import/pending/page.tsx`

## Database tables

- [`forwarder_cost_adjustments`](../../database/native/forwarder_cost_adjustments.md)
- [`forwarders`](../../database/native/forwarders.md)
- [`slips`](../../database/native/slips.md)
- [`tb_cash_back`](../../database/legacy/tb_cash_back.md)
- [`tb_corporate`](../../database/legacy/tb_corporate.md)
- [`tb_forwarder`](../../database/legacy/tb_forwarder.md)
- [`tb_users`](../../database/legacy/tb_users.md)
- [`tb_wallet_hs`](../../database/legacy/tb_wallet_hs.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/forwarder`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `PROMPTPAY_ID`

## Exports / functions

- `ServiceImportPendingPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
