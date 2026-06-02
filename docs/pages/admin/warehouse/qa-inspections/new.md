# `/admin/warehouse/qa-inspections/new`

**สร้างการตรวจ QA**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `warehouse`, `qa` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/warehouse/qa-inspections/new/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../../database/native/admins.md)
- [`freight_qa_inspections`](../../../../database/native/freight_qa_inspections.md)
- [`qa_inspections`](../../../../database/native/qa_inspections.md)
- [`tb_forwarder`](../../../../database/legacy/tb_forwarder.md)
- [`tb_shop`](../../../../database/legacy/tb_shop.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/qa-inspections`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-admin`
- `lib/validators/qa-inspection-rebuilt`

## Exports / functions

- `NewQaInspectionPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
