# `/admin/forwarders/combine-bill`

**รวมบิลส่งสินค้า**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `warehouse`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/forwarders/combine-bill/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_admin`](../../../database/legacy/tb_admin.md)
- [`tb_bill`](../../../database/legacy/tb_bill.md)
- [`tb_bill_item`](../../../database/legacy/tb_bill_item.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)

## Components

- `components/ui/pacred-dialog`

## Server Actions / internal APIs

- action: `actions/admin/combine-bill`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/admin/combine-bill-urls`
- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `CombineBillPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
