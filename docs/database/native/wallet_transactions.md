# `wallet_transactions`

> 💀 rebuilt twin (mostly empty — do not write here for live data) · referenced **45×** in code

Rebuilt wallet ledger twin.

> Live = tb_wallet_hs.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `admin_id` | ✏️ |  |
| `admin_id_update` | ✏️ |  |
| `amount` | ✏️ |  |
| `bucket` | ✏️ |  |
| `created_at` |  |  |
| `first_name` |  |  |
| `id` |  |  |
| `kind` | ✏️ |  |
| `last_name` |  |  |
| `note` | ✏️ |  |
| `profile` |  |  |
| `profile_id` | ✏️ |  |
| `reconciled_forwarder_id` |  |  |
| `reconciliation_status` |  |  |
| `reference_id` | ✏️ |  |
| `reference_type` | ✏️ |  |
| `slip_transferred_at` | ✏️ |  |
| `slip_url` |  |  |
| `status` | ✏️ |  |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/wallet.ts`
- `actions/payment.ts`
- `actions/admin/wallet.ts`
- `actions/admin/payment-reconciliation.ts`
- `actions/admin/forwarder-cost-adjustments.ts`
- …and more (45 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
