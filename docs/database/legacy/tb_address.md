# `tb_address`

> ✅ canonical / live · **lowercase** columns · referenced **52×** in code

Customer shipping addresses (multiple per customer).

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `addressdistrict` |  | District |
| `addressid` |  | Address id |
| `addresslastname` |  | Recipient last name |
| `addressname` |  | Recipient first name |
| `addressno` |  | Address no |
| `addressnote` |  | Note |
| `addressprovince` |  | Province |
| `addressstatus` | ✏️ | Default/active flag |
| `addresssubdistrict` |  | Subdistrict |
| `addresstel` |  | Phone |
| `addresstel2` |  | Phone 2 |
| `addresszipcode` |  | Zip |
| `latitude` |  | Geocode lat |
| `longitude` |  | Geocode lng |
| `userid` |  | Customer |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/forwarder-legacy.ts`
- `actions/admin/forwarders-new.ts`
- `actions/admin/carrier-manual.ts`
- `actions/admin/customer-profile.ts`
- `actions/admin/forwarders-field-edits.ts`
- …and more (52 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
