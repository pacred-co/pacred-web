# `tb_payment`

> ✅ canonical / live · **lowercase** columns · referenced **59×** in code

ฝากโอน / yuan transfer payments — customer pays a China supplier in CNY through Pacred (Alipay/yuan). Holds slip, exchange rate, profit on spread.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `adminid` | ✏️ | Admin |
| `certifiedtruecopy` |  | Certified-copy flag |
| `id` |  | Payment id |
| `imagesslip` |  | Customer slip |
| `imagesslipadmin` |  | Admin slip |
| `keyword` |  | Reference |
| `note` |  | Note |
| `paydate` |  | Date |
| `paydateadmin` | ✏️ | Admin date |
| `paydeposit` |  | Deposit |
| `payprofitthb` |  | Profit on spread (THB) |
| `payrate` |  | Rate (customer) |
| `payratecost` |  | Rate (cost) |
| `paystatus` | ✏️ | 0=pending → 1=approved |
| `paythb` |  | THB charged |
| `paythbcost` |  | THB cost |
| `paytype` |  | Payment type |
| `payyuan` |  | CNY amount |
| `reforder` |  | Order ref |
| `slip_transfer_time` | ✏️ | Slip timestamp |
| `userid` |  | Customer |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/payment.ts`
- `actions/payment-tb.ts`
- `actions/admin/customer-profile.ts`
- `actions/admin/tb-bulk.ts`
- `actions/admin/yuan-payments-tb.ts`
- …and more (59 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
