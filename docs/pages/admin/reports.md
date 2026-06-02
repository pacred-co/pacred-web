# `/admin/reports`

**ศูนย์รายงาน (hub)**

> **Auth:** 🛡 Admin — roles: `ops`, `accounting`, `sales_admin` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/reports/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../database/native/admins.md)
- [`container_hs_lines`](../../database/native/container_hs_lines.md)
- [`sales_payouts`](../../database/native/sales_payouts.md)
- [`tb_forwarder`](../../database/legacy/tb_forwarder.md)
- [`tb_header_order`](../../database/legacy/tb_header_order.md)
- [`tb_payment`](../../database/legacy/tb_payment.md)
- [`tb_users`](../../database/legacy/tb_users.md)
- [`tb_wallet`](../../database/legacy/tb_wallet.md)
- [`tb_wallet_hs`](../../database/legacy/tb_wallet_hs.md)

## Components

- `components/admin/csv-button`
- `components/admin/date-filter`
- `components/admin/page-top-menubar`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/legacy-status-map`
- `lib/supabase/admin`

## Exports / functions

- `AdminReportsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
