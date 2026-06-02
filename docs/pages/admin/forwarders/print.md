# `/admin/forwarders/print`

**พิมพ์ออเดอร์นำเข้า**

> **Auth:** 🛡 Admin — roles: `super`, `ops`, `warehouse`, `accounting` · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/forwarders/print/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)

## Components

- `components/print-button`
- `components/seo/site`

## Server Actions / internal APIs

_None._

## 3rd-party / services

- QR code
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/freight/shipping-methods`
- `lib/supabase/admin`

## Exports / functions

- `ForwarderLabelPrintPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
