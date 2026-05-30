# 🎯 ภูม prep pack — 2026-05-31 (เดฟ pre-staged while ภูม runs his final batch)

> **Why this exists:** ภูม กำลังรันยาวรอบสุดท้ายบน admin-backend lane. เดฟ deep-audited the legacy PHP source (AGENTS.md §0b) for **all of ภูม's "remaining" P0/P1 items** so that when ภูม's run finishes, we pick up the genuinely-open work in minutes — no re-derive. **READ-ONLY prep: no `.ts` touched, zero collision with ภูม's active run.**
>
> **Source of truth:** `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/member/pcs-admin/` · compared against live `dave-pacred` HEAD `2009f66f`.

---

## 🔑 HEADLINE — the gap audit (2026-05-30) is now ~60% STALE on ภูม's lane

Most of the "remaining" P0/P1 items the master gap audit assigned to ภูม **were already shipped** (Wave 31 + the 2026-05-30-night batch + P0-13/P0-16). Verified per-item against live code + git commits. **Do NOT re-implement these — re-writing a faithful action that already exists creates a duplicate-write-path landmine (root-cause pattern #2).**

### ✅ VERIFIED DONE (skip — do not touch)
| Item | Why it's done | Evidence |
|---|---|---|
| **P0-10** yuan bulk-approve UUID | live path `adminBulkApproveYuanPaymentsTb` already calls `resolveLegacyAdminId()` | `actions/admin/tb-bulk.ts:316,333` + regression test `tb-bulk-yuan-uuid.test.ts` |
| **P0-11** yuan per-row form | `actions-cell.tsx` + `refund-modal.tsx` mounted, call `adminUpdateYuanPayment` (tb_payment) | `…/yuan-payments/[id]/page.tsx:251` |
| **P0-14** status-flip/cancel on legacy-view | Wave 31 mounts the form in legacy-view; writes `tb_header_order`, cancel=`'6'` | `service-orders/[hNo]/legacy-view.tsx` |
| **P1-10** Tab-4 spawn 4→5 + promo + notify | done by P0-13 | `service-orders-spawn.ts` |
| **P0-20** 5 profit reports → tb_* | rewritten in-place | commit `ffd5a142` `actions/admin/reports.ts` |
| **P0-21** closing → tb_receipt by rdate | pivoted | commit `00abfafb` `…/accounting/closing/page.tsx` |
| **P0-22** 3 crons retargeted tb_* | refresh-active→`tb_users.useractive`, digest→`tb_wallet_hs`, expire-probation→`tb_admin` | 2026-05-30-night batch |
| **P1-1/2/4/5** forwarder bulk status/driver + earn-trigger | `bulkUpdateStatus` delegates to `adminBulkUpdateForwarderTbStatus`; `tb_forwarder_driver` batch shape written; earn-trigger on fStatus=7 | task #41 closed |

---

## 🟡 ACTUALLY OPEN — the real remaining ภูม work (pre-spec'd, ready to execute)

Ordered by leverage. Each links to its full spec. **S** ≈ <2h · **M** ≈ 2-6h.

| # | Gap | Effort | Spec | Lane / note |
|---|---|---|---|---|
| 1 | 🔴 **Reports reachability** — all **5** profit/report pages are ORPHANS (no hub link · §0d violation). Render real data now but unreachable. | S | [reports.md §1-5](reports.md) | ภูม · highest leverage, lowest risk |
| 2 | **P0-12** yuan manual-create self-approve — `paystatus:'2'`→`'1'` (pending, await 2nd admin) + add customer `sendNotification` + `notifyStaffGroup` | S | [yuan-ops.md §P0-12](yuan-ops.md) | ภูม · 1-line + notify at `yuan-payments-tb.ts:201` |
| 3 | **Reports vat7 fidelity** — DROP invented `vat7` on forwarder+yuan; **RESTORE** vat7 on shops (legacy HAS it) + recompute shops profit `(htotalpricechn+hshippingchn)*hrate − hratecost*hcostall` w/ `hcostall!=0` gate | M | [reports.md §1-2](reports.md) | ภูม |
| 4 | **P1-12** — 8 missing shop header-edit handlers (update_cost · hRate · hShipBy · payMethod · crate · cPriceUpdate · interpreter-reassign · hard-delete item/order) + UI | M | [shop-ops.md §P1-12](shop-ops.md) | ภูม |
| 5 | **sales-monthly** report — revenue undercounts (missing `ftransportprice`+`fpriceupdate`) · wrong date key (`fdate`→`fdatestatus7`) · wrong rep source · `tb_sales_report` may be empty on prod (backfill?) | M | [reports.md §4](reports.md) | ภูม + owner Q4/Q5 |
| 6 | **P1-6/7/9** forwarder — single-container cnt-payment w/ **slip image** (`adminCreateCntPayment` is bulk-only, writes `cntImagesSlip:''`) · per-row bill-to-customer 4→5 (`update_forwarder_to5`) · `saveNote` (absent) | M | [crons-forwarder.md §P1-6/7/9](crons-forwarder.md) | ภูม |
| 7 | **P1-11 GAP2** — 2 mark-paid actions fire NO customer notify (legacy SMS carried the payment link) | S | [shop-ops.md §P1-11](shop-ops.md) | ภูม |
| 8 | **closing** polish — juristic split key decision (`corporatetype` snapshot vs `userCompany` live) + re-add per-row print button | S | [reports.md §6](reports.md) | ภูม + owner Q6 |
| 9 | **Daily-profit graph** — `getForwarderProfitDailySeries`+`getYuanProfitDailySeries` built+tested but unwired (legacy had the echarts line-graph) | S | [reports.md §1,3](reports.md) | owner Q1 (wire or delete) |

### ⚠️ Latent + cross-lane (flag, coordinate — don't solo)
- **`adminMarkForwarderPaid` money-path dead-write** (`actions/admin/forwarders.ts:257`) — reads rebuilt empty `forwarders` + `wallet_transactions`; **NO `-tb` twin exists**; imported by `/admin/forwarders/[fNo]/update-form.tsx`. On prod's 21,950 real forwarders → `not_found`, admin cannot record a forwarder payment. **This is a symptom of P1-3** (the dual-mode `[fNo]` page renders the editor only on the rebuilt-UUID branch). Fix lands WITH the P1-3 forwarder-detail rewrite (ภูม adm-09 lane, big) — must wire the ADR-0018 wallet contract (`tb_forwarder` + `tb_wallet`/`tb_wallet_hs`) then. **Verified by เดฟ from source.**
- **P0-10 residual:** `tb-bulk.ts:60` fallback uses `.slice(0,20)` but `tb_payment.adminid` is varchar(10) → harden to `.slice(0,10)` (a >10-char adminid would still 22001-overflow). Tiny.
- **`adminMarkServiceOrderPaid`** (`service-orders.ts:329`) writes empty rebuilt `service_orders` — dead for real orders; live path is `adminMarkServiceOrderPaidTb`. Repoint or tombstone.

---

## ❓ Open questions for owner / ภูม (collected from all 4 specs)
1. **Daily-profit echarts graph** — want it back (legacy had it on forwarder+yuan+shops)? Wire all 3 or delete the 2 orphan fns?
2. **VAT7** — confirm it belongs on **shops-profit ONLY** (forwarder+yuan legacy show no VAT).
3. **Shops profit** — stored cols vs recompute-from-CNY×rate as canonical for accounting?
4. **sales-monthly source** — is `tb_sales_report` populated on prod? (`SELECT count(*) FROM tb_sales_report;`) If empty → port the backfill, or compute live off `fdatestatus7`?
5. **sales-rep attribution** — commission to rep AT DELIVERY (legacy snapshot `srAdminIDSale`) or customer's CURRENT rep?
6. **closing juristic split** — `tb_receipt.corporatetype` (snapshot) vs `tb_users.userCompany` (legacy live flag)?
7. **OTP report** — keep Pacred-added date filter + invented `purpose` col, or strip to legacy's list-everything shape?
8. **yuan P0-12 staff-notify target** — `notifyStaffGroup()` is a no-op until `LINE_STAFF_GROUP_ID` set (the activation item already pending owner).
9. **yuan approve fidelity** — legacy `payment.php:859-877` requires a slip + real cost-rate on approve (stamps `paythbcost`/`payprofitthb`); Pacred approve does a bare status flip → margin under-reports. Add the slip+cost-rate step? (gap inside the already-built P0-11 form)

---

## 📋 Detail specs
- [yuan-ops.md](yuan-ops.md) — P0-10 (done) / P0-11 (done, 2 fidelity gaps) / **P0-12 (open)**
- [shop-ops.md](shop-ops.md) — P0-14 (done) / P1-10 (done) / P1-11 (mostly done, notify gap) / **P1-12 (open, 8 handlers)**
- [reports.md](reports.md) — P0-20 (done) / P0-21 (done) — **remaining: reachability + vat7 + sales-monthly + graph**
- [crons-forwarder.md](crons-forwarder.md) — P0-22 + P1-1/2/4/5 (done) — **remaining: P1-6/7/9 + adminMarkForwarderPaid escalation**

> Lane discipline: every "open" item above is **ภูม's lane** (admin backend). เดฟ does NOT execute these — เดฟ pre-staged the specs only. When ภูม's run finishes + ภูม pulls main, this pack tells him exactly what's left. The owner-decision items (Q1-9) want a quick owner pass before the M-effort report/sales-monthly work.
