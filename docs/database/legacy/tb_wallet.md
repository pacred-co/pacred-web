# `tb_wallet`

> ✅ canonical / live · **lowercase** columns · referenced **100×** in code

Wallet balance — current balance per customer. Essentially (userid, wallettotal).

> Address/corporate columns appearing in scans are **bleed from joins** — the real table is just the balance.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `id` |  | Row id |
| `userid` | ✏️ | Customer (key) |
| `wallettotal` | ✏️ | Current balance (THB) |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/wallet.ts`
- `actions/credit.ts`
- `actions/payment-tb.ts`
- `actions/admin/wallet-hs.ts`
- `actions/admin/tb-bulk.ts`
- …and more (100 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
