# `service_orders`

> 💀 rebuilt twin (mostly empty — do not write here for live data) · referenced **19×** in code

Rebuilt service-order twin.

> Live = tb_header_order.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `account_type` |  |  |
| `acknowledged_at` |  |  |
| `acknowledged_note` |  |  |
| `bill_to_name_override` | ✏️ |  |
| `crate` |  |  |
| `created_at` |  |  |
| `email` |  |  |
| `f_no` |  |  |
| `first_name` |  |  |
| `free_shipping` |  |  |
| `h_no` |  |  |
| `id` |  |  |
| `item_count` |  |  |
| `last_name` |  |  |
| `note_admin` |  |  |
| `note_user` |  |  |
| `notification_id` |  |  |
| `pay_method` |  |  |
| `payment_due_at` |  |  |
| `phone` |  |  |
| `profile` |  |  |
| `profile_id` | ✏️ |  |
| `ship_address_line` |  |  |
| `ship_by` |  |  |
| `ship_district` |  |  |
| `ship_first_name` |  |  |
| `ship_last_name` |  |  |
| `ship_phone` |  |  |
| `ship_postal_code` |  |  |
| `ship_province` |  |  |
| `ship_sub_district` |  |  |
| `status` | ✏️ |  |
| `subtotal_cny` |  |  |
| `thb_amount` |  |  |
| `title` | ✏️ |  |
| `total_price` |  |  |
| `total_thb` |  |  |
| `transport_type` |  |  |
| `warehouse_china` |  |  |
| `yuan_amount` |  |  |
| `yuan_rate_locked` |  |  |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/service-orders.ts`
- `actions/admin/wht.ts`
- `actions/admin/barcode.ts`
- `actions/admin/invoice-adjustments.ts`
- `actions/admin/refunds.ts`
- …and more (19 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
