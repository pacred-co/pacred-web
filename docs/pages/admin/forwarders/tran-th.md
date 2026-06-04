# `/admin/forwarders/tran-th`

**งานขนส่งในไทย (TH-transport batch)**

> **Auth:** 🛡 Admin — roles: `super`, `accounting`, `warehouse`, `freight_sales`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/forwarders/tran-th/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_forwarder_tran_th_h`](../../../database/legacy/tb_forwarder_tran_th_h.md)
- [`tb_forwarder_tran_th_sub`](../../../database/legacy/tb_forwarder_tran_th_sub.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/admin/forwarder-tran-th`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/require-admin`

## Exports / functions

- `AdminTranThListPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
