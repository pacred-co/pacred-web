# `tax_invoices`

> 🆕 Pacred-native · referenced **20×** in code

Tax invoices (RD Code 86).

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `buyer_address` |  |  |
| `buyer_branch` |  |  |
| `buyer_name` |  |  |
| `buyer_tax_id` |  |  |
| `cancellation_reason` |  |  |
| `cancelled_at` |  |  |
| `created_at` |  |  |
| `credit_note_for_id` |  |  |
| `credit_note_id` | ✏️ |  |
| `email` |  |  |
| `first_name` |  |  |
| `forwarder_f_no` |  |  |
| `id` |  |  |
| `invoice_no` |  |  |
| `issued_at` |  |  |
| `last_name` |  |  |
| `order_h_no` |  |  |
| `payment_method` |  |  |
| `pdf_storage_path` | ✏️ |  |
| `phone` |  |  |
| `profile` |  |  |
| `profile_id` |  |  |
| `serial_no` |  |  |
| `status` |  |  |
| `subtotal_thb` |  |  |
| `total_thb` |  |  |
| `vat_mode` |  |  |
| `vat_thb` |  |  |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/tax-invoices.tsx`
- `actions/admin/accounting-periods.ts`
- `app/[locale]/(admin)/admin/accounting/documents/page.tsx`
- `app/[locale]/(admin)/admin/tax-invoices/[id]/page.tsx`
- `app/[locale]/(admin)/admin/tax-invoices/page.tsx`
- …and more (20 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
