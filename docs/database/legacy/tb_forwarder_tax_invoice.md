# `tb_forwarder_tax_invoice`

> ✅ canonical / live · **lowercase** columns · ADR-0027 · referenced **6×** in code

Forwarder tax invoice (ADR-0027 World-B SOT).

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `buyer_address` |  |  |
| `buyer_branch` |  |  |
| `buyer_name` |  |  |
| `buyer_tax_id` |  |  |
| `created_at` |  |  |
| `id` |  |  |
| `is_juristic` |  |  |
| `issued_at` |  |  |
| `net_payable` |  |  |
| `pdf_storage_path` |  |  |
| `serial_no` |  |  |
| `status` |  |  |
| `userid` |  |  |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/wht-cert.ts`
- `actions/admin/etax-export.ts`
- `actions/tax-invoices.ts`
- `lib/admin/forwarder-tax-invoice.ts`
- …and more (6 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
