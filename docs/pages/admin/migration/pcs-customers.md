# `/admin/migration/pcs-customers`

**เครื่องมือ migrate ลูกค้า PCS เดิม**

> **Auth:** 🛡 Admin — roles: `super`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/migration/pcs-customers/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`pcs_legacy_customers_staging`](../../../database/native/pcs_legacy_customers_staging.md)
- [`profiles`](../../../database/native/profiles.md)
- [`v_pcs_migration_status`](../../../database/native/v_pcs_migration_status.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/pcs-migration`

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

- `PcsMigrationPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
