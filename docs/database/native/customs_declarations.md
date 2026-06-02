# `customs_declarations`

> 🆕 Pacred-native · referenced **22×** in code

Thai customs declaration (ใบขนสินค้า) for a freight shipment.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `broker_license_no` |  | Broker license |
| `broker_name` |  | Customs broker |
| `customs_control_no` |  | Customs control no |
| `customs_office` |  | Customs office |
| `declaration_no` |  | Declaration number |
| `declaration_type` |  | Import/export |
| `freight_shipment_id` |  | → freight_shipments |
| `id` |  | Declaration id |
| `paid_through_promptpay` |  | Paid via PromptPay |
| `port_of_entry` |  | Port of entry |
| `profile_id` |  | Customer |
| `status` |  | State |
| `total_declared_value_thb` |  | Declared value |
| `total_duty_thb` |  | Duty |
| `total_other_taxes_thb` |  | Other taxes |
| `total_vat_thb` |  | VAT |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/customs-declarations.ts`
- `app/[locale]/(admin)/admin/freight/shipments/[id]/page.tsx`
- `app/[locale]/(admin)/admin/freight/declarations/[id]/page.tsx`
- `app/[locale]/(admin)/admin/freight/declarations/page.tsx`
- `app/api/customs-declaration/[id]/route.tsx`
- …and more (22 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
