# `/admin/forwarders/bulk-search`

**ค้นหาออเดอร์นำเข้าแบบกลุ่ม**

> **Auth:** 🛡 Admin — roles: `ops`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/forwarders/bulk-search/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`forwarder_items`](../../../database/native/forwarder_items.md)
- [`forwarders`](../../../database/native/forwarders.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/bulk-tracking-search`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-admin`

## Exports / functions

- `BulkSearchPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
