# `/admin/system/crons`

**จัดการ cron jobs**

> **Auth:** 🛡 Admin — roles: `super`, `ops`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/system/crons/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`cron_invocations`](../../../database/native/cron_invocations.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/system`
- API route: `/api/cron/auto-cancel-orders`
- API route: `/api/cron/cargothai-sync`
- API route: `/api/cron/expire-driver-assignments`
- API route: `/api/cron/expire-probation`
- API route: `/api/cron/refresh-active-customers`
- API route: `/api/cron/sales-daily-digest`
- API route: `/api/cron/send-scheduled-broadcasts`
- API route: `/api/cron/sheets-sync-ctt`
- API route: `/api/cron/sms-balance-check`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/cron/registry`
- `lib/supabase/admin`

## Exports / functions

- `AdminCronHealthPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
