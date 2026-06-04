# `tb_corporate`

> ✅ canonical / live · **lowercase** columns · referenced **60×** in code

Juristic customers — company profile for juristic accounts (tb_users.userCompany="1"). SOT for juristic data (ADR-0021). Linked by userid.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `corporateaddress` |  | Registered address |
| `corporatefile` |  | Uploaded doc |
| `corporatefile20` |  | ภพ.20 doc |
| `corporatename` |  | Company legal name |
| `corporatenumber` |  | Tax ID / registration number |
| `corporatestatus` | ✏️ | Verification status |
| `cpdatecreate` |  | Created date |
| `id` |  | Row id |
| `userid` |  | Customer link |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/customers.ts`
- `actions/admin/forwarder-invoice.ts`
- `actions/admin/customer-profile.ts`
- `actions/admin/pay-user.ts`
- `actions/admin/customer-admin.ts`
- …and more (60 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
