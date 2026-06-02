# `/admin/api-sheets-ctt`

**นำเข้าจาก Sheet CTT**

> **Auth:** 🛡 Admin — roles: `ops`, `warehouse`, `super`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/api-sheets-ctt/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../database/native/admins.md)
- [`tb_address`](../../database/legacy/tb_address.md)
- [`tb_address_main`](../../database/legacy/tb_address_main.md)
- [`tb_co`](../../database/legacy/tb_co.md)
- [`tb_settings`](../../database/legacy/tb_settings.md)
- [`tb_users`](../../database/legacy/tb_users.md)

## Components

- `components/admin/carrier-manual-form`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/admin/carrier-manual-page-data`
- `lib/auth/require-admin`
- `lib/carrier/registry`

## Exports / functions

- `ApiSheetsCttPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
