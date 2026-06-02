# `/admin/accounting/forwarder-invoice/add`

**สร้างใบแจ้งหนี้นำเข้า**

> **Auth:** 🛡 Admin — roles: `super`, `accounting` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/accounting/forwarder-invoice/add/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../../database/native/admins.md)
- [`tb_corporate`](../../../../database/legacy/tb_corporate.md)
- [`tb_forwarder`](../../../../database/legacy/tb_forwarder.md)
- [`tb_receipt`](../../../../database/legacy/tb_receipt.md)
- [`tb_receipt_item`](../../../../database/legacy/tb_receipt_item.md)
- [`tb_users`](../../../../database/legacy/tb_users.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/forwarder-invoice`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/forwarder/outstanding`
- `lib/supabase/admin`

## Exports / functions

- `AddForwarderInvoicePage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
