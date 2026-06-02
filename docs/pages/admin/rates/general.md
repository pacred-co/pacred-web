# `/admin/rates/general`

**เรททั่วไป (engine)**

> **Auth:** 🛡 Admin — roles: `super`, `accounting` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/rates/general/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_admin`](../../../database/legacy/tb_admin.md)
- [`tb_customrate_hs`](../../../database/legacy/tb_customrate_hs.md)
- [`tb_hs_rate_custom_cbm`](../../../database/legacy/tb_hs_rate_custom_cbm.md)
- [`tb_hs_rate_custom_kg`](../../../database/legacy/tb_hs_rate_custom_kg.md)
- [`tb_rate_g_cbm`](../../../database/legacy/tb_rate_g_cbm.md)
- [`tb_rate_g_kg`](../../../database/legacy/tb_rate_g_kg.md)
- [`tb_rate_vip_cbm`](../../../database/legacy/tb_rate_vip_cbm.md)
- [`tb_rate_vip_kg`](../../../database/legacy/tb_rate_vip_kg.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/rate-edits`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminRatesGeneralPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
