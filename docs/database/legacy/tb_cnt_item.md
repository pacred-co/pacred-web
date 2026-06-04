# `tb_cnt_item`

> ✅ canonical / live · **camelCase** columns · referenced **8×** in code

Container ↔ forwarder-order link (by cabinet number).

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `ID` |  | Row id |
| `cntID` | ✏️ | → tb_cnt |
| `fCabinetNumber` | ✏️ | → tb_forwarder.fcabinetnumber |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/cnt-payment.ts`
- `app/[locale]/(admin)/admin/cnt-hs/[id]/page.tsx`
- `app/[locale]/(admin)/admin/cnt-hs/page.tsx`
- `app/[locale]/(admin)/admin/report-cnt/[fNo]/page.tsx`
- `app/[locale]/(admin)/admin/report-cnt/page.tsx`
- …and more (8 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
