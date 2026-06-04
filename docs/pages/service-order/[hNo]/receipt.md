# `/service-order/[hNo]/receipt`

**ใบเสร็จออเดอร์ฝากสั่งซื้อ**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/service-order/[hNo]/receipt/page.tsx`

## Request data (params)

- **route param** `hNo`
- reads **`searchParams`** (query string)

## Database tables

- [`profiles`](../../../database/native/profiles.md)
- [`tb_cash_back`](../../../database/legacy/tb_cash_back.md)
- [`tb_corporate`](../../../database/legacy/tb_corporate.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_forwarder_tax_invoice`](../../../database/legacy/tb_forwarder_tax_invoice.md)
- [`tb_forwarder_tax_invoice_item`](../../../database/legacy/tb_forwarder_tax_invoice_item.md)
- [`tb_header_order`](../../../database/legacy/tb_header_order.md)
- [`tb_order`](../../../database/legacy/tb_order.md)
- [`tb_users`](../../../database/legacy/tb_users.md)
- [`tb_wallet`](../../../database/legacy/tb_wallet.md)
- [`tb_wallet_hs`](../../../database/legacy/tb_wallet_hs.md)
- [`withholding_tax_entries`](../../../database/native/withholding_tax_entries.md)

## Components

- `components/customer-wht-upload-panel`
- `components/print-button`
- `components/seo/site`
- `components/tax-invoice-request-panel`

## Server Actions / internal APIs

- action: `actions/service-order`
- action: `actions/tax-invoices`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

## Lib modules

- `lib/supabase/server`

## Exports / functions

- `ShopOrderReceiptPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
