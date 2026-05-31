# Re-sweep A2 — admin ops/reports/infra · 2026-05-31

**Slice:** ADMIN ops + reports + infrastructure — forwarder-ops, driver, container(cnt), barcode, shop-ops update handlers, ALL reports, settings/config, crons, HR, PRINT routes.
**Legacy SOT:** `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/member/pcs-admin/`
**Pacred HEAD audited:** `dave-pacred` (working tree at audit time — `6f570b53` save-point base).
**Method:** Inventory both sides with Glob/Grep, then VERIFY each suspected gap against the **current live file** (not the 2026-05-30 snapshot). Opened the real `.from(...)` targets, the real consumers, and confirmed reachability. Read-only.

---

## Honest verdict

**This slice is in MUCH better shape than the owner fears, AND the owner's instinct about the big un-ported chunks is correct.** The two facts coexist.

The good news (verified this sweep — the 2026-05-30 `_MASTER` is now **STALE** on these, do NOT re-open them):
- **P0-22 retargeted ALL 4 lane crons to `tb_*`.** `refresh-active-customers`→`tb_header_order`/`tb_forwarder`/`tb_payment`→`tb_users.useractive` ✅ · `sales-daily-digest`→`tb_wallet_hs` 3-stream ✅ · `expire-driver-assignments`→`tb_forwarder_driver` (fdstatus 1→3 + cascade item) ✅ · `expire-probation`→`tb_admin.adminstatusa`/`enddate` ✅. The four "💀 dead cron" P0s in adm-14 are **CLOSED**.
- **P0-20 fixed ALL 5 `reports.ts` dead-read fetchers to `tb_*`** + added the daily-profit series (`getForwarderProfitDailySeries`, `getYuanProfitDailySeries`). forwarder-profit→`tb_forwarder`, shops-profit→`tb_header_order`, yuan-profit→`tb_payment`, sales-monthly→`tb_forwarder`+`tb_users`, otp-success→`tb_users_otp`+`tb_users_otp_hs`. The five "💀 dead report" findings in adm-13 are **CLOSED** (the formula-fidelity + missing-report items below remain).
- **P0-1/P0-2 forwarder bulk bar repointed.** `forwarders-bulk.ts` `bulkUpdateStatus` now delegates to faithful `adminBulkUpdateForwarderTbStatus` (writes `tb_forwarder`+status-log); `bulkAssignDriver` rewritten to write `tb_forwarder_driver`+`tb_forwarder_driver_item`; toolbar uses numeric `'1'..'7','99'`. The two "💀 bulk dead-write" P0s in adm-09 are **CLOSED**.
- **printShop (admin shop receipt/invoice) IS ported** → `/admin/service-orders/print` reads `tb_header_order`, faithful to legacy `printShop.php` (381 LOC), reachable from the row + bulk print links.
- **Shop-ops update handlers all write `tb_*` faithfully** — `adminQuoteShopOrder`/`adminMarkShopOrderOrdered`/`adminSpawnForwarderFromShopOrder`/`adminUpdateOrderAddress`/`adminSwitchOrderTransport`/`adminAddOrderNote` → `tb_header_order`/`tb_order`/`tb_promotion`; per-item refund (`adminRefundShopOrderItem`) → `tb_order`+`tb_header_order`+`tb_wallet`+`tb_wallet_hs`.
- The whole forwarder/driver/cnt/barcode happy path on real `tb_*` rows is solid (adm-09 ~82%).

The bad news (verified STILL open this sweep — the owner is right that we are not done):
- **One NEW money dead-write nobody closed:** `adminMarkForwarderPaid` (`forwarders.ts` L257) still reads the empty rebuilt `forwarders` and writes rebuilt `wallet_transactions` — it 404s on every real row AND is only reachable from a UI that doesn't render on real rows (double-dead).
- **Whole un-ported areas the owner suspected are confirmed ZERO:** the `tb_settings` 128-cell default-cost matrix editor, `tb_notify_wp` customer popup (not written, not read anywhere), `printAll.php`/`printDriver.php` scan-to-print, HR on the migrated `tas_*`/`tb_post_job` (all HR writes the rebuilt twins), the general `tb_rate_g_*` rate-card editor, 4 of 5 org-channel registries, TTP integration, `tb_keyword_product` editor, and the three monitoring/usage reports (search/China-API/SMS).
- **The dual-mode `[fNo]` detail editor (P0-3)** is unchanged — the full edit/driver/cost/bill panels still render only on the dead rebuilt-UUID branch; real rows get a near-read-only legacy view. This is the architectural root that also strands `adminMarkForwarderPaid`.

Net: the **cron + report + bulk-bar dead-writes are fixed**; the **structural editor gap + the big never-built chunks remain**. The remaining work is concentrated, not scattered.

---

## Ledger (gaps only — ✅ DONE items omitted)

Legend: ✅DONE · ⚠️PARTIAL · ❌MISSING · 💀DEAD-WRITE · 🔌UNREACHABLE

| # | Feature | Legacy file:line | Pacred file | Status | Writes which table | Reachable? | Sev | 1-line fix |
|---|---|---|---|---|---|---|---|---|
| **FORWARDER OPS** |
| 1 | Admin record-payment override (mark forwarder paid via cash/bank/OOB) | `forwarder.php` (pay path) / mirrors `payment` | `actions/admin/forwarders.ts:257` `adminMarkForwarderPaid` | 💀🔌 | reads rebuilt `forwarders`, writes rebuilt `wallet_transactions` — **NOT `tb_*`** | only from `[fNo]/update-form.tsx` which renders on rebuilt-UUID branch only → unreachable on real rows | **P0** | Repoint to `tb_forwarder` (by fno) + `tb_wallet`/`tb_wallet_hs` (type=4), mirror `payForwarderFromWallet`; wire onto the legacy-row panel |
| 2 | Detail full editor on real `tb_forwarder` rows (edit all cost fields + rate recalc "บันทึก", re-pick address, swap transport, reassign owner, cost-adjust, bill-to) | `forwarder.php?page=detail` + `include/pages/forwarder/detail.php` | `app/.../forwarders/[fNo]/page.tsx:57,70,235-254` | 💀 | `AdminForwarderUpdateForm`/`DriverAssignForm`/`CostAdjustmentsPanel`/`BillToOverridePanel` render only on UUID branch; real rows early-return `renderLegacyForwarderView` (read-mostly `TbForwarderActionPanel`) | partial — only status/cabinet/tracking-th/note editable on real rows | **P0** | Wire the aside panels to bind `tb_forwarder.id` in legacy-fallback mode (data already loaded); retire the rebuilt-UUID branch |
| 3 | `update_fAddress` re-pick from customer saved `tb_address` | `forwarder.php` update sub-action | legacy view shows address read-only | ❌ | — | no | P1 | Add address picker to `TbForwarderActionPanel` |
| 4 | `update_fCover` replace cover image · `update_fTransportType` · `update_fUserID` reassign owner | `forwarder.php` update sub-actions | not in any panel | ❌ | — | no | P1 | Add to detail editor (part of #2 fix) |
| 5 | `saveNote` push note TEXT via LINE OA + read-flag (note-only save) | `forwarder.php` saveNote | `adminBulkUpdateForwarderTbStatus` fires push only when status changed; note text never pushed | ⚠️ | tb_forwarder note saved ✅, push silent | yes (save) | P1 | Fire `forwarderStatusChanged`-style push on note-only save; include note body |
| 6 | `fCredit='c'` credit-out lifecycle (paydeposit=2 + fCredit=1 + fCreditDate + decrement `tb_credit.creditValue`) | `forwarder.php` credit path | not in `TbForwarderActionPanel` | ❌ | — | no | P1 | Add credit-mode flip to detail editor |
| 7 | `scriptfTrackingCHN` AJAX dupe-check on tracking input (create) | `include/pages/forwarder/scriptfTrackingCHN` | `forwarders-new.ts` form (no live dupe-check) | ⚠️ | — | yes | P2 | Add debounced tracking-dupe check to create form |
| 8 | `updateLock` toggle `tb_forwarder.fLock` (concurrency lock; 13 admins on prod) | `include/pages/forwarder/updateLock` | not ported | ❌ | — | no | P1 | Port row-lock (heartbeat) — collision risk with 13 admins |
| 9 | combine-bill `?page=detail` editable per-bill (photo upload + delete bill + driver assign) | `forwarder-bill.php` | `/admin/forwarders/combine-bill/{,add,print}` (no editable detail) | ❌ | — | print only | P1 | Build per-bill detail (photo→fstatus=7 cascade + delete) |
| 10 | Orange totals row on check-bill (t5/t9/t10/t18/t20/t23 aggregates) | `forwarder-check.php` | not rendered | ⚠️ | — | yes | P2 | Add totals footer row |
| **DRIVER** |
| 11 | `tb_user_sales` agent-commission INSERT on fstatus=7 (4 hardcoded agent maps THADA→PCS888 etc) | `forwarder.php` + `forwarder-driver.php?page=detail` + `forwarder-driver-w.php` | not in `driver-work.ts` deliver step (only signup affiliate exists) | ❌ | — (commission row never written) | n/a | **P0** | INSERT `tb_user_sales` on deliver when `coID` ∈ 4 maps (confirm PR-rebranded codes) |
| 12 | `printDriver.php` A4 picking slip | `printDriver.php` (248) | not ported | ❌ | — | no | P1 | Build `/admin/drivers/[id]/print` picking slip |
| 13 | Truck-size recommender (`call`) · Maps lat/lng pinner (`saveLo`) · per-item cancel from batch | `forwarder-driver.php` sub-actions | not ported (Maps needs key) | ❌ | — | no | P2 | Phase-C (Maps-gated) |
| **CONTAINER (cnt) + report-cnt** |
| 14 | SINGLE-container manual cnt-payment with `cntImagesSlip` upload | `report-cnt.php?id=` POST `add` (L741) | `actions/admin/cnt-payment.ts:248` `adminCreateCntPayment` is BULK-only, hardcodes `cntImagesSlip:""` | ❌ | tb_cnt bulk only — no single+slip entry | bulk yes, single no | P1 | Add single-container `addPay` action with slip upload on `report-cnt/[fNo]` |
| 15 | Per-row bill-to-customer 4→5 from container drill-down (`update_forwarder_to5` + SMS/LINE/email) | `report-cnt.php` L835-911 | absent in `report-cnt-detail.ts` (billing only via forwarder-check bulk) | ❌ | — | no (must leave screen) | P1 | Add per-row "bill this customer" action on drill-down |
| 16 | cnt-hs replace `cntFile` PDF (`formEditFile`) | `cnt-hs.php` | `cnt-hs.ts` (verify PDF-replace path) | ⚠️ | tb_cnt | partial | P2 | Confirm/port PDF replace |
| **BARCODE / gateway** |
| 17 | `printAll.php` warehouse scan-to-print (scan→print label one motion) | `printAll.php` (969) | NOT ported — `gateway type=from` + forwarders list bottom-bar fall back to detail page | ❌ | — | no | P1 | Port `/admin/printAll` (brand decision: PCS vs Pacred first) |
| 18 | `gateway type=6` SweetAlert (assigned-driver name + "ขั้นตอนผิด" guard) | `gateway.php` | deferred (redirects silently) | ⚠️ | — | yes (silent) | P2 | Add driver-preview + wrong-step guard |
| 19 | Numeric pallet codes 1-40 | `barcode-d-importKey.php` | letter A1-Z6 only | ⚠️ | — | yes (letters) | P2 | Owner-decision dual-mode pallet |
| **REPORTS** |
| 20 | Profit-report formula fidelity + invented VAT7 column | `report-forwarder-profit.php` / `report-payments-profit.php` | `reports.ts` getForwarderProfit/getYuanProfit (now tb_* ✅) but adds `vat7=profit*0.07` not in legacy + `5plus` status filter check | ⚠️ | tb_* (read fixed) | yes | P1 | Drop/relabel VAT7 col; confirm `5plus` (fstatus>5) filter present |
| 21 | ยอดพนักงานขาย materialised model vs live recompute (canonical menu report) | `report-sale.php`/`report-sale-new.php` (`tb_sales_report` keyed srAdminIDSale) | TWO parallel: `sales-monthly` (tb_forwarder now ✅) + `sales-by-rep` (`vw_sales_by_rep`); neither has per-rep monthly **detail drill** | ⚠️ | tb_* | yes | P1 | Architecture call (เดฟ): pick one canonical rep report + add per-rep monthly detail page |
| 22 | Agent-commission **payout** report (ประวัติจ่ายเงินลูกค้าตัวแทน) | `report-user-sales.php` + `report-user-sales-history.php` (`tb_user_sales`/`tb_user_sales_pay`/`tb_user_sales_admin_pay`) | NONE — `/admin/reports/user-sales-history` is a name-collision (it's the per-customer 3-service SUM = `report-user-all.php`) | ❌ | — | no | P1 | Build `/admin/reports/agent-payouts` over `tb_user_sales*` |
| 23 | เบิกจ่ายค่าสินค้า **WRITE** flow (multi-select → INSERT `tb_shop_pay_h`/`tb_shop_pay_sub` → `hShopPay=1`) + history list + print-report-shop | `report-shops-profit-pay.php` L26-53 + `report-shops-profit-pay-history.php` + `print-report-shop.php` | `/admin/reports/shops-profit-pay` is READ-ONLY (banner "Phase C"), redirects to `/admin/shop-payouts` (different model `tb_shop_transactions`, customer-pull not admin-push) | ❌ | — (write absent) | read yes, write no | P1 | Port admin-push batch disbursement + tb_shop_pay_h history + print route (needs ADR + migration) |
| 24 | Monitoring/usage reports: search (`tb_history_key`), China-API usage, SMS usage (`tb_sms_hs`) | `report-search.php`/`report-user-search.php`, `report-api-china.php`, `report-api-sms.php` | NONE anywhere | ❌ | — | no | P1 | Build a "monitoring" report section (ปอน lane) |
| 25 | DataTables export parity (Excel/PDF/copy) | most report pages | Pacred `CsvButton` = CSV only | ⚠️ | — | yes (CSV) | P2 | Add Excel/PDF/copy |
| 26 | One-off promo reports (survey 2023 / 3-year / oh-my-ghost) | `report-pro-*.php` (3 files) | NONE | ❌ | — | no | P2 | Triage WONTFIX vs Phase-C |
| 27 | Weekly-report email cron | `include/cron/weekly-report.php` | no scheduled task | ❌ | — | n/a | P2 | Wire scheduled task |
| **SETTINGS / CONFIG** |
| 28 | 128-cell **default forwarder-cost matrix** (fCostCar1-4 × fCostShip1-4 × 8 forwarders × 2 variants) | `settings.php` (6301 LOC · 268 `update_` refs) | NO editor — `tb_settings` cost columns editable only by raw SQL | ❌ | — | no | **P0** | Build matrix editor on `/admin/settings/legacy-rates` (drives per-partner default cost auto-fill) |
| 29 | `numberPaymemt` / `freeShipping` / `hRateCostSale` master config | `settings.php` L31-58, L688-714 | no UI — `tb-settings.ts` only does CNY rates (rsdefault/rpdefault) + custom-cbm | ❌ | — | no | P1 | Extend `tb-settings.ts` + form |
| 30 | General rate-card editor (tiered KG/CBM) | `rate.php` → `tb_rate_g_kg`/`tb_rate_g_cbm` | `/admin/rates/general` → `rates.ts adminUpsertGeneralRate` writes **rebuilt `rate_general`** (engine `resolve-rate.ts` reads `tb_rate_g_*`) | 💀 | rebuilt `rate_general` — edits never reach pricing engine | yes | **P0** | Build `tb_rate_g_*` editor; delete/repoint `rates.ts` rebuilt writers |
| 31 | VIP rate-card **page** + Custom-HS rate-card **page** | `rate-vip.php` → `tb_rate_vip_*` | `/admin/rates/vip` → rebuilt `rate_vip` 💀 (per-customer path `rate-edits.ts`→`tb_rate_vip_*` ✅); `/admin/rates/custom-hs` → rebuilt `rate_custom_hs` 💀 (per-customer `rate-edits.ts`→`tb_hs_rate_custom_*` ✅) | 💀 | rebuilt (dual-path; customer-detail path works) | yes | P1 | Repoint rate-card pages to tb_* (or retire in favour of per-customer path) |
| **ORG REGISTRIES** |
| 32 | Org tell/line/wechat/domainname channel registries (4 tables w/ stored passwords) | `organization-{tell,line,wechat,domainname}.php` → `tb_organization_*` | only `organization-email` ported (✅ `tb_organization_email`); other 4 have NO editor (mobile-launchpad READS `tb_organization_tell`) | ❌ | — (email only) | no | P1 | Add 4 channel editors; resolve `org_contacts` split-brain |
| 33 | `tb_keyword_product` product-category keyword editor | `organization-category-product.php` | none (only `pcs-chrome.ts` reads it) | ❌ | — | no | P2 | Confirm need; build editor or Phase-C |
| **NOTIFY** |
| 34 | Customer popup announcement banner (ALL customers see on login) | `notify.php` (82) → `tb_notify_wp` | `/admin/broadcasts` → rebuilt `broadcasts`, recipients = `profiles WHERE active` (logged-in subset only); `tb_notify_wp` **never written, never read** | 💀 | rebuilt `broadcasts` — reaches small subset not 8,898 | yes (wrong reach) | **P0** | Write+read `tb_notify_wp` for popup OR broadcast off `tb_users` |
| **HR** |
| 35 | Annual holiday / maid-holiday / leave-record / record-work-time clock | `time-attendance-system.php` (308) → `tas_holiday`/`tas_holiday_maid`/`tas_leave`/`tas_historydataold` | `/admin/hr/attendance*` → `attendance.ts` writes rebuilt `attendance_logs`/`leave_requests`; `tas_*` **never touched**; no record-work-time clock, no maid-holiday | 💀/❌ | rebuilt `attendance_logs`/`leave_requests` | yes (wrong table) | P1 | Pivot to `tas_*` OR formally declare HR a Phase-C rebuild (stop calling it ported) |
| 36 | Recruitment job posting (company→type→dept→section) + applicants | `post-job.php`/`post-job-hs.php` → `tb_post_job` | `/admin/hr/recruitment*` → `recruitment.ts` writes rebuilt `job_postings`/`job_applicants`; `tb_post_job` ignored | 💀 | rebuilt `job_postings`/`job_applicants` | yes (wrong table) | P1 | Pivot to `tb_post_job` OR declare Phase-C |
| **PARTNER API** |
| 37 | TTP integration (SM dashboard/detail) | `api-forwarder-ttp.php` | no `lib/integrations` TTP client | ❌ | — | no | P1 | Build TTP client (ก๊อต lane) |
| 38 | JMF inbound webhook PUT (partner POST → upsert tb_forwarder) | `api/update-forwarder/JMFCARGO/{GET/fCost,PUT}` | replaced by pull cron (`momo-sync`→tb_forwarder ✅); inbound entrypoint absent | ⚠️ | tb_forwarder (via pull) | n/a | P2 | Confirm w/ ก๊อต whether JMF switched to pull contract |
| 39 | MK/MX/Sang Google-Sheets adapters | `api-sheets-{mk,mx,sang-2023}.php` | pages exist; only CTT adapter built (foundation) | ⚠️ | tb_forwarder (partial) | yes | P1 | Finish MK/MX/Sang adapters (ก๊อต lane) |
| 40 | LINE Notify per-admin OAuth connect/revoke | `get-token-linenotify.php` + `api/linenotify/{callback,revoke}` → `tb_admin.adminLineTokenNotify` | none (LINE Notify EOL Apr 2025 — replaced by LINE OA push) | ❌ | — | no | P2 | Intentional (EOL) — confirm w/ ก๊อต, WONTFIX |

---

## Whole areas legacy has that Pacred has ZERO of (the owner's suspicion — confirmed)

These are not "partial" — they are **never built** (verified by grep returning nothing across `actions/`, `app/`, `lib/`):

1. **`tb_settings` 128-cell default-cost matrix editor** (#28) — the per-partner (Default/CargoCenter/JMF/MKCargo/MOMO/MXCargo/Sang/WMXCargo) car×ship default-cost grid that auto-fills forwarder cost. Legacy `settings.php` has ~268 `update_` handlers; Pacred edits only the 2 CNY rate cells + custom-cbm via `tb-settings.ts`. Everything else in that 6,301-LOC config screen is **raw-SQL-only** in Pacred. **P0** (drives money — default cost on every new forwarder).

2. **`tb_notify_wp` customer popup announcement** (#34) — the login banner ALL 8,898 customers see. **Not written, not read by a single line of Pacred.** `/admin/broadcasts` is a parallel rebuilt system reaching only the logged-in subset. **P0** (operational comms to the whole base are impossible).

3. **`printAll.php` (969 LOC) + `printDriver.php` (248 LOC) scan-to-print** (#17, #12) — the warehouse single-motion scan→print-label loop and the driver A4 picking slip. Zero routes. Warehouse + driver handoff degraded to "open detail, hunt for a print button".

4. **HR on migrated data** (#35, #36) — `tas_holiday`/`tas_holiday_maid`/`tas_leave`/`tas_historydataold`/`tb_post_job` are migrated-with-data but **`tas_*` is touched by nothing**; all HR (attendance, leave, recruitment) writes Pacred-original rebuilt twins. Staff PCS leave history + the record-work-time clock + maid-holiday flow are invisible. Either pivot to `tas_*` or stop calling HR "ported".

5. **General `tb_rate_g_*` rate-card editor** (#30) — the tiered general KG/CBM card that prices the bulk of non-VIP customers. The pricing engine (`resolve-rate.ts`) READS `tb_rate_g_*`, but the only editor (`/admin/rates/general`) writes the empty rebuilt `rate_general`. **P0** — an admin "changing the general rates" changes nothing the engine uses.

6. **3 monitoring/usage reports** (#24) — product-search demand (`tb_history_key`), China-API call volume, SMS credit burn (`tb_sms_hs`). Zero surfacing — no cost/demand visibility.

7. **4 of 5 org-channel registries** (#32) — tell/line/wechat/domainname editors. Only email ported.

8. **TTP partner integration** (#37) + **agent-commission payout report** (#22) + **admin-push เบิกจ่ายค่าสินค้า disbursement** (#23) — three whole flows with no Pacred equivalent.

---

## Newly-found (not in 2026-05-30 `_MASTER`)

1. **`adminMarkForwarderPaid` is a double-dead money path (#1) — NEW, the worst new gap.** The 2026-05-30 lane docs covered the customer `payForwarderFromWallet` and the bulk-bar, but the *admin record-payment override* (`forwarders.ts:257`) was not flagged. It (a) reads the empty rebuilt `forwarders` → `not_found` on every real row, (b) writes rebuilt `wallet_transactions` not `tb_wallet`/`tb_wallet_hs`, and (c) is only reachable from `[fNo]/update-form.tsx`, which renders solely on the dead UUID branch. So even if a real row somehow reached it, the debit would land in the empty ledger. This is the admin-side cash-receipt escape hatch (customer paid cash/bank, admin records it) — **completely non-functional on real data.** Matches the memory note "adminMarkForwarderPaid dead-write (=P1-3 symptom)" — confirmed and elevated: with the bulk bar + crons now fixed, this is the **last standing forwarder money dead-write**, and it's P0.

2. **`settings.ts` / `business-config.ts` are a second config split-brain — NEW framing.** Beyond the known `tb_settings`-has-no-matrix-editor gap, there are Pacred-original `adminUpdateSettings`→rebuilt `settings` and `adminUpdateBusinessConfig`→rebuilt `business_config`. These look like "settings work" in the UI but are entirely disjoint from the migrated `tb_settings` singleton. Not a regression, but worth noting: "settings" appears covered while the legacy config the system actually reads is unedited.

3. **Confirmation that the cron + report + bulk fixes are real (positive finding).** The `_MASTER` (and memory) listed ~10 dead-write P0s across crons/reports/bulk that are now **closed at HEAD** (P0-20, P0-22, P0-1/2). Re-opening any of them would be wasted work / a dup-write landmine. This sweep's main service to the owner: **don't re-audit those — they're done.**

---

## Count

**P0: 6 · P1: 22 · P2: 12**

P0 (the 6 that block real-data correctness or money):
- #1 `adminMarkForwarderPaid` dead-write (NEW) — repoint to tb_forwarder + tb_wallet/_hs
- #2 forwarder `[fNo]` detail editor dead on real rows (architecture — เดฟ)
- #11 `tb_user_sales` agent-commission not inserted on fstatus=7
- #28 `tb_settings` 128-cell default-cost matrix editor missing (money)
- #30 general `tb_rate_g_*` rate-card editor writes table the engine ignores (money)
- #34 `tb_notify_wp` customer popup reaches ~no one (whole-base comms)

P1/P2: detail-editor sub-fields, single-cnt-pay + per-row bill, printAll/printDriver, HR-on-tas_*, recruitment-on-tb_post_job, org registries, agent-payout + monitoring + admin-push-disbursement reports, profit-formula fidelity, rep-report architecture, TTP/sheets adapters, master-config fields, export parity, promo reports.

> **Scope honesty:** I prioritized breadth — every gap above is verified against the live file's `.from(...)` target + consumer + reachability, but I did not line-by-line read all 268 `settings.php` handlers (confirmed via grep that NO Pacred file UPDATEs `fcostcar`/`fcostship`/`numberpaymemt`/`freeshipping` → the matrix editor is absent, which is the load-bearing fact). The cnt-hs PDF-replace (#16), `5plus` filter (#20), and MK/MX/Sang adapter depth (#39) are marked ⚠️ "verify" rather than asserted.
