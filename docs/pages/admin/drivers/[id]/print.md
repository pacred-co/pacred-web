# `/admin/drivers/[id]/print`

**พิมพ์ใบงานคนขับ**

> **Auth:** 🛡 Admin — roles: `ops`, `super`, `driver` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/drivers/[id]/print/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`admins`](../../../../database/native/admins.md)
- [`profiles`](../../../../database/native/profiles.md)
- [`tb_forwarder`](../../../../database/legacy/tb_forwarder.md)
- [`tb_forwarder_driver`](../../../../database/legacy/tb_forwarder_driver.md)
- [`tb_forwarder_driver_item`](../../../../database/legacy/tb_forwarder_driver_item.md)
- [`tb_users`](../../../../database/legacy/tb_users.md)

## Components

- `components/print-button`
- `components/seo/site`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/freight/shipping-methods`
- `lib/supabase/admin`

## Exports / functions

- `DriverPickingSlipPrintPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
