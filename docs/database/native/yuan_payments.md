# `yuan_payments`

> 💀 rebuilt twin (mostly empty — do not write here for live data) · referenced **11×** in code

Rebuilt yuan-payment twin.

> Live = tb_payment.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `channel` |  |  |
| `created_at` |  |  |
| `id` |  |  |
| `notification_id` |  |  |
| `paid_via_wallet` |  |  |
| `profile_id` |  |  |
| `sales_admin_id` |  |  |
| `slip_transferred_at` | ✏️ |  |
| `status` |  |  |
| `thb_amount` |  |  |
| `yuan_amount` |  |  |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/refunds.ts`
- `actions/admin/yuan-payments.ts`
- `actions/refunds.ts`
- `lib/sidebar-data.ts`
- `app/[locale]/(protected)/refunds/page.tsx`
- …and more (11 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
