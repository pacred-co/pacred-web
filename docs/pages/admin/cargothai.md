# `/admin/cargothai`

**หน้า CargoThai (warehouse-ops/ติดตาม)**

> **Auth:** 🛡 Admin — roles: `ops`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/cargothai/page.tsx`

## Database tables

- [`admins`](../../database/native/admins.md)
- [`tb_tmp_forwarder_cargothai`](../../database/legacy/tb_tmp_forwarder_cargothai.md)
- [`tb_tmp_forwarder_item_cargothai`](../../database/legacy/tb_tmp_forwarder_item_cargothai.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/admin/cargothai`
- API route: `/api/cron/cargothai-sync`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `PACRED_CARGOTHAI_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminCargoThaiPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
