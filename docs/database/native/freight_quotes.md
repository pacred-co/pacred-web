# `freight_quotes`

> 🆕 Pacred-native · referenced **25×** in code

Customer freight quote (FCL/LCL/AIR/truck). Quote → accept → convert to shipment.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `accepted_at` | ✏️ |  |
| `buyer_name_snapshot` |  | Buyer name snapshot |
| `buyer_tax_id_snapshot` |  | Buyer tax-id snapshot |
| `converted_to_shipment_id` | ✏️ | → freight_shipments |
| `currency` |  | Currency |
| `id` |  | Quote id |
| `incoterm` |  | EXW/FOB/CIF… |
| `place_delivery` |  | Delivery place |
| `port_discharge` |  | Destination port |
| `port_loading` |  | Origin port |
| `profile_id` |  | Customer (profiles.id) |
| `quote_no` |  | Quote number |
| `status` | ✏️ | draft→sent→accepted/rejected |
| `subtotal` |  | Subtotal |
| `total` |  | Total |
| `transport_mode` |  | FCL/LCL/AIR/truck |
| `valid_until` |  | Valid until |
| `vat_amount` |  | VAT amount |
| `vat_pct` |  | VAT % |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/freight-quotes.ts`
- `actions/admin/bookings.ts`
- `actions/freight.ts`
- `app/[locale]/(protected)/bookings/[bookingNo]/page.tsx`
- `app/[locale]/(protected)/freight/quotes/[quote_no]/page.tsx`
- …and more (25 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
