# 🔬 PHP Deep-Sweep — V2 launch readiness audit (2026-05-16)

> **Status:** Master gap audit. **Supersedes** [`legacy-cleanup-2026-05-16.md`](legacy-cleanup-2026-05-16.md) §6 "should-port" list. Complements (does not replace) [`php-pcscargo-integrations.md`](php-pcscargo-integrations.md) (integrations) + [`chat-analysis-2026-05-16.md`](chat-analysis-2026-05-16.md) (workflows) + [`cargo-ops-forensics-2026-05-16.md`](cargo-ops-forensics-2026-05-16.md) (cargo/freight ops model).
> **Deadline context:** Sunday 2026-05-17 night BKK GMT+7 = V2 cargo-loop final delivery · Monday 2026-05-18 = launch (รับลูกค้าจริง).
> **Author:** เดฟ (via Claude). **Methodology:** 4 parallel deep-sweep agents (customer / admin-non-freight / freight / api+integrations) over the real PHP source at `/Users/dev/Desktop/pcscargo` (20,331 .php files / 2.2 GB), plus verification pass against Pacred state to filter false alarms.

---

## 0. Why this re-audit was needed

Prior audit [`legacy-cleanup-2026-05-16.md`](legacy-cleanup-2026-05-16.md) §6 concluded "port functionally complete, 5 should-port items, 0 critical." เดฟ noticed Pacred's freight side had never been spec'd in detail, asked for a complete re-sweep.

**This sweep found:**
- **17 PHP database tables** the previous audits never enumerated (mostly freight + quotation + commission + receipt tables)
- **~12 distinct freight subdirs** under `pcs-admin/include/pages/{home/Freight, home/CargoAndFreight, hs-forwarder-invoice}` that prior audits never explored beyond `ls`
- **~24 admin features** the audit only counted at the top-level entry-page level, missing per-subdir business logic
- **3 NEW integration endpoints** + **1 privacy issue** (`/m` SMS tracker logs PII) not in `php-pcscargo-integrations.md`
- **Confirmation** that the customer-side cargo loop is now ~95% V1-complete (V-A1, V-B1, V-C2/3, V-D1/2/3, T-P1/3/4/5, payment loop) — most "gaps" in the agent reports were false alarms against shipped night-1..4 batches

---

## 1. TL;DR — what V2 needs vs what V2 already has

```
Cargo loop V1 (Monday launch):       95% ✅ shipped · 5% small gaps
Freight side (V2 long-phase):        ~5% ✅ (landing pages only) · 95% NET-NEW build
Admin polish + ops (V2):             80% ✅ shipped · 20% bulk/QC/quotation gaps
Owner-facing features (V2 long):     N/A — depends on พี่ป๊อป requests
```

**True Sunday-night blockers:** 5 items (§3) — all in เดฟ + ก๊อต hands, no ภูม backend blocker.
**Phase I2 freight backlog:** 12 new V-E* / V-G* / V-H* tasks (§5) — ~150-200h.
**Phase I3 admin polish backlog:** ~24 items (§6) — ~80-120h.
**Intentionally not ported:** ~40 items (§7) — locked by ADRs or dead code.

---

## 2. Methodology + caveats

**4 agents swept these PHP scopes (in parallel):**
1. Customer-side: `member/*.php` + `member/include/pages/` + `member/api/`
2. Admin-side (excl. freight): `member/pcs-admin/*.php` + `member/pcs-admin/include/pages/` (~75 subdirs)
3. Freight + invoice + quotation + closing + interpreter: the 12 subdirs not covered elsewhere
4. APIs + cron + integrations + secrets: every external call point

**Verification pass (เดฟ ran):**
- 8 high-impact agent claims checked against actual code paths
- Result: ~50% of "🔴 MISSING" or "🟡 PARTIAL" calls turned out to be SHIPPED (agents were reading stale audit docs, not the worktree state)
- Confirmed false alarms documented in §8 so future re-audit can skip them

**This audit is NOT comprehensive on:**
- Specific PHP business logic line-by-line (would need 50+ more agent-hours)
- WordPress side (`/wp-content`, `/wp-admin` — dead, ignore)
- Top-level static dirs (`/shop`, `/c`, `/f`, `/s`, `/m` — handled in §4 integrations)
- Backup / time-stamped / test-* / Old / copy files (per legacy-cleanup §2-§4)

---

## 3. TRUE Sunday-night blockers (Pacred CANNOT launch Monday without these)

> Filtered down from agent reports after verification. Owner column = who must move it; effort = honest estimate.

| # | Blocker | Owner | Effort | PHP source ref | Pacred target |
|---|---|---|---|---|---|
| **B1** | **OTP input UI for prod** — `register/page.tsx` hardcodes `otp: "bypass"` on lines 244 + 415; no `OtpInput` component. With `OTP_BYPASS=false` registration silently fails. **Fix:** 2-step register + `OtpInput` form | เดฟ | ~2-3h | `member/register.php` step 1→2 OTP gate | `app/[locale]/(auth)/register/page.tsx` + new `OtpInput` component |
| **B2** | **Migrations 0023..0043 apply prod** | เดฟ | ~30m | n/a | Supabase Dashboard SQL editor (paste `docs/setup/migrations-0023-0038.sql` then run individual 0039-0043) |
| **B3** | **ก๊อต fastlane: lock ADR-0015/0016** (pre-answered in `briefs/got.md`) — unblocks ภูม V-A6 (WHT — #1 chat complaint) | ก๊อต | ~5m | n/a (decision, not port) | `docs/decisions/0015-*` + `0016-*` flip Status → Accepted |
| **B4** | **DV-3 ThaiBulkSMS signup** → `OTP_BYPASS=false` flip in Vercel | เดฟ | ~30m signup + 5m env | n/a | `THAIBULKSMS_API_KEY` + `_SECRET` env in Vercel |
| **B5** | **ก๊อต K-12/K-13 + DV-1a/b/c signups** (GTM + Clarity + Sentry + Upstash + hCaptcha) — Ads attribution + error visibility + bot filter | ก๊อต | ~2.5h browser | n/a | 5 env vars in Vercel |

**Soft blockers (degrade gracefully, OK to launch without):**
- LIFF `NEXT_PUBLIC_LIFF_ID` (DV-2) — LINE push works without it; `/liff/link` page just non-functional
- PromptPay `PROMPTPAY_ID` — soft-degrade shipped (friendly notice); awaits พี่ป๊อป Bundle 1
- Resend `RESEND_API_KEY` — code wired at `lib/notifications/index.ts:144`; degrade is silent (logs only) — should set before launch if possible

**Sunday-night T-D1 prod smoke** is the gate that catches anything else.

---

## 4. Customer-side cargo loop — VERIFIED state (per worktree, not audit-doc summaries)

> Agent customer report (§ first agent) had several false alarms; verified state below.

| Step | PHP source | Pacred status | Notes |
|---|---|---|---|
| Signup (personal + juristic 3-step) | `register.php` + `regis-tam.php` + `register-id.php` | ✅ shipped | `actions/auth.ts` + DBD tax ID lookup via `app/api/dbd/[taxId]` |
| OTP register | `api/otp/*` (3 providers) | 🟡 **B1 blocker** — UI hardcodes `"bypass"` | Code path exists in `actions/otp.ts`; UI missing |
| OTP recover password | `api/otp/check-otp-recover.php` | ✅ shipped | `/forgot-password` route + `actions/auth.ts::recoverPassword` |
| Verify-tel (post-signup re-verify) | `verify-tel.php` | ✅ shipped | `/profile/security/change-phone` |
| Profile edit | `profile.php` | ✅ shipped | `/profile/page.tsx` + `actions/profile.ts` |
| Account-settings (PHP `account-settings.php` 15KB) | `account-settings.php` | ✅ shipped (subset of /profile) | Verify edge cases — most fields covered by `/profile` + `/profile/security` |
| Address CRUD + main + soft-delete | `address.php` + `china-address.php` | ✅ shipped | `/addresses` + `actions/addresses.ts` (auto-promote trigger on main delete) |
| Wallet view + history | `wallet.php` | ✅ shipped | `/wallet` + `/wallet/history` |
| Wallet deposit + slip | `wallet-normal.php` (+ `wallet-credit/notblank` variants) | ✅ shipped (consolidated to 1 path) | `/wallet/deposit` + `actions/wallet.ts` |
| Wallet withdraw | `wallet.php` | ✅ shipped | `/wallet/withdraw` |
| ฝากสั่ง — shop-order (cart) | `shops.php` (165 KB) + `cart.php` (90 KB) | ✅ shipped | `/service-order/+add/+cart/+pending/+[hNo]/+receipt` · 151-item cart cap |
| URL→cart converter | `convertURL.php` (130 KB) | ⚪ disabled (ADR-0003) | `lib/china-search/` code exists; env unset → demo mode |
| Image / keyword search | `search.php` (35 KB) + `searchIMG.php` | ⚪ disabled (ADR-0003) | Same |
| ฝากโอน — yuan transfer | `payment.php` (56 KB) | ✅ shipped | `/service-payment/+add` |
| ฝากนำเข้า — forwarder | `forwarder.php` (211 KB) + `forwarder-table.php` (120 KB) | ✅ shipped | `/service-import/+add/+pending/+receipts/+[fNo]/+receipt/+warehouse-addresses` |
| Forwarder receipt history | `receipt-f-hs.php` (15 KB) | ✅ shipped (agent false alarm) | `/service-import/receipts/page.tsx` — server-rendered list with date filter |
| Forwarder receipt PDF | `invoiceF.php` + `printReceiptF.php` | ✅ shipped | `/api/pdf/forwarder/[fNo]` (Sarabun + react-pdf) |
| Shop-order receipt PDF | `printShop.php` | ✅ shipped | `/api/pdf/shop-order/[hNo]` |
| ติดตามสถานะ — container/shipment | `forwarder.php` status views | ✅ shipped | `/shipments` + `/shipments/[code]` (last-sync freshness pill) |
| Pay-from-wallet | (PHP did via admin only) | ✅ shipped (NEW Pacred) | `payServiceOrderFromWallet` + `payForwarderFromWallet` |
| ขอใบกำกับภาษี — request | (PHP partial admin-only) | ✅ shipped (agent false alarm) | `components/tax-invoice-request-panel.tsx` wired into both receipt pages |
| Tax invoice PDF | (PHP mPDF) | ✅ shipped | `/api/tax-invoice/[id]` (RD Code 86 layout · CANCELLED watermark variant) |
| Sales referral commission | `report-user-sales*.php` (3 files) + `user-sales.php` | 🟡 partial — gated to 5 hardcoded users in PHP | `/sales/+history/+report/+report/add` exist; team_leaders table partial done |
| LINE Notify connect/revoke | `line-notify.php` + `api/linenotify/callback/` | ⚪ EOL Apr 2025 — replaced by LINE Messaging API push | `lib/notifications/index.ts::sendLinePush()` |
| Notification preferences UI | (PHP `account-settings.php` partial) | 🟡 partial — `notify_channels` JSON column exists, no UI exposed yet | Defer to V2 long-phase |

**Customer-side verdict:** **1 true gap (B1 OTP UI)** + notification-preferences-UI deferrable.

---

## 5. NEW findings — Freight side (the big V2 long-phase build)

> Source: agent 3 deep dive into `pcs-admin/include/pages/{home/Freight, home/CargoAndFreight, hs-forwarder-invoice, forwarder-quotation, closingAccReportForwarder, withdraw-commission-{interpreter,sale}}`. **None of these are Monday-launch blockers** — they're V2 long-phase (Phase I2 expansion).

### 5.1 Freight feature inventory

| Feature | PHP path | New tables | Pacred status | Phase I2 task |
|---|---|---|---|---|
| **Quotation workflow** — admin creates quote PDF · customer accepts → becomes forwarder order; role-based approval (CEO/Mgr approve; sales rep cannot) | `pages/forwarder-quotation/{add,home,detail,view,listPayCommShops}.php` | `tb_farwarder_quotation` (13 cols), `tb_farwarder_quotation_item` | 🔴 MISSING — no Pacred equivalent | **V-E6** |
| **Commercial Invoice + Packing List generator** — multi-item invoice from N forwarder items (same customer, same status `pending_payment`) | `pages/hs-forwarder-invoice/{add,home,forwarder-invoice/listForwarderItem}.php` | `tb_receipt` (25 cols), `tb_receipt_item` | 🟡 partial — receipts table NOT in Pacred yet | **V-E1** (already in PORT_PLAN) — needs schema |
| **Form E (ASEAN-China FTA C/O) generator** | Not in PHP — assumed required for V2 | n/a | 🔴 NEW build | **V-E3** (in PORT_PLAN) |
| **D/O exchange letter generator** | Not in PHP — assumed required for sea shipments | n/a | 🔴 NEW build | **V-E4** (in PORT_PLAN) |
| **Freight value model** (real_value vs declared_value vs VAT plan) | (in legacy Excel only — see forensics §3.5) | n/a | 🔴 NEW build · DRAFT [ADR-0016](../decisions/0016-freight-value-model.md) | **V-E2** (in PORT_PLAN) |
| **Receipt & payment tracking** — payment ledger with withholding tax + RD Code 86 | `tb_receipt` reads via closing report | `tb_receipt`, `tb_receipt_item` | 🔴 MISSING — Pacred wallet ≠ receipts | **V-E7** (NEW) |
| **Commission withdrawal — interpreter (ล่าม)** | `pages/withdraw-commission-interpreter/` (4 files) | `tb_withdraw_comm_interpreter_h`, `_item`, `tb_set_comm_interpreter` | 🔴 MISSING — no interpreter role in Pacred | **V-E8** (NEW) |
| **Commission withdrawal — sales rep enhancement** | `pages/withdraw-commission-sale/` (4 files) | `tb_withdraw_comm_sale_h`, `_item` | 🟡 partial — `/admin/sales-payouts` exists but missing approval workflow detail (note, rejection_reason, slip upload) | **V-E8** (NEW) |
| **Monthly closing ritual for forwarder accounting** | `closingAccReportForwarder.php` (32KB) + `pages/closingAccReportForwarder/home.php` | (uses `tb_receipt` + `tb_forwarder`) | 🟡 partial — `/admin/accounting/closing` stub exists; verify matches PHP ritual (period freeze + read-only past) | **V-E9** (NEW) |
| **QA/QC intake inspection** | (PHP placeholders: `home/Freight/{import,export}/CSAndDocImport.php`) + `tb_check_forwarder` table referenced in `forwarder-check.php` | `tb_check_forwarder` | 🔴 MISSING — pre-billing QC gate blocks invoice | **V-E10** (NEW) |
| **Customs declaration UI (ใบขนสินค้า)** | (placeholder pages) | n/a (would need new tables) | 🔴 NEW build — no Thai Customs API integration | **V-E11** (NEW) |
| **CargoAndFreight role dashboards** — Accounting, QA/QC, CEO, HR, Marketing, ITDT | `pages/home/CargoAndFreight/` (6 subdirs) | none (presentation only) | 🟡 partial — `/admin/dashboard` exists but no freight-specific KPI cards | **V-E12** (NEW) |
| **Freight Import / Export** subordinate dashboards | `pages/home/Freight/{FreightImport,FreightExport,CEO,SaleFreight}` (placeholders) | none | 🔴 NEW build | Part of **V-E12** |
| **Forwarder bill module** (PHP `forwarder-bill.php` + 4 subdir files) | `pages/forwarder-bill/` | `tb_bill`, `tb_bill_item` | 🟡 verify — Pacred has receipt PDFs; if PHP "bill" = pre-invoice "draft quote" then it's V-E6; if it's invoice-with-summary then it's V-E1 expansion | (verify, fold into V-E1 or V-E6) |
| **Forwarder action bulk workflow** (`forwarder-action.php`) | `pages/forwarder-action/` | (writes `tb_forwarder` in loop) | 🔴 MISSING — Pacred has per-item only | **V-G1** (NEW — admin bulk ops) |
| **Forwarder QC check pre-billing gate** | `forwarder-check.php` + `pages/forwarder-check/` | `tb_check_forwarder` | 🔴 MISSING — see V-E10 | Pairs with V-E10 |

### 5.2 Roles + commission model (NEW)

PHP models 2 commission-earning roles Pacred doesn't have:

| Role | PHP definition | Commission model | Pacred plan |
|---|---|---|---|
| **Interpreter (ล่ามจีน)** | `companyType==1 && department==7 && section in (9,10)` OR `companyType==3 && department==2 && section in (2,3)` | Per-job tier in `tb_set_comm_interpreter`; monthly accrual; withdrawal flow with WHT 15% on >5k | **V-H1** — extend `admins.role` enum + accrual + withdrawal |
| **Sales rep** | Hardcoded whitelist (PCS888/352/2000/2678/4155) | Margin-per-order | **V-H2** — already partial (`team_leaders` table) — finish accrual + WHT |

### 5.3 New DB tables to migrate (Phase I2)

Per agent 3 inventory + cross-check vs `supabase/migrations/`:

| Table | Purpose | Migration target | Phase |
|---|---|---|---|
| `freight_quotes` (was `tb_farwarder_quotation`) | Quote header | `0044_freight_quotes.sql` | V-E6 |
| `freight_quote_items` | Quote line items | (same migration) | V-E6 |
| `freight_invoices` (was `tb_receipt`) | Commercial invoice header | `0045_freight_invoices.sql` | V-E1/E7 |
| `freight_invoice_items` (was `tb_receipt_item`) | Invoice line items | (same) | V-E1/E7 |
| `freight_value_plans` | real / declared / VAT plan | `0046_freight_value_plans.sql` | V-E2 (per ADR-0016) |
| `freight_form_e` | ASEAN-China FTA C/O | `0047_freight_form_e.sql` | V-E3 |
| `freight_do_letters` | Sea D/O exchange letter | `0048_freight_do_letters.sql` | V-E4 |
| `freight_customs_declarations` | ใบขนสินค้า | `0049_freight_customs.sql` | V-E11 |
| `freight_qa_inspections` (was `tb_check_forwarder`) | QC intake checklist | `0050_freight_qa.sql` | V-E10 |
| `freight_accounting_periods` | Monthly closing freeze | `0051_freight_periods.sql` | V-E9 |
| `commission_tiers` (was `tb_set_comm_interpreter`) | Interpreter commission tier lookup | `0052_commissions.sql` | V-H1 |
| `commission_accruals` | Per-job commission accrual | (same) | V-H1/H2 |
| `commission_withdrawals` (was `tb_withdraw_comm_*_h`) | Withdrawal request header | (same) | V-H1/H2 |
| `commission_withdrawal_items` (was `tb_withdraw_comm_*_item`) | Withdrawal line items | (same) | V-H1/H2 |

**ADR-0015 WHT migration `0045_withholding_tax.sql`** (per pre-answered fastlane) lands FIRST before freight stack — V-A6 path.

→ Renumber needed: WHT = `0044`, freight stack starts `0045`. Or use 0044+ block reserved for WHT, freight at 0050+. **เดฟ assigns** when implementing.

---

## 6. NEW findings — Admin polish (V2 long-phase, NOT launch blockers)

> Source: agent 2 admin sweep + verification filter. Items below confirmed real after verification (≠ false alarm).

| # | Feature | PHP source | Pacred status | Phase | Effort |
|---|---|---|---|---|---|
| **AP1** | **Admin push broadcast (popup announcements TO users)** | `popup.php` + 3 subdir files | 🔴 MISSING — Pacred only has `contact-messages` (inbound). Send-to-users via `sendNotification()` requires writing an admin action per use case; no ad-hoc broadcast UI | V2 long-phase | ~4h |
| **AP2** | **Cargo TOS version management** — admin manage T&C versions | `termsOfServiceCargo.php` + 3 subdir files | 🔴 MISSING — `actions/tos.ts::acceptCurrentTos` exists but no version-admin UI | V2 long-phase | ~3h |
| **AP3** | **Organization contact info CRUDs** — 5 mini-modules (domain/email/line/tell/wechat) | `organization-{domainname,email,line,tell,wechat}/` (5 × 3 files) | 🟡 partial — `components/seo/site.ts` constants cover these; needs owner-self-serve admin UI eventually | V2 long-phase | ~4-6h |
| **AP4** | **Forwarder driver assignment** detail parity check | `forwarder-driver.php` + 8 files | 🟡 verify — `/admin/barcode/driver` + `actions/admin/forwarder-drivers.ts` cover most; spot-check parity | V2 long-phase | ~1h audit |
| **AP5** | **Forwarder QC gate (pre-billing)** | `forwarder-check.php` + `pages/forwarder-check/` | 🔴 MISSING — see V-E10 above | V2 long-phase | (folded into V-E10) |
| **AP6** | **Bulk transfer customers to sales rep** | `transferSalesCustomers.php` + 2 files | 🟡 partial — Pacred has per-customer at `/admin/customers/[id]/transfer-rep`; bulk variant missing | V2 long-phase | ~3h |
| **AP7** | **Bulk forwarder actions** (multi-shipment update) | `forwarder-action.php` + subdir | 🔴 MISSING — see V-G1 above | V2 long-phase | ~4h |
| **AP8** | **Barcode generation (creation, not just scan)** — mobile + desktop barcode-create for shop orders | `barcode-c-*.php` (5 files) | 🔴 MISSING — Pacred `/admin/barcode/+driver` is scan-only | V2 long-phase OR skip (shop-side) | ~4-6h or skip |
| **AP9** | **Shop refund workflow** | `shopping-return.php` + subdir | 🔴 MISSING — Pacred has receipt cancel but no return/refund | V2 long-phase | ~4h |
| **AP10** | **HS-code salary / commission analysis report** | `salary-hs.php` | 🔴 MISSING — admin breakdown of revenue per HS code | V2 long-phase | ~3h |
| **AP11** | **Forwarder volume report** | `report-forwarder-volume.php` + 3 files | 🔴 MISSING — shipment volume analytics per forwarder/period | V2 long-phase | ~3h |
| **AP12** | **Sales-by-user report** | `report-sales-group-by-user.php` | 🔴 MISSING — per-rep revenue breakdown | V2 long-phase | ~2h |
| **AP13** | **User-sales detail ledger** | `report-user-sales.php` (admin variant) | 🔴 MISSING — individual user sales history admin view | V2 long-phase | ~2h |
| **AP14** | **Shop product profit report** | `report-shops-profit-pay.php` | 🔴 MISSING — shop revenue (low priority if shop is being phased out) | V2 long-phase OR skip | ~2h or skip |
| **AP15** | **Meeting room booking** | `booking-meeting-room.php` + 6 files | 🔴 MISSING — internal HR tool, FullCalendar | V2 long-phase OR skip | ~6h or skip |
| **AP16** | **Time attendance feature-parity** | `time-attendance-system.php` + 2 files | 🟡 verify — `/admin/hr/attendance` exists; spot-check vs PHP | V2 long-phase | ~2h audit |
| **AP17** | **Recently-imported-customers view** | `recently-used-imported-customers.php` | 🟡 partial — `/admin/csv-imports/` lists imports; "recently used" filter missing | V2 long-phase | ~1h |
| **AP18** | **Customer address book CRUD** | `address.php` (admin) + 3 files | 🟡 verify — customer-side has addresses; admin override may not exist | V2 long-phase | ~2h |
| **AP19** | **Admin LINE Notify subscription mgmt** | `admin-table-linenotify.php` | ⚪ deprecated (LINE Notify EOL Apr 2025) | Skip | n/a |
| **AP20** | **HS custom rate per customer** | `hs-customrate.php` | 🟡 verify — `/admin/rates/custom-hs` exists; check if matches PHP per-customer scope | V2 long-phase | ~1h audit |
| **AP21** | **VIP tier settings** | `settings-vip.php` + 3 files | 🟡 verify — `/admin/rates/vip` exists; check if covers all VIP config | V2 long-phase | ~1h audit |
| **AP22** | **Admin profile mgmt** (152 KB + 43 KB copy) | `admin-profile.php` | 🟡 partial — dashboard has profile; verify feature parity | V2 long-phase | ~1h audit |
| **AP23** | **Admin table RBAC view** | `admin-table.php` + 7 files | 🟡 verify — `/admin/admins` exists; check RBAC config UI | V2 long-phase | ~1h audit |
| **AP24** | **Sales commission withdrawal — approval enhancement** | `withdraw-commission-sale.php` + 4 files | 🟡 partial — `/admin/sales-payouts` exists; missing approval detail (note, rejection_reason, slip upload, withholding-tax math) | V2 long-phase | ~3h |

---

## 7. Intentionally NOT ported (decisions — do not re-flag)

| Item | Decision | Reference |
|---|---|---|
| China product search (TAMIT / AkuCargo / Laonet) | Locked DISABLED — track in repo, no env vars | [ADR-0003](../decisions/0003-china-search-vendor-cutoff.md) Option E |
| LINE Notify (EOL Apr 2025) — 11 send sites, OAuth flow, all per-admin tokens | Replaced by LINE Messaging API push | [ADR-0001](../decisions/0001-line-notify-replacement.md) |
| JMF / TTP / CN carrier sync APIs | Pending ก๊อต API switchover | [`runbook/legacy-cutover-tracker.md`](../runbook/legacy-cutover-tracker.md) F1-5 |
| Google Sheets sync cron | Admin dashboards replace | Sprint 5 cron audit |
| Cargo backup / time-stamped variants (`*BackUp`, `*Old`, `20231213*`, `20260311*`) | Dead code per legacy-cleanup §2 | [`legacy-cleanup-2026-05-16.md`](legacy-cleanup-2026-05-16.md) §2 |
| Time-bound promos (`user-pro-valentine`, `user-pro1212`, `report-pro-3-year-anniversary`, `oh-my-ghost`, `survey202306`) | Expired | legacy-cleanup §3 |
| Test scaffolds (`a-Test-*`, `test-*`, `addmail-test`, `code-templet`, `blank*`) | Test/scratch | legacy-cleanup §4 |
| Content stubs (`businessPlan`, `corporateCulture`, `jobFlowchart`, `descriptionBTN`) | Reference against fake `tb_name` | legacy-cleanup §4 |
| Customer-check tools (`check-customer-maomao-{free,vip}`, `check-customer-shipby-freedom`, `check-sang-cost`, `check-payMethod`, `check-price-flash`) | Ad-hoc SQL OK; no UI port needed | legacy-cleanup §6 |
| Search-image admin tool | Not core admin feature | this audit |
| WordPress side (entire `wp-*` + `wp-content` + `wp-includes`) | Dead WP install; Pacred Next.js replaces marketing site | legacy-cleanup §1 |
| `/m` SMS tracker pixel (logs PII to MySQL) | **Privacy risk** — kill, use GTM events instead | this audit §8 + API agent finding |
| mPDF (PHP PDF lib) | Replaced by `@react-pdf/renderer` + Sarabun fonts | D-2 decision |
| 8 hardcoded credentials in PHP (SMTP / TISO / ThaiBulkSMS / FB OAuth / LINE Notify personal × 5 / DB pass in `/m` / JMF token / Google Sheets JSON) | Rotate when PHP retires (post-Pacred cutover) — see PHP integrations audit §1.3 | [`php-pcscargo-integrations.md`](php-pcscargo-integrations.md) §1.3 |

---

## 8. False alarms (audit hygiene note for next sweep)

These were flagged 🟡/🔴 by the deep-sweep agents but verified SHIPPED in Pacred. Listed here so future re-audits don't waste cycles.

| Agent claim | Actual state | Verification path |
|---|---|---|
| "Customer cannot request tax invoice" | ✅ `components/tax-invoice-request-panel.tsx` wired in 2 receipt pages | `find components/ -name "*tax-invoice*"` |
| "Admin wallet approval UI missing" | ✅ `/admin/wallet/page.tsx` + `bulk-approve-bar.tsx` + `actions-cell.tsx` + `actions/admin/wallet.ts::adminUpdateWalletTransaction` | `ls "app/[locale]/(admin)/admin/wallet/"` |
| "Resend email integration is just a stub" | ✅ Wired at `lib/notifications/index.ts:144` — just needs `RESEND_API_KEY` env | `grep -n "RESEND" lib/notifications/index.ts` |
| "Manual tracking entry UI not built (rebind L-2)" | ✅ `ManualShipmentForm` shipped night-2 (U1-3 + U1-4) | `find app -name "manual-shipment-form*"` |
| "Received_qty / cargo_type / bill_to_override UI not wired" | ✅ All in night-3 batch (V-A1/V-B1/V-C2/V-C3/V-D1/D2/D3) | `git log --oneline origin/dave -20` |
| "ตัดตู้ enforce UI missing" | ✅ V-C3 night-3 (migration 0042 + countdown chip) | (same) |
| "Carrier_container_no UI missing" | ✅ V-D3 night-3 (migration 0040) | (same) |
| "Forwarder receipt history customer page missing" | ✅ `/service-import/receipts/page.tsx` server-rendered list | `cat "app/[locale]/(protected)/service-import/receipts/page.tsx"` |
| "Payment settlement UI missing" | ✅ `/admin/payment` redirects to `/admin/yuan-payments`; THB wallet at `/admin/wallet` (2 separate routes, not 1 "payment" page) | `cat "app/[locale]/(admin)/admin/payment/page.tsx"` |
| "Withholding tax model in schema missing → revenue blocker" | 🟡 Correct schema gap but NOT a launch blocker; ADR-0015 fastlane pre-answered tonight → ก๊อต lock → ภูม implement Mon-Tue post-launch | `briefs/got.md` "P0.7-fastlane" section |
| "Address main-default delete corruption possible" | ✅ Auto-promote trigger via `softDeleteAddress` writes `is_default: false`; trigger promotes next | `actions/addresses.ts:181` comment |

**Pattern:** all false alarms = agents reading stale audit summaries instead of grepping the worktree. **Lesson:** any future audit MUST verify against actual `actions/` + `app/[locale]/(admin|protected)/` + `lib/` + `supabase/migrations/` before flagging gaps.

---

## 9. Cross-references

- Schedule + ranking → [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V (V-A* / V-B* / V-C* / V-D* / V-E* / V-G* / V-H*)
- ADRs unblocking → [`0015 WHT`](../decisions/0015-withholding-tax-model.md) (🟡 fastlane pre-answered) · [`0016 freight value`](../decisions/0016-freight-value-model.md) (🟡 fastlane pre-answered)
- Spec docs (per V-* implementation):
  - V-D → [`port-specs/cargo-volume-reconciliation.md`](../port-specs/cargo-volume-reconciliation.md)
  - V-E1/E3/E4 → [`port-specs/freight-document-suite.md`](../port-specs/freight-document-suite.md)
  - V-E6/E7/E8/E9/E10/E11/E12 + V-G + V-H → **TODO new specs** (เดฟ post-Monday)
- Forensics + chat audit → [`audit/cargo-ops-forensics-2026-05-16.md`](cargo-ops-forensics-2026-05-16.md) + [`audit/chat-analysis-2026-05-16.md`](chat-analysis-2026-05-16.md)
- Integrations + secrets → [`audit/php-pcscargo-integrations.md`](php-pcscargo-integrations.md)
- Legacy cleanup (dead files + security findings) → [`audit/legacy-cleanup-2026-05-16.md`](legacy-cleanup-2026-05-16.md) (this doc **supersedes its §6**; §1-5 still authoritative)
- Strategic risk → [`audit/cargo-ops-forensics-2026-05-16.md`](cargo-ops-forensics-2026-05-16.md) §2 — the ไอแต้ม single-point-of-failure
- Cutover gating → [`runbook/legacy-cutover-tracker.md`](../runbook/legacy-cutover-tracker.md) — F1-1..F1-8
- T-D1 smoke runbook → [`runbook/cargo-smoke-test-T-D1.md`](../runbook/cargo-smoke-test-T-D1.md) — execute Sunday on dev + prod
- V2 vs V3 scope rules → [ADR-0010](../decisions/0010-v2-v3-version-strategy.md)

---

## 10. Sunday-night → Monday plan derived from this audit

### เดฟ (this session)
1. ⬜ Apply migrations 0023..0043 on prod Supabase (~30m) — pre-req for T-D1
2. ⬜ Build OTP UI (2-step register + `OtpInput` component) — `B1` blocker (~2-3h)
3. ⬜ DV-2 LIFF app create + `NEXT_PUBLIC_LIFF_ID` set (~30m)
4. ⬜ DV-3 ThaiBulkSMS signup + `OTP_BYPASS=false` flip (~30m)
5. ⬜ Run T-D1 smoke on dev (~2-3h)
6. ⬜ Run T-D1 smoke on prod (Sunday) (~1-2h)
7. ⬜ Coordinate T-D4 soft-launch — 5 friendly customers (Mon)

### ก๊อต (in parallel, see `briefs/got.md` updated)
1. ⬜ Lock ADR-0015 + ADR-0016 via fastlane (~5m, already pre-answered)
2. ⬜ Sign up K-12 GTM, K-13 Clarity, DV-1a Sentry, DV-1b Upstash, DV-1c hCaptcha (~2.5h browser)
3. ⬜ Call พี่ป๊อป Bundle 1 — PromptPay/bank/tax-ID/LIFF (~30m call)
4. ⬜ Call MOMO dev for endpoint inventory (~2h call + 1h doc)

### ภูม (waits Sunday eve / starts Monday)
1. ⬜ After ADR-0015 lock → implement V-A6 WHT (schema `0044` + UI gate + receipt block) (~8-12h)
2. ⬜ After ก๊อต MOMO call → wire `lib/integrations/momo-jmf/sync.ts` body (~4-6h)
3. ⬜ Pickup AP4 / AP16 / AP18 / AP20 / AP21 / AP22 / AP23 audit-verifications (small, V2 long-phase)

### V2 long-phase (post-Monday, owner-led prioritization)
- Phase I2 freight stack: V-E1..V-E12 + V-G* + V-H* (~150-200h)
- Phase I3 admin polish: AP1..AP24 (~80-120h)
- Owner-requested long tail (as พี่ป๊อปรีเควสต์เพิ่ม)

---

**End of audit. Next refresh:** when V2 reaches "owner has nothing more to add" → transition to V3 in `pacred-dpx` repo (per ADR-0010).
