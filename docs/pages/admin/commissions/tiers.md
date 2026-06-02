# `/admin/commissions/tiers`

**ตั้งค่าขั้นคอมมิชชัน**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/commissions/tiers/page.tsx`

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`commission_accruals`](../../../database/native/commission_accruals.md)
- [`commission_tiers`](../../../database/native/commission_tiers.md)
- [`commission_withdrawal_items`](../../../database/native/commission_withdrawal_items.md)
- [`commission_withdrawals`](../../../database/native/commission_withdrawals.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/commissions`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`
- `lib/validators/commission`

## Exports / functions

- `AdminCommissionTiersPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
