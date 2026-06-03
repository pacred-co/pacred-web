# `freight_shipments`

> 🆕 Pacred-native · referenced **29×** in code

Active freight shipment + customs value-engineering fields (Form-E, VAT plan, duty). Source for freight P&L + customs declaration.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `bl_no` |  | BL number |
| `carrier_container_no` |  | Carrier container # |
| `commercial_value_thb` |  | Commercial value (THB) |
| `commercial_value_usd` |  | Commercial value (USD) |
| `container_code` |  | Container code |
| `declared_customs_value_thb` |  | Declared customs value (THB) |
| `declared_value_basis` |  | Declared value basis |
| `duty_rate_pct` |  | Duty % |
| `duty_thb` |  | Duty (THB) |
| `exchange_rate` |  | Exchange rate |
| `form_e_applied` |  | Form-E (China FTA) flag |
| `hs_code` |  | HS code |
| `id` |  | Shipment id |
| `incoterm` |  | Incoterm |
| `job_no` |  | Job number |
| `origin_country` |  | Origin country |
| `payment_term` |  | Payment term |
| `place_delivery` |  | Delivery place |
| `port_discharge` |  | Discharge port |
| `port_loading` |  | Loading port |
| `profile_id` |  | Customer |
| `source_quote_id` |  | Origin quote |
| `status` | ✏️ | State |
| `transport_mode` |  | Mode |
| `vat_base_thb` |  | VAT base |
| `vat_plan_label` |  | VAT plan |
| `vat_thb` |  | VAT |
| `vessel_voyage` |  | Vessel/voyage |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/freight-invoices.ts`
- `actions/admin/freight-quotes.ts`
- `actions/admin/freight-shipments.ts`
- `actions/admin/customs-declarations.ts`
- `app/[locale]/(protected)/freight/shipments/[id]/page.tsx`
- …and more (29 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
