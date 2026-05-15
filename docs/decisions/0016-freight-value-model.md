# ADR-0016 — Freight value model (commercial value · declared customs value · VAT plan)

**Status:** 🟡 **DRAFT** — เดฟ scaffold 2026-05-16. ก๊อต to review + lock. ภูม implements as part of **V-E1/V-E2** (Phase I2 freight build).
**Date:** 2026-05-16
**Phase:** Part V — Legacy Cargo Forensics backlog (task `V-E2`); Phase I2 freight expansion
**Owner:** เดฟ (scaffold author) · ก๊อต (review + lock) · ภูม (implementation)

> **ADR-number note:** 0011-0013 reserved for ก๊อต Sprint 7+ Track D; 0014 = state transitions; 0015 = withholding tax. This ADR = **0016**.

---

## Context

[`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) §3.5 + §4 **E1-E2/E5** decoded the **freight** (FCL/LCL single-consignee) side of operations. Unlike consolidated cargo, the legacy PHP system **never modelled freight at all** — it runs entirely on loose Excel files today (real samples: `INV_GZE260407-1 - แผน2 VAT.xlsx`, `INV_GZS260406-1-DRAFT.xlsx`, `INV+PL_A2600200036_Draft.xlsx`).

What the real documents show a freight invoice carries:

- A **Commercial Invoice** from the China shipper (e.g. `MAITU INTERNATIONAL TRADE`, `HANGZHOU MILEGAO`, `BEIJING SANO LASER`): line items priced in **USD**, plus a **THB-conversion + VAT block** (× a frozen exchange rate — observed `31.4109`, `32.8526`, `33.162` — then VAT 7%).
- The **declared customs value** used on the Thai import declaration (ใบขนสินค้า) is **decoupled from the real commercial value** — the spreadsheets carry a separate THB figure that drives the duty + VAT assessment.
- Files are literally named "**แผน2 VAT**" (VAT Plan 2): each shipment has **alternate VAT-outcome sheets**, and staff pick one.
- The spreadsheets carry **int32-overflow data corruption** (`-2146826265`-type garbage) — proof the loose-Excel process is fragile and unauditable.

Pacred's freight module needs a **first-class data model** for shipment value so freight invoicing is computed, frozen, and auditable — not retyped into a fragile spreadsheet.

> **Compliance note (load-bearing).** The declared customs value must be a **lawful, defensible figure**. This model exists to make every value **explicit, traceable, and auditable** — to *prevent* the silent conflation and untraceable edits the legacy spreadsheets allow. It is not a tool to enable misdeclaration. Editing the declared value is restricted to super/accounting and always carries a justification + an audit row.

---

## Decision points

1. What value fields does a freight shipment / freight invoice carry?
2. How is the **USD→THB exchange rate** captured — frozen at issuance, or live?
3. How are the **"VAT plans"** modelled — N stored rows, or one committed plan + a calculator?
4. How does this relate to `tax_invoices` (migration 0034 / ADR-0006) and to `hs_codes` (migration 0030)?

---

## Options considered

### Option A — explicit value fields on the freight shipment + invoice ✅ recommended (V1)
Model the real value, the declared value, the rate, the duty/VAT as **separate named fields**. One shipment carries **one committed VAT plan**; "what-if" alternatives live in a calculator UI, not stored rows.
- ➕ Auditable, range-guardable, impossible to silently conflate.
- ➕ Smallest correct V1.
- ➖ Comparing alternative plans is a UI calculation, not a saved history.

### Option B — normalized `freight_value_plans` child table
Every alternative VAT plan stored as a row; one flagged `chosen`.
- ➕ Full what-if history for the accounting/PEAK export.
- ➖ More build; not needed until the freight volume justifies it. **Defer** — Option A's fields migrate cleanly into B later.

### Option C — reuse `tax_invoices` for the freight value
- ❌ **Rejected.** `tax_invoices` (0034) is the *downstream* Thai tax document. The freight value model is *upstream* — it feeds **both** the customer's freight invoice **and** the customs declaration. Different lifecycle, different immutability rules.

---

## Decision

**Adopt Option A** — explicit, separated value fields on the freight shipment + its invoice; one committed VAT plan per shipment.

### Field model (sketch — final table layout part of the V-E1 freight schema migration)

**Per freight invoice line:**
`description · qty · unit_price · currency (default USD) · amount` — the real commercial figures from the shipper's Commercial Invoice.

**Per freight shipment / invoice (shipment-level value block):**

| Field | Meaning |
|---|---|
| `commercial_value_usd` | Σ of line amounts — the **real** value the shipper invoiced. |
| `exchange_rate` · `rate_source` · `rate_date` | USD→THB rate, **frozen at issuance** (never live-recomputed after issue). |
| `commercial_value_thb` | `commercial_value_usd × exchange_rate` (derived, stored frozen). |
| `declared_customs_value_thb` | The CIF value on the ใบขนสินค้า — **explicitly separate**, super/accounting-entered. |
| `declared_value_basis` | Required free-text justification for the declared figure (audit). |
| `hs_code` | FK → `hs_codes` (migration 0030) — drives the duty rate. |
| `duty_rate_pct` · `duty_thb` | Import duty (rate snapshot from `hs_codes`, overridable + logged). |
| `vat_base_thb` | The base VAT 7% is computed on. |
| `vat_thb` | `round(vat_base_thb × 0.07, 2)`. |
| `vat_plan_label` | The chosen plan's name (e.g. "แผน 2") — documentation, not logic. |
| `form_e_applied` (bool) | Whether ASEAN-China FTA preferential duty was claimed (Form E). |

### Rules (load-bearing)

1. **`commercial_value_*` and `declared_customs_value_thb` are NEVER the same field and NEVER silently equal.** If a workflow needs them equal, that is an explicit, logged choice.
2. **The exchange rate is frozen at issuance** (`rate_date` + `rate_source` stored). Re-issuing recomputes; an issued invoice never silently shifts because the rate moved.
3. **Editing `declared_customs_value_thb` is super/accounting-only**, requires `declared_value_basis`, and writes an `admin_audit_log` row (per [ADR-0014](0014-customer-self-service-state-transitions.md)).
4. **Range-guard every numeric field** — the legacy sheets carry int32-overflow garbage (forensics E5). Zod + DB `check` constraints; reject values outside sane bounds.
5. **One committed VAT plan per shipment.** Alternative plans are a calculator UI (Option B deferred). The issued freight invoice is immutable (mirror `tax_invoices` immutability, 0034).
6. **Downstream tax document:** when the customer wants a Thai tax invoice for a freight shipment, it flows through the existing `tax_invoices` (ADR-0006 / migration 0034) — the freight value block supplies that invoice's financial snapshot. ADR-0016 is upstream; ADR-0006 is downstream.

---

## Consequences

**Positive**
- Freight invoicing leaves Excel — every figure computed, frozen, range-guarded, auditable.
- Real vs declared value can never be silently conflated; the int32-corruption class of bug is structurally impossible.
- Clean inputs for the accounting export (V-A8) + the PEAK API (V-F2).
- The declared-value justification + audit trail is a genuine compliance improvement over the legacy spreadsheets.

**Negative**
- Net-new schema + freight invoice UI + a VAT calculator — this is real Phase I2 build, not a small task.
- A USD→THB rate source must be chosen (see open questions).

**Neutral**
- Consolidated cargo billing (weight/CBM × type-rate) is unaffected — that is a different model (`cargo_*` spine).

---

## Open questions for ก๊อต (lock these)

1. **Exchange-rate source** — staff-entered per shipment, a daily BOT/bank reference rate, or an FX API? (`rate_source` enum depends on this.)
2. **VAT plans** — confirm Option A (calculator UI, store only the committed plan) for V1, or is stored what-if history (Option B) needed from day one?
3. **Declared-value authority** — super + accounting only, or accounting alone? Does it need a second approver?
4. **HS-code → duty rate** — read the rate live from `hs_codes` at issuance and snapshot it, or fully manual? (Recommend: snapshot from `hs_codes`, overridable + logged.)
5. Does freight need its own ADR for the **Form E generator** (V-E3) and the **D/O letter** (V-E4), or are those pure templating with no decision to lock?

## Cross-references

- Problem source → [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) §3.5 + §4 E1-E2-E5
- Task / schedule → [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V `V-E1` / `V-E2`
- Downstream tax document → [ADR-0006 — tax-invoice flow](0006-tax-invoice-flow.md) + migration `0034_tax_invoices.sql`
- Duty rates → migration `0030_hs_codes_rates.sql` (`hs_codes` table)
- Edit-audit pattern → [ADR-0014](0014-customer-self-service-state-transitions.md)
- Withholding tax on the freight service fee → [ADR-0015](0015-withholding-tax-model.md)

---

**End of ADR-0016 (DRAFT).** ก๊อต: review, answer the 5 open questions, flip Status → Accepted. ภูม: this is Phase I2 — the 🔴 cargo loop (Part V V-A/V-C/V-D) comes first.
