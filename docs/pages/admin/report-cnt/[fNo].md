# `/admin/report-cnt/[fNo]`

**รายละเอียดตู้ + แก้ต้นทุน**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `accounting`, `warehouse`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/report-cnt/[fNo]/page.tsx`

## Request data (params)

- **route param** `fNo`
- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_admin`](../../../database/legacy/tb_admin.md)
- [`tb_check_forwarder`](../../../database/legacy/tb_check_forwarder.md)
- [`tb_cnt`](../../../database/legacy/tb_cnt.md)
- [`tb_cnt_item`](../../../database/legacy/tb_cnt_item.md)
- [`tb_cnt_pay_idorco`](../../../database/legacy/tb_cnt_pay_idorco.md)
- [`tb_cnt_pay_trackingchn`](../../../database/legacy/tb_cnt_pay_trackingchn.md)
- [`tb_cost_container`](../../../database/legacy/tb_cost_container.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_forwarder_import2`](../../../database/legacy/tb_forwarder_import2.md)
- [`tb_promotion`](../../../database/legacy/tb_promotion.md)
- [`tb_settings`](../../../database/legacy/tb_settings.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

- `components/admin/forwarder-cost-edit-button`
- `components/admin/top-menu-report`

## Server Actions / internal APIs

- action: `actions/admin/cnt-payment`
- action: `actions/admin/report-cnt-cost-update`
- action: `actions/admin/report-cnt-detail`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/admin/forwarder-status`
- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminReportCntDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
