# `/admin/forwarders/combine-bill/[id]`

**รายละเอียดบิลรวม**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `warehouse`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/forwarders/combine-bill/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admins`](../../../../database/native/admins.md)
- [`tb_admin`](../../../../database/legacy/tb_admin.md)
- [`tb_bill`](../../../../database/legacy/tb_bill.md)
- [`tb_bill_item`](../../../../database/legacy/tb_bill_item.md)
- [`tb_forwarder`](../../../../database/legacy/tb_forwarder.md)

## Components

- `components/seo/site`
- `components/ui/pacred-dialog`

## Server Actions / internal APIs

- action: `actions/admin/combine-bill`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/admin/combine-bill-urls`
- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `CombineBillDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
