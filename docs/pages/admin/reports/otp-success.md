# `/admin/reports/otp-success`

**อัตราสำเร็จ OTP**

> **Auth:** 🛡 Admin — roles: `super`, `ops`
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/reports/otp-success/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`admins`](../../../database/native/admins.md)
- [`tb_admin`](../../../database/legacy/tb_admin.md)
- [`tb_forwarder`](../../../database/legacy/tb_forwarder.md)
- [`tb_header_order`](../../../database/legacy/tb_header_order.md)
- [`tb_payment`](../../../database/legacy/tb_payment.md)
- [`tb_sales_report`](../../../database/legacy/tb_sales_report.md)
- [`tb_users`](../../../database/legacy/tb_users.md)
- [`tb_users_otp`](../../../database/legacy/tb_users_otp.md)
- [`tb_users_otp_hs`](../../../database/legacy/tb_users_otp_hs.md)

## Components

- `components/admin/reports/report-shell`

## Server Actions / internal APIs

- action: `actions/admin/reports`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/admin/reports/types`
- `lib/auth/require-admin`

## Exports / functions

- `OtpSuccessReportPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../README.md).</sub>
