# `/admin/forwarders/combine-bill/add`

**สร้างบิลรวมใหม่**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `warehouse`, `accounting` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/forwarders/combine-bill/add/page.tsx`

## Database tables

- [`admins`](../../../../database/native/admins.md)
- [`tb_admin`](../../../../database/legacy/tb_admin.md)
- [`tb_bill`](../../../../database/legacy/tb_bill.md)
- [`tb_bill_item`](../../../../database/legacy/tb_bill_item.md)
- [`tb_forwarder`](../../../../database/legacy/tb_forwarder.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/combine-bill`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-admin`

## Exports / functions

- `CombineBillAddPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
