# `/admin/accounting/quote-compare`

**เครื่องมือเทียบราคา (CEO pricing)**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`, `sales_admin`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/accounting/quote-compare/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_rate_custom_cbm`](../../../database/legacy/tb_rate_custom_cbm.md)
- [`tb_settings`](../../../database/legacy/tb_settings.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

- `components/admin/page-top-menubar`

## Server Actions / internal APIs

- action: `actions/admin/quote-comparison`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/admin/accounting-menubar`
- `lib/auth/require-admin`

## Exports / functions

- `AdminQuoteComparePage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
