# `momo_import_tracks`

> 🆕 Pacred-native · referenced **17×** in code

MOMO partner-sync main pull table — one row per MOMO tracking. Cron pulls here, then commits eligible rows into tb_forwarder.

> ⚠️ MOMO `container_no` ≠ cabinet — it sends a routing batch id (PR20260527-SEA02), not the real cabinet. Never write it into tb_forwarder.fcabinetnumber.

## Columns observed in code

| Column | W | Meaning |
|---|:-:|---|
| `admin_status_text` |  | Admin status text |
| `cbm` |  | CBM |
| `commit_userid` |  | Commit user |
| `committed_at` |  | Committed timestamp |
| `committed_forwarder_id` |  | → tb_forwarder on commit |
| `container_batch_no` |  | Container batch |
| `container_closed_id` |  | → momo_container_closed |
| `id` |  | Row id |
| `last_synced_at` |  | Last sync |
| `momo_container_no` |  | MOMO container (routing batch — NOT cabinet) |
| `momo_sack_no` |  | Sack # |
| `momo_tracking_no` |  | MOMO tracking # |
| `momo_user_code` |  | MOMO user code |
| `phase` |  | Sync phase |
| `raw` |  | Raw API payload |
| `ship_by` |  | Ship method |
| `shipment_status` |  | Status |
| `weight_kg` |  | Weight |

<sub>✏️ = column written by code (high-confidence). Others observed in reads/filters — may include join bleed. Casing as the code uses it.</sub>

## Referenced by

- `actions/admin/momo-backfill.ts`
- `lib/admin/commit-momo-row-core.ts`
- `lib/admin/auto-commit-momo.ts`
- `lib/integrations/momo-isolated/propagate.ts`
- `lib/integrations/momo-isolated/sync.ts`
- …and more (17 total references)

---

<sub>Derived from code usage on 2026-06-02 — not from migration files. See [../README.md](../README.md).</sub>
