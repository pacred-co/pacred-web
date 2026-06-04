# `/admin/reports/system`

**รายงานระบบ**

> **Auth:** 🛡 Admin — roles: `super` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/reports/system/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_page_name`](../../../database/legacy/tb_page_name.md)
- [`tb_web_hs`](../../../database/legacy/tb_web_hs.md)

## Components

- `components/admin/csv-button`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/datetime-helpers`
- `lib/supabase/admin`

## Exports / functions

- `ReportSystemPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
