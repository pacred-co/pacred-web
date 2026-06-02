# `tb_user_sales_admin_pay`

> ✅ canonical / live · **lowercase** columns · referenced **22×** in code

Admin pay-out of sales commission — status 2→3 + slip (AND status=2 double-pay guard).

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `admincreate` |  |  |
| `amount` | ✏️ |  |
| `date` |  |  |
| `dateslip` |  |  |
| `file` | ✏️ |  |
| `id` |  |  |
| `imagesslip` | ✏️ |  |
| `name_account` |  |  |
| `name_blank` |  |  |
| `no_blank` |  |  |
| `status` |  |  |
| `useridmain` | ✏️ |  |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/sales-payouts-tb.test.ts`
- `actions/admin/sales-payouts-tb.ts`
- `actions/admin/reports-agent-payouts.ts`
- `actions/commissions-tb.test.ts`
- `actions/commissions-tb.ts`
- …and more (22 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
