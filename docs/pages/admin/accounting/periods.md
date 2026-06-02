# `/admin/accounting/periods`

**งวดบัญชี**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`, `ops`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/accounting/periods/page.tsx`

## Database tables

- [`accounting_periods`](../../../database/native/accounting_periods.md)
- [`admins`](../../../database/native/admins.md)
- [`freight_invoice_payments`](../../../database/native/freight_invoice_payments.md)
- [`freight_invoices`](../../../database/native/freight_invoices.md)
- [`period_close_event`](../../../database/native/period_close_event.md)
- [`tax_invoices`](../../../database/native/tax_invoices.md)
- [`wallet_transactions`](../../../database/native/wallet_transactions.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/accounting-periods`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`
- `lib/validators/accounting-period`

## Exports / functions

- `AdminAccountingPeriodsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
