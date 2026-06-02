# `tb_wallet_hs`

> ✅ canonical / live · **lowercase** columns · referenced **137×** in code

Wallet ledger / history — every credit/debit movement (append-only). Balance changes in tb_wallet are mirrored here; `type` codes the entry kind.

> **type codes:** deposit / debit-on-order / cashback / withdraw / forwarder-settle / credit. type='3' was a withdrawal collision → '8'; type='4' = direct-slip deposit branch.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `adminid` | ✏️ | Admin |
| `adminidupdate` | ✏️ | Updated-by admin |
| `amount` | ✏️ | Movement amount |
| `cbhid` |  | Cashback/order id |
| `date` | ✏️ |  |
| `dateslip` | ✏️ | Slip date |
| `depositnamebank` | ✏️ | Deposit bank |
| `id` |  | Ledger row id |
| `imagesslip` | ✏️ | Uploaded slip |
| `nameuserbank` | ✏️ | User bank name |
| `note` | ✏️ | Note |
| `nouserbank` | ✏️ | User bank no |
| `paydeposit` | ✏️ |  |
| `paystatus` |  | Paid state |
| `paythb` |  | THB amount |
| `reforder` | ✏️ | Settled order ref |
| `reforder2` |  | Settled order ref 2 |
| `status` | ✏️ | Approval state |
| `type` | ✏️ | Entry type code |
| `typenew` | ✏️ | Entry type (new) |
| `typeservice` | ✏️ | Service type |
| `userid` |  | Customer |
| `wallettotal` |  | Resulting balance |
| `whid` |  | Wallet id |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/wallet.ts`
- `actions/credit.ts`
- `actions/payment-tb.ts`
- `actions/admin/shop-disbursement.ts`
- `actions/admin/wallet-hs.ts`
- …and more (137 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
