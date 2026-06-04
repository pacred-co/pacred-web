# `tb_cnt`

> ✅ canonical / live · **camelCase** columns · referenced **12×** in code

Containers / ตู้ — container ledger (payment/cost per container).

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `ID` |  | Container id |
| `adminIDCreate` |  | Created-by |
| `adminIDUpdate` |  | Updated-by |
| `cntAmount` |  | Cost/amount |
| `cntFile` | ✏️ | Doc |
| `cntImagesSlip` |  | Payment slip |
| `cntName` |  | Container name/code |
| `cntStatus` |  | Status |
| `nameAccount` |  | Bank account name |
| `nameBlank` |  | Bank name |
| `noBlank` |  | Bank account no |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/cnt-hs.ts`
- `actions/admin/cnt-payment.ts`
- `actions/admin/sidebar-counts.ts`
- `app/[locale]/(admin)/admin/cnt-hs/[id]/page.tsx`
- `app/[locale]/(admin)/admin/cnt-hs/page.tsx`
- …and more (12 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
