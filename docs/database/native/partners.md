# `partners`

> 🆕 Pacred-native · referenced **5×** in code

External partner directory (migration 0136, PM-7) — logistics/business partners.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `code` |  | Partner code |
| `contact_email` |  | Email |
| `contact_name` |  | Contact |
| `contact_phone` |  | Phone |
| `id` |  | Partner id |
| `is_active` | ✏️ | Active |
| `name` |  | Name (TH) |
| `name_en` |  | Name (EN) |
| `note` |  | Note |
| `partner_type` |  | GOGO/JMF/TTP/MOMO/CargoThai/warehouse/customs/messenger/api_provider |
| `sort` |  | Sort order |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/partners.ts`
- `app/[locale]/(admin)/admin/partners/page.tsx`
- …and more (5 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
