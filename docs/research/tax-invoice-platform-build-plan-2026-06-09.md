# CARGO tax-invoice (3-number / 4-role) → platform build plan

**Date:** 2026-06-09 · **Author:** เดฟ (grounded by a 4-agent audit of tax-infra / cargo-flow / integration seams). **Companion:** the model + the delivered Excel form are in [`docs/learnings/pacred-cargo-tax-invoice-flow.md`](../learnings/pacred-cargo-tax-invoice-flow.md). **Next free migration = `0158`** (the ledger says 0157 but `0157_tb_api_china_hs_search_idx.sql` is taken — fix the ledger when you reserve).

## The one-line conclusion

The hard layer is **already built** — there is a working doc-mode toggle, a per-mode VAT engine, two idempotent tax-invoice stores, a WHT-by-class engine, a complete customs-declaration (declared/duty/VAT) model, a freight cost-rate CRUD to clone, PEAK CSV export, and the role-gated sidebar pattern. **What's captured today is exactly ONE price — the SELLING price — across the entire cargo tax path.** That single fact *is* the whole gap. The build = the upstream **COST + DECLARED + Pricing-role** layer, not a rebuild.

## 1. What already exists (the reusable spine)

- **Doc-mode toggle — BUILT.** `lib/tax/tax-doc-mode.ts` (`TaxDocMode = tax_invoice | customs | none`, `computeTaxForMode()` switches the VAT base per mode). Column `tax_doc_pref` on `tb_header_order` + `tb_forwarder` (mig `0127`) + `tb_payment` (`0140`).
- **Customer toggle at order entry — BUILT for ฝากสั่งซื้อ** (`cart-tax-doc-pref.tsx` → `submitCartOrder`, `actions/cart.ts`). NOT wired for ฝากนำเข้า (gap §2.4).
- **Tax-invoice stores — BUILT + idempotent.** `tb_forwarder_tax_invoice`(+`_item`+`_wht_entry`, `0129`, LIVE) and `tb_shop_tax_invoice`(+items+wht, `0152`, shop/yuan, **DORMANT** behind `tax_invoice.shop_yuan_enabled`). Bridges: `lib/admin/{forwarder,shop,yuan}-tax-invoice.ts`.
- **WHT engine — BUILT** (`lib/tax/wht.ts`: transport 1% / service 3% / rental 5% / goods 0% · juristic via `tb_corporate`).
- **DECLARED/duty/VAT model — BUILT but freight-only.** `customs_declarations`(+`_lines`, `0057`): per-line `declared_value_thb`, `duty_rate_pct`, `duty_thb`, `vat_thb`, `fta_applied` (Form-E/RCEP), `hs_code`, serial `CD-{YYMMDD}-{NNNN}`, `customs_control_no` (the real NETBAY no). Keyed to `freight_shipments` — NOT cargo.
- **Cost-capture scaffold to clone** — `actions/admin/freight-rates.ts` + `lib/freight/rate-lookup.ts` (Zod CRUD + `withAdmin` + `logAdminAction` + FX-snapshot). Forwarder header already has `fcosttotalprice`/`fcostrefrate`/`fprofittotal` (`adminUpdateForwarderCost`).
- **PEAK export — BUILT (CSV only)** `actions/admin/peak-export.ts`. **Consolidation grain** — `tb_forwarder.fcabinetnumber` (many customers / one cabinet) + `tb_cnt`. **Role-gated sidebar** — `lib/admin/sidebar-menu.ts` (`menuFreightImportDoc` = the template).

## 2. The core gaps (vs the 3-number / 4-role model)

1. **NO per-line COST field on cargo lines** (`tb_order` has only `cprice` selling; `tb_forwarder_item` has cost *components* but no selling-vs-cost split; cost exists only at header — too coarse for per-line PEAK stock-in). No cost-side yuan-rate column.
2. **NO declared / มูลค่าสำแดง field on cargo tables** (the declared model exists but is bolted to `freight_shipments`, no bridge to `tb_forwarder`/`tb_cnt`).
3. **NO `pricing` role** in `AdminRole` (28 roles, none for cost capture). The load-bearing missing piece. (CS≈`sales`, Docs≈`freight_import_doc`, Account≈`accounting` all exist.)
4. **NO doc-mode toggle at ฝากนำเข้า order entry** (`createLegacyForwarder` omits `tax_doc_pref` → defaults `none`).
5. **NO role-gated CS→Pricing→Docs→Account job state machine** carrying the 3 numbers + section handoff.
6. **`tb_shop_tax_invoice` has no admin read surface** (`/admin/accounting/etax` reads only the forwarder store).
7. **PDF renderer is shaped for dead World-A**, not the `tb_*` snapshot shape.

## 3. Data model (concrete, additive)

**Decision: do NOT extend `tb_forwarder_tax_invoice`** (it's a post-issuance idempotent snapshot — the 3-number model is upstream of issuance). Instead:

- **`0158_cargo_3number_lines.sql`** — per-line cost + declared at their natural grain:
  - `tb_order` += `cost_unit_cny numeric(14,2)`, `cost_rate_cny numeric(8,4)`, `declared_value_thb numeric(14,2)`, `hs_code text`.
  - `tb_forwarder_item` += `cost_unit_thb`, `cost_rate_cny`, `declared_value_thb`, `hs_code`.
- **`0159_cargo_taxdoc_job.sql`** — `tb_cargo_taxdoc_job` (fid/hno · `doc_mode` · `cs_status`/`pricing_status`/`docs_status`/`account_status` · `cabinet_no` · `declaration_id`). Unique per fid + per hno. RLS `is_admin(['super','sales','pricing','accounting','freight_import_doc'])`.
- **`0160_customs_decl_cargo_link.sql`** — `customs_declarations` += `cargo_cabinet_no`, `cargo_forwarder_id` (reuse the freight customs model for the consolidated ใบขนรวม; `freight_shipment_id` becomes one of three optional keys).

## 4. Phased build (each phase a shippable slice — gate `pnpm verify`+`build`, click-through ≤3 clicks)

| Phase | What | Schema | Role | Owner-blocker |
|---|---|---|---|---|
| **P1** ⭐ | **doc-mode toggle + VAT at ฝากนำเข้า order entry** — mount `CartTaxDocPref` on `service-import-add-form.tsx` + add `tax_doc_pref`/taxid/address to `createLegacyForwarder`. Reuses existing column + component + engine. | none | customer | ใบขน VAT base un-signed-off (default service-only + comment; rarely fires at create) |
| **P2** | **COST (Pricing) capture** — clone `freight-rates.ts` → `actions/admin/cargo-cost.ts` (Zod + `withAdmin` + `logAdminAction` + cost-yuan-rate snapshot); cost inputs on the forwarder + shop item-edit panels; roll up into `fcosttotalprice`/`hcostall`. | `0158` | **add `pricing` role** (1-line enum + CHECK) | none for capture |
| **P3** | **declared value + ใบขน (Docs)** — `actions/admin/cargo-declarations.ts` reusing the `customs_declarations` CRUD keyed on `cargo_cabinet_no`/`cargo_forwarder_id`; per-line declared defaults from cost, editable, **`logAdminAction` every edit**. | `0159`+`0160` | `freight_import_doc` | สำแดง = sensitive audited manual field (never auto = selling) |
| **P4** | **4-role workspace + PEAK** — `menuPricing` + job-detail page (3 numbers + 4 status pills) + advance `*_status` (Account gated on cs/pricing done) + **add shop store read to `/admin/accounting/etax`** + extend `getPeakExportBundle` (cost + selling). | — | per-section (sales/pricing/freight_import_doc/accounting) | PEAK GL account codes from the accountant (CSV only, no write API) |
| **P5** | **NETBAY / Form-E e-submission** (owner-gated, deferred) — `lib/integrations/netbay/*` once creds exist; write back `customs_control_no`. | — | freight_import_doc | NETBAY account + field spec + creds (hard blocker; manual entry until then) |

## 5. Owner-blockers (none block P1)
- **ใบขน VAT base** (`tax-doc-mode.ts:187-195`) — service-only vs +transport+rental; accounting sign-off.
- **PEAK GL account codes** (P4) — accountant supplies; PEAK is CSV-import only.
- **NETBAY** (P5) — no API/creds/field-spec; owner provisions.
- **สำแดง value-engineering** (P3) — declared ≠ commercial is a deliberate, audit-logged owner/accountant decision (ADR-0016); every edit logged.
- **shop/yuan store stays DORMANT** (`shop_yuan_enabled`=false) until the P4 admin read surface + a TEST-order money-loop browser test + accounting sign-off.

## 6. First slice (next session) = **P1**
Zero schema risk (column/component/engine all exist), closes a real asymmetry (ฝากสั่งซื้อ has the toggle, ฝากนำเข้า defaults `none`), is the natural CS-section entry point that P2–P4 key off, and no owner-blocker gates it. Read `actions/forwarder-legacy.ts:194-279` + `service-import-add-form.tsx` + `cart-tax-doc-pref.tsx`, mount the toggle, add the fields to the insert, browser-verify a juristic create persists ใบกำกับ, gate green, push at the save-point.

> **Stale records to fix when you touch them:** migration ledger NEXT-FREE (says 0157, real 0158) · ADR-0027 (claims no shop/yuan World-B store; `0152` built it). **Don't-rebuild:** the SELLING + VAT + WHT + issuance layer is done — the build is the upstream cost/declared/Pricing layer only.
