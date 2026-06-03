# `/admin/juristic-check`

**ตรวจ/อนุมัติเอกสารนิติบุคคล**

> **Auth:** 🛡 Admin — roles: `super`, `manager`, `accounting`, `qa`, `ops`, `sales_admin` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/juristic-check/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admin_contact_extras`](../../database/native/admin_contact_extras.md)
- [`admins`](../../database/native/admins.md)
- [`profiles`](../../database/native/profiles.md)
- [`tb_corporate`](../../database/legacy/tb_corporate.md)
- [`tb_forwarder`](../../database/legacy/tb_forwarder.md)
- [`tb_header_order`](../../database/legacy/tb_header_order.md)
- [`tb_users`](../../database/legacy/tb_users.md)

## Components

- `components/ui/button`
- `components/ui/pacred-dialog`

## Server Actions / internal APIs

- action: `actions/admin/customers`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `DBD_LOOKUP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/dbd/parse-juristic`
- `lib/storage/legacy-resolver`
- `lib/supabase/admin`

## Exports / functions

- `AdminJuristicCheckPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
