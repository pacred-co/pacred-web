# Port-spec — Cargo volume reconciliation (V-D1 · V-D2 · V-D3)

> **Status:** 🟡 spec by เดฟ — backend prep for ภูม. ภูม implements + finalises (column names / grain are his call; this is a proposal, not a contract).
> **Date:** 2026-05-16 · **Owner:** ภูม (impl) · **Source:** PORT_PLAN Part V `V-D1/D2/D3`
>
> **Read with:**
> [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) §3.2-3.3 + §4 D (the *why*) ·
> [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) (the spine) ·
> [`supabase/migrations/0033_containers.sql`](../../supabase/migrations/0033_containers.sql) (the tables this extends) ·
> [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V (the schedule).

---

## Context

Forensics §4 **D** found two revenue-critical container-data defects, both confirmed against real documents:

1. **CBM does not reconcile.** One container measures different CBM in three places — the PCS API on goods-receipt ("รับเข้า"), the "รวมคิว" queue-sum, and the China loading manifest ("ปิดตู้"). Real case **GZE260422-1: API ≈ 16.79 vs manifest 21.281817 CBM** — the customer disputes the bill, revenue stalls.
2. **Type taxonomy is inconsistent.** The PCS API tags goods `A/M/X/O/Z`; the warehouse manifest tags the *same* categories `G/T/F`. Nothing reconciles them.
3. Plus: a container carries **two identifiers** — the Pacred code (`GZE260407-1`) and the carrier's physical container number (`BLOU2025012`) — not linked in the schema.

All three extend the existing `cargo_*` spine ([migration 0033](../../supabase/migrations/0033_containers.sql)) with **additive columns** — `add column if not exists`, idempotent, zero risk to live rows.

---

## V-D1 — CBM (and weight) per source

**Problem:** `cargo_shipments.volume_cbm` is a single number. There is nowhere to record *where it came from*, so a 16.79-vs-21.28 disagreement is invisible until a customer complains.

**Proposed columns on `public.cargo_shipments`:**

| Column | Meaning |
|---|---|
| `cbm_received` `numeric(10,3)` | CBM the China warehouse API computed when goods were scanned in ("รับเข้า"). |
| `cbm_queued` `numeric(10,3)` | CBM from the PCS "รวมคิว" queue-sum. |
| `cbm_manifest` `numeric(10,3)` | CBM from the China loading manifest ("ปิดตู้" / 装柜明细). |
| `weight_received_kg` `numeric(10,2)` | Weight per the receive scan (same mismatch class — chat showed weight disputes too). |
| `weight_manifest_kg` `numeric(10,2)` | Weight per the loading manifest. |

- **Keep `volume_cbm` and `weight_kg` as the *billed* (canonical) values** — existing billing code reads them; do not break it. Staff confirm them from the source columns before an invoice is generated.
- All numeric — **range-guard** (`check (… >= 0)`, sane upper bound) per forensics E5 (legacy sheets carry int32-overflow garbage).
- `cbm_variance` is **computed app-side** (`max − min` of the non-null sources) — no stored column needed.

**What ภูม builds:**
- The migration (additive columns + checks).
- MOMO sync + manifest import populate `cbm_received` / `cbm_manifest` (sources differ — see `lib/integrations/momo-jmf/`).
- **Admin shipment/forwarder detail UI:** show all three CBM values side by side; if `cbm_variance` exceeds a threshold (suggest **> 0.5 CBM or > 10%**), show a warning and require the staff member to **confirm the billed CBM** before the invoice action unlocks. Confirmation writes an audit row ([ADR-0014](../decisions/0014-customer-self-service-state-transitions.md) pattern).

---

## V-D2 — One canonical cargo-type enum

**Problem:** two legacy code sets for the same five categories (forensics §3.3).

**Proposed:** a single canonical enum, stored on `public.cargo_shipments` (the grain we have; move to a per-parcel table later if one is introduced):

```sql
cargo_type text check (cargo_type in
  ('general','electrical','food_drug','brand','controlled'))
```

**Canonical ↔ legacy mapping** (lives as a constant in `lib/cargo/` — ภูม's call; the DB stores **only** the canonical value):

| Canonical | TH label | PCS API code | Manifest code | Clearance note |
|---|---|---|---|---|
| `general` | ทั่วไป | `A` | `G` | — |
| `electrical` | เครื่องใช้ไฟฟ้า | `M` | `T` | needs มอก. (TIS) cert |
| `food_drug` | อาหาร/ยา | `O` | `F` | needs อย. (FDA) |
| `brand` | แบรนด์เนม/พิเศษ | `X` | — | special handling |
| `controlled` | สินค้าควบคุม | `Z` | — | restricted import |

**What ภูม builds:** the column + check; the `lib/cargo/` mapping constant + a `toCanonicalCargoType(legacyCode)` helper; both the MOMO sync and the manifest import normalise to the canonical value on write.

---

## V-D3 — Carrier physical container number

**Problem:** `cargo_containers.code` holds the Pacred code (`GZE260407-1`); the carrier's physical container number (`BLOU2025012`, `SLVU4871649` — on the B/L and the D/O) has nowhere to live.

**Proposed column on `public.cargo_containers`:**

| Column | Meaning |
|---|---|
| `carrier_container_no` `text` | The shipping-line / carrier container number from the B/L. Nullable (set when known). |

`code` stays the Pacred-issued `GZE`/`GZS` code. The manifest import already has both (`container_name` = Pacred code, `container_code` = carrier number) — populate both.

---

## Migration note

All of the above is **one additive migration** — `add column if not exists` on `cargo_containers` + `cargo_shipments`, plus `check` constraints. Idempotent.

**ภูม assigns the migration number.** Note `0039` is earmarked for [ADR-0015](../decisions/0015-withholding-tax-model.md) (withholding tax) — so this is likely `0040_cargo_volume_reconciliation.sql`, or the next free number when applied.

---

## Acceptance

- A staff member opening a cargo shipment sees `received` / `queued` / `manifest` CBM (and weight) side by side.
- If the sources disagree beyond the threshold, a warning shows and the invoice action is gated until staff confirm the billed CBM (audited).
- Every shipment carries one canonical `cargo_type`; legacy `A/M/X/O/Z` and `G/T/F` inputs both normalise to it on import.
- Every container can store its carrier container number alongside the Pacred code.

## Cross-references

- Why → [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) §3.2-3.3 + §4 D
- Schedule → [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V `V-D1` / `V-D2` / `V-D3`
- Tables extended → [`supabase/migrations/0033_containers.sql`](../../supabase/migrations/0033_containers.sql) · split-receipt precedent [`0037`](../../supabase/migrations/0037_cargo_shipments_received_qty.sql)
- Staff-confirm audit pattern → [ADR-0014](../decisions/0014-customer-self-service-state-transitions.md)
- Decoded model reference → [`docs/learnings/pacred-domain-knowledge.md`](../learnings/pacred-domain-knowledge.md)
