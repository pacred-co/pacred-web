# `/admin/customers/[id]/transfer-rep`

**ย้ายเซลผู้ดูแลลูกค้ารายนี้**

> **Auth:** 🛡 Admin — roles: any admin role · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/customers/[id]/transfer-rep/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admin_contact_extras`](../../../../database/native/admin_contact_extras.md)
- [`admins`](../../../../database/native/admins.md)
- [`forwarders`](../../../../database/native/forwarders.md)
- [`profiles`](../../../../database/native/profiles.md)
- [`service_orders`](../../../../database/native/service_orders.md)
- [`tb_users`](../../../../database/legacy/tb_users.md)
- [`yuan_payments`](../../../../database/native/yuan_payments.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/admin/admins`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/supabase/admin`

## Exports / functions

- `TransferRepPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
