# `tb_receipt`

> ✅ canonical / live · **lowercase** columns · referenced **26×** in code

Receipts minted on payment-land. Doc number {FRC|FRG}{yyMM}-{NNNNN}. Issuer = Pacred (TaxID 0105564077716).

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `corporatetype` |  | Customer juristic type |
| `id` |  | Receipt id (=rid) |
| `issuedate` |  | Issue date |
| `ramount` |  | Amount |
| `rdate` |  | Date |
| `rdatecreate` |  | Created |
| `recompaddress` |  | Issuer address |
| `recompname` |  | Issuer company |
| `recompnumber` |  | Issuer tax id |
| `refid` |  | Settled order/payment |
| `rstatus` | ✏️ | Receipt status |
| `totalbeforewithholding` |  | Pre-WHT total |
| `userid` |  | Customer |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/forwarder-invoice.ts`
- `actions/admin/peak-export.ts`
- `actions/admin/accounting-receipts.ts`
- `actions/freight.ts`
- `lib/admin/auto-issue-receipt.ts`
- …and more (26 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
