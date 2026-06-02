# `/admin/reports/sla-cycle-time`

**เวลา cycle/SLA**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/reports/sla-cycle-time/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_users`](../../../database/legacy/tb_users.md)

## Components

- `components/admin/reports/report-shell`

## Server Actions / internal APIs

- action: `actions/admin/reports-sla`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/admin/reports/types`
- `lib/auth/require-admin`

## Exports / functions

- `ForwarderSlaCycleTimePage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
