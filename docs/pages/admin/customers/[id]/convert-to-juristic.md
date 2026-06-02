# `/admin/customers/[id]/convert-to-juristic`

**แปลงลูกค้าเป็นนิติบุคคล**

> **Auth:** 🛡 Admin — roles: `super`, `manager`, `accounting`, `qa`, `ops`, `sales_admin`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/customers/[id]/convert-to-juristic/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admin_contact_extras`](../../../../database/native/admin_contact_extras.md)
- [`admins`](../../../../database/native/admins.md)
- [`profiles`](../../../../database/native/profiles.md)
- [`tb_corporate`](../../../../database/legacy/tb_corporate.md)
- [`tb_forwarder`](../../../../database/legacy/tb_forwarder.md)
- [`tb_header_order`](../../../../database/legacy/tb_header_order.md)
- [`tb_users`](../../../../database/legacy/tb_users.md)

## Components

- `components/ui/button`

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
- `lib/supabase/admin`

## Exports / functions

- `ConvertToJuristicPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
