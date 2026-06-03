# `/admin/accounting/forwarder-invoice/[id]`

**รายละเอียดใบแจ้งหนี้นำเข้า**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/accounting/forwarder-invoice/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admins`](../../../../database/native/admins.md)
- [`tb_address`](../../../../database/legacy/tb_address.md)
- [`tb_address_main`](../../../../database/legacy/tb_address_main.md)
- [`tb_corporate`](../../../../database/legacy/tb_corporate.md)
- [`tb_forwarder`](../../../../database/legacy/tb_forwarder.md)
- [`tb_receipt`](../../../../database/legacy/tb_receipt.md)
- [`tb_receipt_item`](../../../../database/legacy/tb_receipt_item.md)
- [`tb_users`](../../../../database/legacy/tb_users.md)

## Components

- `components/seo/site`

## Server Actions / internal APIs

- action: `actions/admin/forwarder-invoice`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`
- `lib/utils/thai-number`

## Exports / functions

- `ForwarderInvoicePrintPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
