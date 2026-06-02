# `profiles`

> 🆕 Pacred-native · referenced **122×** in code

Pacred-native customer/auth profile. New accounts use this; migrated PCS customers link via legacy_pcs_user_id. Coexists with tb_users (live data).

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `account_type` | ✏️ | individual/juristic |
| `avatar_url` | ✏️ | Avatar |
| `birthday` |  | Birthday |
| `company_name` | ✏️ | Company |
| `customer_group` | ✏️ | Segment |
| `direct_phone` |  | Direct phone |
| `display_name` |  | Display name |
| `email` | ✏️ | Email |
| `first_name` | ✏️ | First name |
| `how_know` | ✏️ | Acquisition channel |
| `id` | ✏️ | Supabase auth uid |
| `is_active` |  | Active |
| `last_name` | ✏️ | Last name |
| `legacy_pcs_user_id` | ✏️ | Legacy PCS link |
| `line_id` |  | LINE id |
| `line_linked_at` | ✏️ | LINE linked |
| `line_user_id` | ✏️ | LINE user id |
| `member_code` |  | PR<n> (matches tb_users.userID) |
| `migrated_from_pcs` | ✏️ | Migration flag |
| `nickname` |  | Nickname |
| `notify_channels` | ✏️ | Notify prefs |
| `phone` | ✏️ | Phone |
| `profile_id` |  | Self/legacy link |
| `sales_admin_id` | ✏️ | Assigned sales rep |
| `services` | ✏️ | Interested services |
| `sex` |  | Sex |
| `status` | ✏️ | State |
| `tax_id` | ✏️ | Tax ID |
| `total_price` |  | Lifetime value |
| `total_thb` |  | Lifetime value (THB) |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/credit.ts`
- `actions/admin/wallet.ts`
- `actions/admin/rates.ts`
- `actions/admin/credit.ts`
- `actions/admin/work-item-messages.ts`
- …and more (122 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
