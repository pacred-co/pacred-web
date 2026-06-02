# `/commissions`

**คอมมิชชัน (มุมมองลูกค้า/ตัวแทน)**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/commissions/page.tsx`

## Database tables

- [`sales_commissions`](../database/native/sales_commissions.md)
- [`sales_payouts`](../database/native/sales_payouts.md)
- [`team_leaders`](../database/native/team_leaders.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/commissions`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

## Lib modules

- `lib/auth/require-auth`
- `lib/supabase/server`
- `lib/validators/commission`

## Exports / functions

- `CommissionsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
