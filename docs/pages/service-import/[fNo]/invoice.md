# `/service-import/[fNo]/invoice`

**ใบแจ้งหนี้ของออเดอร์นำเข้า**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/service-import/[fNo]/invoice/page.tsx`

## Request data (params)

- **route param** `fNo`

## Database tables

- [`profiles`](../../../database/native/profiles.md)
- [`tb_admin`](../../../database/legacy/tb_admin.md)
- [`tb_corporate`](../../../database/legacy/tb_corporate.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_forwarder_tax_invoice`](../../../database/legacy/tb_forwarder_tax_invoice.md)
- [`tb_forwarder_tax_invoice_item`](../../../database/legacy/tb_forwarder_tax_invoice_item.md)
- [`tb_receipt`](../../../database/legacy/tb_receipt.md)
- [`tb_receipt_item`](../../../database/legacy/tb_receipt_item.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

- `components/print-button`
- `components/seo/site`
- `components/tax-invoice-request-panel`

## Server Actions / internal APIs

- action: `actions/tax-invoices`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/admin/sales-rep-contact`
- `lib/auth/require-auth`
- `lib/forwarder/outstanding`
- `lib/supabase/admin`

## Exports / functions

- `ServiceImportInvoicePage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
