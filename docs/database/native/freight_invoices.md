# `freight_invoices`

> 🆕 Pacred-native · referenced **25×** in code

Freight tax invoice (heavily snapshotted for legal fidelity).

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `cancelled_at` |  | Cancelled |
| `commercial_value_thb` |  | Value (THB) |
| `duty_thb` |  | Duty |
| `exchange_rate` |  | Rate |
| `freight_shipment_id` |  | → freight_shipments |
| `fully_paid_at` |  | Fully paid |
| `hs_code` |  | HS code |
| `id` |  | Invoice id |
| `invoice_no` |  | Invoice number |
| `issued_at` |  | Issued |
| `payment_status` |  | Payment state |
| `profile_id` |  | Customer |
| `status` |  | Invoice state |
| `vat_thb` |  | VAT |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/freight-invoices.ts`
- `actions/admin/wht.ts`
- `actions/admin/invoice-adjustments.ts`
- `actions/admin/freight-shipments.ts`
- `actions/admin/customs-declarations.ts`
- …and more (25 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
