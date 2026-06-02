# `/admin/forwarders/[fNo]`

**รายละเอียด/แก้ไขออเดอร์นำเข้า (เครื่องมือ admin ครบ)**

> **Auth:** 🛡 Admin — roles: `ops`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx`

## Request data (params)

- **route param** `fNo`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`forwarder_cost_adjustments`](../../../database/native/forwarder_cost_adjustments.md)
- [`forwarder_driver`](../../../database/native/forwarder_driver.md)
- [`forwarder_items`](../../../database/native/forwarder_items.md)
- [`forwarders`](../../../database/native/forwarders.md)
- [`profiles`](../../../database/native/profiles.md)
- [`tb_address`](../../../database/legacy/tb_address.md)
- [`tb_admin`](../../../database/legacy/tb_admin.md)
- [`tb_corporate`](../../../database/legacy/tb_corporate.md)
- [`tb_credit`](../../../database/legacy/tb_credit.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_forwarder_driver`](../../../database/legacy/tb_forwarder_driver.md)
- [`tb_forwarder_driver_item`](../../../database/legacy/tb_forwarder_driver_item.md)
- [`tb_header_order`](../../../database/legacy/tb_header_order.md)
- [`tb_log_forwarder_status`](../../../database/legacy/tb_log_forwarder_status.md)
- [`tb_users`](../../../database/legacy/tb_users.md)
- [`tb_wallet`](../../../database/legacy/tb_wallet.md)
- [`tb_wallet_hs`](../../../database/legacy/tb_wallet_hs.md)
- [`tb_wallet_paydeposit`](../../../database/legacy/tb_wallet_paydeposit.md)
- [`wallet_transactions`](../../../database/native/wallet_transactions.md)

## Components

- `components/admin/bill-to-override-panel`
- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/admin/forwarder-cost-adjustments`
- action: `actions/admin/forwarder-drivers`
- action: `actions/admin/forwarders`
- action: `actions/admin/forwarders-bulk`
- action: `actions/admin/forwarders-field-edits`
- action: `actions/admin/pay-user`
- API route: `/api/cron/expire-driver-assignments`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/storage/legacy-resolver`
- `lib/supabase/admin`

## Exports / functions

- `AdminForwarderDetail`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
