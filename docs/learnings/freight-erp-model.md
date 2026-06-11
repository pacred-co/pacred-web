# Freight ERP model — PJ-BOOK / AXELRA → Pacred (the FREIGHT product line)

**Date:** 2026-06-09 · **Source:** deep-source mine of AXELRA's legacy freight ERP — PJ-BOOK (Prisma 10-model schema on Google Sheets + Apps Script + Postgres), AX BOOKING (public quote wizard), AX JOB (ops cockpit), the Cost & Profit & Com / AXELRA & NNB BOOKING workbooks — reconciled against Pacred's already-shipped `freight_*` tables.

**Why durable:** FREIGHT is Pacred's second product line (CARGO = the PCS port; FREIGHT = the AXELRA side, the B2B customs-clearance + international-transport business). No LLM training has this. This file captures the **schema shape**, the **PRICING→SALES→DOC→ACC workflow**, the **rate/commission/P&L model**, and the **public RFQ funnel** so future agents don't re-mine the binary `.xlsx` files (which are unreadable).

> **Companion files — don't duplicate:** the CARGO 3-number tax-invoice model is in [`pacred-cargo-tax-invoice-flow.md`](pacred-cargo-tax-invoice-flow.md); the customs doc-kit (Form-E / D-O / ใบขน letters) is in [`customs-brokerage-kit.md`](customs-brokerage-kit.md); the cargo/MOMO/container ops decode is in [`pacred-domain-knowledge.md`](pacred-domain-knowledge.md). The raw evidence is in [`docs/research/freight-knowledge-2026-06-01/`](../research/freight-knowledge-2026-06-01/_MASTER-FREIGHT-PLAN.md). This is the *synthesis* of the freight ERP shape.

---

## 1. CARGO vs FREIGHT — the same business, two doc regimes

- **Pacred = ONE legal entity** (`0105564077716` = AXELRA = Pacred). Two product lines, two brands historically (AXELRA + NNB).
- **CARGO** (ฝากสั่ง/ฝากนำเข้า/ฝากโอน) = a Freight-LCL job where Pacred issues a **consolidated ใบขนรวม under the shipping-company name** → the customer sees only a ใบกำกับภาษี. This is the PCS-ported side. (Detail: `pacred-cargo-tax-invoice-flow.md`.)
- **FREIGHT** (the AXELRA side) = a B2B job where the customer **wants the customs declaration in their OWN name** — full INV / PL / CI / Form-E set, per-shipment ใบขน. This is the AXELRA ERP that ran on Google Sheets and is being ported into Pacred's `freight_*` Supabase tables.
- The switch is the **doc-mode at order entry**: เอาเอกสาร (+VAT 7%) · ไม่เอาเอกสาร (NNB / เหมาภาษี · no VAT, flat duty) · ใบขนในชื่อตัวเอง → becomes a FREIGHT job.

## 2. The PJ-BOOK 10-model schema → Pacred `freight_*` mapping

PJ-BOOK's Prisma models map to Pacred Supabase tables. **Most of the core is already shipped** — the gap is the doc/plan/messenger/acc-statement tracking layer + the ops-cockpit aggregation.

| PJ-BOOK model | Pacred table | Status (2026-06-09) |
|---|---|---|
| Customer | `tb_users` / `profiles` (reuse existing) | ✅ |
| Shipment (job spine, `A{YY}{NNNNN}`) | `freight_shipments` + `freight_parties` (mig 0050) | ✅ shipped |
| (quotation) | `freight_quotes` + `freight_quote_items` (mig 0048 · `FQYYMMDD-NNNN`) | ✅ shipped |
| (commercial invoice) | `freight_invoices` + `freight_invoice_lines` (mig 0051 · `FI{YYMMDD}-{NNNN}`) | ✅ shipped |
| AccStatement (4.STATEMENT) | `freight_acc_statements` (append-only AR/AP ledger w/ running balance) | ❌ NOT built |
| AccShipment (4.1ACC) | `freight_acc_shipments` (per-shipment cost/revenue/profit rollup, mutable, `closed_date`) | ❌ NOT built |
| DocData (3.DOC DATA) | `freight_doc_data` (doc issuance log: carrier/BL/vessel/ETD/ETA/Form-E status) | ❌ NOT built |
| DocPlan (3.1DOC PLAN) | `freight_doc_plan` (per-container clearance status: D/O–B/L date, deliv date) | ❌ NOT built |
| Messenger | `freight_messengers` (last-mile task assignment + delivery confirm + commission) | ❌ NOT built |
| PricingRequest / PricingStatus | `freight_pricing_requests` (inbound inquiry → quote) — or compute from quotes | ❌ NOT built (and `freight_quote` 0134 public RFQ partly covers it) |

**Already shipped beyond PJ-BOOK:** `freight_invoice_payments` (0052 · payment ledger + WHT + RD Code 86) · `freight_qa_inspections` (0045 · pre-billing QA gate) · `customs_declarations`/`_lines` (0057 · internal ใบขน) · `tb_freight_rate` (0145 · China-cost lookup + FX snapshot) · `accounting_periods` (0056 · monthly close).

**Key schema traits to preserve:**
- The **ADR-0016 value block** lives on shipments (editable: `commercial_value_usd`, `exchange_rate`, `declared_customs_value_thb`, `hs_code`, `duty_rate_pct`, `duty_thb`, `vat_base_thb`, `vat_thb`, `form_e_applied`) and is **FROZEN as a snapshot at invoice issuance** (copied onto `freight_invoices`). Never re-read live values onto an issued invoice.
- `declared_customs_value_thb` edit is **super+accounting only** (ADR-0016 Q3) — same audited-manual discipline as the CARGO DECLARED field.
- One invoice per shipment (V1 · UNIQUE) · at-most-one shipment per quote (UNIQUE `source_quote_id`).

## 3. The PRICING → SALES → DOC → ACC state machine (AX JOB cockpit)

The whole freight ERP is a 4-stage Kanban. Each stage = one role + one section of the job card.

```
PRICING  freight_pricing_request(accepted) → freight_quote(draft)
         → pending_approval → approved(super-only · financials freeze)
         → sent → accepted | rejected | expired
SALES    quote.accepted → adminConvertQuoteToShipment()
         → freight_shipment(draft · job_no reserved · parties snapshot)
         → confirmed (logistics lock · value still editable by super+accounting)
         → in_progress
DOC      shipment{confirmed|in_progress} → adminCreateFreightInvoice(draft)
         → issue CI/PL/Form-E (invoice_no reserved · value block FROZEN)
         → cleared (customs done · doc_plan updated · D/O–B/L logged)
         → delivery_date recorded
ACC      invoice.issued → freight_invoice_payments (WHT, collections)
         → freight_acc_shipments (cost/revenue/profit rollup)
         → freight_acc_statements line (AR/AP)
         → delivered → closed_date (financial close)
```

**Commission accrues on shipment delivered** (or invoice issued) → idempotent on `(source_kind='freight_quote', source_ref=job_no, earner)`.

**Quote status (existing):** `draft → pending_approval → approved → sent → accepted|rejected|expired`.
**Shipment status (existing):** `draft → confirmed → in_progress → cleared → delivered | cancelled`.
**Withdrawal status:** `pending → approved → paid | rejected`.

## 4. The rate / margin / commission / P&L model

**Three FX rates, never one:** selling เรทหยวน · cost เรทหยวน (actual China-pay) · customs monthly USD rate (customs.go.th ≈ 31.5). The cost side is **monthly + FX-dependent + per-port×carrier USD matrix** → it **cannot be honestly hardcoded** (goes stale → "มั่ว"). Hence `tb_freight_rate` (0145) stores `cost_usd` per unit (container/CBM/kg) × `fx_thb_per_usd` snapshot (default 35, monthly manual refresh via `business_config 'freight.fx_rate_thb_per_usd'` — no FX API). Lookup: pick most-specific (pol/pod/carrier with `''` wildcard fallback) → `cost_thb = cost_usd × fx`.

**Markup tiers:** freight + transport **30 / 25 / 20 / 15 / 10 %** by customer size (big customer → lower tier). PROFIT = SELL − COST per line. Pass-throughs (VAT / duty / RENT / overtime) carry **NO margin** — `วางบิลตามใบเสร็จ`.

**CEO margin cap:** ≤ **15,000 ฿ / container** profit. Currently **advisory-only** (an ephemeral UI banner) — not persisted, not blocking. Build = flag `margin_exceeds_cap` (profit > 15k × containers) at quote-approve + shipment-convert; keep advisory unless the owner says hard-gate.

**Commission split (V-E8 · the AX JOB model):** **freight 1% + customs 5% + doc 5% − 3% WHT** by revenue-bucket (`commission_scope` per line item) + a flat **20฿/shipment DOC** for EK/AIR + **25฿/location messenger**. Withdrawal applies **WHT 15% on amounts > 5,000฿** (Revenue Code §50(1)). **These rate constants must be owner-confirmed in writing** — the source `.xlsx` is binary-unreadable; verify vs PCS history before production.

**Rate-engine reality:** `lib/freight/rate-engine.ts` `composeFreightQuote(spec)` is tested (23–26 tests) against REAL AXELRA sheet totals (CIF AIR 4W=10211/6W=13301 · CIF SEA LCL 4W=13511/6W=14801). **LCL + truck cases are grounded; FCL + AIR sell-cards are "representative" (not fully transcribed from the xlsx)** — flag for the pricing team. The engine returns a `chinaCostPending` flag when the China cost is unmodelled → shows "กำไรขั้นต้น (ยังไม่รวมต้นทุนเฟรทจีน)" instead of presenting gross-as-net.

## 5. The public RFQ funnel — `freight_quote` SINGULAR ≠ `freight_quotes` PLURAL

**The single most dangerous gotcha in the freight stack.** Two tables, near-identical names, different purposes:
- **`freight_quote` (SINGULAR · mig 0134)** = the **public RFQ lead** from the AX BOOKING 5-step wizard (`/freight-quote`). Anon-insertable. The wizard captures service/transport/incoterm/cargo-specs/add-ons/contact → `submitFreightQuote()` mints `AX-YYYY-NNNNN` → inserts the lead → fires a `notifyStaffGroup` LINE ping.
- **`freight_quotes` (PLURAL · mig 0048)** = the **admin-issued B2B quotation** with line items + approval workflow + conversion to shipment.

**The trap:** the public wizard writes SINGULAR; the admin `/admin/freight/quotes` reads PLURAL. So inbound freight leads land in the DB + ping LINE but **no admin surface lists/triages/converts the SINGULAR table** → a dead revenue loop (a §0e reachable-dead-end). The bridge is a `convertLeadToQuote(ref)` action that seeds a PLURAL draft from a SINGULAR lead + auto-prices it. **Verify the actual `/admin/freight/leads` state before building** — the audit is contradictory on whether triage is already wired (mig 0151 may already add `freight_quote.status + assigned_admin_id`).

**AX BOOKING wizard internals (for the public estimate):** 5 steps (service → transport+incoterm+POD+carrier → cargo specs → add-ons+doc-checklist+YY section → price+contact). Air volumetric = `max(actualWeight, cbm × 167) × ~120฿/kg`. Engine prices `service='import'` only — export/customs/truck show "ติดต่อทีมเพื่อราคาแม่นยำ". Public output is **customer-safe** (SELL lines + VAT-inclusive total only — NEVER cost/margin/profit). Incoterm drives the doc-checklist + the YY section (show "ลงทะเบียน YY จีน" + "ยื่นใบขนไทย" if EXW|FOB).

## 6. What to BUILD vs what's DONE (the reconciliation, 2026-06-09)

- **DONE (do NOT rebuild):** quotes/shipments/invoices/payments/QA/declarations/rates/leads-list schema + admin CRUD pages + rate-engine + PDF generators (CI/PL/Form-E/D-O/receipt) + RLS for Doc roles.
- **MISSING (the genuine gap):** commission ledger (4 tables · ZERO migrations) · ops cockpit `freight_job_operations`+`freight_stage_checklists` (Kanban) · doc_data/doc_plan/messenger/acc_statement/acc_shipment tracking tables · role dashboards (V-E12 · 10 role-specific) · freight P&L persistence (margin-cap flag · cost snapshot on shipment) · export reverse-flow (current schema is import-only) · `adminConvertQuoteToShipment` may still be a stub (verify the INSERT).
- **Owner-blocked:** NETBAY e-filing · commission-rate sign-off · ≤15k cap policy · FX monthly refresh (manual) · legacy freight-data import.

### ✅ CORRECTION (2026-06-09 NIGHT → 2026-06-10) — most of §6's "MISSING" list shipped same-day
The §6 MISSING list above was the 2026-06-09 *pre-build* snapshot. The deep-source build (W4/W5/W6) closed most of it within the same day — keeping §6 for history, the current truth is:
- **Commission ledger** — ✅ SHIPPED. `freight_commission_*` ×4, migration `0167_freight_commission_ledger.sql`, **DORMANT** behind `business_config commission.freight_enabled` (0/4 tiers owner-confirmed · no auto-pay). (W6.)
- **Ops cockpit Kanban** — ✅ SHIPPED. `freight_job_operations` + `freight_stage_checklists`, migrations `0163`/`0164`, `/admin/freight/operations` + `freight-ops-cockpit.ts` (money-isolation reviewed CLEAN). (W4.)
- **Freight P&L persistence** — ✅ SHIPPED. Persisted cost/margin/commission + `/admin/freight/shipments/[id]/p-and-l` + FX-refresh control, migration `0165_freight_pnl_margin.sql`; ≤15k cap = ADVISORY only. (W5.)
- **`adminConvertQuoteToShipment`** — ✅ **confirmed REAL** (not a stub — it does the INSERT). The §6 "may still be a stub" caveat was resolved.
- **RFQ leads triage bridge** — ✅ SHIPPED. `/admin/freight/leads` triage, migration `0151_freight_quote_triage.sql` (status + assigned_admin_id on `freight_quote`).
- **Still genuinely open:** export reverse-flow (schema still import-only) · role dashboards (V-E12) · the doc_data/doc_plan/messenger/acc tracking tables (partly subsumed by the cockpit) · interpreter (ล่าม) commission lane (V-H1).
- **Cross-ref:** ADR-0016 freight value-model freeze (declared ≠ selling · audited manual field) + the **2026-06-10 tax-invoice dead-twin closure** (the World-A `tax_invoices` table was retired; live stores = `tb_forwarder_tax_invoice` + `tb_shop_tax_invoice`; mig `0172` freezes them on period close) — see [`docs/learnings/pacred-cargo-tax-invoice-flow.md`](pacred-cargo-tax-invoice-flow.md) + the CLAUDE.md 2026-06-10 save-point.

## Cross-links
- Build sequence: [`docs/research/build-backlog-2026-06-09.md`](../research/build-backlog-2026-06-09.md) (Waves 1, 4, 5, 6).
- ADR-0016 freight value model: [`docs/decisions/0016-freight-value-model.md`](../decisions/0016-freight-value-model.md).
- Raw evidence: [`docs/research/freight-knowledge-2026-06-01/_MASTER-FREIGHT-PLAN.md`](../research/freight-knowledge-2026-06-01/_MASTER-FREIGHT-PLAN.md) + `02-pricing-booking-model.md`.
- Rate-engine handoff: [`docs/research/freight-rate-engine-2026-06-04.md`](../research/freight-rate-engine-2026-06-04.md).
