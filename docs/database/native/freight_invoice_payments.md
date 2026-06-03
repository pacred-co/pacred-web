# `freight_invoice_payments`

> 🆕 Pacred-native · referenced **11×** in code

Payments against a freight invoice.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `amount_thb` |  |  |
| `bank_ref` |  |  |
| `created_at` |  |  |
| `freight_invoice_id` |  |  |
| `id` |  |  |
| `method` |  |  |
| `notes` |  |  |
| `paid_at` |  |  |
| `recorded_by_admin_id` |  |  |
| `slip_storage_path` |  |  |
| `status` | ✏️ |  |
| `void_reason` | ✏️ |  |
| `voided_at` | ✏️ |  |
| `voided_by_admin_id` | ✏️ |  |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/accounting-periods.ts`
- `actions/admin/freight-invoice-payments.ts`
- `app/[locale]/(protected)/freight/shipments/[id]/page.tsx`
- `app/[locale]/(admin)/admin/freight/shipments/[id]/page.tsx`
- `app/api/freight-receipt/[id]/route.tsx`
- …and more (11 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
