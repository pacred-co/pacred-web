# `/admin/cnt-hs`

**เบิกเงินค่าตู้ (cnt-hs)**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `accounting` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/cnt-hs/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../database/native/admins.md)
- [`tb_cnt`](../../database/legacy/tb_cnt.md)
- [`tb_cnt_item`](../../database/legacy/tb_cnt_item.md)

## Components

- `components/admin/top-menu-report`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/admin/default-queue-filter`
- `lib/admin/forwarder-status`
- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `CntHsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
