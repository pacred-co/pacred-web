# `/admin/accounting/documents`

**เอกสารบัญชี (PEAK hub)**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/accounting/documents/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tax_invoices`](../../../database/native/tax_invoices.md)
- [`tb_bill`](../../../database/legacy/tb_bill.md)
- [`tb_receipt`](../../../database/legacy/tb_receipt.md)

## Components

- `components/admin/page-top-menubar`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/admin/accounting-menubar`
- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminDocumentsLifecyclePage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
