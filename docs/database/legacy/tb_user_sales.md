# `tb_user_sales`

> ✅ canonical / live · **lowercase** columns · referenced **15×** in code

Sales commission earn-trigger ledger (4 agent codes on forwarder delivery).

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `date` |  | Date |
| `id` |  | Row id |
| `idf` |  | Forwarder order |
| `useridmain` |  | Sales rep |
| `usstatus` | ✏️ | Status |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/earn-trigger-tb-user-sales.ts`
- `actions/admin/sales-payouts-tb.ts`
- `actions/admin/reports-agent-payouts.ts`
- `actions/commissions-tb.test.ts`
- `actions/commissions-tb.ts`
- …and more (15 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
