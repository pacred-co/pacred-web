# `/admin/leads`

**คิวโทรลูกค้าเย็น (cold-leads)**

> **Auth:** 🛡 Admin — roles: `super`, `sales_admin`, `sales`, `ops`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/leads/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../database/native/admins.md)
- [`lead_call_log`](../../database/native/lead_call_log.md)
- [`tb_forwarder`](../../database/legacy/tb_forwarder.md)
- [`tb_users`](../../database/legacy/tb_users.md)

## Components

- `components/admin/page-top-menubar`

## Server Actions / internal APIs

- action: `actions/admin/leads`
- action: `actions/admin/leads-types`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-admin`

## Exports / functions

- `AdminLeadsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
