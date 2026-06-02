# `/admin/reports/search-demand`

**ดีมานด์การค้นหาสินค้า**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`, `ops`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/reports/search-demand/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_search_history`](../../../database/legacy/tb_search_history.md)
- [`tb_sms_hs`](../../../database/legacy/tb_sms_hs.md)

## Components

- `components/admin/reports/report-shell`

## Server Actions / internal APIs

- action: `actions/admin/reports-monitoring`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/admin/reports/types`
- `lib/auth/require-admin`

## Exports / functions

- `SearchDemandReportPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
