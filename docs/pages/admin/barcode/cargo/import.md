# `/admin/barcode/cargo/import`

**บาร์โค้ด cargo — นำเข้า**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `warehouse` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/barcode/cargo/import/page.tsx`

## Database tables

- [`admins`](../../../../database/native/admins.md)
- [`tb_admin`](../../../../database/legacy/tb_admin.md)
- [`tb_forwarder`](../../../../database/legacy/tb_forwarder.md)
- [`tb_forwarder_import2`](../../../../database/legacy/tb_forwarder_import2.md)

## Components

- `components/admin/camera-scanner`
- `components/admin/top-menu-barcode`

## Server Actions / internal APIs

- action: `actions/admin/barcode-import`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-admin`

## Exports / functions

- `BarcodeCargoImportPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
