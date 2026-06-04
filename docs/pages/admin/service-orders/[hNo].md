# `/admin/service-orders/[hNo]`

**รายละเอียด/แก้ไขออเดอร์ฝากสั่งซื้อ**

> **Auth:** 🛡 Admin — roles: any admin role
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/service-orders/[hNo]/page.tsx`

## Request data (params)

- **route param** `hNo`

## Database tables

- [`service_order_items`](../../../database/native/service_order_items.md)
- [`service_orders`](../../../database/native/service_orders.md)
- [`tb_admin`](../../../database/legacy/tb_admin.md)
- [`tb_corporate`](../../../database/legacy/tb_corporate.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_header_order`](../../../database/legacy/tb_header_order.md)
- [`tb_order`](../../../database/legacy/tb_order.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

- `components/admin/bill-to-override-panel`
- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/admin/service-orders`
- action: `actions/admin/service-orders-spawn`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/supabase/admin`

## Exports / functions

- `AdminServiceOrderDetail`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
