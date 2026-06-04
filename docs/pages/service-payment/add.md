# `/service-payment/add`

**สร้างรายการฝากโอนใหม่**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/service-payment/add/page.tsx`

## Database tables

- [`admin_audit_log`](../../database/native/admin_audit_log.md)
- [`profiles`](../../database/native/profiles.md)
- [`slips`](../../database/native/slips.md)
- [`tb_payment`](../../database/legacy/tb_payment.md)
- [`tb_settings`](../../database/legacy/tb_settings.md)
- [`tb_wallet`](../../database/legacy/tb_wallet.md)
- [`tb_wallet_hs`](../../database/legacy/tb_wallet_hs.md)
- [`wallet_transactions`](../../database/native/wallet_transactions.md)

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/payment`
- action: `actions/wallet`

## 3rd-party / services

- Icons (lucide)
- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_YUAN_RATE`

## Lib modules

- `lib/auth/get-user`

## Exports / functions

- `ServicePaymentAddPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
