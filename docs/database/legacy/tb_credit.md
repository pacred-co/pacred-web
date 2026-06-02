# `tb_credit`

> ✅ canonical / live · **lowercase** columns · ADR-0023 · referenced **11×** in code

Customer credit line (ADR-0023). getMyCredit = tb_users.userCreditValue − tb_credit.creditvalue.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `creditvalue` | ✏️ | Used credit (offset against limit) |
| `id` |  | Row id |
| `userid` | ✏️ | Customer |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/credit.ts`
- `actions/admin/wallet-hs.ts`
- `actions/admin/forwarders-field-edits.ts`
- `lib/legacy/pcs-chrome.ts`
- `app/[locale]/(protected)/service-import/page.tsx`
- …and more (11 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
