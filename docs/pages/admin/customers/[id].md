# `/admin/customers/[id]`

**โปรไฟล์ลูกค้า (สถิติ/ที่อยู่/เรท/แก้ไข/hard-delete)**

> **Auth:** 🛡 Admin — roles: `ops`, `sales_admin`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/customers/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_address`](../../../database/legacy/tb_address.md)
- [`tb_address_main`](../../../database/legacy/tb_address_main.md)
- [`tb_admin`](../../../database/legacy/tb_admin.md)
- [`tb_cash_back_hs`](../../../database/legacy/tb_cash_back_hs.md)
- [`tb_corporate`](../../../database/legacy/tb_corporate.md)
- [`tb_customrate_hs`](../../../database/legacy/tb_customrate_hs.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_header_order`](../../../database/legacy/tb_header_order.md)
- [`tb_hs_rate_custom_cbm`](../../../database/legacy/tb_hs_rate_custom_cbm.md)
- [`tb_hs_rate_custom_kg`](../../../database/legacy/tb_hs_rate_custom_kg.md)
- [`tb_payment`](../../../database/legacy/tb_payment.md)
- [`tb_rate_custom_cbm`](../../../database/legacy/tb_rate_custom_cbm.md)
- [`tb_rate_custom_kg`](../../../database/legacy/tb_rate_custom_kg.md)
- [`tb_users`](../../../database/legacy/tb_users.md)
- [`tb_wallet`](../../../database/legacy/tb_wallet.md)
- [`tb_wallet_hs`](../../../database/legacy/tb_wallet_hs.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/customer-profile`
- action: `actions/admin/customer-rate`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/storage/legacy-resolver`
- `lib/supabase/admin`

## Exports / functions

- `AdminCustomerDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
