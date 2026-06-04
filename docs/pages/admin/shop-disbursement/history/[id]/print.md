# `/admin/shop-disbursement/history/[id]/print`

**พิมพ์ใบเบิกจ่ายร้านค้า**

> **Auth:** 🛡 Admin — roles: `accounting`, `super` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/shop-disbursement/history/[id]/print/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admins`](../../../../../database/native/admins.md)
- [`tb_account_pcs`](../../../../../database/legacy/tb_account_pcs.md)
- [`tb_admin`](../../../../../database/legacy/tb_admin.md)
- [`tb_header_order`](../../../../../database/legacy/tb_header_order.md)
- [`tb_shop_pay_h`](../../../../../database/legacy/tb_shop_pay_h.md)
- [`tb_shop_pay_sub`](../../../../../database/legacy/tb_shop_pay_sub.md)
- [`tb_users`](../../../../../database/legacy/tb_users.md)
- [`tb_wallet_hs`](../../../../../database/legacy/tb_wallet_hs.md)

## Components

- `components/print-button`
- `components/seo/site`

## Server Actions / internal APIs

- action: `actions/admin/shop-disbursement`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-admin`

## Exports / functions

- `ShopDisbursementPrintPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../../README.md).</sub>
