@AGENTS.md
@CLAUDE_TECHNICAL.md

---

# 🧾 2026-06-10 — เดฟ: tax-invoice dead-twin integrity arc (consolidate→repoint→retire→forward-fix→FREEZE) + W1-W11 audit-harden + ~95 test assertions → dave-pacred + MAIN · read FIRST

> **🏁 ALL ON MAIN.** main = dave-pacred (promoted per owner "push dave-pacred + main") · Poom-pacred / InwPond007 = **0-ahead** (their work already integrated in dave-pacred from prior sessions · NOT re-pushed per push-policy) · Vercel deploying prod. `pnpm verify` EXIT 0 every save-point · **migration 0172 APPLIED + VERIFIED PROD · NEXT FREE = 0173.** Resume next machine: `git fetch origin && git pull origin main` (needs `.env.local` first · prod keys don't travel · prod Supabase = `yzljakczhwrpbxflnmco`).
>
> **🧾 THE tax-invoice dead-twin integrity arc — CLOSED end-to-end.** A deep workflow map (5 parallel readers + synthesis · high-confidence) proved real ใบกำกับภาษี are issued ONLY into the live tb_* stores (`tb_forwarder_tax_invoice` forwarder · `tb_shop_tax_invoice` shop+yuan · serial_no-keyed · `gross_before_wht` = VAT-incl total) — the World-A `tax_invoices` table (mig 0034) is a 0-row **DEAD TWIN** with NO live producer (issueTaxInvoice = UPDATE-only · only INSERT = the credit-note clone). 6 surfaces read it. Owner chose **consolidate → redirect** (not rebuild a 2nd two-store view · §12):
> - **`0fdb5860`** — `/admin/tax-invoices` list+[id] → redirect to the live `/admin/accounting/etax` hub (reads BOTH tb_* lanes) · etax gate widened +`freight_export_doc`/`freight_import_doc` to preserve Doc-role reach (§0d) · menubar + 2 Doc sidebars repointed (−1014 LOC).
> - **`2a438e4b`** — `/admin/accounting/documents` (issued count+Σ → tb_* union · dead "รออนุมัติ" stat [tb_* has no pending] → real cancelled-this-month) + `/admin/search` (was DOUBLY broken: dead table AND non-existent `invoice_no` col → now `serial_no` across both stores + `?store=` PDF drill-down).
> - **`8477e913`** — retire orphaned World-A dead code (−1284 LOC: action + export + 4 buttons · **KEPT `wht-panel.tsx`** = live freight-shipment dep · the per-file-verify trap the cleanup warned about).
> - **`c53a8ea4`** — forward-fix the period-close snapshot (`accounting-periods.ts buildCloseSnapshots`) → tb_* union (Σ gross_before_wht) · **NO backfill needed** (prod had 0 closed periods + 0 invoices · nothing frozen-wrong · no immutable-history rewrite).
> - **`853c9e34` · mig 0172 APPLIED+VERIFIED PROD** — freeze the live tb_* stores on period close (extends the V-E9 0056 `accounting_period_freeze_check()` +2 branches + BEFORE UPDATE/DELETE triggers on both · header-only per 0056 precedent · _wht_entry children stay mutable for 50-ทวิ cert chase · ZERO blast radius today). dry-run→`--apply`, both triggers + fn-branches confirmed via `pg_trigger`. Closes the last gap.
>
> **🛡 W1-W11 audit-harden + test-coverage (earlier same session · all gated+pushed):** W6-W11 money-accuracy/reachability (`88613e89`) · W1-W8 **BK-1 blocker** (lead-convert idempotency) + **SF-1** incoterm-scope cost gate (CIF/FOB don't fold China freight) + SF-2/3/4/6 (`def674cd`/`02b9ced8`) · **N-1/N-2** config-drive the freight margin cap (`efb700ec`) — money-safety **CONFIRMED-CLEAN** throughout (declared≠selling · no commission double-accrual/auto-pay · dormant flags fail-closed · FX correct · cap advisory). **~95 test assertions** lock the money fixes (SF-1 35 · S1 cargo-cost-line 19 · BK-1 17 · S2 commission-tier-select 7 · SF-4 forwarder-profit 11 · N-2 cap 6) with behavior-preserving extracts that removed REAL duplication (`forwarderRowProfit` was inline-dup'd cockpit↔report; `selectActiveConfirmedTiers`/`cargoLineCostThb`/`incursChinaFreightCost`/`isLeadConvertible` factored out). PDF route repointed (`1535b8da`). **S5 "productbagid" = verified FALSE-POSITIVE** (CargoThai writes the `tb_tmp_*` staging twin, not the real item table · learning `725a6dd9` — verify the TABLE not just the column name). CLAUDE.md June archive 895→513 lines (`31a9acfa`).
>
> **⚠️ Verify-state note:** every tb_* tax-invoice surface is **correct-for-the-future** but renders 0/empty on prod **until issuance goes live** (0 issued invoices everywhere · issuance ships DORMANT) — the money-doc render can't be browser-verified until the owner flips the dormant flag + runs a test order. The consolidation/redirect path needed NO such verify (no new tb_* read introduced; sends staff to the already-working etax).
>
> **🔴 OWNER ACTION ITEMS (carryover · unchanged):** flip `commission.freight_enabled` (after confirming W6 tier rates) · flip `tax_invoice.shop_yuan_enabled` (after money-test + ใบขน VAT sign-off) · enable `pricing`/`warehouse`/`freight_*_doc` roles for staff · ใบขน VAT-base sign-off · PEAK GL codes · NETBAY creds · rotate the dev DB password · **test-customer login** (unblocks the §0c authed-click-test + the tax-invoice money-doc browser-verify once issuance is live).

---

# 🛠 2026-06-09 LATE-NIGHT — เดฟ: 3 URGENT prod-bug fixes + roadmap waves W6-W11 + ปอน mobile-polish → ALL ON MAIN · SESSION CLOSE (ย้ายคอม) · read FIRST

> **🏁 SESSION CLOSE (machine move).** Resume on the next machine: `git fetch origin && git pull origin main` — **everything is on main = dave-pacred = Poom-pacred = InwPond007 = `42116bc3`** (all synced 0/0 · deployed prod). ⚠️ the next machine needs `.env.local` first (prod keys don't travel · memory `local-dev-env-and-legacy-path` · prod Supabase = `yzljakczhwrpbxflnmco`).
> **State:** `pnpm verify` + prod build EXIT 0 every save-point · **8 migrations applied+verified prod (0161-0167 + 0169-0171 · NEXT FREE = 0172)** · ปอน's final commit = mobile-first service-import polish (single-row cards · icon-rail sidebar · view-tab cleanup · clean FF, all เดฟ fixes verified-intact).
>
> **🔧 3 URGENT owner-reported prod bugs — FIXED + DEPLOYED first:** (1) **payment QR broken in every pay-modal** — the static company QR (`lib/promptpay.ts` `STATIC_PAYMENT_QR_PATH=/images/payment/pacred-qr.png`) was never UPLOADED (code was right; file missing → broken-image). Placed the owner's K-Shop QR (JPG→PNG · resized 720px · no code change · fixes all modals). (2) **ฝากนำเข้า create-order silent-blocked** — P1 doc-picker auto-defaulted to ใบกำกับ for juristic → required billing fields blocked submit when tb_corporate incomplete → `CartTaxDocPref` gained `defaultMode`; ฝากนำเข้า passes `'none'` (order-entry no longer forces a tax doc · cart unchanged). (3) **เพิ่มที่อยู่ใหม่ 404** — `/addresses/add` now redirects to `/addresses` (add is a modal there). **+ systemic broken-image sweep** (`grep static img-src vs public/`): fixed 7 more (5 unuploaded hero banners → existing service banners · 2 admin default placeholders). Learning: `docs/learnings/nextjs-16-quirks.md` (broken-image = missing public/ file).
>
> **🚀 Remaining roadmap waves BUILT + integrated (mechanism-first · owner-inputs gated/deferred · adversarially reviewed):**
> - **W6 — Freight commission ledger** (`freight_commission_*` ×4 · mig 0167) — 💰 **ships DORMANT** behind `business_config commission.freight_enabled` (=`{"enabled":false}`) + rates as EDITABLE seeded tiers (`is_owner_confirmed=false` · 0 confirmed) · idempotent accrual · NO auto-pay. **🔴 owner: confirm the rate tiers + flip the flag to go live.**
> - **W9 — Tax-invoice P4: CARGO tax-doc 4-role workspace** (`/admin/pricing/taxdoc-workspace` · CS→Pricing→Docs→Account over tb_cargo_taxdoc_job · 3 numbers + 4 status pills · ACC gated on cs+pricing · no schema) + PEAK 3-number rollup + shop/yuan etax read. Issuance stays gated.
> - **W10 — Warehouse worker-app** (`/admin/warehouse/worker/*` intake/measure/sack/ship/follow · mig 0169-0171 · isolated audit tables · no money write · respects fcabinet_locked). **🔴 owner/China-team: confirm `warehouse` role assignment.**
> - **W11 — Customs doc-kit** (`/admin/accounting/customs-doc-kit` · DO-LOI per carrier + 45-day/POA/amend/lost-doc letters + Form-E/ACFTA eligibility + HS-assist + port codes · advisory/PDF only). **🔴 NETBAY e-filing DEFERRED (no creds · manual filing).**
> - Built by 5 worktree agents (W6 + W9/W10/W11 batch) → I integrated serially (4 merges · the persistent ภูม receipt-PDF race · the conflict-marker trap + a lint/type cascade — all caught by my gate · learning `parallel-agent-sprints.md` L-PAS-08).
>
> **🔴 OWNER ACTION ITEMS (carryover · all the DORMANT/gated levers):** flip `commission.freight_enabled` (after confirming W6 tier rates) · flip `tax_invoice.shop_yuan_enabled` (ใบกำกับ ฝากสั่ง/โอน · after money-test + ใบขน VAT sign-off) · enable `pricing`/`warehouse`/`freight_import_doc` roles for staff at `/admin/admins/[id]/edit` · ใบขน VAT-base sign-off (gates issuance) · PEAK GL codes (accountant) · NETBAY creds · rotate the dev DB password ภูม committed · confirm juristic-signup fix · test customer login (unblocks the §0c authed-click-test of all the new admin surfaces — gated+reviewed but NOT browser-tested).

---

# 🌏 2026-06-09 NIGHT — เดฟ: DEEP-SOURCE BUILD (cargo+freight) + full team-integrate → ALL ON MAIN · read FIRST

> **main = dave-pacred = Poom-pacred = InwPond007 = `7287bfd9`** (all 0/0 · pushed main per owner "ตรวจงานน้องๆ → รวม → push main ทีเดียว · อย่าทำงานน้องหาย" · Vercel deploying prod) · `pnpm verify` + prod build EXIT 0 every save-point · **6 migrations applied+verified prod (0161-0166) · NEXT FREE = 0167.**
>
> **🔴 CRITICAL FACT (owner-confirmed · was a near-miss):** **prod Supabase = `yzljakczhwrpbxflnmco`** · **`lozntlidlqqzzcaathnm` = ภูม's DEV project (NOT prod).** ภูม's `docs/briefs/HANDOFF-FOR-DAVE-GOT-2026-06-09.md` mistook dev-for-prod + instructed switching the prod Vercel `SUPABASE_DB_PASSWORD` to the DEV password (would break prod) — **เดฟ corrected/neutralized the doc.** All เดฟ migrations target the right prod (`yzljakczhwrpbxflnmco`). 🔐 **Owner: rotate the dev DB password ภูม committed** (scrubbed from git going forward; still in Poom-pacred history).
>
> **🌏 The deep-source build (owner gave `olddata dev` cargo+freight + "พัฒนาส่วนที่ขาดทั้งหมด · ทำเลินนิ่ง" · ultracode workflow-orchestrated):** mine+audit (9+6 agents) → `docs/research/build-backlog-2026-06-09.md` (11 waves) + learnings `docs/learnings/freight-erp-model.md` + `customs-brokerage-kit.md`. **Headline: the freight stack is ~80% already scaffolded** (freight_quotes/shipments/invoices/customs_declarations/tb_freight_rate exist) — real gaps = cockpit/commission/ใบขน-Docs/P&L. Then built (each gated + adversarially reviewed):
> - **W2 — Tax-invoice P3: ใบขนรวม** (cargo customs declarations + Docs surface) — `cargo-declarations.ts` + `/admin/accounting/cargo-declarations` · reuses customs_declarations · มูลค่าสำแดง defaults from COST (3-number model · never from selling) · **mig 0161 (tb_cargo_taxdoc_job) + 0162 (customs_decl cargo-link)**.
> - **W4 — Freight ops cockpit (AX JOB Kanban)** PRICING→SALES→DOC→ACC — `/admin/freight/operations` + `freight-ops-cockpit.ts` · **mig 0163 + 0164** · adversarial review: **money-isolation CLEAN** (P&L snapshot display-only, never touches spine/invoices · ACC gated on pricing+sales).
> - **W5 — Freight P&L + margin-guard** — persisted cost/margin/commission + `/admin/freight/shipments/[id]/p-and-l` + FX-refresh control · ≤15k cap = ADVISORY · **mig 0165**. (adminConvertQuoteToShipment confirmed REAL, not stub.)
> - **W8 — BI cockpit drill-down** (profit/margin/SLA per carrier/warehouse/sales-rep · no schema) + finished W1 (freight leads — was already built) · W3 (customs accounting edit-page) · W7 (public /track rate-limit).
> - **0166** defensive customs RLS broadening (super/accounting/freight_import_doc/pricing).
> - **Build-bugs caught by MY gate** (agents can't gate): freight-cockpit optional-`res.data` (5 TS errors) · `FREIGHT_FX_KEY` "use server" const-export (13 Turbopack errors · the documented gotcha).
>
> **🔀 Integrated ALL teammates (nothing lost · owner directive):** **ภูม 7 commits** (sticky top-menubar across admin · forwarders UX · **fShipBy P0** PCS-pickup-wins-over-Flash · address-link 404 fix · driver/heartbeat already on main) · **ปอน 2 commits** (customer sidebar redesign + unified service-import tabs) → restored `/my-issues` link ปอน's redesign dropped (§0d). Migration collision (ภูม 0158/0159 ↔ เดฟ 0158) resolved earlier (ภูม→0159/0160).
>
> **🔴 REMAINING BACKLOG = owner-input-blocked (paused per owner "พักไว้"):** **W6 commission ledger** (needs the rates confirmed in writing: เฟรท 1%/customs 5%/doc 5%/−3% WHT/flat 20฿/WHT 15%>5k) · **W9 P4 4-role workspace+PEAK** (VAT-base sign-off + PEAK GL codes + flip `shop_yuan_enabled` + test login) · **W10 warehouse worker-app** (China-team RBAC sign-off) · **W11 customs generators + NETBAY** (NETBAY creds · external). ⚠️ **admin surfaces gated+reviewed but NOT authed-click-tested** (no test login). Standing owner items carry over (flip ใบกำกับ flag · enable `pricing` role for a staffer · confirm juristic-fix · Supabase refresh-token · Vercel env).

---

# 🧾 2026-06-09 EVE — เดฟ: tax-invoice platform P1+P2 SHIPPED + ภูม chase integrated → ALL ON MAIN · read FIRST

> **main = dave-pacred = Poom-pacred = InwPond007 = `8a5d6c1f`** (all synced 0/0 · pushed to main per owner "ขึ้น main เลย" · Vercel deploying prod) · `pnpm verify` + prod build (direct-node) EXIT 0 every save-point · **5 migrations applied prod today (0157 hs-idx · 0158 cargo_3number · 0159 driver-completed-at · 0160 heartbeat-lock) · NEXT FREE = 0161.**
>
> **Shipped this session (tax-invoice platform · plan = [`docs/research/tax-invoice-platform-build-plan-2026-06-09.md`](docs/research/tax-invoice-platform-build-plan-2026-06-09.md)):**
> 1. **P1 — doc-mode toggle @ ฝากนำเข้า order entry** (`7a9217fa`) — mounted `<CartTaxDocPref>` on `/service-import/add` (ใบกำกับ/ใบขน/ไม่รับเอกสาร) → persists `tb_forwarder.tax_doc_*` (mig 0127 · cart.ts shape · no schema · no new i18n). SELECTION only, no money at create.
> 2. **P2 — COST/Pricing capture + the `pricing` AdminRole** (`6aa7db85` backend + `beb7e188` UI) — **mig 0158** (tb_order + tb_forwarder_item += `cost_unit_*`/`cost_rate_cny`/`declared_value_thb`/`hs_code` + widen `admins.role` CHECK +`pricing`) · `actions/admin/cargo-cost.ts` (`setForwarderItemCost`/`setShopOrderItemCost` · super/accounting/pricing · logAdminAction) · inline green "ต้นทุน (Pricing · ใบขน)" cost editors on the forwarder `[fNo]` + shop `[hNo]` detail pages (`cargo-cost-line-editor.tsx` · confirm-before-mutate · read-only summary for other roles). **🔒 ISOLATED from the money path** (no selling/quote/status/comms) · **NO header rollup** (`fcosttotalprice` stays cost-sheet-authoritative — landmine avoided · PEAK rollup = P4).
> 3. **ภูม Poom-pacred chase integrated** (14 commits · `db0611d1` merge) — shop-order heartbeat-lock + bulk-actions + multi-axis search + refund-history + inline edits + driver-runs completed-at + ctt-cron live-flag + momo-autocommit safety. **🔢 migration collision resolved** (ภูม's 0158→**0159** · 0159→**0160** vs เดฟ's applied 0158) · RBAC integrity verified (all 24 roles present, `comm` diff empty) · ภูม's renamed migrations applied+verified prod · fixed his ctt-cron-activation.md broken md-links.
>
> **🔴 OWNER ACTION ITEMS (carryover — still pending):** (1) **flip `tax_invoice.shop_yuan_enabled`** (ใบกำกับ ฝากสั่ง/ฝากโอน ships DORMANT) after money-loop TEST + accounting ใบขน-VAT sign-off. (2) confirm urgent juristic-signup fix (real นิติบุคคล signup + big photo). (3) **enable the Pricing role:** assign `pricing` to a staffer at `/admin/admins/[id]/edit` so they reach the cost editors. (4) carryover: Supabase refresh-token · Vercel env (TAMIT/Sentry/FB) · staff photos · employee_code.
>
> **⚠️ NOT authed-click-tested:** P1 (doc-mode persist) + P2 (cost-line save → DB) gated green + reviewed but not browser-tested on an authed session (no test login). **➡️ NEXT = P3** (ใบขน Docs · declared-value→customs_declarations · `freight_import_doc` role · mig 0161+0162 · ⚠️ มูลค่าสำแดง = owner/accountant policy-sensitive per ADR-0016 · NETBAY = P5 blocker) — best started fresh-context.

---

# 🧾 2026-06-09 PM — เดฟ: CARGO ใบกำกับภาษี form delivered + platform build-plan + team-model clarified · SESSION CLOSE · read FIRST

> **All on `dave-pacred` (+ this close-out pushed to all branches once, then dave-pacred-only going forward).** Built the **CARGO tax-invoice (ใบกำกับภาษี) Excel form** from the AXELRA template + olddata-dev chats — adds the missing **Pricing (cost) section** (file `/Users/dev/Downloads/PACRED-ใบกำกับภาษี-form-v2-pricing.xlsx`, script `scripts/tax-invoice-form-build.py`, 0 formula errors, functional-tested).
>
> **⭐ The insight PCS+ไอแต้ม missed (now the spec):** CARGO import = a Freight-LCL job where Pacred issues a **ใบขนรวม under the shipping-co name** → customer sees only the tax invoice. **THREE distinct prices, three roles** — never conflate: **SELLING** (CS → invoice + VAT 7%) · **COST** (Pricing → PEAK stock + profit) · **มูลค่าสำแดง/DECLARED** (Docs → ใบขน, defaults to cost but engineered-down, audited). 4-role flow CS→Pricing→Docs(NETBAY/Form-E)→Account(PEAK). Learning: [`docs/learnings/pacred-cargo-tax-invoice-flow.md`](docs/learnings/pacred-cargo-tax-invoice-flow.md).
>
> **🏗 Platform build-plan (grounded by a 4-agent audit · [`docs/research/tax-invoice-platform-build-plan-2026-06-09.md`](docs/research/tax-invoice-platform-build-plan-2026-06-09.md)):** the SELLING+VAT+WHT+issuance layer is **already built** (`tax-doc-mode.ts` · `tb_forwarder_tax_invoice` LIVE / `tb_shop_tax_invoice` DORMANT · `customs_declarations` freight-only · PEAK CSV). The whole gap = platform captures ONE price (selling); **no COST field, no DECLARED field, no `pricing` role.** Build = the upstream cost/declared/Pricing layer (do NOT rebuild). **P1 = doc-mode toggle at ฝากนำเข้า order entry (no schema · the recommended next slice)** → P2 cost (mig 0158 + `pricing` role) → P3 declared/Docs → P4 4-role workspace+PEAK → P5 NETBAY. **NEXT-FREE migration = 0158** (ledger stale); ADR-0027 stale.
>
> **👥 Team model clarified + corrected in docs** (`docs/team.md` §0): **4 contributors only** — เดฟ=`dave-pacred` (lead/integrator, on the owner's behalf) · ภูม=`Poom-pacred` · ปอน=`InwPond007` · ก๊อต=`main` review + delegated. The **owner (CEO) sets direction but does not commit code**. Fixed stale branch names across team.md / CLAUDE.md TL;DR / AGENTS.md §13 (resync → `dave-pacred`) / `branch-integrate-loop` skill.
>
> **🔧 Push policy going forward (owner directive):** finish a big wave → push **only `dave-pacred`**. Do **NOT** push `main` unless the owner says so, and **do NOT push teammate branches** routinely (they already have the updates). This close-out is the one-time all-branch distribution.

---

# 🌊 2026-06-09 — เดฟ: 5-wave autonomous code sprint + nav-fix + phone-dedupe + self-audit harden · ALL on main · read FIRST

> **main = dave-pacred = Poom-pacred = InwPond007 = `423d17cb`** (all synced) · `pnpm verify` + `pnpm build` EXIT 0 every save-point · migration **0157** applied prod (NEXT FREE = **0158**). Owner: "เอางาน code ล้วนมาแยกร่าง เคลียเป็น phase เล็ก→ใหญ่ run long" → ran 5 worktree-agent waves (3 agents/wave · serial-merge + gate + push-per-wave · every wave merged clean). Then "เก็บงานให้ดีก่อนไปต่อ" → self-audit + fixed the gaps.

**Shipped (each gated + pushed main):**
1. **PR112/PR10584 dup-merge** (retire empty dup `userStatus='0'`) + **root-cause phone-dedupe guard** in `adminCreateNew` (refuse phone already in tb_users · `allow_existing_phone` override) + detection tool `scripts/find-cross-system-phone-dups.mjs` (37 dups = review backlog) · learning [`duplicate-identity-cross-system.md`].
2. **W1:** services-catalogue UI fixes (ส่งออก→soon · soon-cards non-nav · +consignment/bill-payment) · auto-cancel cron repoint `service_orders`(0-row)→`tb_header_order` (reuse `autoExpireOverdueShopOrder`) · public freight wizard → `composeFreightQuote` (customer-safe SELL-only).
3. **W2:** **admin CRUD `/admin/freight/rates`** → `tb_freight_rate` (0145 · confirm-gated · unblocks net-margin) · wallet-reconcile cron (read-only drift/overdraft) · `/admin/reports/lead-source` attribution dashboard.
4. **W3:** `/admin/tools/china-category` lookup (77k rows · **0157** GIN) · freight cost-loop verified complete (consumer already wired).
5. **W4:** daily container-bulletin cron (Phase-B's last un-built item) · **local Code128 barcode** (`lib/barcode.ts` bwip-js · drop external `pcscargo.co.th/barcode.php` · §3-safe) · 98 test assertions (freight money-safety).
6. **W5:** 30 assertions on forwarder NET-total + WHT · −966 LOC orphan cleanup.
7. **nav-split fix:** primary `/service-order` page now has the REAL `<BulkPayBar>` multi-select pay-from-wallet (was a Potemkin placeholder linking `?q=2`) — reuses the proven `/add` islands + `payServiceOrderFromWallet`; ปอน's design kept. (`/add` redirect deferred — it has paste-search + cart/search nav.)
8. **Self-audit harden** (`423d17cb`): 4-auditor sweep (§0c/§0d/§0e/§0f/i18n/money) → **all money + customer-safety CLEAN**; fixed 1 🔴 (freight-wizard raw-i18n-key leak — `freightQuoteWizard.service.*` was missing both locales · the gate misses template-literal keys) + 4 🟠 (freight rate-lookup ordering · getFreightRates loadFailed banner · stale cron desc · lead-source RBAC↔hub mismatch).

**🟠 Flagged (not done):** 3c `/service-order/add` dedup redirect (spawn_task · needs cart/search flow-trace) · the 37 phone-dup review backlog.
**🔴 NEXT TIER = owner-blocked** (run-long stopped here — building blind = wrong): FX yuan-rate source (price-sensitive) · slip-OCR · PEAK 2-way · CargoThai producer · the 8 TBD catalogue services (product specs) · freight P&L ledger (needs rate data). Plus the 2026-06-08 owner items below (flip `shop_yuan_enabled`, juristic-signup confirm, prod-data confirm, env).

---

# 🏁 2026-06-08 SESSION CLOSE — เดฟ: URGENT juristic fix + full team-merge + freight inbox + cargo/CRM/ใบกำกับ builds → ALL on main · ย้ายคอมกลับบ้าน · read FIRST

> **🏁 SESSION CLOSE (เดฟ · machine-move home).** Resume on the home machine: `git fetch origin && git pull origin main` — **everything today is on main = dave-pacred = Poom-pacred = InwPond007 (synced at close)**. `pnpm verify` + prod build (direct-node) EXIT 0 at every save-point. **9 migrations applied prod (0148–0156 · NEXT FREE = 0157).**
> **🔴 OWNER ACTION ITEMS (pending):** (1) **flip `tax_invoice.shop_yuan_enabled`** at `/admin/settings/business-config` — the ใบกำกับ ฝากสั่ง/ฝากโอน issuance ships **DORMANT**; turn ON only after a money-loop TEST-order test (shop+yuan) **+ accounting sign-off on the ใบขน VAT base** (`lib/tax/tax-doc-mode.ts` L187). (2) **Confirm the urgent juristic-signup fix** — have the waiting customer/staff do one real นิติบุคคล signup with a big phone photo. (3) **Confirm prod-data** — transactional tables near-empty (`tb_forwarder=50` · `tb_header_order/tb_order/tb_payment/tb_wallet_hs/tb_cnt=0`); read as early-business (migrated customer list + few orders · the "47k/104k" figures = dev/legacy) — confirm expected. (4) Carryover: Supabase refresh-token-reuse-interval · Vercel env (TAMIT-2026 · Sentry-client DSN · FB tokens) · staff photos · employee_code numbers.
> **➡️ NEXT SESSION = Freight ERP cockpit (AX JOB.html PRICING→SALES→DOC→ACC) + customs-brokerage automation (NETBAY / Form-E / HS-AI) — the big Phase-C build.** Specs ready: `docs/research/freight-knowledge-2026-06-01/_MASTER-FREIGHT-PLAN.md` + `docs/research/full-scope-gap-2026-06-08.md`. Also: ภูม keeps pushing warehouse-RBAC (the chase) — re-survey Poom-pacred on resume.

**🔥 PUSHED TO MAIN (`5f344b8f..6c789c87` · Vercel auto-deploying · main=dave-pacred=InwPond007 all == `6c789c87`).** 5 commits: reachability (5 orphans wired) · leads→CS handoff · gap-analysis docs · **merged ปอน InwPond007** (import table-view + pay-modal UI redesign + i18n · server action untouched) · **🚨 URGENT FIX juristic (นิติบุคคล) signup "An unexpected response was received from the server"** = `UploadField` had NO client-side size guard → a doc-photo >12mb hit Next `bodySizeLimit` → platform-rejected BEFORE the action's 10MB check → cryptic error. Fix = in-browser image compress (≤2400px/q0.82/EXIF-correct/fallback-safe) + size-guard, client-only, proven upload path untouched (`app/[locale]/(auth)/register/register-client.tsx`). **Gate REAL: `VERIFY_EXIT=0` + `REAL_BUILD_EXIT=0` (direct-node — ⚠️ `pnpm build` FAILS on this Windows box: the script's inline `NODE_OPTIONS=` isn't cmd.exe-compatible → ALWAYS build via `NODE_OPTIONS=--max-old-space-size=8192 node node_modules/next/dist/bin/next build`; the notification/pipe exit code LIES) + `/register` prod-smoke 200.** ⚠️ NOT large-file-E2E-tested (would pollute the prod-pointed DB) → **have the waiting customer/staff do one real juristic signup w/ a big phone photo to confirm.**

**✅ ภูม batch INTEGRATED + APPLIED + PUSHED (2026-06-08 round 2 · owner "ลุยต่อเลย"):** merged Poom-pacred into main — **auto-merged 0-conflict** (ภูม's branch already had ปอน's pay-modal redesign → money-path file identical both sides; my reachability+leads+register-fix all survived, grep-verified). **3 migrations 0148/0149/0150 dry-run→`--apply` to prod** (additive/idempotent · COMMITTED · ledger updated). Fixed 1 verify break (audit:env undeclared `SUPABASE_URL` fallback in `scripts/probe-rls-policies.mjs`) + added `scripts/apply-migration-0149.mjs`. Gate REAL: verify=0 + build=0. Pushed main+dave-pacred+Poom-pacred+InwPond007. **🟦 prod-data note (CONFIRM):** prod (`yzljakczhwrpbxflnmco`, both pooler+REST agree) has `tb_users=8,940` but `tb_forwarder=50 · tb_header_order/tb_order/tb_payment/tb_wallet_hs/tb_cnt=0` — read as the early-stage business state (migrated customer list for acquisition + few real orders; the "47k orders/104k wallet" figures are dev/legacy, NOT live prod) — owner to confirm. NEXT FREE migration = **0157** (after round 3). ⟦superseded note below⟧

**✅ ROUND 3 (2026-06-08 · owner "1 เสร็จก่อน แล้วแยกร่าง 2/3/4"): freight inbox + 3 parallel agent builds — ALL PUSHED main + migrations applied prod.** (1) **Freight RFQ leads-inbox** `/admin/freight/leads` + convert-to-draft-quote (revenue unlock · 0151) — public RFQ leads were orphaned (no admin triage); now viewable/triageable/convertible. (2) **cargo fixes** (customer tracking-freshness badge · courier/Lalamove URL field 0156 · จองรถ external-truck LINE block · customer "ของไม่ครบ" report→work_items). (3) **🔴 ใบกำกับ ฝากสั่ง/ฝากโอน** (shop+yuan tax-invoice issuance · 0152 · **FLAG-GATED `tax_invoice.shop_yuan_enabled` = DEFAULT-OFF → ships DORMANT** · owner flips ONLY after a money-loop TEST-order browser test + accounting sign-off on the ใบขน VAT base `lib/tax/tax-doc-mode.ts` L187). (4) **CRM depth** (customer tags 0154 · activity timeline 0155 · lead-pipeline kanban). 4 build agents (1 freight + 3 parallel-disjoint), each merged 0-conflict, verify=0 + build=0 (build-only "another build running" lock false-alarm cleared via rm .next), all 5 migrations dry-run→applied prod. 🟡 Poom-pacred has newer ภูม commits (the chase) = next integration round.
**🟡 ภูม batch (pre-integration survey · now done — kept for trail):** `origin/Poom-pacred` = 2-ahead/7-behind main · `f02cd59e` "5-lane: Doc PDF RLS + delivery feedback + dead-write tombstone + shop-order surgical + cabinet lock" (54 files). 🔴 carries **3 migrations `0148_freight_doc_rls`/`0149_delivery_feedback`/`0150_tb_forwarder_cabinet_locked` NOT-applied-prod** (ledger confirms 0148 ⏳ → migration-prod-gate: can't push to main until applied via ภูม's `scripts/apply-0148-rls-dryrun.mjs`+`apply-migration-0150.mjs`, dry-run first) + **money-path conflict** (`forwarder-pay-modal.tsx` — ปอน's redesign now in main vs ภูม's edit). Distribute: InwPond007 FF'd ✅; Poom-pacred FF-rejected (ภูม pushed mid-round) — re-survey done, work safe on his branch. **⚠️ migration-number collision risk:** my STAGED freight-inbox/tax-invoice gap-doc says "next free 0148" — but ภูม now owns 0148-0150 → my future work starts at 0151.

**Earlier this session (all in the push above):** Owner gave the complete `olddata dev` data (cargo+freight · 3.8GB) + "ทำหมด". Ran a **5-agent customer reachability audit** + a **4-agent full-scope gap analysis**. **🟢 Headline: platform ~90% built — gaps are last-mile wiring, not from-scratch.** Full file-level roadmap per stream + gates → **[`docs/research/full-scope-gap-2026-06-08.md`](docs/research/full-scope-gap-2026-06-08.md)**.

**SHIPPED (committed local, NOT pushed):**
1. **`9b80e07e` customer reachability (§0d):** audit = surface link-clean + legacy-complete (0 404 / 0 missing legacy fn / 0 §0e dead-write / 0 money bug). All orphans traced to the DEAD `components/sections/protected-sidebar.tsx` (live customer nav = `components/legacy/pcs-left-menu.tsx` — wire new customer features THERE). Wired 5 orphans + th/en i18n: `/service-import/receipts`+`/shipments` (import accordion) · `/refunds` (cash-wallet) · `/pay` (top-level) · `/my-issues` (user-pill).
2. **`c6ce6e73` sales→CS handoff (CEO §5):** `logLeadCall('closed')` → auto-assign CS (`pickLeastLoadedCsRep`→`tb_users.adminIDCS`, only if none) + เคลียร์/แอร์ bypass checkbox. Best-effort (never fails the call log).

**🟡 STAGED (spec'd in the gap doc · NOT built):** freight **RFQ leads-inbox** (`/admin/freight/leads` — THE missing link: public `freight_quote` leads land in DB+LINE but sales can't see/triage/convert; admin `/admin/freight/quotes` reads a DIFFERENT table `freight_quotes` · highest-value freight delta · ~1 day) · **ใบกำกับ ฝากสั่ง/ฝากโอน** (🔴 money/tax-critical — shop pref is a §0e dead-write, yuan has no selector; needs migration 0148 + accounting sign-off on ใบขน VAT base + a TEST-order money-loop test → WON'T auto-ship untested) · CRM depth (tag system · activity timeline · lead-kanban) · cargo small fixes (tracking-freshness · Lalamove field · จองรถ LINE block · missing-item report). **Next free migration = 0148.**

**🔴 NEEDS OWNER:** (a) **push the 2 commits** to dave-pacred→main? (auto-deploys prod · reachability nav is customer-facing + NOT authed-verified) OR give a **test customer login** (member_code+pw) so I §0c-verify authed flows + the tax-invoice money-loop · (b) **accounting sign-off** on ใบขน VAT base · (c) carryover: Supabase refresh-token-reuse-interval · Vercel env (TAMIT-2026·Sentry client DSN·FB — เดฟ HAS `VERCEL_TOKEN` now, can set on request) · staff photos · employee_code.

---

# 📤 2026-06-07 — เดฟ: member polish + CSV-export ทั้ง platform + i18n leak-kill+guard + dashboard FOUC + full team-merge · read FIRST

**main = `dave-pacred` = `92f5f9ba`+ · pushed dave-pacred (→ main this session per owner "จบงานได้เลย") · `pnpm verify` + `pnpm build` EXIT 0 (REAL · every save-point) · migrations 0143–0147 ALL applied prod (verified live) · localhost :3000.** Owner-driven long run (many "ต่อเลย/ลุยเลย/ทำให้จบทีเดียว"). Everyone's work integrated; nothing lost. SHIPPED (each gated + pushed dave-pacred):

1. **🔀 Full team-merge** — ภูม (Poom-pacred: 13 commits CSV/report-cnt/avatar + docs) + ปอน (InwPond007: 6 commits **i18n EN sweep** + un-nest 198 namespaces). Conflicts (10 files = ปอน `t()` vs เดฟ bloat-className) **resolved keeping BOTH** (i18n content + compact className). Reviewed ภูม's merge → fixed **2 real bugs**: CSV **formula-injection** (HIGH · `=cmd` in customer name runs in Excel) + **avatar filename-vs-URL** broke /sales. Both branches now 0-behind dave-pacred.
2. **📤 CSV export — ครบทุก admin list (~72 surfaces)** — page "⬇ CSV หน้านี้" + "⬇ CSV ทั้งหมด" (drift-free export-all = page's exact filtered query unpaginated, cap 10k) + **migration 0147 `admin_export_log`** PII-export audit (applied prod). Coverage: 14 (ภูม) + 10 accounting + 11 QA + 7 freight/misc + 30 remaining. Shared `components/admin/csv-button.tsx` (formula-injection-safe + UTF-8 BOM) + `actions/admin/export/<dataset>.ts` per surface + `actions/admin/export-log.ts`. Only 3 non-lists skipped (dashboard · ad-hoc quote-tool · cargothai sync snapshot).
3. **🎨 Member content polish** — 66 pages compacted to the `/service-import/estimate` scale (owner's "กล่องไม่ยืด อยู่ในหน้าเดียว"): killed `text-4xl/5xl` · `p-8/10/12` · `shadow-lg/xl/2xl/custom` · `animate-pulse` · `rounded-3xl`. + **styled file-upload buttons** (`components/ui/styled-file-input.tsx`) replacing raw `<input type=file>` (member + 9 admin).
4. **🌐 i18n raw-key leak KILLED + GUARDED** (owner screenshot: sidebar showed `pcsAdminNav.wallet.title`) — ปอน's sweep wired `t()`/labelKey but never added entries → next-intl rendered the raw key (audit:i18n checks PARITY only, not key-existence). Fixed **61 keys**: pcsAdminNav 15 + shopOrderPayModal 14 + customerWhtUpload 24 (last 2 were DOUBLE-NESTED — un-nest pass missed them) + freightQuoteWizard 7 + notifications 1. NEW guard **`scripts/i18n-key-audit.mjs`** (wired into `audit:all`→`verify`) → 0 leaks + can't regress.
5. **🎠 Dashboard FOUC "บวม → ย่อ" FIXED** — the promo Slick carousel rendered all slides STACKED until client jQuery init collapsed them, every load. Standard Slick anti-FOUC in blocking `legacy-overrides.css` (`:not(.slick-initialized)` → show 1st slide only). Verified: pre-init 1 slide · CLS=0. Swept rest: no other jQuery-FOUC (slick=dashboard only · modals hidden · tam-counter intentional).

**🟢 STATE:** dave-pacred green · migrations all on prod · CSV/i18n/polish/FOUC done · this session pushed to **main** (owner "จบงานได้เลย"). **🔴 carryover (owner/external · unchanged):** Vercel env (TAMIT-2026 · Sentry DSN · FB tokens · **Supabase refresh-token-reuse-interval** = the random-logout durable fix) · employee_code numbers · staff photos · ใบขน VAT · freight cost-side. Learnings updated: `member-sidebar-contact-and-i18n-traps.md` · `nextjs-16-quirks.md` (Slick FOUC) · `parallel-agent-sprints.md` (workflow worktree-confusion + {schema} fragility).

---

> 📚 **June save-points (2026-06-01 → 2026-06-06) are archived** → [`docs/sprints/archive-claude-md-2026-06.md`](docs/sprints/archive-claude-md-2026-06.md) — superseded/shipped-history, moved out 2026-06-09 to keep this doc lean (§12).

---

> 📚 **Older dated save-points (2026-05-19 → 2026-05-31) are archived** → [`docs/sprints/archive-claude-md-2026-05.md`](docs/sprints/archive-claude-md-2026-05.md) — moved out of this live context doc 2026-06-05 to stay under the AGENTS.md §12 2000-line cap. They are historical session save-points (all superseded / shipped-history). The recent save-points (2026-06-01+) above + all permanent sections below remain here.

---

# 🧬 Pacred DNA (load-bearing — read once, internalise forever)

**Company:** บริษัท แพคเรด (ประเทศไทย) จำกัด · **Pacred (Thailand) Co., Ltd.** · ทะเบียน `0105564077716` · **Slogan: "เร็ว ไว ไม่มีคำว่าทำไม่ได้"** · Owner **พี่ป๊อป Visit** (second-tier: เดฟ + ก๊อต).

**Scope:** ecosystem ของ import-export-customs-cargo-logistics (เคลียร์ศุลกากร · นำเข้า-ส่งออก · ขนส่งระหว่างประเทศ + ในประเทศ · ฝากสั่งซื้อ-ฝากโอน-ฝากขาย · ใบกำกับภาษี · ใบขนสินค้า · ขอคืนภาษี · ฟูมิเกชัน · แมสเซ็นเจอร์ · "และอื่นๆ ทั้งวงการ"). Markets ลำดับ: ไทย → จีน → ญี่ปุ่น → เกาหลี → มาเล → อินโด → เมกา → อื่นๆ.

**Vision:** ทำให้ทุกคน (แม้ไม่รู้อะไรเลย) สามารถนำเข้า-ส่งออกได้ ง่ายๆแค่ปลายนิ้ว. Full-loop service ดึงลูกค้าไว้ในระบบ ไม่ปล่อย handover ที่อื่น.

**Brand-split context (DON'T preempt cleanup):** Pacred = บริษัทใหม่ กำลังแยกจาก **PCS CARGO + TTP + ไอแต้ม**. บาง API ยัง "ยืม" เจ้าเก่าใช้ — ลบ reference เหล่านี้ **หลัง** ก๊อต confirm API switchover เสร็จ (ไม่ใช่ก่อน). Tracked in [`docs/runbook/pcs-scrub-plan.md`](docs/runbook/pcs-scrub-plan.md).

📋 **Full SOT:** [`docs/pacred-info.md`](docs/pacred-info.md) — addresses, phones, emails (7 depts), LINE OA, social, sales reps, JSON-LD code consumers
🧠 **Memory:** `pacred_company_dna` + `cash_burning_p0_emergency` (load via /memories)

---

# 🧭 CURRENT DIRECTION — D1: Pacred is a faithful port of PCS Cargo (2026-05-18)

**The direction changed on 2026-05-18.** The owner (พี่ป๊อป) reviewed the rebuilt-from-scratch Pacred app and **rejected it** — neither the UI nor the workflow logic-loop matches the legacy **PCS Cargo** system that staff and **~8,898 existing customers** use every day. Rebuilding fresh would force everyone to retrain.

**New direction (decision "D1"):** Pacred **becomes the legacy PCS Cargo system, faithfully — rebranded `PCS` → `PR`.** Not a reinterpretation; a faithful port. The canonical source of truth is **[ADR-0017](docs/decisions/0017-pacred-faithful-pcs-port.md)** — read it in full before any D1 work. It supersedes the "V2 = rebuilt owner-pleaser" framing of [ADR-0010](docs/decisions/0010-v2-v3-version-strategy.md).

**⚠️ Owner mandate (2026-05-19, verbatim):** *"ต้องเอาของเดิมมา copy ให้ได้ ให้เหมือนทั้งหมด 100% ก่อน แล้วเราค่อยพัฒนาให้เหนือยิ่งกว่า"* — copy the original to **100% sameness FIRST**, then improve. The owner scolded the team on 2026-05-19 for screens still diverging from legacy PCS. Faithful first; improvements are Phase C only. Every Phase-B port runs through the `legacy-fidelity-check` skill.

**Three phases:**
- **Phase A — Data migration. ✅ DONE.** Ported the legacy `pcsc_main` (117 tables, ~8,898 customers, years of orders) into Pacred's PostgreSQL/Supabase. `PCS<n>` → `PR<n>` keeping the exact running number; custom auth so customers sign in with their existing password (no reset). *Status: Supabase **Pro upgrade done** (ก๊อต) · **all 117 tables loaded on dev + prod**, incl. the 3 log tables `tb_web_hs`/`tb_history_key`/`tb_history` backfilled post-Pro · **customer image + storage files uploaded to Supabase S3 prod** (`pcsracgo/public/member`) by ภูม 2026-05-24 · migrations `0081`-`0083`+`0087` on `main`.* Runbook: [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md).
- **Phase B — Workflow fidelity.** Rework the Pacred app — customer portal + admin back-office — so its menus, job statuses, container (ตู้) flow, and end-to-end logic-loop **match the legacy PCS system exactly**. Goal: staff + customers need *zero* retraining. *Status: **wave 1 done + integrated on `dave`** (customer 9-icon launchpad · order flow · admin per-role RBAC sidebar + badges · admin container `tb_cnt` payment ledger · legacy-auth bridge) — first-pass, not yet fidelity-verified. Waves 2+ in progress.*
- **Phase C — Pacred enhancements.** *Only after* the faithful port works, layer Pacred's own improvements on top. **Deferred — not cancelled.**

**What this means for prior work:**
- The launched rebuilt app (2026-05-17 production deploy) and its `profiles` + launch-era schema **coexist** with the ported `tb_*` schema during the transition, then retire.
- The **Tier 0/1/2/3 capability roadmap** and the **Phase-2 build queue** (booking flow · customer-intelligence · internal-chat · disbursement · china-ops · platform-observability) are **deferred to Phase C — not cancelled**, re-sequenced *after* the faithful port. [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md) is the **D1 master phase plan** (current state · stages · work-lanes); its Phase-C appendix + [`docs/research/capability-tools-strategy-2026-05-18.md`](docs/research/capability-tools-strategy-2026-05-18.md) describe that deferred work.
- In-flight pre-D1 feature work (e.g. BK-1 booking flow, freight V-E1.1) **pauses**; the team pivots to Phase A/B.

**Decision lens (every task):** does this make the port **more faithful to PCS Cargo** — closer to *zero retraining* for staff and customers? Prefer work that moves Phase A (data migration) or Phase B (workflow fidelity) forward. De-prioritise anything that extends the rejected rebuild or belongs to the deferred Phase-C enhancements.

**Anti-patterns (under D1):**
- Extending the rejected rebuilt app or building Phase-C enhancements before the faithful port works
- Reinterpreting / "improving" the PCS workflow during Phase B — fidelity first; enhancements are Phase C
- V3 architecture redesign in this repo (V3 = `pacred-DPX`, separate repo — append ideas to `docs/v3-wishlist.md`)
- Shipping a stage before the quality gate is green (`pnpm verify` + build smoke + a functional pass)
- Scrub PCS/TTP/ไอแต้ม **before** ก๊อต API switchover (would break the revenue path)

---

# 🛑 STOP — Read your role brief FIRST (force-read every Claude Code session)

ทุก dev ใช้ Claude Code ทำงาน async บน worktree ของตัวเอง. ก่อนแตะ code หรือตอบคำถาม — **เปิด brief ของคุณก่อน**:

| ถ้าคุณคือ… | เปิดไฟล์นี้ก่อนทุกอย่าง | คุณจะรู้ทันที |
|---|---|---|
| **ก๊อต** (Senior Advisor / Production Watcher) | [`docs/briefs/got.md`](docs/briefs/got.md) | P0/P1, ADRs ที่ต้อง lock, partner/tools picks |
| **เดฟ** (Project Lead / Integrator) | [`docs/briefs/dave.md`](docs/briefs/dave.md) | landing pivot, backend prep for ภูม, hardening |
| **ภูม** (Backend / Customer Portal / Admin) | [`docs/briefs/poom.md`](docs/briefs/poom.md) | container model, tax invoice, admin workflows |
| **ปอน** (Frontend / Landing / SEO / Marketing) | [`docs/briefs/podeng.md`](docs/briefs/podeng.md) | owner critiques, L-5 polish, SEO research |

📂 [`docs/briefs/INDEX.md`](docs/briefs/INDEX.md) — routing map + onboarding flow + brief shape
📋 [`docs/briefs/ops-roles.md`](docs/briefs/ops-roles.md) — 14 STAFF role workspaces (admin UI / RBAC system design)

**Why force-read?** แต่ละ brief สรุปว่า:
- คุณ own อะไร / ห้ามแตะอะไร (scope boundaries)
- งานต่อไปลำดับไหน (priority list — ไม่ต้อง re-derive จาก PORT_PLAN ทุกครั้ง)
- ติดอะไรอยู่ → ทำอะไรแทน (blockers + alternatives)
- Hand-off เข้า/ออก คุยกับใคร

อ่าน brief ก่อน → conversation รอบนี้ตรงเป้าตั้งแต่ tool call แรก. ข้าม brief = หลงเดิน.

---

# 👉 START HERE — ทีมงานทุกคน อ่านก่อนเริ่ม

📘 **[`docs/HANDBOOK.md`](docs/HANDBOOK.md)** = entry point — มี documentation map + quick start

**Canonical docs (อ่านครั้งเดียว ใช้ตลอด):**
- 👥 [`docs/team.md`](docs/team.md) — roles + permissions + branch + merge policy + daily workflow + §3.0 push-frequency cost rule (STRICTER — save-points only) + §6 self-directed mode + §9 Claude Code async collab
- 📐 [`docs/conventions.md`](docs/conventions.md) — code style + commit format + naming + DB rules + §13 docs rules (every .md ≤ 2000 lines · no duplication) + §14 pre-deploy smoke gate
- 🔐 [`docs/env.md`](docs/env.md) — every env var explained + production checklist (incl. §19 MOMO JMF)
- 🏢 [`docs/pacred-info.md`](docs/pacred-info.md) — company info SOT (addresses + phones + emails + LINE OA + sales reps)

**Role briefs (force-read — see top of file):**
- 🧑‍💻 [`docs/briefs/INDEX.md`](docs/briefs/INDEX.md) — routing map for which brief is yours
- [`docs/briefs/got.md`](docs/briefs/got.md) · [`docs/briefs/dave.md`](docs/briefs/dave.md) · [`docs/briefs/poom.md`](docs/briefs/poom.md) · [`docs/briefs/podeng.md`](docs/briefs/podeng.md)
- 👷 [`docs/briefs/ops-roles.md`](docs/briefs/ops-roles.md) — 14 STAFF role workspaces (system design input)

**🎯 Master strategy (single-read consolidation — all briefs + ADRs + plans condensed):**
- [`docs/STRATEGY.md`](docs/STRATEGY.md) — read once per session, refer back as needed

**🛠 Skills kit (playbooks the agent follows when triggered):**
- [`.claude/skills/INDEX.md`](.claude/skills/INDEX.md) — 16 skills: phase-verify-loop · bug-swarm-loop · debug-mantra · management-talk · audit-kpi-dashboard · test-coverage-writer · refactor-readability · performance-hunter · scholar-immortal · copyist-unlimited · legacy-php-sweep · qa-flow-simulator · branch-integrate-loop · mobile-first-verify · legacy-fidelity-check · landing-conversion-audit

**📚 Learnings (compounding knowledge — read before re-debugging):**
- [`docs/learnings/_index.md`](docs/learnings/_index.md) — every agent / dev adds new entries via `scholar-immortal` skill

**Living docs (เดฟ updates):**
- 🧭 [`docs/decisions/0017-pacred-faithful-pcs-port.md`](docs/decisions/0017-pacred-faithful-pcs-port.md) — **THE current direction (D1)** — faithful PCS Cargo port, Phase A/B/C. Start here for "what's next".
- 🚀 [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md) — **the D1 master phase plan** — current state + the stages (A-final → B-0 → B-waves → C) + the work-lanes. The canonical "what's next" sequencing doc; deferred Phase-C/Tier detail kept as a labelled appendix.
- 🚚 [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md) — **Phase A runbook ✅ DONE** — the `pcsc_main` (117 tables) → Supabase data migration; all 117 tables loaded on dev + prod (incl. 3 log tables backfilled post-Pro), customer images on S3 prod.
- 📋 [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) — sprint history + cargo/gap-hunt backlogs (Parts O–W; Part V = cargo-forensics, Part W = gap-hunt; ~1825 lines — watch the 2000-line cap)
- 📚 [`docs/sprints/archive-a-to-n.md`](docs/sprints/archive-a-to-n.md) — historic survey (Parts A–N — moved out to keep PORT_PLAN under 2000-line agent ceiling)
- 🏗 [`docs/architecture.md`](docs/architecture.md) — system diagrams + DB schema + auth + security
- 🏗 [`docs/architecture/container-centric-model.md`](docs/architecture/container-centric-model.md) — **NEW** warehouse/container/shipment spine (4 tables, RLS, status enums, CT-1..CT-8 implementation)
- 🤝 [`docs/integrations/momo-jmf.md`](docs/integrations/momo-jmf.md) — MOMO partner API spec (JWT, endpoint inventory TBD)
- 🧠 [`docs/PACRED-SECOND-BRAIN.md`](docs/PACRED-SECOND-BRAIN.md) — context notes + gotchas

**Reference (open เมื่อจำเป็น):**
- [`AGENTS.md`](AGENTS.md) — Next 16 breaking changes (สำหรับ Claude/AI)
- [`docs/decisions/*.md`](docs/decisions/) — ADRs (incl. 0010 V2/V3 version strategy, 0006 tax invoice, 0007 analytics, 0014 state transitions, 0015 withholding tax, 0016 freight value model)
- [`docs/audit/chat-analysis-2026-05-16.md`](docs/audit/chat-analysis-2026-05-16.md) — **NEW** LINE chat audit (จุดรั่ว + MOMO status enum canonical + workflows team really uses)
- [`docs/audit/legacy-cleanup-2026-05-16.md`](docs/audit/legacy-cleanup-2026-05-16.md) — **NEW** PHP cleanup sweep (~115 dead-code files + 6 NEW critical security findings + 5 minor port gaps)
- [`docs/audit/cargo-ops-forensics-2026-05-16.md`](docs/audit/cargo-ops-forensics-2026-05-16.md) — **NEW** decoded cargo/freight ops model (GZE truck / GZS sea · A/M/X/O/Z types · Form E / D-O / invoice-value engineering) + ไอแต้ม-chat problem catalog → PORT_PLAN Part V
- 🆕 [`docs/research/capability-tools-strategy-2026-05-18.md`](docs/research/capability-tools-strategy-2026-05-18.md) — capability synthesis (growth / operating-system / build-vs-buy) → the Tier 0/1/2/3 roadmap. **Deferred to Phase C by D1** ([ADR-0017](docs/decisions/0017-pacred-faithful-pcs-port.md)) — not the current "what's next".
- 🆕 [`docs/research/PACRED-MASTER-STRATEGY.md`](docs/research/PACRED-MASTER-STRATEGY.md) — **chained gap-hunt synthesis** — rolls the 5 source-code gap docs ([`docs/research/`](docs/research/_index.md)) into 4 problems: a 🔴 P0 security keystone (`driver`/`warehouse` RLS reach all money tables — fix launch-week), the 🔴 wallet-leak chain, the "islands with no bridges" flow-wiring workstream, and **[PORT_PLAN Part W](docs/PORT_PLAN.md)** backlog
- [`docs/audit/owasp-2026-05.md`](docs/audit/owasp-2026-05.md) — pre-launch security posture (note: superseded on RLS-vs-role-model by the master strategy §1)
- [`docs/audit/php-pcscargo-integrations.md`](docs/audit/php-pcscargo-integrations.md) — deep legacy PHP integrations audit (companion to legacy-cleanup-2026-05-16)
- [`docs/runbook/*.md`](docs/runbook/) — operational runbooks (PCS scrub + OTP rotation + cron + cargo smoke test T-D1)
- [`docs/setup/*.md`](docs/setup/) — onboarding guides (OAuth/Supabase/Vercel/LINE)
- [`supabase/migrations/README.md`](supabase/migrations/README.md) — migration runbook

**ทำงานครั้งแรก:**
1. **เปิด YOUR brief จาก [`docs/briefs/`](docs/briefs/)** ก่อนทุกอย่าง (force-read — see top of file)
2. อ่าน [`docs/HANDBOOK.md`](docs/HANDBOOK.md) → [`docs/team.md`](docs/team.md) → [`docs/conventions.md`](docs/conventions.md)
3. `cp .env.example .env.local` + fill values (ถามเดฟ) — รายละเอียดทุก var ใน [`docs/env.md`](docs/env.md)
4. รัน migration ที่ยังไม่ได้รัน — ดู [`supabase/migrations/README.md`](supabase/migrations/README.md)
5. หางานของตัวเอง: brief ของคุณ + [`docs/decisions/0017-pacred-faithful-pcs-port.md`](docs/decisions/0017-pacred-faithful-pcs-port.md) §"Work-split" (current per-role D1 work)
6. Sync branch ตามวิธีใน [`docs/team.md`](docs/team.md) §3 (น้อง pull จาก `dave` ไม่ใช่ `main`!) + §3.0 push-frequency rule (save-points only — sleep / machine change / location change / big batch done; per memory `push_frequency_strict`)

---

# Project Snapshot — pacred-web

Last updated: 2026-05-19 (D1 — Phase A data loaded to dev + prod · Phase B wave-1 integrated — see [ADR-0017](docs/decisions/0017-pacred-faithful-pcs-port.md) + [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md))

> **Pacred** — ระบบเว็บไซต์บริษัทนำเข้า-ส่งออก / ชิปปิ้ง / เคลียร์ศุลกากร / ฝากสั่งซื้อสินค้าจากจีน
> Marketing site + landing pages + customer member portal + admin back-office. The rebuilt app launched 2026-05-17, but on **2026-05-18 the owner redirected the project (D1)** — Pacred is now a **faithful port of the legacy PCS Cargo system** (`PCS` → `PR`). Current work: **Phase A ✅ DONE** (legacy `pcsc_main` fully loaded to prod Supabase — all 117 tables incl. 3 log tables backfilled post-Pro · customer images on S3 prod) → **Phase B in progress** (workflow fidelity — wave 1 integrated on `dave-pacred`, 1:1 transcription continues on customer + admin lanes — wave-17+ work also accumulating on `Poom-pacred` for V3 features). See the "CURRENT DIRECTION — D1" section at the top of this file + [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md) for the full phase plan.

> 🎯 **Live state** — ดูที่ [`docs/STRATEGY.md`](docs/STRATEGY.md) §9 (shipped vs pending — updated each save-point). The "Auth & Backend State" section below and STRATEGY.md §9 describe the **rebuilt** app — that work is preserved + coexists with the ported `tb_*` schema during the D1 transition, but the rebuilt schema/workflow is no longer the target; the legacy PCS workflow is. Phase B reworks the app to match it.

## Stack
- Next.js **16.2.6** (App Router) — **โปรดอ่าน AGENTS.md: เวอร์ชันนี้มี breaking changes จาก training data**
- React 19.2.4
- TypeScript 5 (strict)
- Tailwind CSS v4 (`@theme inline` ใน [app/globals.css](app/globals.css) — ไม่มี tailwind.config.js)
- ESLint 9 (flat config, eslint-config-next)
- **next-intl** ^4.11.1 — i18n (th/en) แบบ namespace ใน [messages/](messages/)
- **lucide-react** ^1.14.0 — icons (Lucide outline-style ทั้งโปรเจกต์)
- Package manager: **pnpm**

> หมายเหตุ: middleware อยู่ที่ [proxy.ts](proxy.ts) (ไม่ใช่ `middleware.ts` — เป็นรูปแบบของ Next 16)

## Scripts
- `pnpm dev` / `pnpm build` / `pnpm start` / `pnpm lint`

## Conventions

📐 Full convention rules → [`docs/conventions.md`](docs/conventions.md) (CANONICAL — code style + commit format + naming + DB rules + §13 docs rules ≤2000 lines · no duplication + §14 pre-deploy smoke gate).

**Hot tips you'll trip on:**
- Path alias `@/*` → `./*`; locale prefix `as-needed`; default locale TH; `Link` from `@/i18n/navigation` (NOT `next/link`)
- Tailwind v4 → `@theme inline` in [`app/globals.css`](app/globals.css) (no `tailwind.config.js`); brand red = `primary-600` (#B30000)
- Component split: section-level → [`components/sections/`](components/sections/); reusable UI → [`components/ui/`](components/ui/); default Server Component unless state needed
- i18n: TH+EN parity in [`messages/th.json`](messages/th.json) + [`messages/en.json`](messages/en.json); `pnpm audit:i18n` enforces

## Folder Structure

📁 **Live tree** is the authoritative source — `ls app/[locale]/` to see actual routes. High-level shape:

- `app/[locale]/(public)/` — marketing site + landing pages (no auth)
- `app/[locale]/(auth)/` — login/register/forgot — guests only; auto-redirect signed-in to `/`
- `app/[locale]/(protected)/` — customer portal (dashboard / orders / wallet / shipments / etc.) — `requireAuth()` gate
- `app/[locale]/(admin)/admin/*` — admin back-office — `requireAdmin()` gate per [ADR-0002](docs/decisions/0002-admin-architecture.md)
- `actions/` — Server Actions (`actions/auth.ts`, `actions/wallet.ts`, etc.); admin variants in `actions/admin/*`
- `lib/` — `supabase/{client,server,admin}.ts` · `auth/*` · `sms/gateway.ts` · `notifications/*` · `validators/*` (Zod) · `pdf/*` · `forwarder/calc-price.ts`
- `supabase/migrations/` — 0001..0087 numbered migrations (`0065` is an intentional unused gap; `0081`-`0083` = the D1 legacy `tb_*` schema/indexes/member-seq, applied to dev + prod; `0087` = a migration-view security fix — see [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md) §9; next free number `0088`); see [`supabase/migrations/README.md`](supabase/migrations/README.md)
- `proxy.ts` (NOT `middleware.ts` — Next 16 rename) at repo root

## Auth & Backend State (rebuilt app — coexists during the D1 transition)

> ⚠️ **D1 note:** this section describes the **rebuilt** app's auth/backend (Phase 1-5 pre-D1). Under D1 it **coexists** with the ported legacy `tb_*` schema and the legacy-auth bridge (`lib/auth/pcs-legacy-bridge.ts` — migrated PCS customers sign in with their existing password, no reset) during the transition, then retires. Phase-B work reworks these surfaces onto the `tb_*` schema.

### What works
- **Supabase Auth** — email/phone + password. Social login (Google/Facebook OAuth + LINE) is gated OFF by default behind `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED` → the buttons render greyed-out "COMING SOON" (legacy PCS was password-only; D1 defers social login to Phase C)
- **Legacy-auth bridge** — `lib/auth/pcs-legacy-password.ts` + `pcs-legacy-bridge.ts` — migrated PCS customers sign in with their **existing** PCS password (no reset) via a "เชื่อมต่อบัญชี PCS CARGO" login; the 79-char legacy hash is verified against the ported `tb_users.userpass`
- **DB** — profiles (auto-gen `PR001` member_code — PR + min-3-digit running no.), documents, otp_codes, orders
- **Storage** — `member-docs/` private bucket, RLS = owner-only
- **OTP** — custom via ThaiBulkSMS, hashed (sha256+pepper), TTL 5min, rate-limited 3/hour
  - **`OTP_BYPASS=true`** in dev → skip SMS + accept any code
- **Sessions** — `proxy.ts` middleware refreshes tokens; cookies set by `@supabase/ssr`
- **Route guards** — `(auth)` redirects logged-in users; `(protected)` redirects guests + incomplete profiles
- **NavBar** — auto-aware: shows login/register buttons OR user menu (avatar + dropdown) based on session

### Pages live + current state

📊 **Live state snapshot** is in [`docs/STRATEGY.md`](docs/STRATEGY.md) §9 (shipped vs pending — updated each save-point). The lists below were Phase 1-5 historic — **current state lives in STRATEGY.md §9, not here**.

Shipped + in production: customer portal (`/service-order` · `/service-import` · `/service-payment` · `/wallet` +deposit/+history/+withdraw · `/refunds` · `/sales` · `/notifications` · `/shipments` +[code]) · `/admin/*` (60+ routes incl. accounting/container-costs · disbursements · refunds · migration/pcs-customers · search · system/crons · system/notifications) · tax-invoice flow · pay-from-wallet self-serve · customer credit line · staff RBAC console. **Post-launch U1/U2/U4 + Tier 0/1/2 features shipped on `dave`** — incl. `/contact` lead funnel · `/start-order` + `QuoteCTA` buy-bridge · `/admin/kpi` exec dashboard · `/admin/board` + `/admin/inbox` work-board. See STRATEGY.md §9 + [`docs/research/capability-tools-strategy-2026-05-18.md`](docs/research/capability-tools-strategy-2026-05-18.md).

## Architecture & Roadmap

📐 **Blueprint:** [`docs/architecture.md`](docs/architecture.md) — full diagrams, DB schema, auth flows, security model.

🎯 **Master strategy (single-read consolidation):** [`docs/STRATEGY.md`](docs/STRATEGY.md) — read once per session.

📋 **Locked decisions (ADRs):** [`docs/decisions/`](docs/decisions/) — 17 ADRs + drafts. The high-leverage ones:
- **ADR-0017 — D1: Pacred = faithful PCS Cargo port** (the current direction — supersedes the "V2 = rebuilt owner-pleaser" framing of ADR-0010)
- ADR-0001 LINE Notify → Messaging API push (creds set; LIFF pending DV-2)
- ADR-0002 admin architecture (`is_admin()` SECURITY DEFINER + `admins` table)
- ADR-0003 China-search Option E (Track G code, prod=demo mode)
- ADR-0004 PromptPay-only pre-beta; Omise/2C2P/Stripe = post-beta ([decision matrix](docs/decisions/d7-payment-gateway-decision-matrix.md) ready)
- ADR-0006 tax invoice (RD Code 86)
- ADR-0007 GTM + Clarity + cookie A/B
- ADR-0010 V2 vs V3 (`pacred-dpx`) — note: the "V2 = rebuilt owner-pleaser" definition is superseded by ADR-0017 (V2 is now the faithful PCS port); V3 unaffected
- ADR-0014 customer self-service state transitions (admin-client-after-ownership-verify)
- ADR-0015/0016 ✅ Accepted 2026-05-16 (WHT model + freight value model)
- ADR-0011/0012/0013 (DRAFT — V3 RBAC granular + ERP shell + V2→V3 migration; deferred T+30d)

🌱 **Infra stack:** Vercel + Supabase Cloud · `proxy.ts` middleware · ThaiBulkSMS OTP (`OTP_BYPASS` flag) · `member_code` = `PR001` running — **PR + minimum 3 digits**, overflow-safe past PR999 (Postgres trigger `generate_member_code`, migration `0060`; **NO compat with PHP `PCS<num>`** — Pacred is new company).

---

# 🌐 Pacred Ecosystem (brand + service catalogue)

> **Pacred** = บริษัทใหม่ (ไม่ใช่ PCS Cargo เดิม) — เป็น **all-in-one shipping/customs/cargo platform** ที่กินรวบทุกบริการในห่วงโซ่นำเข้า-ส่งออก
>
> ระบบ PHP เก่าครอบคลุมเฉพาะฝั่ง **Cargo** (จีน-ไทย ฝากสั่ง/ฝากนำเข้า/ฝากโอน) เท่านั้น — Pacred ขยายไปฝั่ง **Freight** (FCL/LCL ระหว่างประเทศ + customs/clearance/export) ครบทั้ง ecosystem

## Brand & social channels
- **Company:** Pacred
- **LINE OA:** https://lin.ee/Yg3fU0I  *(แทน LINE Notify เดิม — LINE Notify EOL Apr 2025)*
- **YouTube:** https://www.youtube.com/@PacredShipping
- **Facebook:** https://www.facebook.com/PacredShippingCustomsClearanceImportExport/
- **TikTok:** https://www.tiktok.com/@pacred.co
- **Instagram:** https://www.instagram.com/pacred.co/

## Service catalogue

แต่ละบริการมี **landing page ของตัวเอง** ที่ `/services/<slug>` (public, ไม่ต้อง login) — กดจาก landing เพื่อ "ใช้บริการ" → redirect เข้าระบบหลังบ้าน (`/(protected)/...`) ที่ตรงกับ service นั้น

| # | Service (TH) | slug | กลุ่ม | สถานะ in PHP เดิม | Backend module (Next.js) |
|---|---|---|---|---|---|
| 1 | จับคู่ลงทะเบียนกรมศุล / ตัวแทนออกของ (YY) | `customs-broker-matching` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 2 | ฝากสั่งซื้อสินค้า (China shopping cart) | `shop-order` | cargo | ✅ shops.php / cart.php | `(protected)/service-order/` |
| 3 | ฝากโอนชำระสินค้า (Yuan transfer / Alipay) | `yuan-transfer` | cargo | ✅ payment.php | `(protected)/service-payment/` |
| 4 | ฝากนำเข้าสินค้า — **FCL / LCL ทุกเทอม** (รถ/เรือ/แอร์) + **Cargo** (รถ/เรือ/แอร์) | `import` | both | 🟡 เฉพาะ cargo (forwarder.php) | `(protected)/service-import/` (รองรับ multi-mode) |
| 5 | ขอคืนภาษี (Tax refund) | `tax-refund` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 6 | เคลียร์สินค้าติดด่าน (รถ/เรือ/แอร์) | `customs-clearance` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 7 | ออกใบกำกับภาษี (Tax invoice) | `tax-invoice` | freight | partial (admin only ใน PHP) | TBD (ต่อยอดจาก receipts) |
| 8 | ออกใบขนสินค้า (Customs declaration form) | `shipping-document` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 9 | ส่งออกสินค้า (Export) | `export` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 10 | บริการฟูมิเกชัน (Fumigation) | `fumigation` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 11 | บริการฝากขายสินค้า (Consignment) | `consignment` | new | ❌ ใหม่ทั้งหมด | TBD |
| 12 | บริการฝากจ่ายบริการ (Pay-on-behalf services) | `bill-payment` | new | ❌ ใหม่ทั้งหมด | TBD |
| 13 | ขนส่งภายในประเทศ + ต่างประเทศ + แมสเซ็นเจอร์ (Logistics + Messenger) | `logistics` | both | ❌ ใหม่ทั้งหมด | TBD |

**กลุ่ม:**
- 🟦 **cargo** = ระบบเดิมจาก PHP `pcs-cargo` (จีน→ไทย, ฝากสั่ง/นำเข้า/โอน)
- 🟧 **freight** = ส่วนขยายใหม่ของ Pacred (international FCL/LCL, customs broker, export)
- 🟪 **both** = บริการที่ครอบคลุมทั้งสองฝั่ง
- ⬜ **new** = ฟีเจอร์ใหม่ที่ไม่เคยมีในเครือเดิม

## Routing convention (planned)

```
app/[locale]/(public)/
├─ page.tsx                       # home (มีแล้ว)
└─ services/
   ├─ page.tsx                    # ภาพรวมทุกบริการ (service grid)
   └─ [slug]/page.tsx             # landing แต่ละบริการ (dynamic, content จาก CMS หรือ MDX)

app/[locale]/(protected)/         # หลังบ้าน (ลูกค้า)
├─ service-order/                 # = slug shop-order
├─ service-payment/               # = slug yuan-transfer
├─ service-import/                # = slug import (รองรับ FCL/LCL/Cargo modes)
└─ ... (modules ใหม่ตาม service catalogue)
```

**หมายเหตุ:** อาจใช้ MDX-per-service หรือ Sanity/Payload CMS ถ้า marketing ต้องแก้ landing บ่อย — ตัดสินใจตอนเริ่ม Phase H (rebrand)

---

# 👥 Team & Branch workflow

> ⚠️ **CANONICAL doc moved to [`docs/team.md`](docs/team.md)** — full role/branch/merge policy + daily workflow + safety rules
> ห้าม duplicate รายละเอียดที่นี่ — อ่านที่ `docs/team.md` ครั้งเดียว ที่เดียว

**TL;DR — four contributors; the owner sets direction but does not commit code:**

| คน | บทบาท | Branch | Release to main |
|---|---|---|---|
| **เดฟ** (dave) | Project Lead / Integrator (works on the owner's behalf) | `dave-pacred` (the integration trunk) | ✅ release gate, on owner's go |
| **ภูม** (Poom) | Backend / Admin / Accounting | `Poom-pacred` | ❌ own branch → เดฟ integrates |
| **ปอน** (podeng) | Frontend / UI / SEO | `InwPond007` | ❌ own branch → เดฟ integrates |
| **ก๊อต** (got) | Senior Advisor / Production Watcher | `main` review + assigned | ✅ release gate with เดฟ |

`dave-pacred` is the one integration branch; ภูม + ปอน push their own branch and เดฟ merges both in, gates, and (on the owner's go) promotes to `main`. The owner is the CEO — not a code contributor; เดฟ is his counterpart on the codebase. Full model in [`docs/team.md`](docs/team.md) §0.

**Daily sync (every morning):**
```bash
git fetch origin && git merge origin/dave-pacred   # everyone bases on dave-pacred (the trunk)
```

**Conflict / safety:** อย่าใช้ `--force` / `reset --hard` ถ้าไม่แน่ใจ — full safety rules ใน [`docs/team.md`](docs/team.md) §5

---

## Working with this codebase

### Add a section to home
- New component in [components/sections/](components/sections/)
- Import in [app/[locale]/(public)/page.tsx](app/[locale]/(public)/page.tsx)

### Add a new feature/system (pattern)
1. SQL: add table + RLS in `supabase/migrations/NNNN_<name>.sql`
2. Validator: Zod schema in `lib/validators/<name>.ts`
3. Server Action: mutations in `actions/<name>.ts` (`"use server"`)
4. Pages: under `app/[locale]/(protected)/<name>/` (auth-guarded)
5. i18n: add keys in [messages/th.json](messages/th.json) + [messages/en.json](messages/en.json) namespace
6. (optional) Realtime: subscribe via `supabase.channel(...)` in `"use client"` component

→ See [lib/validators/refund.ts](lib/validators/refund.ts) + [actions/refunds.ts](actions/refunds.ts) + [app/[locale]/(protected)/refunds/](app/[locale]/(protected)/refunds/) as a working reference (the pre-D1 `/orders` demo this used to point at was deleted 2026-06-10)

### Common edits
- Locale string → both `messages/th.json` + `messages/en.json`
- Theme color → `@theme inline` in [app/globals.css](app/globals.css)
- Auth check on a page → `await requireAuth()` from `lib/auth/require-auth.ts`
- Get current user → `await getCurrentUserWithProfile()` from `lib/auth/get-user.ts`
- Mutate Supabase from Server Action → `await createClient()` from `lib/supabase/server.ts`
- Bypass RLS (admin only) → `createAdminClient()` from `lib/supabase/admin.ts`

---

# 📋 Legacy PHP Port Plan (in progress)

> **Goal:** Port ทั้งระบบ PHP เดิม (`/Users/dev/Desktop/pcscargo/member/` บน Mac · `C:\xampp\htdocs\pcscargo\member\` บน Windows) มาเป็น Next.js + Supabase
> **Strategy:** เอา **logic + structure** มาก่อน ไม่ต้อง migrate data → ค่อย rebrand UI/UX + จัดกลุ่มใหม่ในเฟสถัดไป
> **Order:** ฝั่งลูกค้าก่อน (member portal) → ฝั่ง admin (back office)
>
> ⚠️ **Scope reminder:** PHP เดิมครอบทั้ง **cargo** (services #2, #3, #4-cargo-mode) **+ freight** (ใน `pcs-admin/include/pages/{home/Freight, home/CargoAndFreight, hs-forwarder-invoice, forwarder-quotation, withdraw-commission-*}`) — services อื่น (`#1, #5-13`) ต้อง **build ใหม่ทั้งหมด** ในเฟสถัดไป (Phase I+)
>
> 🆕 **AUTHORITATIVE gap status (2026-05-16 night):** [`docs/audit/php-deep-sweep-2026-05-16.md`](docs/audit/php-deep-sweep-2026-05-16.md) — เดฟ-led 4-agent deep-sweep against 20,331 .php files + verification pass. Found **17 NEW DB tables** + **12 freight subdirs** + **24 admin polish items** that the prior `legacy-cleanup-2026-05-16` audit §6 missed. The deep-sweep audit replaces §6 "should-port" assessment; tables below remain useful as **customer-side / admin-side historical reference** but for current Sunday-night blockers + V2 long-phase backlog **read the deep-sweep doc + [PORT_PLAN Part V](docs/PORT_PLAN.md) V-E6..V-E12 / V-G / V-H**.

## Survey snapshot (สำรวจแล้ว 2026-05-12; updated 2026-05-16 deep-sweep)

- **PHP source:** `/Users/dev/Desktop/pcscargo/member/` (Mac) · `C:\xampp\htdocs\pcscargo\member\` (Windows) — 20,331 .php files / 2.2 GB
- **DB:** MySQL `pcsc_main` (110+ tables; full schema in legacy SQL dumps)
- **member_code เดิม:** `PCS<int>` (PHP) — **ทิ้งไม่ใช้**; Pacred ใช้ `PR001` running (PR + ขั้นต่ำ 3 หลัก)
- **Stack PHP:** mysqli plain SQL, mPDF (THSarabunNew), PHPMailer, Bootstrap 4

## Customer-side / Admin-side feature maps + migration concerns + integrations

**Authoritative live docs (read these, not duplicates below):**

| What you need | Where it lives |
|---|---|
| Per-feature port status + tasks | [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) Parts O-V (most active) + archive Parts A-N |
| Master gap audit (20k file sweep) | [`docs/audit/php-deep-sweep-2026-05-16.md`](docs/audit/php-deep-sweep-2026-05-16.md) |
| Deep integrations + secrets inventory | [`docs/audit/php-pcscargo-integrations.md`](docs/audit/php-pcscargo-integrations.md) (TAMIT, JMF, LINE Notify, SMS, OAuth, mPDF) |
| Dead-code + security findings (S-1..S-6) | [`docs/audit/legacy-cleanup-2026-05-16.md`](docs/audit/legacy-cleanup-2026-05-16.md) §1-5 (§6 superseded by deep-sweep) |
| Cargo ops decoded (GZE/GZS / A-M-X-O-Z / Form E / D-O / "แผน VAT") | [`docs/audit/cargo-ops-forensics-2026-05-16.md`](docs/audit/cargo-ops-forensics-2026-05-16.md) |
| Chat-derived workflows (W-1..W-9) + leak holes (L-1..L-10) | [`docs/audit/chat-analysis-2026-05-16.md`](docs/audit/chat-analysis-2026-05-16.md) |
| Cutover dependency burn-down (F1-1..F1-8) | [`docs/runbook/legacy-cutover-tracker.md`](docs/runbook/legacy-cutover-tracker.md) |
| Per-task implementation specs (V-D / V-E / V-G / etc.) | [`docs/port-specs/`](docs/port-specs/) — 10 spec docs |
| Per-task ADR decisions | [`docs/decisions/`](docs/decisions/) — 16 ADRs + 5 plans/matrices |

## Phased roadmap

> **Historic Phase A-I list moved to:** [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) Parts O-V (live) + [`docs/sprints/archive-a-to-n.md`](docs/sprints/archive-a-to-n.md) (Phase A-N historic).
>
> **Current state (2026-05-16):** Phase A-F ✅ shipped · Phase G admin back-office ~98% HR + ~50% ops + 60+ routes shipped · Phase H polish ongoing · Phase I expansion = V2 long-phase post-Monday-launch ([port-specs/](docs/port-specs/) for V-E6..V-E12 freight stack + V-G admin polish).

## Key references (อย่าลืม consult)

- **PHP source:** `/Users/dev/Desktop/pcscargo/` (Mac) · `C:\xampp\htdocs\pcscargo\` (Windows)
- **Admin source:** `<root>/member/pcs-admin/` (187 entry .php + 85 business-logic subdirs under `include/pages/`)
- **Helper catalogue:** `<root>/member/include/function.php` (2451 LOC) + `<root>/member/pcs-admin/include/function.php` (3500 LOC)
- **Schema dump:** legacy SQL dumps (see `docs/audit/legacy-cleanup-2026-05-16.md` §7)
- **Use legacy-php-sweep skill** (`.claude/skills/legacy-php-sweep/SKILL.md`) when porting any feature
