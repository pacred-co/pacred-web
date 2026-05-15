# Port-spec — Freight document suite (V-E1 · V-E3 · V-E4)

> **Status:** 🟡 spec by เดฟ — backend prep for ภูม (Phase I2 freight build). ภูม implements + finalises; the value math is owned by ADR-0016, not here.
> **Date:** 2026-05-16 · **Owner:** ภูม (impl) · **Source:** PORT_PLAN Part V `V-E1/E3/E4`
>
> **Read with:**
> [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) §3.5 (decoded document set) ·
> [`docs/decisions/0016-freight-value-model.md`](../decisions/0016-freight-value-model.md) (the value/VAT math — DRAFT) ·
> [`docs/decisions/0006-tax-invoice-flow.md`](../decisions/0006-tax-invoice-flow.md) + migration `0034` (downstream Thai tax invoice) ·
> [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V.

---

## Context

**Freight** (FCL/LCL, single-consignee import) is the half of the business the legacy PHP system **never modelled** — it runs entirely on loose Excel today. The forensics decoded the real document set from 6 live files (`INV_GZE260328-1`, `INV_GZE260407-1`, `INV_GZS260406-1`, `INV+PL_A2600200036`, `DRAFT_FE - A2600200036`, `จดหมายเเลกDO406`):

| Document | What it is | V-E task |
|---|---|---|
| Commercial Invoice + Packing List | China shipper → Thai consignee; goods, value, weight | **V-E1** |
| Form E | ASEAN-China FTA Certificate of Origin (12-box) — preferential duty | **V-E3** |
| D/O exchange letter (จดหมายแลก D/O) | Consignee → shipping-line agent; releases the container | **V-E4** |

This spec proposes the **data model** + the **generation approach** for all three. The value-engineering math (real vs declared value, exchange rate, VAT plan) is **out of scope here** — it lives in [ADR-0016](../decisions/0016-freight-value-model.md).

---

## Data model

Freight is its own spine — it does **not** reuse the consolidated-cargo `cargo_*` tables (different grain: one job = one consignee, full commercial documents).

### `freight_shipments` — the job

| Field | Notes |
|---|---|
| `job_no` | `A{YY}{seq}` (e.g. `A2600200036`) — the Pacred freight booking number. |
| `transport_mode` | `truck` / `sea` (GZE / GZS). |
| `container_code` | The `GZE`/`GZS` code. **For freight, the commercial-invoice number = this code.** |
| `carrier_container_no` | Physical container no on the B/L (`SLVU4871649`). |
| `bl_no` · `vessel_voyage` | B/L number · vessel + voyage (`M. MARINER 2614S`). |
| `port_loading` · `port_discharge` · `place_delivery` | `NANSHA` · `LAEM CHABANG` · … |
| `incoterm` | `CIF` (observed) — enum. |
| `payment_term` | `T/T` (observed). |
| `origin_country` | `CHINA`. |
| `status` | freight lifecycle state machine (booking → docs → in-transit → cleared → delivered). |
| `profile_id` | the Pacred customer (consignee). |

### `freight_parties` — shipper + consignee snapshots

Snapshot at document issuance (do **not** live-join — mirror the `tax_invoices` buyer-snapshot rule, migration 0034). Two roles per shipment:
- **shipper** — the China company (`MAITU INTERNATIONAL TRADE (SHENZHEN)`, `HANGZHOU MILEGAO TRADING`, `BEIJING SANO LASER`): `name`, `address`.
- **consignee** — the Thai importer (`THE N N B TRADING CO.,LTD.`, `INNO AESTHETICS LASER`): `name`, `address`, `tax_id`, `branch`.

### `freight_invoice_lines` — the goods

`position · marks · description · qty · unit (PCS/LO/MTK/KGM) · unit_price · currency (USD) · amount · cartons · gross_weight_kg · hs_code` (FK → `hs_codes`, migration 0030).

### Value block → ADR-0016

`commercial_value_usd`, `exchange_rate`, `declared_customs_value_thb`, `duty`, `vat`, `vat_plan` — **see [ADR-0016](../decisions/0016-freight-value-model.md)**. Range-guard every numeric field (forensics E5 — legacy sheets carry int32-overflow garbage).

---

## V-E1 — Commercial Invoice + Packing List generator

Two views of the same `freight_shipments` + `freight_invoice_lines` data:

- **Packing List** — Item · Mark & No. · Cartons · Description · Total Quantity · Unit · Gross Weight; totals row (Σ cartons / Σ qty / Σ kg).
- **Commercial Invoice** — header (shipper / consignee / invoice no = container code / date / mode / `TO:` / term / incoterm / origin) + lines (Item · Marks · Description · Qty · Unit · U/Price USD · Amount USD) + the ADR-0016 THB/VAT block + totals.

**Generation:** `@react-pdf/renderer` (the project's mPDF replacement — see `legacy-php-sweep` skill), components in `components/pdf/`. Pattern already proven by `components/pdf/forwarder-receipt.tsx`.
**Immutability:** once issued, the invoice header is frozen (mirror `tax_invoices`, 0034).

## V-E3 — Form E generator (ASEAN-China FTA Certificate of Origin)

The standard **12-box** government form (decoded from `DRAFT_FE`):
1 exporter · 2 consignee · 3 means of transport + route · 4 official use · 5 item no. · 6 marks & numbers · 7 packages + description · 8 **origin criterion** · 9 gross weight/quantity · 10 invoice number + date · 11 exporter declaration · 12 certification.

Most boxes derive from `freight_shipments` + `freight_invoice_lines`. Form-E-specific fields to add: `origin_criterion` (per item), `fta_reference_no`.

> **⚠️ Open question for ก๊อต:** Form E is an **official issued document** — is it (a) generated by Pacred as a draft for the customer to lodge with the issuing authority, or (b) Pacred only *prepares the data* and the authority issues? This decides whether V-E3 renders a full PDF or just an export. Flag before building.

## V-E4 — D/O exchange letter generator

A letter, consignee → shipping-line agent (`CULINES`), requesting telex-release / waybill so the container can be collected. Decoded fields (from `จดหมายเเลกDO406`): consignee name + address + email · `M.V./VOY` · Port of Loading · Port of Discharge · Place of Delivery · `B/L no` · `Container nos` · Cargo (cartons) · Weight · the fixed telex-release wording paragraph · signer name + position (`กรรมการบริษัท`).

All fields already exist on `freight_shipments` + `freight_parties` — V-E4 is **pure templating** over that data (no new schema, no decision to lock). `@react-pdf/renderer`.

---

## Migration note

`freight_shipments` + `freight_parties` + `freight_invoice_lines` = one new migration; **ภูม assigns the number** (note `0039` is earmarked for ADR-0015 WHT; the V-D spec wants the slot after). This is **net-new tables** (`create table if not exists`), zero risk to existing data.

## What ภูม builds (Phase I2 — after the 🔴 cargo loop V-A/V-C/V-D)

1. The 3 tables + RLS (customer reads own; super/ops/accounting write — mirror `tax_invoices` policies).
2. Zod validators in `lib/validators/`.
3. Server actions: create/update a freight shipment + lines.
4. The 3 PDF generators in `components/pdf/` (Invoice+PL · Form E · D/O letter).
5. Admin UI: freight shipment list + detail + document buttons.
6. Customer view: freight shipment status + document downloads.

## Acceptance

- A freight shipment can be entered once and produce a consistent Commercial Invoice, Packing List, Form E draft, and D/O letter — no Excel.
- Shipper/consignee details are snapshotted at issuance; issued invoices are immutable.
- Every numeric field is range-guarded; the int32-overflow class of corruption is structurally impossible.

## Cross-references

- Decoded document set → [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) §3.5
- Value / VAT math → [`docs/decisions/0016-freight-value-model.md`](../decisions/0016-freight-value-model.md) (DRAFT — ก๊อต to lock)
- Downstream Thai tax invoice → [`docs/decisions/0006-tax-invoice-flow.md`](../decisions/0006-tax-invoice-flow.md) + migration `0034`
- Duty rates → migration `0030_hs_codes_rates.sql`
- Schedule → [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V `V-E1` / `V-E3` / `V-E4`
- PDF pattern → `components/pdf/forwarder-receipt.tsx` · [`legacy-php-sweep` skill](../../.claude/skills/legacy-php-sweep/SKILL.md)
