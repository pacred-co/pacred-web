# `tb_cash_back`

> ✅ canonical / live · **lowercase** columns · ADR-0025 · referenced **23×** in code

Cashback ledger (ADR-0025).

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `amount` |  | Amount |
| `cbtotal` | ✏️ | Cashback balance/amount |
| `id` |  | Row id |
| `reforder` |  | Settled order ref |
| `status` |  | State |
| `type` |  | Entry type |
| `userid` | ✏️ | Customer |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/payment-tb.ts`
- `actions/admin/wallet-hs.ts`
- `actions/admin/customer-admin.ts`
- `actions/service-order.ts`
- `actions/forwarder.ts`
- …and more (23 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
