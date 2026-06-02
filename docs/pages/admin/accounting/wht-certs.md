# `/admin/accounting/wht-certs`

**หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/accounting/wht-certs/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_forwarder_tax_invoice`](../../../database/legacy/tb_forwarder_tax_invoice.md)
- [`tb_forwarder_wht_entry`](../../../database/legacy/tb_forwarder_wht_entry.md)

## Components

- `components/admin/page-top-menubar`

## Server Actions / internal APIs

- action: `actions/admin/wht-cert`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/admin/accounting-menubar`
- `lib/auth/require-admin`

## Exports / functions

- `AdminWhtCertsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
