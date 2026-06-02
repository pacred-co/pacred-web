# `/admin/freight/shipments/new`

**สร้าง shipment freight**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `sales_admin`, `accounting` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/freight/shipments/new/page.tsx`

## Database tables

- [`admins`](../../../../database/native/admins.md)
- [`freight_invoices`](../../../../database/native/freight_invoices.md)
- [`freight_parties`](../../../../database/native/freight_parties.md)
- [`freight_shipments`](../../../../database/native/freight_shipments.md)

## Components

- `components/admin/customer-picker`

## Server Actions / internal APIs

- action: `actions/admin/freight-shipments`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-admin`
- `lib/validators/freight-shipment`

## Exports / functions

- `NewFreightShipmentPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
