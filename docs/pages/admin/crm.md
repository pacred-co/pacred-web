# `/admin/crm`

**CRM omni-inbox + customer-360 + routing**

> **Auth:** 🛡 Admin — roles: `super`, `manager`, `sales_admin`, `sales`, `ops`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/crm/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`Podeng_customers_line`](../../database/native/Podeng_customers_line.md)
- [`admin_contact_extras`](../../database/native/admin_contact_extras.md)
- [`admins`](../../database/native/admins.md)
- [`freight_quote`](../../database/native/freight_quote.md)
- [`lead_call_log`](../../database/native/lead_call_log.md)
- [`tb_admin`](../../database/legacy/tb_admin.md)
- [`tb_forwarder`](../../database/legacy/tb_forwarder.md)
- [`tb_users`](../../database/legacy/tb_users.md)
- [`tb_wallet`](../../database/legacy/tb_wallet.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/crm`
- action: `actions/admin/line-inbox`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/admin/crm-types`
- `lib/admin/line-inbox-types`
- `lib/auth/require-admin`
- `lib/utils/relative-time`

## Exports / functions

- `AdminCrmPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
