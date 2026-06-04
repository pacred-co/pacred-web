# `/admin/forwarders/combine-bill/print`

**พิมพ์ใบส่งสินค้า (บิลรวม)**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `warehouse`, `accounting` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/forwarders/combine-bill/print/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../../database/native/admins.md)
- [`tb_forwarder`](../../../../database/legacy/tb_forwarder.md)
- [`tb_users`](../../../../database/legacy/tb_users.md)

## Components

- `components/print-button`
- `components/seo/site`

## Server Actions / internal APIs

- API route: `/api/pdf/forwarder/[fNo]`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `CombineBillPrintPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
