# `/admin/accounting/etax`

**e-Tax (ออก XML ภาษีอิเล็กทรอนิกส์)**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/accounting/etax/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_forwarder_tax_invoice`](../../../database/legacy/tb_forwarder_tax_invoice.md)

## Components

- `components/admin/csv-button`
- `components/admin/page-top-menubar`

## Server Actions / internal APIs

- action: `actions/admin/etax-export`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/admin/accounting-menubar`
- `lib/auth/require-admin`
- `lib/etax/build-xml`

## Exports / functions

- `AdminEtaxPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
