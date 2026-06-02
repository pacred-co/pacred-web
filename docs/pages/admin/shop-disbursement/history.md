# `/admin/shop-disbursement/history`

**ประวัติเบิกจ่ายร้านค้า**

> **Auth:** 🛡 Admin — roles: `accounting`, `super`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/shop-disbursement/history/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_account_pcs`](../../../database/legacy/tb_account_pcs.md)
- [`tb_admin`](../../../database/legacy/tb_admin.md)
- [`tb_header_order`](../../../database/legacy/tb_header_order.md)
- [`tb_shop_pay_h`](../../../database/legacy/tb_shop_pay_h.md)
- [`tb_shop_pay_sub`](../../../database/legacy/tb_shop_pay_sub.md)
- [`tb_users`](../../../database/legacy/tb_users.md)
- [`tb_wallet_hs`](../../../database/legacy/tb_wallet_hs.md)

## Components

- `components/admin/page-top-menubar`

## Server Actions / internal APIs

- action: `actions/admin/shop-disbursement`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/admin/accounting-menubar`
- `lib/auth/require-admin`

## Exports / functions

- `AdminShopDisbursementHistoryPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
