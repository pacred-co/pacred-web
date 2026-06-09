# 🗂 Pacred build backlog — 2026-06-09 (synthesis: MINE specs × current-code AUDIT)

> **What this is.** The definitive, prioritized, BUILDABLE backlog reconciling the deep-source MINE specs (PJ-BOOK freight ERP · AX BOOKING wizard · AX JOB cockpit · freight pricing/commission/P&L · CargoThai provider · P-BEE 3-tab tax workspace · MOMO warehouse worker-app · call-CDR sales-rank) against a current-code audit of what Pacred has actually shipped. Sequenced into **shippable waves** by **value × safety × buildable-now**.
>
> **Read first:** [`docs/research/tax-invoice-platform-build-plan-2026-06-09.md`](tax-invoice-platform-build-plan-2026-06-09.md) (the canonical tax-invoice 5-phase plan) · [`docs/learnings/pacred-cargo-tax-invoice-flow.md`](../learnings/pacred-cargo-tax-invoice-flow.md) (the 3-number model) · NEW [`docs/learnings/freight-erp-model.md`](../learnings/freight-erp-model.md) + [`docs/learnings/customs-brokerage-kit.md`](../learnings/customs-brokerage-kit.md) (domain knowledge mined this session).
>
> **State as of this doc:** tax-invoice **P1 (doc-mode toggle @ฝากนำเข้า) + P2 (per-line COST/DECLARED capture + `pricing` role)** are **SHIPPED** (mig 0158 applied prod). Migrations **0158/0159/0160 applied + verified prod**. **NEXT FREE migration = 0161.** Build on `dave-pacred`.

---

## 0. Headline findings from the reconciliation

1. **The freight stack is ~80% scaffolded already** — `freight_quotes`/`freight_quote_items` (0048), `freight_shipments`/`freight_parties` (0050), `freight_invoices`/`freight_invoice_lines` (0051), `freight_invoice_payments` (0052), `freight_qa_inspections` (0045), `customs_declarations`/`_lines` (0057), `tb_freight_rate` (0145), `accounting_periods` (0056). Full admin CRUD pages for quotes/shipments/declarations/rates/leads. The rate-engine (`composeFreightQuote`) is tested against real AXELRA sheet totals (23–26 tests). **The MINE "freight ERP schema expansion" (XL) is mostly DONE** — what is genuinely missing is narrow: **commission ledger**, **ops cockpit / Kanban**, **doc/plan/messenger/acc-statement tracking tables**, **role dashboards**, **export-flow**.

2. **The single highest-value orphan = freight RFQ leads triage.** The public `/freight-quote` wizard writes `freight_quote` (SINGULAR · 0134); admin `/admin/freight/quotes` reads `freight_quotes` (PLURAL · 0048) — a different table. Inbound freight leads land in DB + fire a LINE ping but **no admin surface lists/triages/converts them** → dead revenue loop. (Two of the audit streams independently flagged this; one says it's already partially built — **verify the actual state before building**, see Wave 1.)

3. **The tax-invoice platform's remaining gap is the DOCS + 4-role layer.** P1+P2 shipped (doc-mode + cost/declared capture). **P3 = ใบขน Docs** (cargo declarations reusing the `customs_declarations` model + a `tb_cargo_taxdoc_job` state machine) is the next safe, isolated, data-capture-only slice. **P4 = 4-role workspace + PEAK rollup + shop-store read** is gated on accounting sign-off + test login. **P5 = NETBAY** is owner-blocked.

4. **Commission infrastructure is DESIGNED but ZERO migrations exist.** `commission_tiers` / `commission_accruals` / `commission_withdrawals` / `commission_withdrawal_items` — all spec'd (V-E8/H1/H2), none built. This is revenue-side (staff payout automation) and high-ROI, but money-sensitive (WHT 3%/15% per Revenue Code).

5. **The MOMO/CargoThai warehouse worker-app + provider/multi-tenant layers are NOT built** (Theme 7 Phase 1/3/4). They are L–XL and gated on RBAC overhaul + China-team authority sign-off. The CONSUMER side (we pull from MOMO/CargoThai/CTT) is shipped; the PROVIDER side (we expose APIs / partners log in) is not.

6. **Money / tax / policy-sensitive items are flagged 💰 throughout.** Never ship these without the named sign-off. The recurring failure mode (PCS, ไอแต้ม) was conflating SELLING / COST / DECLARED — see the 3-number model.

**Legend:** 🟢 buildable-now (no owner blocker) · 🟡 partly blocked (some sub-items need a decision/cred) · 🔴 owner-blocked (cannot start safely) · 💰 money/tax/policy-sensitive (needs the named sign-off) · ⏱ effort S/M/L/XL.

---

## WAVE 1 — Freight RFQ leads triage (close the dead revenue loop) · 🟢 ⏱ S–M

**Why first:** highest value × highest safety × buildable-now. Admin-only surface, no money path, no customer login needed, additive schema. Converts inbound freight RFQs (already arriving on prod) into sales action. ROI is immediate revenue capture.

**⚠️ FIRST STEP — verify the actual current state.** The audit is contradictory: one stream says `/admin/freight/leads` "EXISTS (basic version)" + lists `freight_quote`; another says it's a 🔴 CRITICAL orphan. Before building, `grep`/`Read`:
- `app/[locale]/(admin)/admin/freight/leads/page.tsx` — does it exist? does it read `freight_quote` (singular)?
- `actions/admin/freight-leads.ts` — what does it actually do (the audit lists `list/triage/convert-to-quote` actions)?
- `supabase/migrations/0151_freight_quote_triage.sql` — already adds `freight_quote.assigned_admin_id` + status index?

If the table already has `status` + `assigned_admin_id` and the page lists them, this wave shrinks to **wiring the convert-to-quote action + the staff-notification deep-link** (and possibly it's fully done — in which case dismiss this wave and move to Wave 2).

**Items (if NOT already built):**
- `freight_quote` (singular) schema check / extend: `status` enum(`new|contacted|quoted|won|lost|spam`) + `assigned_admin_id` (FK admins) — likely already in 0151; if not, **mig 0161**.
- `app/[locale]/(admin)/admin/freight/leads/page.tsx` — list + status-filter chips + "assign to me" + CSV export (via `admin_export_log`).
- `app/[locale]/(admin)/admin/freight/leads/[id]/page.tsx` (or `[ref]`) — detail + triage panel (status dropdown · assign picker · convert-to-quote button).
- `setFreightLeadStatus(ref, status, notes)` action — update + audit log.
- `convertLeadToQuote(ref)` action — seed a `freight_quotes` (plural) draft, copy RFQ fields, run `adminComposeQuoteFromRateCard` to auto-price. **This is the bridge** singular→plural.
- Sidebar: "Freight Leads" entry in `lib/admin/sidebar-menu.ts`.
- Fix `notifyStaffGroup` deep-link → `/admin/freight/leads/${ref}` (not the quotes list).

**Buildable now:** ✅ yes. **Owner-blockers:** none. **Gate:** typecheck+lint+build + smoke `/admin/freight/leads` (307 auth-gate) + detail page renders.

---

## WAVE 2 — Tax-invoice P3: ใบขน (cargo declarations + Docs surface) · 🟢💰 ⏱ M

**Why second:** the next isolated, SAFE, data-capture-only slice of the tax-invoice platform. P1+P2 already capture cost/declared per line (mig 0158 cols exist); P3 surfaces them as a customs declaration for the Docs role. Reuses the existing `customs_declarations` freight model — no money path, no comms, no status flips. Unblocks the ใบขนรวม workflow end-to-end. The VAT-base decision is already documented (ADR-0016 · `tax-doc-mode.ts` L187–195), so the 💰 gate is mostly resolved — **but confirm the accounting sign-off on the ใบขน VAT base is still current before issuance UI** (P4, not P3).

**Items (per `tax-invoice-platform-build-plan-2026-06-09.md` P3):**
- **mig 0161** `tb_cargo_taxdoc_job` — `fid`/`hno` · `doc_mode` · 4 status cols (`cs_status`/`pricing_status`/`docs_status`/`account_status`) · `cabinet_no` · `declaration_id` · unique per `fid` + per `hno` · RLS `is_admin(['super','sales','pricing','accounting','freight_import_doc'])`.
- **mig 0162** `customs_declarations += cargo_cabinet_no, cargo_forwarder_id` — bridge the freight customs model to the cargo consolidated ใบขนรวม (reuse ONE customs schema for freight + cargo).
- `actions/admin/cargo-declarations.ts` — reuse `customs_declarations` CRUD keyed on `cargo_cabinet_no`/`cargo_forwarder_id`; **per-line declared defaults from mig 0158 `cost_unit_thb` → `declared_value_thb`** (cost-to-declared defaulting · Docs edits down); `logAdminAction` every edit.
- `/admin/accounting/documents` (or `/admin/freight/declarations` cargo tab) detail-view: per-line declared values + HS codes + duty/VAT calcs · read-only until P4 wires edit permissions.
- Wire the cost→declared defaulting in the UI so the pricing role's capture auto-populates the Docs review field.

**Buildable now:** ✅ yes (gates met: P2 cost cols exist · freight customs model exists). **Owner-blockers:** none for capture; 💰 the ใบขน VAT-base sign-off blocks the *issuance* step (P4). **Note:** declared value is an **audited manual field — NEVER auto-equals selling**; default from COST and let Docs edit down per the สำแดง plan.

---

## WAVE 3 — Customs edit-page + 3-doc trio completion · 🟢💰 ⏱ S

**Why:** the cheapest high-value slice — all backend exists, only a UI wrapper is missing. The CEO-mandated 3-doc trio for cargo billing (ใบกำกับภาษี ✅ · ใบขนสินค้า · ไม่รับเอกสาร ✅) needs the declaration mutation surface. The customs-brokerage audit calls this the "HIGHEST-VALUE SAFE slice" (1–2 hr, zero new schema/actions).

**Items:**
- `app/[locale]/(admin)/admin/accounting/customs-declarations/[id]/page.tsx` — new ~50 LOC page wrapping the already-built `DeclarationDetailClient` (HeaderPanel + LinesPanel + StatusActions) from `/admin/freight/declarations/[id]/declaration-detail-client.tsx`. Copy auth + data-fetch from `/admin/freight/declarations/[id]/page.tsx`, route to `/admin/accounting`, add breadcrumb + `CARGO_MENUBAR`. Accounting role writes via existing RLS.
- Customer portal customs-declaration READ view — `/protected/freight/...` page to display own declarations (RLS already permits status ≥ submitted; customers currently have no UI to see them).

**Buildable now:** ✅ yes (everything tested + in prod). **Owner-blockers:** none. 💰 only the VAT-base policy (same as Wave 2). **Risk:** near-zero.

---

## WAVE 4 — Freight ops cockpit (AX JOB Kanban · stage tracking) · 🟢 ⏱ L

**Why:** visibility layer over the existing freight spine. The PRICING→SALES→DOC→ACC pipeline tables exist but there is no unified cockpit view. Safe (read-mostly + status/assignment writes), no money path beyond surfacing existing P&L, iterable. Owners want the cockpit ("AX JOB.html" was the pixel reference).

**Items (per AX JOB MINE spec · effort L):**
- **mig 0163** `freight_job_operations` — per-shipment stage state + cost breakdown + assignments (`assigned_{pricing,sales,doc,acc}_admin_id` · `{pricing,sales,doc,acc}_status` · cost/revenue/profit snapshot · `is_urgent`). UNIQUE on `freight_shipment_id`.
- **mig 0164** `freight_stage_checklists` — per-stage action items + owner + done state.
- `actions/admin/freight-ops-cockpit.ts` — `adminListFreightOpsCockpit` (filter by stage/assignee) · `adminGetFreightCockpitDetail` · stage-advance actions (`adminCompletePricingStage`/`adminConfirmSalesQuote`/`adminRecordDocStageCost`) · `adminUpsertFreightChecklist` · `adminAssignFreightStageOwner` · `adminToggleFreightUrgent`. `withAdmin()` per role matrix + `logAdminAction` (ADR-0014).
- `app/[locale]/(admin)/admin/freight/operations/page.tsx` — Kanban board (6 columns: PRICING|SALES|DOC|ACC|in-progress|DONE) + stat bar + filter pills.
- `app/[locale]/(admin)/admin/freight/operations/[id]/page.tsx` + `shipment-detail-client.tsx` — stage-aware detail panel (pricing table / sales checklist / doc checklist / acc P&L+commission). Components: `shipment-card`, `detail-panel`, `pricing-modal`, `checklist-section`, `cost-breakdown`, `commission-panel`.

**Buildable now:** ✅ yes (spine + invoices + payments already exist). **Owner-blockers:** none to start; the **commission-panel** sub-component is blocked on Wave 6 (commission tables) → ship the cockpit with commission as a stub/read-from-P&L first, wire the panel after Wave 6. **Dependency:** Wave 6 for full commission display (degradable).

---

## WAVE 5 — Freight P&L + margin-guard persistence + rate-card admin polish · 🟢💰 ⏱ M

**Why:** the cost/sell/profit data exists per shipment but there's no P&L dashboard or persistent margin-cap flag. The CEO's ≤15k฿/container cap is currently only an ephemeral UI banner. Closes the freight profitability-visibility gap. Money-sensitive (it shows real margins + China cost) but no mutation of money.

**Items (per Freight Pricing/Commission/P&L MINE spec · effort M):**
- Extend `freight_shipments` (alter, batch into a mig): `cost_china_freight_thb` · `cost_local_thb` · `cost_total_thb` · `profit_margin_thb` · `margin_exceeds_cap_at_conversion` · `margin_cap_thb` (snapshot at quote→shipment convert).
- Extend `freight_quotes` (alter): `profit_margin_thb` · `margin_exceeds_cap` · `china_cost_lookup_error` · `commission_calc_status`.
- Extend `freight_quote_items` (alter): `commission_scope` · `commission_pct` · `commission_amount_thb`.
- `lib/freight/rate-lookup.ts` → `lookupChinaFreightCostThb(mode, pol, pod, carrier, qty)` (already partly exists — verify it queries `tb_freight_rate` + applies FX snapshot).
- Enhance `adminComposeQuoteFromRateCard` — fold in China cost → net margin; set `china_cost_lookup_error` if rate not found (gross only · yellow banner); flag `margin_exceeds_cap` if profit > 15k × containers (advisory, NOT blocking).
- `adminConvertQuoteToShipment` — **verify the INSERT logic is actually implemented** (audit says it may be a stub); copy cost snapshot + margin flags; reserve `job_no`; create parties.
- `app/[locale]/(admin)/admin/freight/shipments/[job_no]/p-and-l` — P&L dashboard (cost block · revenue block · profit block w/ margin-cap status · commission breakdown).
- `upsertFreightRate` / `deactivateFreightRate` actions (if missing) + FX-rate refresh control reading `business_config 'freight.fx_rate_thb_per_usd'`.

**Buildable now:** ✅ yes. **Owner-blockers:** 💰 the **≤15k cap policy** is advisory-only by current decision (confirm before making it a hard gate); 🟡 **FX rate is a monthly manual refresh** (ops updates `business_config`) — no FX API. **Note:** rate-engine LCL+truck cases are tested; FCL/AIR cards are "representative" (not full from xlsx) — flag for the pricing team.

---

## WAVE 6 — Commission ledger + withdrawal workflow (V-E8/H1/H2) · 🟡💰 ⏱ L

**Why:** revenue-side staff-payout automation. The current commission path is per-customer-only workaround; the proper ledger is fully designed but ZERO migrations exist. Unblocks interpreter (ล่าม) + sales-rep payouts and the cockpit's commission panel. Money-critical → strict WHT handling.

**Items (per commission MINE spec · effort L):**
- **mig** 4 tables: `commission_tiers` (`role_kind` · `service_kind` incl. new `freight_quote` · `rate_pct`/`flat_thb` · effective dates) · `commission_accruals` (`earner_admin_id` · `source_kind` incl. `freight_quote` · `base_thb` · `accrued_amount_thb` · partial-UNIQUE `(source_kind, source_ref, earner_admin_id)` for idempotency · `commission_scope_breakdown` jsonb) · `commission_withdrawals` (gross/wht/net · status `pending→approved→paid` · bank snapshot · WHT 15% > 5k per Revenue Code §50(1)) · `commission_withdrawal_items`.
- Add `pricing`/`interpreter` to the commission role set (note: `pricing` AdminRole already added in mig 0158).
- `lib/freight-commission/calc-v2.ts` — the **5%+5%+1% − 3% WHT** split (freight 1% · customs 5% · doc 5% · flat 20฿/shipment for EK/AIR; WHT 3% on freight commission, 15% general Thai rate on withdrawal > 5k). Keep alongside the legacy 1% calc in `calc.ts`.
- `actions/admin/freight-commission.ts` — `adminAccrueFreightCommission` (idempotent, triggered on shipment delivered or invoice issued) · `computeFreightCommission`.
- Wire `adminIssueFreightInvoice` (existing) → trigger accrual. Wire `adminMarkFreightCommissionPaid` → existing `/admin/sales-payouts` flow.
- Admin approval/payment queue UI (`/admin/commission/freight-accruals` or extend existing).

**Buildable now:** 🟡 mostly — **the commission RATES (5%+5%+1%−3% WHT) must be confirmed in writing by the owner** (the source `.xlsx` cost/commission tables are binary-unreadable; verify against PCS history). **Owner-blockers:** 💰 commission-rate sign-off · WHT policy confirmation. Build the tables + idempotent accrual logic now (safe); gate the actual rate constants behind written confirmation.

---

## WAVE 7 — Public /track hardening + CargoThai provider readiness · 🟢 ⏱ S–M

**Why:** the public `/track/[code]` is live but has NO hard rate-limit → blocks ad-linking (gate G-15). Safe, isolated, unblocks marketing. Also adds the CargoThai public search (parallel route) the MINE spec describes.

**Items:**
- **Rate-limit** (the immediate SAFE win, 2–3 hr): `lib/rate-limit.ts` using Upstash (env present) · wrap `getPublicTrackStatus` in `actions/track.ts` (or middleware) · 100 req/hr per IP · 429 on exceed. Unblocks ad-safe `/track`.
- (Optional, M) CargoThai public search per MINE spec: `/track/cargothai` + `[code]` pages · `/api/public/cargothai/search` (no auth, rate-limited, **filtered fields only — never customer_code/cost/note_amount**) · `actions/public/cargothai-tracking.ts` reading the existing `tb_tmp_forwarder_cargothai` + `_item_cargothai` temp tables. The sync (admin + cron) is already shipped.

**Buildable now:** ✅ yes (Upstash env present · temp tables exist · sync shipped). **Owner-blockers:** 🟡 public-tracking exposes shipping status to anon (no PII, but **ops sign-off** recommended before public/ad launch); 🔴 `PACRED_CARGOTHAI_TOKEN` needed only for fresh sync (already wired, may already be set — verify in Vercel).

---

## WAVE 8 — BI deep-dive (cockpit profit/margin/SLA + sales-rank) · 🟢 ⏱ M

**Why:** the 47k forwarder orders carry `fprofittotal`/`fcosttotalprice`/`fdatestatus2..7` that are almost entirely un-analyzed (the "10× value" the big audit flagged). The exec cockpit already reads MTD aggregates; this adds per-carrier/warehouse/sales-rep drill-down + SLA dwell-time. Zero new schema, low reachability friction (same cockpit landing). The CRM + acquisition stream is otherwise COMPLETE.

**Items:**
- Extend `/admin/reports/cockpit` — per-carrier / per-warehouse / per-sales-rep profit + margin drill-down · SLA dwell-time per status stage (from `fdatestatus2..7`).
- (Optional, from call-CDR MINE spec) **sales-rank dashboard** — `/admin/reports/sales-rank` + `rep_sales_summary` table (mig). 🔴 BLOCKED on the `salerank.html` API endpoint + legacy-admin-code↔profile_id mapping → defer the *external sync*; the *internal* rep-leaderboard from `tb_forwarder` + `lead_call_log` is buildable now.
- (Optional) rep call-queue extension (`rep_call_queue` table) + `/admin/reports/rep-queue` — internal aggregation buildable now; **win-back drip + PDPA policy + Podeng campaign templates are owner-blocked.**

**Buildable now:** ✅ for the internal BI; 🔴 the salerank external sync + win-back drip + PDPA sign-off block the call-CDR external pieces. **Owner-blockers:** salerank API URL/creds · legacy-admin mapping (ADR-0022 13-admin recreate) · 💰 PDPA sign-off for call-lead PII storage.

---

## WAVE 9 — Tax-invoice P4: 4-role workspace + PEAK rollup + shop/yuan store · 🟡💰 ⏱ M–L

**Why:** completes the tax-invoice platform's role-gated workflow + activates the dormant shop/yuan tax-invoice stores. Money/tax-critical → multiple sign-offs + a test-order money loop. Sequenced after P3 (Wave 2) which provides the declarations.

**Items (per build-plan P4):**
- `menuPricing` sidebar entry (currently missing — sidebar has `menuSuper` but no extracted `menuPricing`).
- Job-detail page rendering 3 numbers + 4 status pills (`cs/pricing/docs/account_status`) + the advance state machine (Account gated on cs+pricing done) over `tb_cargo_taxdoc_job` (mig 0161 from Wave 2).
- Extend `getPeakExportBundle` to include cost + selling rollup (cost header rollup currently deferred — `fcosttotalprice` stays cost-sheet-authoritative until this).
- Add the **shop/yuan store READ surface** to `/admin/accounting/etax` (currently forwarder-store-only; `tb_shop_tax_invoice` is dormant behind `tax_invoice.shop_yuan_enabled` = OFF).
- PDF renderer shape fix — the legacy renderer is shaped for World-A (selling-only VAT), not the tb_* cost/declared/3-number split.

**Buildable now:** 🟡 the workspace + state machine are buildable; activation is 🔴/💰. **Owner-blockers:** 💰 **accounting sign-off on the ใบขน VAT base** (`tax-doc-mode.ts` L187 — service-only vs +transport+rental) · **PEAK GL account codes from accountant (NAT)** (CSV import only, no write API) · **owner flips `tax_invoice.shop_yuan_enabled`** AFTER a TEST-order money-loop browser test · **test customer login** (owner-deferred — blocks the §0c authed click-test of P1+P2 too).

---

## WAVE 10 — MOMO/CargoThai warehouse worker-app (Theme 7 Phase 1) · 🔴 ⏱ L

**Why:** the "ไม่ต้องโทรถาม" USP — workers receive/measure/pack/seal/track. The pixel reference (cargothai.html 7-view SPA) + the data model (extend `tb_forwarder`/`tb_forwarder_item`/`momo_sack_*`/`tb_cnt`) are clear. But it needs RBAC roles (`warehouse_worker`/`warehouse_supervisor`) + China-team authority sign-off → owner-blocked to start.

**Items (per MOMO warehouse MINE spec · effort L):** 7 pages under `/admin/warehouse/*` (dashboard/intake/dataentry/sacks/shipping/transit/follow) · 8 server actions (intake/measure/sack/print/seal/depart/arrive/status-override) · extend tables + `warehouse_intake_log` + `momo_sack_print_log` audit tables · new admin roles + RLS scoped by warehouse_id · reuse Quagga2 barcode + `notifyStaffGroup` + CBM calc.

**Buildable now:** 🔴 no. **Owner-blockers:** RBAC 13-admin recreate (P0-1) · China-warehouse-team authority sign-off (who can seal + role assignment) · 💰 มูลค่าสำแดง logged in notes only (customs handled externally) · MOMO write-scope creds · barcode scanner USB driver test on the deployment Windows env · TMS/GPS integration out of scope.

---

## WAVE 11 — Partner portal + API-as-a-service (Theme 7 Phase 3/4) · 🔴 ⏱ XL

**Why:** the inverse of current MOMO consumption — Pacred becomes the provider (multi-tenant partner login + API leasing + metering/billing). Long-term moat. Hard owner-blockers (RBAC overhaul + multi-tenancy + billing).

**Items:** multi-tenant login + branch/warehouse row-scoping + partner role · expose MOMO-like endpoints (import/track, container/closed, sack/info) with API-key issuance + Upstash rate-limit + usage metering/billing · partner-API live pulls (GOGO/JMF/TTP — only MOMO/CargoThai/CTT done · ก๊อต-owned).

**Buildable now:** 🔴 no. **Owner-blockers:** RBAC 13-admin recreate · multi-tenancy design · billing/metering decision · ก๊อต partner-API switchover.

---

## WAVE 12 — Customs doc-kit + Form-E engine + export flow (Phase C / DPX) · 🔴💰 ⏱ L–XL

**Why:** the customs-letter kit (D/O-LOI carrier variants · 45-day waiver · POA · amend · lost-doc · port-code master) + Form-E ACFTA eligibility engine + the export reverse-flow. High value for the brokerage moat but deferred post-V1 / DPX ERP.

**Items:** D/O-LOI generators (ZIM Split-DO · RCL · COSCO · HEDE · FUJIT · UPS variants) · 45-day-waiver/POA/amend/lost-doc letter templates · port-code master · Form-E eligibility engine (HS-code origin-criterion + ACFTA preference logic — currently `fta_applied` is captured but no automation computes it) · HS-code AI-assist prompt · multi-currency declared values · export-flow schema (consignee in China, shipper in Thailand — current schema is import-only) · NETBAY e-filing (`lib/integrations/netbay/*` · write-back `customs_control_no`).

**Buildable now:** 🔴 no. **Owner-blockers:** 🔴 **NETBAY account + field spec + creds** (hard blocker — manual entry until then) · Customs Trader Portal API · 💰 Form-E/customs policy + FTA eligibility logic sign-off · multi-currency conversion-formula decision · the `.xlsx` cost/commission/port tables are binary-unreadable (need CSV export from owner).

---

## Appendix A — Owner-blocker register (the gates that unblock waves)

| Blocker | Unblocks | Owner / source |
|---|---|---|
| 💰 ใบขน VAT base sign-off (`tax-doc-mode.ts` L187) | W2 issuance · W9 | Accounting (NAT) — likely already documented per ADR-0016; **confirm current** |
| 💰 PEAK GL account/chart-of-accounts codes | W9 | Accounting (NAT) — CSV import only |
| 🔴 Test customer login (member_code + pw) | §0c click-test of P1/P2 · W9 | Owner — deferred |
| 🔴 Owner flips `tax_invoice.shop_yuan_enabled` | W9 shop/yuan issuance | Owner — AFTER test-order money-loop |
| 💰 Commission rates 5%+5%+1%−3% WHT confirmation | W6 | Owner — `.xlsx` unreadable, verify vs PCS history |
| 💰 ≤15k฿/container cap = advisory vs hard gate | W5 | Owner / CEO |
| 🟡 FX `business_config 'freight.fx_rate_thb_per_usd'` monthly refresh | W5 | Ops — no FX API |
| 🔴 RBAC 13-admin recreate (ADR-0022) | W8 rep-routing · W10 · W11 | Owner / ภูม |
| 🔴 China-warehouse-team authority sign-off | W10 | Owner / China ops |
| 🔴 NETBAY account + field spec + creds | W2-NETBAY (deferred) · W12 | Owner / broker |
| 🔴 `PACRED_CARGOTHAI_TOKEN` (verify set in Vercel) | W7 fresh sync | Owner / CargoThai ops |
| 💰 PDPA sign-off for call-lead PII | W8 call-CDR | Owner / legal |
| 🔴 salerank.html API URL + auth + admin-code mapping | W8 sales-rank external sync | Owner |
| 🟡 Ops sign-off on public-track exposure | W7 public/ad launch | Ops |

## Appendix B — Cross-cutting build rules (read before any wave)

- **Migration numbering:** NEXT FREE = **0161** as of this doc (0158/0159/0160 applied prod). Reserve numbers in the ledger (`docs/runbook/migration-ledger.md`) before parallel agents start, or collisions happen.
- **The 3-number model is load-bearing:** never conflate SELLING (CS · invoice+VAT) / COST (Pricing · PEAK+profit) / DECLARED (Docs · ใบขน, audited, edits down from cost). DECLARED **NEVER auto-equals selling.** See [`docs/learnings/pacred-cargo-tax-invoice-flow.md`](../learnings/pacred-cargo-tax-invoice-flow.md).
- **Dead-write trap (§0e):** before claiming any admin write-surface works, grep the WRITE target table vs the READER's table — a 0-row rebuilt twin written while consumers read `tb_*` = silent no-op. (This is exactly the freight-quote singular/plural split.)
- **Reachability (§0d):** every new function ships its nav entry in the same diff (≤3 clicks from sidebar/dashboard).
- **Windows build:** `pnpm build` fails on the Windows box (inline `NODE_OPTIONS=` not cmd-compatible → false 0). Build via `NODE_OPTIONS=--max-old-space-size=8192 node node_modules/next/dist/bin/next build` + read a REAL exit echo.
- **Money/tax/policy items (💰):** never ship without the named sign-off in Appendix A.

---

**Recommended first build:** **WAVE 1 (Freight RFQ leads triage)** — highest value × safety × buildable-now, no owner blocker. **First action within it: verify the actual current state** of `freight_quote` table + `/admin/freight/leads` page + `freight-leads.ts` (the audit is contradictory on whether it's already built). If already built, dismiss W1 → start **WAVE 2 (tax-invoice P3 ใบขน)**.
