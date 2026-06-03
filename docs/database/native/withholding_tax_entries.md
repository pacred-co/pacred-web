# `withholding_tax_entries`

> 🆕 Pacred-native · referenced **25×** in code

WHT (หัก ณ ที่จ่าย) entries (1%/3%/5%).

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `cert_number` |  |  |
| `cert_received_at` |  |  |
| `cert_status` |  |  |
| `cert_storage_path` |  |  |
| `created_at` |  |  |
| `first_name` |  |  |
| `forwarder_f_no` |  |  |
| `freight_invoice_id` |  |  |
| `gross_invoice_thb` |  |  |
| `id` |  |  |
| `last_name` |  |  |
| `net_expected_thb` |  |  |
| `order_h_no` |  |  |
| `profile` |  |  |
| `profile_id` |  |  |
| `tax_invoice_id` | ✏️ |  |
| `waived_at` |  |  |
| `waived_reason` |  |  |
| `wht_amount_thb` |  |  |
| `wht_base_thb` |  |  |
| `wht_rate_pct` |  |  |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/wht.ts`
- `actions/admin/freight-invoices.ts`
- `actions/admin/wht.ts`
- `actions/admin/tax-invoices.tsx`
- `actions/admin/freight-invoice-payments.ts`
- …and more (25 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
