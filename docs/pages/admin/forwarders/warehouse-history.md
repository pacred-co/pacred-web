# `/admin/forwarders/warehouse-history`

**ประวัติเข้าโกดัง**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `warehouse`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/forwarders/warehouse-history/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_admin`](../../../database/legacy/tb_admin.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_forwarder_import2`](../../../database/legacy/tb_forwarder_import2.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

- `components/admin/top-menu-report`

## Server Actions / internal APIs

- action: `actions/admin/warehouse-history`

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

- `AdminForwardersWarehouseHistoryPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
