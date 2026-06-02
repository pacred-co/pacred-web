# `/admin/accounting/peak-export`

**ส่งออกข้อมูลเข้า PEAK**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/accounting/peak-export/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_bill`](../../../database/legacy/tb_bill.md)
- [`tb_bill_item`](../../../database/legacy/tb_bill_item.md)
- [`tb_receipt`](../../../database/legacy/tb_receipt.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

- `components/admin/csv-button`
- `components/admin/page-top-menubar`

## Server Actions / internal APIs

- action: `actions/admin/peak-export`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/admin/accounting-menubar`
- `lib/auth/require-admin`

## Exports / functions

- `AdminPeakExportPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
