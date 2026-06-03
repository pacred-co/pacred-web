# `/admin/cnt-hs/[id]`

**รายละเอียดเบิกค่าตู้**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/cnt-hs/[id]/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_cnt`](../../../database/legacy/tb_cnt.md)
- [`tb_cnt_item`](../../../database/legacy/tb_cnt_item.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/cnt-hs`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/admin/forwarder-status`
- `lib/auth/require-admin`
- `lib/storage/legacy-resolver`
- `lib/storage/upload`
- `lib/supabase/admin`

## Exports / functions

- `CntHsDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
