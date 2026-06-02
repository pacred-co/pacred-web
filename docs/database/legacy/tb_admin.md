# `tb_admin`

> ✅ canonical / live · **camelCase** columns · referenced **49×** in code

Staff / sales-attribution SOT (legacy). After PM-6: login SOT=admins, sales-attribution SOT=tb_admin (bridged via admins.legacy_admin_id).

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `adminEmail` |  | Email |
| `adminFirstName` |  | First name |
| `adminID` |  | Staff code (e.g. admin_pee, admin_center) |
| `adminLastName` |  | Last name |
| `adminName` |  | Name |
| `adminNickname` |  | Nickname |
| `adminPicture` |  | Avatar |
| `adminStatusA` |  | Active flag |
| `adminStatusSale` |  | '1'=active sales rep (round-robin pool) |
| `adminTMP` | ✏️ |  |
| `adminTel` |  | Phone |
| `adminType` |  | Role/type |
| `department` |  | Department |
| `enddate` |  | Termination date |
| `section` |  | Section |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/forwarder-cost.ts`
- `actions/admin/shop-disbursement.ts`
- `actions/admin/service-orders.ts`
- `actions/admin/combine-bill.ts`
- `actions/admin/wallet-hs.ts`
- …and more (49 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
