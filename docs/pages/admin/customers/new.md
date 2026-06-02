# `/admin/customers/new`

**สร้างลูกค้าใหม่โดย admin (ไม่ต้อง self-register)**

> **Auth:** 🛡 Admin — roles: `ops`, `sales_admin` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/customers/new/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`profiles`](../../../database/native/profiles.md)
- [`tb_address`](../../../database/legacy/tb_address.md)
- [`tb_address_main`](../../../database/legacy/tb_address_main.md)
- [`tb_cash_back`](../../../database/legacy/tb_cash_back.md)
- [`tb_corporate`](../../../database/legacy/tb_corporate.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_header_order`](../../../database/legacy/tb_header_order.md)
- [`tb_payment`](../../../database/legacy/tb_payment.md)
- [`tb_users`](../../../database/legacy/tb_users.md)
- [`tb_wallet`](../../../database/legacy/tb_wallet.md)
- [`tb_wallet_hs`](../../../database/legacy/tb_wallet_hs.md)

## Components

- `components/admin/page-top-menubar`

## Server Actions / internal APIs

- action: `actions/admin/customer-admin`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-admin`
- `lib/validators/customer-admin`

## Exports / functions

- `AdminCustomerNewPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
