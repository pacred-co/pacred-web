# `admins`

> 🆕 Pacred-native · referenced **58×** in code

Unified-admin table (PM-6) — login + RBAC SOT (15-admin roster). Sales-attribution bridges to tb_admin via legacy_admin_id.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `admin_note` |  | Note |
| `contract_end_date` |  | Contract end |
| `department` |  | Department |
| `direct_phone` |  | Direct phone |
| `display_name` |  | Display name |
| `email` |  | Email |
| `employee_type` |  | Employee type |
| `first_name` |  | First name |
| `granted_at` | ✏️ | Role grant time |
| `granted_by` | ✏️ | Granted by |
| `hired_at` |  | Hired |
| `id` |  | Admin id |
| `is_active` | ✏️ | Active |
| `last_name` |  | Last name |
| `legacy_admin_id` |  | Bridge → tb_admin.adminID |
| `nickname` |  | Nickname |
| `phone` |  | Phone |
| `profile_id` | ✏️ | → profiles |
| `role` | ✏️ | RBAC role (super/accounting/sales/qa/warehouse/driver/freight_*) |
| `roles` |  | Multi-role |
| `section` |  | Section |
| `work_email` |  | Work email |
| `work_phone` |  | Work phone |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/contact.ts`
- `actions/admin/incidents.ts`
- `actions/admin/work-item-messages.ts`
- `actions/admin/learning.ts`
- `actions/admin/tb-settings.ts`
- …and more (58 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
