# `/admin/forwarders/[fNo]/edit`

**แก้ไขมิติ/ค่าใช้จ่ายของออเดอร์นำเข้า**

> **Auth:** 🛡 Admin — roles: `ops`, `accounting`, `super` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/forwarders/[fNo]/edit/page.tsx`

## Request data (params)

- **route param** `fNo`

## Database tables

- [`admins`](../../../../database/native/admins.md)
- [`tb_admin`](../../../../database/legacy/tb_admin.md)
- [`tb_forwarder`](../../../../database/legacy/tb_forwarder.md)
- [`tb_forwarder_item`](../../../../database/legacy/tb_forwarder_item.md)
- [`tb_rate_custom_cbm`](../../../../database/legacy/tb_rate_custom_cbm.md)
- [`tb_rate_custom_kg`](../../../../database/legacy/tb_rate_custom_kg.md)
- [`tb_rate_g_cbm`](../../../../database/legacy/tb_rate_g_cbm.md)
- [`tb_rate_g_kg`](../../../../database/legacy/tb_rate_g_kg.md)
- [`tb_rate_vip_cbm`](../../../../database/legacy/tb_rate_vip_cbm.md)
- [`tb_rate_vip_kg`](../../../../database/legacy/tb_rate_vip_kg.md)
- [`tb_users`](../../../../database/legacy/tb_users.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/forwarders-edit`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminForwarderEditPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
