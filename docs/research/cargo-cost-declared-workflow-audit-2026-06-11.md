# Cargo COST → DECLARED → ใบขน → ใบกำกับ → ACCOUNTING + customer VAT-choice — workflow audit (2026-06-11)

> Owner directive: the cost+declared section must AUTO-FILL from the order data above (then editable); the CS→Pricing→DOCS→Accounting handoff must close; the customer VAT/NON-VAT doc choice must be visible + drive issuance; income/expense must be clear. "ไล่เก็บปิด gab workflow มาดีๆ … ให้หมด."
> Method: 5 parallel code-auditors + synthesis, file:line-verified against live source.

## TL;DR — the one-line break
**The 3-number model (SELLING/COST/DECLARED) is structurally sound** — read from the right authoritative columns, and the customer doc-choice (`tax_doc_pref`, mig 0127) drives the VAT base for SHOP + IMPORT. **But the chain is status-flowing, not data-flowing:** numbers exist at each node; nobody threads them forward. The per-order cost editor renders EMPTY because it inits only from the null mig-0158 columns and nothing seeds the cost basis the order already computed right above it. **GAP 1 (auto-fill) is the first thread — the declared-default, profit view, margin-VAT, and PEAK rollup all become real once cost is actually captured.**

## The 10 gaps (ranked · auto-fill first)
1. **★ GAP 1 — cost/declared AUTO-FILL** (the owner ask · pure threading, no new query/DB write). Editor `components/admin/cargo-cost-line-editor.tsx:96-107` inits only from null columns. Add optional `autoCostUnit/autoCostRate/autoDeclared` props → useState falls back to auto* when stored is null/0 → "ออโต้ — แก้ได้" chip → persist only on Save.
   - SHOP (`shop-cost-section.tsx`): autoCostUnit=`cprice`, autoCostRate=`tb_settings.hratecostdefault`, autoDeclared=`roundUp2(cprice*rate*camount)`.
   - IMPORT (`forwarder-cost-section.tsx`): autoCostRate=hratecostdefault, autoDeclared=`fcosttotalprice*(productqty/Σqty)`, cost_unit blank (no faithful per-unit source — tb_forwarder_item has qty+CBM only).
2. **★ GAP 2 — shop admin detail shows the doc choice.** `service-orders/[hNo]/legacy-view.tsx` renders NO `<TaxDocBadge>` (import HAS it: `forwarders/[fNo]/page.tsx:558-565`). Add `tax_doc_pref`(+`fusercompany`) to the select + render the existing `components/admin/tax-doc-badge.tsx` + `JuristicWhtChip`. No new component.
3. **★ GAP 9 — income/expense/profit panel** (bundle w/ GAP 1). `fcosttotalprice` is a DEAD-READ (`forwarders/[fNo]/page.tsx:258`, never rendered); shop has the `profit` math (`legacy-view.tsx:233`) but no panel. Render SELLING/COST/PROFIT on both detail pages (`forwarderRowProfit()` `reports-profit-types.ts:129`).
4. **GAP 3 — YUAN doc-choice never captured.** `service-payment/add` has zero `CartTaxDocPref` → every yuan order = `'none'` → mig 0140 + `issueYuanTaxInvoice` stranded. Mount the picker + persist `tax_doc_*`.
5. **GAP 4 — cost-save → workspace handoff.** `setShop/ForwarderItemCost` never advances `tb_cargo_taxdoc_job.pricing_status`; the 4-role workspace (`/admin/pricing/taxdoc-workspace`) is manual toggles. Advance pricing_status on save + cross-link order↔job.
6. **GAP 5 — CS HS-first.** HS lives only in the Pricing-gated cost form; CS can't enter it first (the ground-truth flow: CS asks China warehouse → enters HS → then Pricing costs). Add an HS-only field gated to sales/CS; Pricing seeds from it.
7. **GAP 6 — cargo ใบขน PDF (+ invoice/packing).** Capture WORKS (`cargo-declarations.ts:149-210`) but the only ใบขน PDF route is hard-keyed to `freight_shipment_id` → empty for cargo. Add a cargo branch + download button.
8. **GAP 7 — auto-enroll into the taxdoc workspace** (currently 100% manual "เปิดงาน").
9. **GAP 8 — wire `computeMarginVat`** (DEAD function, zero callers · `tax-doc-mode.ts:231`) into a profit surface for the NON-VAT 7%-on-margin Pacred owes (gross profit now captured via GAP 1).
10. **GAP 10 — quick-add forwarder modal omits the doc picker** (silent default).

## ✅ Already WORKS (don't rebuild)
- Customer doc-mode pick @ shop + import order entry (mig 0127); forwarder ใบกำกับ issuance honors doc-choice + correct VAT base (live, mig 0129); import detail shows the doc badge + WHT chip + inline editor; the taxdoc-workspace spine + stage RBAC + 3-number side-by-side; PEAK export rolls up SELLING+COST+DECLARED+GL (code-complete; GL codes = owner data, mig 0177 seed exists). ภูม's `lib/forwarder/import-duty-vat.ts` (mig 0178) adds the อากร/VAT-inclusive rollup.

## 🔒 Owner-policy gated (banner in-UI, don't silently no-op)
flip `tax_invoice.shop_yuan_enabled` (mig 0152) after money-test · accountant fills `peak.gl_accounts` (mig 0177) → flip `glAccounts.pending=false` · sign-off on the ใบขน VAT base (`tax-doc-mode.ts:187-195`).

— full per-lane finding archived in the 2026-06-11 cargo-cost-declared workflow audit run.

---

## ▶️ Build sequence — waves (added 2026-06-12 · GAP 1 shipped)

GAP 1 (★ auto-fill) shipped 2026-06-12 (commit `dafa481f` · `lib/forwarder/cargo-cost-autofill.ts`). The remaining 9 gaps are all **buildable-now mechanism work** (display/capture/handoff — none need the owner-blocked issuance levers, which live downstream in G1: flip `shop_yuan_enabled` + PEAK GL + VAT-base sign-off). Grouped by file-locality so parallel agents never collide:

| Wave | Gaps | Owner-surface (disjoint) | Notes |
|---|---|---|---|
| **2** ★ | GAP 2 (shop doc badge) + GAP 9-shop (profit panel) | `service-orders/[hNo]/legacy-view.tsx` | one agent owns the shop detail. Reuse `<TaxDocBadge>`/`<JuristicWhtChip>` (already on forwarder [fNo]) + `forwarderRowProfit`/shop `profit` math. Add `tax_doc_pref`+`fusercompany` to the select. |
| **2** ★ | GAP 9-forwarder (profit panel) | `forwarders/[fNo]/page.tsx` | render SELLING/COST/PROFIT (`fcosttotalprice` is a DEAD-READ today, L258). Disjoint file → parallel with the shop agent. |
| **3** | GAP 3 (yuan doc-choice) | `service-payment/add` | mount `<CartTaxDocPref>` + persist `tax_doc_*` (mig 0140 + `issueYuanTaxInvoice` are stranded today — every yuan order = 'none'). |
| **3** | GAP 5 (CS HS-first) | cost editor / shop+fwd detail | HS-only field gated to sales/CS so HS can be entered before Pricing costs; Pricing seeds from it. |
| **4** | GAP 4 (cost-save → workspace handoff) | `actions/admin/cargo-cost.ts` + taxdoc-workspace | advance `tb_cargo_taxdoc_job.pricing_status` on cost save + cross-link order↔job. |
| **4** | GAP 7 (auto-enroll into taxdoc workspace) | enrolment path | currently 100% manual "เปิดงาน". |
| **5** | GAP 6 (cargo ใบขน PDF) | the ใบขน PDF route (hard-keyed to `freight_shipment_id`) | add a cargo branch + download button (capture already works `cargo-declarations.ts:149`). |
| **5** | GAP 8 (wire `computeMarginVat`) | a profit surface | DEAD function (0 callers · `tax-doc-mode.ts:231`) — wire the NON-VAT 7%-on-margin figure now that GAP 1/9 capture gross profit. |
| **5** | GAP 10 (quick-add forwarder modal doc picker) | the quick-add modal | omits the doc picker → silent default. small. |

**Cadence:** each wave = parallel build agents (worktree isolation) → integrate serially → `pnpm verify` → adversarial review workflow (money-isolation lens mandatory — these are cost/declared/VAT surfaces) → push dave-pacred + main at each gated wave (a save-point). The ★ wave-2 cluster is highest leverage (the audit's "auto-fill first" — profit/declared become real once cost is captured + visible).

---

## ✅ STATUS 2026-06-12 — 10 of 10 gaps SHIPPED + Build A (declared FX) + Build B (HS library)

All shipped to dave-pacred + main, each `pnpm verify` EXIT 0 + a 2-lens adversarial review = SHIP (money-isolation lens mandatory on every cost/declared/VAT surface):

| Gap | Commit | What shipped |
|---|---|---|
| ★ GAP 1 cost/declared auto-fill | `dafa481f` | `lib/forwarder/cargo-cost-autofill.ts` + editor seeds (stored-wins · "ออโต้" chip · persist-on-Save) |
| GAP 2 shop doc badge | `f420a299` | `<TaxDocBadge>`+`<JuristicWhtChip>` on the shop-order detail header |
| GAP 9 forwarder profit panel | `f420a299` | `<ForwarderProfitPanel>` surfacing the dead-read `fcosttotalprice` (ขาย/ต้นทุน/กำไร) · GAP 9-shop already present |
| GAP 8 marginVat | `f420a299` | wired the dead `computeMarginVat` into the profit panel |
| GAP 3 yuan doc-choice | `a717110c` | `<CartTaxDocPref>` on `/service-payment/add` + `mapTaxDocColumns` → `tb_payment.tax_doc_*` (both slip + wallet) |
| GAP 4 cost-save→handoff | `e647aeaa` | `markCargoPricingStarted` bumps `pricing_status ''→in_progress` on cost-save |
| GAP 7 auto-enroll | `e647aeaa` | same — ensures the `tb_cargo_taxdoc_job` row (no more manual "เปิดงาน") |
| GAP 10 quick-add doc picker | `35c40620` | เอกสารภาษี `<select>` on the admin quick-add forwarder → `tb_forwarder.tax_doc_pref` |
| GAP 6 cargo ใบขนรวม PDF | `b14b5b70` | cargo branch on `/api/customs-declaration/[id]` (resolves from `tb_forwarder`+customer) + download button |
| ✅ GAP 5 CS HS-triage queue | `b67d4447`+`ca692439` | owner chose a **dedicated CS คิวงานรวม** (`/admin/accounting/hs-triage`) — per-line items w/ no HS, CS types HS w/ a live คลัง HS duty hint, `setLineHsCode` writes ONLY `hs_code` (§0e), CS-gated (super/sales/sales_admin/ops) |

**★ GAP 1 RE-SEED CORRECTION (owner 2026-06-12):** cost/unit ¥ now seeds from the **real purchase total** the Pricing team filled job-by-job (`tb_header_order.hcostall` ÷ Σqty · `tb_forwarder.hcostall` for shop-spawn / `fCostTotal÷Σqty` direct) — NOT the selling `cprice` ("ตรงกว่า เชื่อได้กว่า เพราะมีคนมาเฟิม"). เรทหยวนต้นทุน seeds from the **real FX** the job used (`hratecost`), editable.

**Build A — declared value via Customs FX** (`mig 0179`): มูลค่าสำแดง is **USD-anchored** with a monthly Customs-Department FX setting (`business_config customs.fx_rates` · default `{USD:36.5,CNY:5.1,pending:true}`) + a **per-job override** (currency-switchable USD/CNY/… · editable rate + amount) → `declared_value_thb = round2(amount × rate)` recomputed server-side (`resolveDeclaredThb`); defaults from real cost (engineer-down). Cols on `tb_order`+`tb_forwarder_item`: `declared_currency`/`declared_fx_rate`/`declared_amount_ccy`. `lib/admin/customs-fx.ts`.

**Build B — คลัง HS library** (`mig 0180`): `hs_codes` += `form_e_duty_pct`/`other_forms`(jsonb)/`hs_note` → **อากรปกติ + Form-E + ฟอร์มอื่นๆ** per code. New `/admin/accounting/hs-library` CRUD + `lookupHsCode` duty-hint wired into the cost editor AND the GAP 5 triage (auto-lookup as CS/Pricing types the HS).

**⚠️ Verify-state:** ALL gaps behind admin auth (cost editor / detail pages / quick-add / cargo PDF / HS library / HS triage) — gated + unit-tested + tsc/lint-clean + adversarially-reviewed-SHIP (GAP 5 + Build B passed a 2-lens money-isolation/correctness review: CLEAN money-isolation · 3 WARN + 1 NIT fixed in `ca692439`), but NOT authed-click-tested (no test admin login · standing §0c blocker). The cargo PDF render can't be browser-verified until a test login + a real cargo declaration exist.

**🟠 OWNER decision still open on GAP 5 scope:** the HS-triage queue currently lists every per-line item with no `hs_code` (bounded, newest-first). Owner to confirm whether to scope it (import/forwarder-only? active-orders-only? exclude domestic shop?) — flagged in-UI, not guessed.
