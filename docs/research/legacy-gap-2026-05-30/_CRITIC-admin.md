# Completeness Critique — ADMIN side (legacy-gap-2026-05-30)

**Critic pass:** 2026-05-30 · reviewer = completeness critic (admin) · branch `dave-pacred`.
**Reviewed:** the 7 admin lane docs `adm-08`…`adm-14` + cross-checked against the legacy source tree `…/pcsc/public_html/member/pcs-admin/` (180 `.php` entry files + `include/pages/` MVC dirs) + verified the most severe death-flows by opening the real Pacred files.

**Verdict:** the 7 docs are **high quality** — accurate, trust-but-verify done properly, status enums read from real PHP (not paraphrased), Tier-A fixes correctly marked CLOSED. I confirmed a representative sample of the worst death-flows and **every one I checked was TRUE** (no false positives in the sample). The gaps below are **coverage holes** (legacy surfaces no lane was assigned) and **one factual table-name error**, not fabricated gaps.

---

## 1. MISSED SUBSYSTEMS (legacy admin surfaces NO lane doc audited)

The 7 lanes carved up: customer-mgmt (08), forwarder/driver/cnt (09), shop-orders (10), yuan (11), accounting-reports+pay-users+commission (12), reports (13), HR/settings/org/rate/API/cron (14). That leaves the following legacy `pcs-admin/*.php` surfaces **unassigned to any lane** — confirmed by reading the files + grepping the lane docs.

### 🔴 MS-1 (P0) — `wallet.php` admin wallet surface: deposit-slip approval + withdraw approval + cash-back — NO lane owns it, and the APPROVE action is a silent dead-write
This is the **single most important miss.** Legacy `pcs-admin/wallet.php` is a 3-mode money surface:
1. global wallet-balance dashboard + **manual admin top-up** (`INSERT tb_wallet_hs type='1'` + credit `tb_wallet`),
2. **cash-back ledger management** (`tb_cash_back` / `tb_cash_back_hs`, `cbhStatus` 1→2),
3. **`?page=withdraw`** — the **withdraw-request approval queue**: approve/reject customer withdraw requests (`tb_wallet_hs type='3' status='1'` → status 2, or reject + refund), with `w-s-withdraw.php` / `w-s-withdraw-detail.php` + a `checkPay.php` + `updateLockAdd.php` 60s lock.

**Why it slipped:** adm-12 explicitly scoped only the `acc-*` **reports** + `pay-users` + `withdraw-commission-*`; adm-11 only yuan. `wallet.php`'s **write side** (deposit-slip approval, withdraw approval, manual cash-back grant) fell between adm-11/adm-12 with no owner.

**The dead-write I verified (P0 money hole):**
- `app/[locale]/(admin)/admin/wallet/page.tsx` + `balance-view.tsx` + `transactions-view.tsx` + `[id]/page.tsx` correctly **READ `tb_wallet_hs`/`tb_wallet`** (L110-113) → they show the real pending deposit-slips + withdraw requests of the 8,898 customers. ✅
- BUT `app/[locale]/(admin)/admin/wallet/slip-review-modal.tsx` (the deposit/withdraw **approve/reject** UI, L26/111/131) calls **`adminUpdateWalletTransaction`** (`actions/admin/wallet.ts` L26) which does `.from("wallet_transactions").update(...).eq("id", …)` — the **rebuilt, empty table**, keyed by a UUID the tb_wallet_hs row doesn't have. 💀
- Same file: `adminBulkApproveDeposits` (L175) and `adminCreateManualWalletEntry` (L341) also write rebuilt `wallet_transactions` + `profiles`.

**Impact:** an admin opens the wallet queue, sees a real customer's top-up slip (read from `tb_wallet_hs`), clicks "approve" → the UPDATE hits empty `wallet_transactions`, **0 rows change, the customer's wallet is never credited.** Deposit-slip approval is the #1 wallet-inflow path. This is a launch-blocking money death-flow that no lane doc flagged. (Note: the *manual top-up* path `actions/admin/wallet-hs.ts` IS faithful — writes `tb_wallet`+`tb_wallet_hs` — so this is the classic duplicate-action-file trap: `wallet-hs.ts` ✅ vs `wallet.ts` 💀, and the slip-review modal grabbed the wrong one.)
**Owner:** เดฟ (wallet ledger is the cross-cutting integration spine; same root as adm-11 P1-6 "two wallet ledgers" + adm-12 pay-users). Re-point `adminUpdateWalletTransaction`/`adminBulkApproveDeposits` to `tb_wallet_hs`/`tb_wallet` (the `wallet-hs.ts` pattern). **Withdraw-approval + cash-back grant need a NEW lane (call it adm-15-wallet).**

### 🟠 MS-2 (P1) — `search.php` + `search-image.php`: the admin China-product-search TOOL
Legacy `search.php` (the admin clone of the customer 1688/Taobao search, reads `tb_settings.rsDefault` for pricing) + `search-image.php` (image-based product search). adm-13 audited `report-search.php` (the search *usage analytics*) and assigned it to ปอน, but **the search tool itself** (staff searching China products on a customer's behalf, the front-half of the ฝากสั่งซื้อ funnel) is in no lane. Customer-side search is a ปอน frontend lane; the **admin** search tool is unowned.
**Owner:** ภูม (admin backend) or ปอน — needs an owner decision. Likely overlaps the cargothai/China-API integration (adm-14 #24).

### 🟠 MS-3 (P1) — Freight/HS tax-invoice mint cluster: `hs-forwarder-invoice.php` · `create-f-receipt.php` · `hs-receipt-forwarder.php` · `gatway-receipt-forwarder.php` · `hs-customrate.php`
A whole freight-side invoicing cluster. adm-09 mentions `gatway-receipt-forwarder.php` is ✅ covered via `forwarder-invoice.ts`, and Pacred *does* have `/admin/accounting/forwarder-invoice/*` + `app/api/freight-invoice/*` (verified present). BUT:
- `hs-forwarder-invoice.php` (ประวัติการออกใบแจ้งหนี้ ฝากนำเข้า — the issued-invoice **history/list** keyed off `tb_name`),
- `create-f-receipt.php` (multi-`rID` batch freight receipt mint, `tb_receipt`+`tb_receipt_item`+`tb_corporate` join),
- `hs-receipt-forwarder.php` (ประวัติการออกบิล split by `userCompany`),
- `hs-customrate.php` (rate-change-history view) —
none are scored. adm-12 P1-2 caught the `acc-system-cargo` receipt leaf but not this parallel HS-invoice family. **Risk: a second issued-invoice surface that may or may not read `tb_receipt`** — needs a verify pass. (adm-09's `gatway-receipt-forwarder` ✅ is the *generate-from-fID* path, not the *history list* — different flow.)
**Owner:** ภูม (admin accounting backend), coordinate with adm-12.

### 🟡 MS-4 (P1) — `pay.php` / `gateway-prepare.php` / `printPCSF.php` / `barcode-import` standalone
- `pay.php` (admin pay-confirm helper) + `gateway-prepare.php` (warehouse scan prep) — adm-09 covers `gateway.php` + `barcode-import/index.php` but not these two siblings; verify they're not distinct entrypoints.
- `printPCSF.php` (PCSF-promo box-label print) — adm-09 inventoried `printAll`/`printDriver`/`printBill`/`printShop`/`printReceipt` but not `printPCSF`.
- `import-excel.php` ("ปรับรายการอัตโนมัติ" — bulk Excel adjust tool) — unowned; bulk-data tooling.
**Owner:** ภูม.

### 🟡 MS-5 (P2) — Internal/CMS/content admin pages (low revenue, but legacy-present → faithful-port scope)
None of these are in any lane (they're internal-ops / content, `tb_name`-backed):
- `jobFlowchart.php` (ผังงาน Job) · `businessPlan.php` (BUSINESS PLAN) · `corporateCulture.php` · `training-regulations.php` · `termsOfServiceCargo.php` (ToS content — note Pacred has `/admin/settings/tos-versions`, verify parity) · `organization-table.php` (ผังองค์กรแบบตาราง) · `organization-chart.php` (the RBAC org-tree — **load-bearing: it's the `checkRights()` source**, adm-14 references `checkRights` but doesn't audit the chart editor itself).
- `booking-meeting-room.php` (meeting-room booking) · `contact-list-outsider.php` (`tb_contact_outsider` external-contact CRM — verified writes its own table) · `address.php` (admin view of all member addresses) · `history.php` (VIP-system action-history viewer) · `map.php` (Google Maps waypoint demo — likely dead) · `code-templet.php` / `single-code-text-converter*.php` (dev utilities — skip).
**Owner:** ภูม (triage WONTFIX vs port; most are Phase-C). `organization-chart` RBAC editor is the one with real weight — flag for เดฟ/ก๊อต (RBAC architecture).

### 🟡 MS-6 (P2) — `settings-vip.php` (VIP-tier *type* config) + `rate-vip.php` standalone
adm-14 covers `settings.php` + `rate.php` rate-cards, and adm-08 covers the VIP *classification*. But `settings-vip.php` ("ตั้งค่าประเภทของสมาชิก VIP" — the VIP **tier-type definitions**, distinct from per-customer grant) isn't scored. Minor; folds into adm-08 WF#16 (classification) or adm-14.
**Owner:** ภูม.

---

## 2. FALSE GAPS (claimed gaps that are actually present / claims that are wrong)

I opened the real Pacred files for the most severe death-flows. **Sample result: the death-flow claims are TRUE — no false positives found in the sample.** The corrections below are about **precision**, not invented gaps.

### FG-1 (factual error) — adm-14 P0-3 names the WRONG table for the customer popup; the real one (`tb_notify` via `popup.php`) is a MISSED subsystem
adm-14 P0-3 says the customer login announcement = legacy `notify.php` → `tb_notify_wp`, and tells เดฟ to "wire `tb_notify_wp`". **Verified against source — this is wrong:**
- The **customer member-portal** login popup reads **`tb_notify`** (+ `tb_notify_read` for per-user dismiss), edited by **`popup.php`** — confirmed in `member/include/all-script.php` L617-625 + `member/include/pages/index/userReadNotify.php`.
- **`tb_notify_wp`** (edited by `notify.php`) is read **only by the WordPress marketing site** (`wp-content/themes/pcscargo/functions.php`), NOT the member portal.
So the fix target is `tb_notify` + `tb_notify_read` + the `popup.php` editor — and `popup.php`/`tb_notify`/`tb_notify_read` are a **missed subsystem** (no lane audited popup.php). The *direction* of adm-14 P0-3 (broadcasts don't reach the 8,898) is right; the table is wrong. **This matters** — a fix that wires `tb_notify_wp` would still not drive the member-portal popup. Owner: เดฟ (correct the target to `tb_notify`/`tb_notify_read`).

### FG-2 (precision) — adm-12 pay-user stub: the fallback target is ALSO dead (under-stated, not a false gap)
adm-12 P0-1 correctly calls `/admin/wallet/pay-user` a redirect stub → CONFIRMED (`redirect("/admin/wallet?kind=order_payment")`). One nuance: the stub's redirect target `/admin/wallet` reads `tb_wallet_hs` for the list but its *kind=order_payment* mutation surface routes into the same `wallet.ts` dead-write family (MS-1). So the situation is slightly **worse** than "stub" — there is no working fallback. Not a false gap; the doc under-states severity.

### FG-3 (verify-recommended, not a confirmed false gap) — adm-09 item 24 `updateLock` "not ported"
adm-09 marks `updateLock` (forwarder concurrency) ❌. The wallet + service-order lanes also mark session-lock missing. This is consistent and likely true, BUT Pacred *does* have lock scaffolding referenced in places (`updateLockAdd.php` equivalent). Low-confidence; recommend a single cross-lane grep for any `*_lock`/`lockdate` write before all the "session-lock missing" items are taken as fully absent. Not asserting it's a false gap — flagging for a 10-min confirm.

**No fabricated death-flows found.** Specifically re-verified and CONFIRMED TRUE:
- adm-08 P0-B: `/admin/juristic-check/page.tsx` L9 reads `.from("corporate")` (rebuilt) ✅ true.
- adm-08 P0-A: `editCustomer` exists (`customers.ts` L32) and is imported by **no** page/component ✅ true (orphaned).
- adm-11 P0-2: `tb-bulk.ts` L318 yuan bulk-approve writes raw `adminId` (UUID) into `tb_payment.adminid` varchar(10) ✅ true — and note the SIBLING path L155 (`tb_wallet_hs.bulk_approve`) correctly uses `resolveLegacyAdminId()`, which makes the yuan-path bug even clearer.
- adm-12 P0-3 / adm-13 P0-1: `reports.ts` fetchers read `forwarders`/`service_orders`/`yuan_payments`/`otp_codes` (L53/143/229/308/387) ✅ true.
- adm-12 P0-1: pay-user is a `redirect()` stub ✅ true.

---

## 3. CROSS-CUTTING PATTERNS (root causes, admin side)

These recur across all 7 lanes — fixing the pattern beats fixing surfaces one by one. (Extends the master-fidelity "6 patterns" with what THIS critic pass surfaced.)

1. **SILENT DEAD-WRITE to rebuilt tables (the dominant failure).** Present in EVERY lane: `profiles`, `corporate`, `forwarders`, `forwarder_driver`, `service_orders`, `service_order_items`, `yuan_payments`, `wallet_transactions`, `rate_general`/`rate_vip`, `job_postings`, `attendance_logs`, `org_contacts`, `broadcasts`. The 8,898-customer data is in `tb_*`; the rebuilt tables are empty on prod; the admin action "succeeds" and changes 0 rows. **This is ~70% of all P0s on the admin side.** Root cause: the rebuilt-era app and the D1 port coexist, and UI wires to whichever action was written first.

2. **DUPLICATE ACTION FILES — faithful twin vs dead twin, UI grabbed the dead one.** The signature trap: `yuan-payments.ts` (mixed/rebuilt) vs `yuan-payments-tb.ts` (✅); `service-orders.ts adminMarkServiceOrderPaid` (💀) vs `service-orders-tb.ts …Tb` (✅); `rates.ts` (💀) vs `rate-edits.ts` (✅); **`wallet.ts` (💀) vs `wallet-hs.ts` (✅) — MS-1, newly surfaced.** The faithful action almost always already EXISTS; the fix is re-wiring the UI import + deleting/renaming the dead twin to `*-legacy-dead.ts`.

3. **DUAL-MODE UUID-vs-legacy detail pages render the editor only on the empty-UUID branch.** adm-09 P0-3 (forwarder `[fNo]`) + adm-10 P0-4 (service-order `[hNo]` legacy-view) are the same architecture bug: the page looks up the rebuilt-UUID row first, and the full edit/action panels render only in that branch — so on EVERY real `tb_*` row the staffer gets a near-read-only legacy view. **One architectural decision (legacy numeric id is canonical; retire the UUID path) closes multiple P0s at once.** Owner เดฟ (correctly assigned in adm-09).

4. **READ-faithful but WRITE-dead split within ONE surface.** The most dangerous variant (MS-1 wallet, adm-10 service-order legacy-view): the list/detail READS `tb_*` so it looks completely real and populated, but the mutate/approve action writes rebuilt. Passes a click-through "I can see the data" smoke; fails silently on submit. Detection requires asserting a **row delta in `tb_*`** after the action, not just a 200 + populated list.

5. **CRON dead-writes (whole class).** adm-14 found 3 (`refresh-active-customers`, `sales-daily-digest`, `expire-probation`) + adm-09 a 4th (`expire-driver-assignments`) — all read/write rebuilt tables → run daily doing nothing. Highest leverage-per-minute fixes (~2-3h total for all 4). The `userActive` flag never flips for 8,898 customers → every active-customer filter/report/segment is silently wrong.

6. **NOTIFICATION channel collapse (4-channel → 1-channel or none).** Legacy fans status changes to Email + SMS + LINE Notify + LINE OA. Pacred fires the internal `sendNotification` only, or nothing (mark-paid, saveNote, yuan approve). Recurs in adm-09 (saveNote), adm-10 (quote/ordered/mark-paid), adm-11 (manual-create + approve). The payment-prompt SMS is the load-bearing loss.

7. **SESSION-LOCK universally absent.** `updateLock.php` 60s heartbeat (forwarder/service-order/yuan/wallet/pay-users all have it) → none ported. 13 prod admins = real concurrent-overwrite risk once the write workflows land. Cross-cutting infra (เดฟ) — build one `lib/admin/edit-lock.ts`, not 5 copies.

8. **"IMPROVEMENT smuggled into a port diff" (fidelity violation).** adm-13 P0-2 (invented `vat7 = profit*0.07` column not in legacy) + adm-08 #7 (rep-auto-assign + welcome-SMS folded into "recover customer") + adm-11 5-state enum over legacy's 2-outcome. Each hides divergence inside a good-looking change — exactly what the owner's "copy 100% first" gate forbids. Run `legacy-fidelity-check` before shipping these.

9. **member-code rebrand is NOT a gap (guard against re-flagging).** `PCS<n>` → `PR<n>` (adm-08 #16, flow-order note 5) is the intended rebrand per CLAUDE.md. Flag so a future porter doesn't "fix" it back. Same for the Google-Sheets→CSV swap (adm-09 item 64) and forwarder-check LINE+email (exceeds legacy) — intentional, do not re-flag.

---

## 4. TRUE P0 ORDERING (admin side)

Sequenced by money-correctness → revenue-path → operational, and so each unblocks the next. Quick-win dead-writes first (minutes each, clear the silent-failure noise), then the wallet/identity holes, then the big workflow builds.

1. **MS-1 — Wallet deposit-slip + withdraw approval dead-write** (`wallet.ts` `adminUpdateWalletTransaction`/`adminBulkApproveDeposits` → `tb_wallet_hs`/`tb_wallet`). **NEWLY surfaced, launch-blocking money hole — admin approves a top-up, customer never credited.** เดฟ. ~2-3h. *(Highest priority: it's a cash-inflow death-flow no lane caught.)*
2. **Cron retargets (4, batch)** — `refresh-active-customers`, `sales-daily-digest`, `expire-probation` (adm-14) + `expire-driver-assignments` (adm-09) → `tb_*`. ภูม. ~2-3h total. *(Cheapest correctness-per-minute; `userActive` drives everything downstream.)*
3. **adm-11 P0-2 — yuan bulk-approve UUID→`resolveLegacyAdminId()`** (varchar(10) overflow hard-errors the only working approve path). ภูม. 15min.
4. **adm-11 P0-4 — yuan manual-create `paystatus '2'→'1'`** (restore 2-admin separation) + customer notify. ภูม. 30min.
5. **adm-08 P0-B — juristic cluster → `tb_corporate`** (queue + verify/reject/lookup/convert; follow the working `adminUpdateCorporate`). เดฟ. ~4h. *(8,898 juristic records invisible.)*
6. **adm-10 P0-4 — render `AdminServiceOrderUpdateForm` in `legacy-view.tsx`** (cancel/status/note already target `tb_header_order`; 1-wire unblocks 21,950 orders). ภูม. ~1h. *(Highest leverage in the shop lane.)*
7. **adm-08 P0-A — customer-identity edit on `tb_users`** (`adminUpdateUserIdentity`; delete orphaned `editCustomer`). เดฟ. ~2h.
8. **adm-09 P0-1/P0-2 — forwarder list-bar `bulkUpdateStatus`/`bulkAssignDriver` → `tb_forwarder`/`driver-batches`** (faithful actions already exist). ภูม. ~5h. *(= open task #41.)*
9. **adm-09 P0-3 / adm-10 P0-1 — dual-mode detail-page editor on legacy rows** (the shared UUID-vs-legacy architecture call) + the **5-tab service-order workflow** (quote 1→2 unblocks the NEW-order revenue path). เดฟ (architecture) + ภูม (handlers). ~10-14h. *(Biggest single build.)*
10. **adm-12 P0-1 — `pay-users.php` pay-on-behalf** (`tb_wallet`/`tb_wallet_hs`/`tb_header_order`/`tb_forwarder`/`tb_receipt` + promo/corporate math). เดฟ. ~8h. *(Primary phone/LINE-customer fulfillment path; shares the MS-1 wallet spine.)*
11. **adm-12 P0-3 + adm-13 P0-1 — `reports.ts` 5 fetchers → `tb_*`** (all profit/rep/otp dashboards blank on prod). ภูม. ~4-6h.
12. **adm-12 P0-2 — `/admin/accounting/closing` → `tb_receipt`** (month-end recon blank). ภูม. ~3h.
13. **adm-10 P0-2 + P0-3 — `/admin/service-orders/print` (admin auth) + `repayItem` per-item refund** (print dead-ends to user-pinned route; refund unported = hand-SQL money moves). เดฟ (print) + ภูม (refund). ~6h.
14. **FG-1 — customer popup → `tb_notify`/`tb_notify_read`** (correct adm-14 P0-3's table; member-portal announcement reaches no one). เดฟ. ~3h.

**Then P1 wave:** session-lock infra (one shared lib), 4-channel notify restoration, the 13 service-order header-edit handlers, classification management (adm-08), HR `tas_*` pivot, general rate-card editor, the missed subsystems MS-2…MS-6.

---

## Bottom line
The 7 admin docs are trustworthy and were written with real source reads — I found **zero fabricated death-flows** in a targeted verify of the worst claims. The risk is what they **didn't cover**: **`wallet.php` (deposit-slip/withdraw approval + cash-back) was assigned to no lane, and its primary approve action is a P0 cash-inflow dead-write** — this belongs at the TOP of the admin P0 list and needs a new lane (adm-15-wallet). Secondary misses: the admin China-search tool, the freight/HS-invoice history cluster, and a wrong-table error in adm-14's popup fix (`tb_notify_wp` → should be `tb_notify`). The cross-cutting root causes (rebuilt dead-write · duplicate-action-file · dual-mode detail page · read-faithful/write-dead · dead crons) mean a handful of pattern-level fixes + one architecture decision (retire the UUID path) clear most of the 57 admin P0s.
