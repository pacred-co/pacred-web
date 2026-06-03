# `/admin/settings/forwarder-costs`

**ตั้งค่าต้นทุนนำเข้า (matrix)**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/settings/forwarder-costs/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_rate_custom_cbm`](../../../database/legacy/tb_rate_custom_cbm.md)
- [`tb_settings`](../../../database/legacy/tb_settings.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/admin/tb-settings`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminForwarderCostsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
