# `/admin/forwarders/new`

**สร้างออเดอร์นำเข้าใหม่ (admin)**

> **Auth:** 🛡 Admin — roles: `ops`, `accounting`, `super` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/forwarders/new/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_address`](../../../database/legacy/tb_address.md)
- [`tb_address_main`](../../../database/legacy/tb_address_main.md)
- [`tb_admin`](../../../database/legacy/tb_admin.md)
- [`tb_co`](../../../database/legacy/tb_co.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_settings`](../../../database/legacy/tb_settings.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/forwarders-new`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminForwarderNewPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
