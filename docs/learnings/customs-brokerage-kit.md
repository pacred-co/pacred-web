# Customs-brokerage kit — ใบขนสินค้า · Form-E · D/O-LOI · NETBAY (the brokerage moat)

**Date:** 2026-06-09 · **Source:** deep-source mine of the AXELRA customs-docs workflow + the FORM/ doc-kit folder + the P-BEE 3-tab tax-doc workspace spec, reconciled against Pacred's shipped `customs_declarations` (mig 0057) + the `components/pdf/*` generators.

**Why durable:** customs brokerage (เคลียร์ศุลกากร / ออกใบขนสินค้า / Form-E / D/O) is the high-margin moat Pacred is building — no LLM training has the Thai-customs doc mechanics or the carrier-specific D/O-LOI variants. This file captures the **document taxonomy**, the **ใบขน workflow + RLS roles**, the **Form-E / ACFTA model**, the **D/O-LOI carrier kit**, and the **NETBAY filing model** so future agents don't re-mine.

> **Companion files — don't duplicate:** the CARGO consolidated-ใบขน-under-shipper-name + 3-number model is in [`pacred-cargo-tax-invoice-flow.md`](pacred-cargo-tax-invoice-flow.md); the FREIGHT ERP shape + value block is in [`freight-erp-model.md`](freight-erp-model.md). This is the *customs document* layer specifically.

---

## 1. The document taxonomy (what each doc is + who owns it)

| Doc (TH) | What | When | Pacred status |
|---|---|---|---|
| **ใบกำกับภาษี** (Tax invoice) | RD Code-86 tax invoice, SELLING + VAT 7% | issued by Account at close | ✅ shipped (forwarder lane live · shop/yuan dormant) |
| **ใบขนสินค้า** (Customs declaration) | the customs entry filed with Thai Customs (duty + import-VAT base = DECLARED value) | filed by Docs before clearance | ✅ schema + admin CRUD + PDF (mig 0057) — INTERNAL working draft only |
| **Commercial Invoice (CI) + Packing List (PL)** | the export-doc pair lodged with customs | Docs builds from shipment lines | ✅ PDF generators shipped |
| **Form E** (Certificate of Origin · ACFTA) | ASEAN-China FTA 12-box C/O → zero-rates MFN duty | requested when origin qualifies | ✅ PDF generator (templating only · DRAFT — no eligibility engine) |
| **D/O exchange letter** (Delivery Order) | letter consignee→shipping-line agent for telex release of the B/L | Docs at arrival | ✅ PDF generator shipped (the *letter*) |
| **D/O-LOI** (carrier-specific Letter of Indemnity) | the carrier's own split-DO / waiver template | per carrier | ❌ NOT built (FORM/ kit) |

## 2. The ใบขน workflow + the role model (P-BEE 3-tab → 4-role)

The customs declaration runs a sales-keyer → pricing → customs-classifier → accounting-issuer chain. P-BEE described it as 3 tabs; the full model is 4 roles (matching the CARGO 4-role flow CS→Pricing→Docs→Account).

```
entry      CS (freight_import_doc): key HS/desc/qty/declared_value
  ↓
priced     Pricing (freight_export_doc): assign cost_base_thb (PEAK + สำแดง base)
  ↓
classified Docs (accounting): set vat_eligibility (zero_rated|taxable|exempt) + reason
  ↓
approved   Accounting: ready for invoice + ใบขน filing
  ↓ (any step) rejected (reason logged + notify)
```

**Status enum (shipped 0057):** `draft → submitted → accepted → released` (+ `cancelled`). `submitted` reserves `CD-{YYMMDD}-{NNNN}`. DB CHECK constraints enforce: submitted/accepted/released require `declaration_no` + actor + timestamp; one active (non-cancelled) declaration per shipment (partial UNIQUE index).

**RLS roles (shipped 0057 + 0148):** customer reads OWN declarations only when status ≥ submitted (NOT draft) · admin (`super` + `accounting` + `freight_export_doc` + `freight_import_doc`) read+write all · lines inherit parent visibility. Per-line tax math (shipped, `lib/validators/customs-declaration.ts` `computeLineTaxes`): `duty = declared × rate%`, `VAT = (declared + duty) × 7%`.

**Customs offices (shipped enum):** 9 Thai port/border options. **Declaration types:** import / export / transit.

## 3. The DECLARED value — the load-bearing discipline

The same insight as the CARGO 3-number model: the **มูลค่าสำแดง (declared customs value) is an AUDITED, SEPARATELY-EDITABLE field — it NEVER auto-equals the selling price.** It defaults from COST and the Docs role edits it DOWN per the value-engineering / สำแดง plan. The original PCS/ไอแต้ม template's bug was declaring the ex-duty SELLING price to customs because there was no cost field. In Pacred: capture cost (mig 0158 cost cols) → default DECLARED from cost → Docs adjusts. Edit restricted to **super+accounting** (ADR-0016 Q3). **VAT base policy** (`tax-doc-mode.ts` L187–195) is documented per ADR-0016 but **confirm the accounting sign-off is current before issuance**.

## 4. Form E / ACFTA model

- **Form E** under the ASEAN-China FTA (ACFTA) zero-rates the MFN duty when goods qualify by origin criterion. RCEP is the broader successor.
- Pacred captures `fta_applied` (boolean) on declaration lines + `form_e_applied` on the value block, but **there is NO eligibility engine** — no automation computes whether Form-E applies from the HS code / origin criterion. The `freight-form-e.tsx` generator renders the 12-box C/O as a **DRAFT** (boxes 4 & 12 blank) for the customer to lodge with the authority.
- **To build (Phase C):** an HS-code → origin-criterion → ACFTA-preference eligibility engine + the "ท่า Port.txt" HS-code AI-assist (mentioned ready in the master plan but not wired into code).

## 5. The D/O-LOI carrier kit (FORM/ folder · NOT built)

The D/O exchange *letter* (consignee→agent) is shipped. The carrier-specific **D/O-LOI (Letter of Indemnity)** templates are NOT — these are the carrier's own split-DO / waiver forms: **ZIM Split-DO · RCL · COSCO · HEDE · FUJIT · UPS** variants + **45-day waiver · POA · amend · lost-doc** letters + a **port-code master**. These are part of the deferred "customs-letter kit" automation (Phase C / DPX). They're pure templating over shipment + parties data once the per-carrier layouts are transcribed.

## 6. NETBAY — the real customs filing gateway (HARD owner-blocker)

- **NETBAY** (`api.netbay.co.th`) is the real Thai Customs e-declaration gateway. Pacred's `customs_declarations` (V-E11) generates **INTERNAL working drafts only** — real filing is manual or via a future NETBAY integration.
- **Hard blocker:** NETBAY account + broker username/password + the field-spec/payload-schema (no structured JSON/XML export format is documented yet). Until then, customs filing is manual entry; the platform just produces the working ใบขน + writes back `customs_control_no` manually.
- Auth in the legacy PJ-BOOK was username+password broker credentials. The Customs Trader Portal API (official entry submission) is a separate Phase-III deferral.

## 7. The cheapest high-value build right now

The customs-brokerage audit's `nextBuildable`: **wire the already-built `DeclarationDetailClient` into `/admin/accounting/customs-declarations/[id]`** (a ~50 LOC page wrapper — all backend actions exist, tested, in prod; RLS already permits accounting). This completes the CEO-mandated 3-doc trio (ใบกำกับ ✅ + ใบขน → THIS + ไม่รับเอกสาร ✅) for cargo billing. Risk near-zero. (Backlog Wave 3.) The next layer = the cargo-declarations CRUD reusing the customs model keyed on `cargo_cabinet_no`/`cargo_forwarder_id` (Wave 2 · the consolidated ใบขนรวม).

## Cross-links
- Build sequence: [`docs/research/build-backlog-2026-06-09.md`](../research/build-backlog-2026-06-09.md) (Waves 2, 3, 12).
- Shipped schema: `supabase/migrations/0057_customs_declarations.sql` · actions `actions/admin/customs-declarations.ts` · PDF `components/pdf/customs-declaration.tsx`.
- Specs: `docs/port-specs/freight-customs-declaration.md` (V-E11) · `docs/port-specs/freight-document-suite.md` (V-E1/E3/E4).
- Domain evidence: `docs/research/freight-knowledge-2026-06-01/04-customs-docs-accounting.md`.
- ADR-0016 value model: `docs/decisions/0016-freight-value-model.md`.
