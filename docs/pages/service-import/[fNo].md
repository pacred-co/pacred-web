# `/service-import/[fNo]`

**รายละเอียดออเดอร์ฝากนำเข้า (สถานะ/ค่าใช้จ่าย/ชำระ)**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/service-import/[fNo]/page.tsx`

## Request data (params)

- **route param** `fNo`

## Database tables

- [`profiles`](../../database/native/profiles.md)
- [`tb_address`](../../database/legacy/tb_address.md)
- [`tb_address_main`](../../database/legacy/tb_address_main.md)
- [`tb_admin`](../../database/legacy/tb_admin.md)
- [`tb_forwarder`](../../database/legacy/tb_forwarder.md)
- [`tb_forwarder_driver`](../../database/legacy/tb_forwarder_driver.md)
- [`tb_forwarder_driver_item`](../../database/legacy/tb_forwarder_driver_item.md)
- [`tb_forwarder_tran_th_sub`](../../database/legacy/tb_forwarder_tran_th_sub.md)
- [`tb_promotion`](../../database/legacy/tb_promotion.md)
- [`tb_receipt_item`](../../database/legacy/tb_receipt_item.md)
- [`tb_users`](../../database/legacy/tb_users.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/forwarder-legacy`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_LEGACY_MEMBER_BASE`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/get-user`
- `lib/legacy-image`
- `lib/supabase/admin`

## Exports / functions

- `ServiceImportDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
