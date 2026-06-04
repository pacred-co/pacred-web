# `/service-import/receipts/print`

**พิมพ์ใบเสร็จฝากนำเข้า**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/service-import/receipts/print/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`business_config`](../../../database/native/business_config.md)
- [`tb_address`](../../../database/legacy/tb_address.md)
- [`tb_address_main`](../../../database/legacy/tb_address_main.md)
- [`tb_corporate`](../../../database/legacy/tb_corporate.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_receipt`](../../../database/legacy/tb_receipt.md)
- [`tb_receipt_item`](../../../database/legacy/tb_receipt_item.md)
- [`tb_users`](../../../database/legacy/tb_users.md)
- [`tb_wallet_hs`](../../../database/legacy/tb_wallet_hs.md)

## Components

- `components/print-button`
- `components/seo/site`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-auth`
- `lib/supabase/admin`
- `lib/tax/rates`
- `lib/tax/wht`

## Exports / functions

- `ServiceImportReceiptPrintPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
