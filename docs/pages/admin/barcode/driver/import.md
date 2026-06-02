# `/admin/barcode/driver/import`

**บาร์โค้ดคนขับ — สแกนนำเข้า (USB scanner)**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `warehouse` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/barcode/driver/import/page.tsx`

## Database tables

- [`admins`](../../../../database/native/admins.md)
- [`tb_admin`](../../../../database/legacy/tb_admin.md)
- [`tb_forwarder`](../../../../database/legacy/tb_forwarder.md)
- [`tb_forwarder_import2`](../../../../database/legacy/tb_forwarder_import2.md)

## Components

- `components/ui/pacred-dialog`

## Server Actions / internal APIs

- action: `actions/admin/barcode-import`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/admin/forwarder-status`
- `lib/auth/require-admin`

## Exports / functions

- `BarcodeDriverImportPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
