# `tb_users`

> ✅ canonical / live · **camelCase** columns · referenced **218×** in code

Customer master (PR-coded). One row per customer account — identity, contact, assigned sales rep, wallet-balance mirror, credit limit.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `adminIDSale` | ✏️ | Assigned sales rep (legacy admin code e.g. admin_pee) |
| `coID` |  | Corporate master link (tb_co) |
| `pcs_logged` | ✏️ |  |
| `userActive` | ✏️ | ''=never-contacted lead (the cold-lead pool) |
| `userAddressID` | ✏️ | Default address id |
| `userBirthday` |  | Birthday |
| `userCompany` | ✏️ | "1"=juristic (→tb_corporate), else individual |
| `userCreditValue` | ✏️ | Credit limit (ADR-0023; tb_credit.creditvalue=used) |
| `userEmail` |  | Email |
| `userFacebook` |  | Facebook id |
| `userID` | ✏️ | Member code PR<n> — the join key used everywhere as `userid` |
| `userLastLogin` |  | Last login |
| `userLastName` |  | Last name |
| `userLineID` |  | LINE id |
| `userLineNotify` |  | LINE notify token |
| `userName` |  | First name |
| `userNote` | ✏️ | Admin freetext note |
| `userPass` | ✏️ | Legacy 79-char hash (bridge login verifies against this) |
| `userRegistered` |  | Register date |
| `userSex` |  | Sex |
| `userShipBy` |  | Default shipping method |
| `userStatus` | ✏️ | Account status |
| `userTel` |  | Phone (login identity) |
| `userTransportType` |  | Default transport mode |
| `useractive` | ✏️ |  |
| `wallettotal` |  | Mirror of wallet balance |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/credit.ts`
- `actions/forwarder-legacy.ts`
- `actions/admin/shop-disbursement.ts`
- `actions/admin/wallet-hs.ts`
- `actions/admin/forwarders-new.ts`
- …and more (218 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
