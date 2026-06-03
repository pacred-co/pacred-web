# `/admin`

**หน้าแรกหลังบ้าน admin (ภาพรวม/เมนู)**

> **Auth:** 🛡 Admin — roles: `ops`, `accounting`, `sales_admin` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../database/native/admins.md)
- [`sales_payouts`](../database/native/sales_payouts.md)
- [`tb_forwarder`](../database/legacy/tb_forwarder.md)
- [`tb_header_order`](../database/legacy/tb_header_order.md)
- [`tb_payment`](../database/legacy/tb_payment.md)
- [`tb_settings`](../database/legacy/tb_settings.md)
- [`tb_users`](../database/legacy/tb_users.md)
- [`tb_wallet`](../database/legacy/tb_wallet.md)
- [`tb_wallet_hs`](../database/legacy/tb_wallet_hs.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `AdminDashboardPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
