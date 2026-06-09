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
| **P1** ✅ **SHIPPED** `7a9217fa` (dave-pacred, 2026-06-09) | **doc-mode toggle + VAT at ฝากนำเข้า order entry** — mounted `CartTaxDocPref` on `service-import-add-fields.tsx` (full-page `/service-import/add`; defaults fetched in `page.tsx` from `tb_users.userCompany`+`tb_corporate`) + added `taxDocPref`/`taxDocTaxId`/`taxDocBillingName`/`taxDocAddress` to `createLegacyForwarder` → persists `tb_forwarder.tax_doc_*` (mig 0127) via the exact cart.ts shape. SELECTION only (no money at create); list-view quick-add modal omits the picker → stays ไม่รับเอกสาร. Reused column + component + engine, **no schema, no new i18n keys.** verify=0 + build=0. ⚠️ NOT authed-click-tested (needs a customer login). | none | customer | ใบขน VAT base un-signed-off (default service-only + comment; rarely fires at create) |
| **P2** ✅ **SHIPPED** `6aa7db85` (backend) + `beb7e188` (UI · dave-pacred, 2026-06-09) | **per-line COST + DECLARED capture** — mig `0158` (tb_order + tb_forwarder_item += `cost_unit_*`/`cost_rate_cny`/`declared_value_thb`/`hs_code` · **APPLIED + verified prod**) + `pricing` AdminRole (union + ADMIN_ROLES + `menuPricing` + ROLE_PRECEDENCE + 3 role→label maps + `role.pricing` th/en) + `actions/admin/cargo-cost.ts` (`setForwarderItemCost`/`setShopOrderItemCost` · super/accounting/pricing · `logAdminAction`) + inline cost editors on the forwarder `[fNo]` + shop `[hNo]` **detail** pages (`cargo-cost-line-editor.tsx` + 2 cost-sections · confirm-before-mutate · read-only summary for other roles). **ISOLATED from the money path** (no selling/quote recompute · no status · no comms). **NO header rollup** — `fcosttotalprice` stays cost-sheet-authoritative; PEAK rollup deferred to P4. verify=0 + build=0. ⚠️ NOT authed-click-tested (needs a pricing/super login). | `0158` ✅ | `pricing` ✅ | none for capture |
| **P3** | **declared value + ใบขน (Docs)** — `actions/admin/cargo-declarations.ts` reusing the `customs_declarations` CRUD keyed on `cargo_cabinet_no`/`cargo_forwarder_id`; per-line declared defaults from cost, editable, **`logAdminAction` every edit**. | `0159`+`0160` | `freight_import_doc` | สำแดง = sensitive audited manual field (never auto = selling) |
| **P4** | **4-role workspace + PEAK** — `menuPricing` + job-detail page (3 numbers + 4 status pills) + advance `*_status` (Account gated on cs/pricing done) + **add shop store read to `/admin/accounting/etax`** + extend `getPeakExportBundle` (cost + selling). | — | per-section (sales/pricing/freight_import_doc/accounting) | PEAK GL account codes from the accountant (CSV only, no write API) |
| **P5** | **NETBAY / Form-E e-submission** (owner-gated, deferred) — `lib/integrations/netbay/*` once creds exist; write back `customs_control_no`. | — | freight_import_doc | NETBAY account + field spec + creds (hard blocker; manual entry until then) |

## 5. Owner-blockers (none block P1)
- **ใบขน VAT base** (`tax-doc-mode.ts:187-195`) — service-only vs +transport+rental; accounting sign-off.
- **PEAK GL account codes** (P4) — accountant supplies; PEAK is CSV-import only.
- **NETBAY** (P5) — no API/creds/field-spec; owner provisions.
- **สำแดง value-engineering** (P3) — declared ≠ commercial is a deliberate, audit-logged owner/accountant decision (ADR-0016); every edit logged.
- **shop/yuan store stays DORMANT** (`shop_yuan_enabled`=false) until the P4 admin read surface + a TEST-order money-loop browser test + accounting sign-off.

## 6. First slice = **P1** ✅ SHIPPED `7a9217fa` (dave-pacred, 2026-06-09)
Closed the real asymmetry (ฝากสั่งซื้อ had the toggle, ฝากนำเข้า defaulted `none`). Mounted `<CartTaxDocPref>` on the full-page add form, fetched the juristic defaults in `page.tsx`, and added the 4 tax-doc fields to `createLegacyForwarder` → persists `tb_forwarder.tax_doc_*` in the exact `cart.ts` shape (`tax_doc_address = "{name} · {address}"`). Zero schema, no new i18n keys, gates green.
**Remaining for full P1 confidence:** authed click-test (juristic customer → /service-import/add → pick ใบกำกับ → fill taxid → create → assert `tb_forwarder.tax_doc_pref='tax_invoice'`) — blocked on a test customer login (owner-deferred). The cart twin of this exact flow is already proven in prod.

**P2 ✅ SHIPPED** (backend `6aa7db85` + UI `beb7e188` · mig 0158 applied + verified prod · per-line COST + DECLARED capture + the `pricing` role · isolated from the money path · no header rollup). **⚠️ NOT authed-click-tested** — needs a pricing/super login: open a forwarder `[fNo]` + a shop `[hNo]` detail → the green "ต้นทุน (Pricing · ใบขน)" section → save a line → assert the `tb_forwarder_item` / `tb_order` cost cols persisted.

**Next slice (next session) = P3** (declared value + ใบขน Docs — `actions/admin/cargo-declarations.ts` reusing `customs_declarations` · mig `0159`+`0160` · `freight_import_doc` role · the declared-value columns from 0158 are already in place to default from cost).

> **Stale records to fix when you touch them:** migration ledger NEXT-FREE = **0159** (0158 applied 2026-06-09) · ADR-0027 (claims no shop/yuan World-B store; `0152` built it). **Don't-rebuild:** the SELLING + VAT + WHT + issuance layer is done — the build is the upstream cost/declared/Pricing layer only.
