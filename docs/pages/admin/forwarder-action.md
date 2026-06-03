# `/admin/forwarder-action`

**การกระทำต่อออเดอร์นำเข้า (bulk action)**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `accounting`, `warehouse`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/forwarder-action/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../database/native/admins.md)
- [`tb_forwarder`](../../database/legacy/tb_forwarder.md)
- [`tb_header_order`](../../database/legacy/tb_header_order.md)

## Components

- `components/admin/top-menu-report`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/storage/legacy-resolver`
- `lib/supabase/admin`

## Exports / functions

- `AdminForwarderActionPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
