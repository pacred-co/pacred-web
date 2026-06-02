# `/service-payment/[id]`

**รายละเอียดรายการฝากโอน**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/service-payment/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`corporate`](../../database/native/corporate.md)
- [`profiles`](../../database/native/profiles.md)
- [`tb_forwarder`](../../database/legacy/tb_forwarder.md)
- [`tb_forwarder_tax_invoice`](../../database/legacy/tb_forwarder_tax_invoice.md)
- [`tb_forwarder_tax_invoice_item`](../../database/legacy/tb_forwarder_tax_invoice_item.md)
- [`tb_payment`](../../database/legacy/tb_payment.md)
- [`tb_settings`](../../database/legacy/tb_settings.md)
- [`wallet_transactions`](../../database/native/wallet_transactions.md)

## Components

- `components/tax-invoice-request-panel`

## Server Actions / internal APIs

- action: `actions/payment`
- action: `actions/tax-invoices`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_YUAN_RATE`

## Lib modules

- `lib/auth/get-user`
- `lib/supabase/server`

## Exports / functions

- `YuanPaymentDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
