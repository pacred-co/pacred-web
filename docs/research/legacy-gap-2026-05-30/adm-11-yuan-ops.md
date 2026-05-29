# adm-11-yuan-ops — Admin ฝากโอน ops (yuan payment · approve · refund) — legacy-gap audit

**Date:** 2026-05-30 · **Auditor lane:** adm-11-yuan-ops (admin side) · **Method:** AGENTS.md §0b deep-audit-from-source (read the actual `.php` on disk + the actual Pacred `.ts`/`.tsx` on `dave-pacred` HEAD — never a paraphrase).

> **TRUST-BUT-VERIFY result vs prior-art:** the prior `docs/audit/yuan-payments-fidelity-2026-05-30-evening.md` was written BEFORE the Tier-A merge (tasks #42-43). Several of its 🔴 P0s have since landed and are now CLOSED — re-verified here against current HEAD. Several remain OPEN. This doc supersedes the prior-art on what is actually broken **today**.

## Overview

**Legacy scope (source of truth):**
- `pcs-admin/payment.php` — 1,047 LOC, 3 modes:
  - **list / default** (L4-606) — DataTable of `tb_payment` + 4 status-tab COUNT badges + daterangepicker + inline "+เพิ่มรายการ" modal (admin-add).
  - **add handler** (L4-95) — admin creates a yuan-payment on a customer's behalf: wallet pre-check → INSERT `tb_payment` (paystatus defaults **'1' pending**) → debit `tb_wallet` → INSERT `tb_wallet_hs` type='6' status='1' → 2× LINE notify.
  - **update / detail** (L607-1047) — per-row APPROVE/REJECT form (renders only when `paystatus='1'`): session-lock gate → `imagesSlip` upload (required) → `payRateCost` numeric input (default `tb_settings.hRateCostDefault`) → `payStatus` select (2/3) with confirm dialog → POST computes `payTHBCost`/`payProfitTHB`, UPDATEs row, on '3' refunds wallet (`tb_wallet_hs` type='5' + `tb_wallet` credit), LINE-notifies. Terminal after flip. + wallet cards (own + cash-back) + `updateLock.php` 60s heartbeat.
- `pcs-admin/acc-payment.php` (24.5 KB) — accounting ledger: `tb_wallet_hs LEFT JOIN tb_payment ON p.ID=wh.refOrder AND wh.type=6`, year/month + daterangepicker filter, `printReceipt.php` print form, `companyType/department/section` gate hides totals/export.
- `pcs-admin/report-payments.php` (28 KB) — "รายงานฝากชำระเงิน" Chart.js graph + DataTable.
- `pcs-admin/report-payments-profit.php` (29 KB) — "กำไรฝากโอนหยวน" profit-margin report.
- `include/pages/payment/{getUserID,scriptUser,updateLock,QRPay,QRPay copy}.php` — 5 AJAX endpoints.

**Pacred scope (compare target):**
- Routes: `(admin)/admin/yuan-payments/{page,[id]/page,new/{page,form}}.tsx` + interactive `{actions-cell,refund-modal,bulk-approve-bar,tb-bulk-bar}.tsx`.
- Actions: `actions/admin/yuan-payments.ts` (update + refund-modal — MIXED tables), `actions/admin/yuan-payments-tb.ts` (manual-create — `tb_payment` ✅), `actions/admin/tb-bulk.ts §2` (bulk-approve — `tb_payment` ✅), `actions/admin/tb-payment.ts`, customer `actions/payment.ts` (create/list/detail — `tb_payment` ✅), `lib/legacy-paystatus-map.ts` (status helpers).
- Adjacent: `/admin/accounting/payment` (acc-payment 1:1 ✅), `/admin/reports/{payment,yuan-profit}`, `/admin/settings/legacy-rates` (rate editor ✅ — NEW since prior-art).

**% complete (admin yuan-ops): ~62%.**
Reads are solid (list + detail + accounting ledger all read `tb_payment`/correct join). The **write/approve workflow is the hole**: the per-row approve/reject form is still not built (detail page is read-only), the bulk-approve has a varchar(10) overflow bug, the refund modal + per-row action components are wired to the empty rebuilt table and are mounted nowhere, the manual-create still inserts paystatus='2' (SOD bypass) with no LINE notify, and the profit report reads the empty rebuilt table.

**Legacy flow count (admin lane): 11 distinct workflows** (list+tabs · admin-add · approve · reject+refund · session-lock · wallet-cards · profit-report · acc-ledger · payments-report · rate-config · print-receipt).

| Bucket | Count |
|---|---|
| ✅ present + correct + correct-order | 4 |
| 🟡 partial / flow-order or detail drift | 4 |
| ❌ missing | 1 |
| 💀 dead-write / dead-component (looks present, isn't) | 2 |

---

## Workflow-by-workflow gap table

| # | Legacy flow | Pacred equivalent | Status | Flow-order correct? | Owner |
|---|---|---|---|---|---|
| W1 | **List + 4 status tabs + date window** (`payment.php` default; tab COUNT badges all/1/2/3 scoped to date; default last-60-day) | `yuan-payments/page.tsx` reads `tb_payment` ✅, 60-day default ✅, 4 tabs ✅ | 🟡 | mostly | ภูม |
| W2 | **Admin-add (manual create)** — wallet pre-check → INSERT `tb_payment` **paystatus='1'** → debit `tb_wallet` → `tb_wallet_hs` type='6' → LINE notify ×2 | `adminCreateYuanPaymentManual` (`yuan-payments-tb.ts`) writes `tb_payment` ✅ + wallet debit ✅ + `tb_wallet_hs` type='6' ✅ | 🟡 | **NO** — inserts **paystatus='2'** (legacy='1'); no LINE notify | ภูม |
| W3 | **Per-row APPROVE** (`paystatus 1→2`) — slip upload + `payRateCost` input + confirm → compute profit + UPDATE + LINE notify | `adminUpdateYuanPayment` (`yuan-payments.ts`) writes `tb_payment` ✅ + notify ✅ — BUT **no UI mounts it** (`[id]/page.tsx` is read-only; `actions-cell.tsx` mounted nowhere) | ❌ | n/a (unreachable) | ภูม |
| W4 | **Per-row REJECT** (`paystatus 1→3`) + wallet refund (`tb_wallet_hs` type='5' + `tb_wallet` credit) + LINE notify | `adminUpdateYuanPayment` refund branch writes `tb_payment` + `tb_wallet_hs` type='5' ✅ — but **unreachable** (same as W3) + refund gated on `paydeposit='1'` (legacy refunds unconditionally) | ❌ | n/a (unreachable) | ภูม |
| W5 | **Bulk approve** `1→2` (NOT in legacy — Pacred superset) | `adminBulkApproveYuanPaymentsTb` (`tb-bulk.ts`) writes `tb_payment` ✅, wired to `<TbYuanBulkBar>` ✅ | 💀 | n/a | ภูม |
| W6 | **Refund-with-slip modal** (Phase-C QoL over legacy) | `YuanRefundModal` + `adminMarkYuanPaymentRefunded` write **rebuilt `yuan_payments`** (empty) + mounted NOWHERE | 💀 | n/a | ภูม |
| W7 | **Profit-margin report** (`report-payments-profit.php`) | `/admin/reports/yuan-profit` → `getYuanProfitReport` reads **rebuilt `yuan_payments`** (empty on prod) | 💀 | n/a | ภูม |
| W8 | **Accounting ledger** (`acc-payment.php`: `tb_wallet_hs ⋈ tb_payment` type=6) | `/admin/accounting/payment/page.tsx` same join ✅ | ✅ | yes | ภูม |
| W9 | **Payments report** (`report-payments.php` graph + table) | `/admin/reports/payment` table rewrite ✅ (Chart.js graph not ported) | 🟡 | yes (graph missing) | ภูม |
| W10 | **CNY rate config** (`tb_settings.rpDefault` + `hRateCostDefault`) | `/admin/settings/legacy-rates` writes `rpdefault` ✅; `getCurrentYuanRate` reads `rpdefault` ✅ — `hratecostdefault` editor NOT wired | 🟡 | yes (cost-rate read-only) | ภูม |
| W11 | **Session-lock** (`payLockDate` + `updateLock.php` 60s heartbeat + lock-screen) | none | ❌ | n/a | ภูม |
| W12 | **Print receipt** (`acc-payment.php` → `printReceipt.php?id=`) | no yuan-payment print path | ❌ | n/a | ภูม |
| AUX | **Two wallet ledgers** — customer-submit wallet-paid debits **rebuilt `wallet_transactions`**; admin refund credits **legacy `tb_wallet`/`tb_wallet_hs`** | split across `actions/payment.ts` vs `actions/admin/yuan-payments.ts` | 💀 | n/a (correctness risk) | เดฟ |

---

## Death-flows (P0/P1 — detailed)

### 🔴 P0-1 — Per-row APPROVE/REJECT form not built; detail page is read-only (W3 + W4)
**Owner: ภูม**
`/admin/yuan-payments/[id]/page.tsx` docblock literally reads *"Wave 7 read-only · ปุ่ม approve/reject + auto-credit wallet → Wave 8"* and it does NOT mount `<YuanPaymentActions>`. The component `actions-cell.tsx` (`YuanPaymentActions`) DOES exist and DOES call the now-correct `adminUpdateYuanPayment` (writes `tb_payment`), but `grep` confirms it is **imported/mounted in ZERO pages**. The list page's "จัดการ" column is a plain `<Link>` to `/[id]`. Net effect: **a staff member cannot approve or reject a single customer ฝากโอน row from Pacred admin UI** — they must either use the legacy PHP or the bulk-approve bar (which is `1→2` only, no reject, no `payRateCost` capture). The legacy approve form's load-bearing inputs (`imagesSlip` proof upload + `payRateCost` cost-rate → profit calc) have no Pacred surface.
**Fix:** mount an approve/reject form on `[id]/page.tsx` (gated `paystatus==='1'`) that calls `adminUpdateYuanPayment` with a `cost_rate` input (default from `tb_settings.hratecostdefault`) + status select + confirm dialog, mirroring `payment.php` L853-897. The action already does the profit math + notify + wallet-refund correctly. NOTE the action uses the 5-state enum (`processing/completed/failed/refunded`) while legacy + the `[id]` page use 1/2/3 — reconcile the UI to legacy 2-outcome (สำเร็จ/ไม่สำเร็จ) per "100% sameness FIRST".

### 🔴 P0-2 — Bulk-approve writes a 36-char UUID into `tb_payment.adminid varchar(10)` (W5)
**Owner: ภูม**
`adminBulkApproveYuanPaymentsTb` (`tb-bulk.ts` L318) does `.update({ paystatus: "2", adminid: adminId, paydateadmin: nowIso })` where `adminId` is the **Supabase auth UUID (36 chars)**. Migration `0081` L3626 declares `tb_payment.adminid character varying(10) NOT NULL`. Writing a 36-char value throws Postgres `22001 value too long for character varying(10)` → the bulk UPDATE **fails for the whole batch** and surfaces a raw error in the bar. The single-row `adminUpdateYuanPayment` correctly resolves the legacy slug via `resolveLegacyAdminId()`; the bulk action skips that helper. This is the exact bug `resolveLegacyAdminId()` exists to prevent. Bulk-approve is the ONLY working approve path today, and it is broken.
**Fix:** in `adminBulkApproveYuanPaymentsTb`, resolve `const legacyAdminId = await resolveLegacyAdminId();` (import the shared `lib/auth/safe-legacy-admin-id.ts`) and write that instead of `adminId`. One-line. (Verify on prod whether the column truncates or hard-errors — Supabase REST returns the error, so the bar shows ❌ and nothing approves.)

### 🔴 P0-3 — Yuan profit report reads the empty rebuilt table (W7)
**Owner: ภูม**
`/admin/reports/yuan-profit/page.tsx` → `getYuanProfitReport` (`actions/admin/reports.ts` L308) does `.from("yuan_payments")`. That rebuilt table is **empty on prod** (the ~1,460 real yuan payments live in `tb_payment`). Accounting + management open the report and see **0 rows / ฿0 profit**. This is the only P&L view for the ฝากโอน business line.
**Fix:** rewrite `getYuanProfitReport` to read `tb_payment` (project `payyuan, payrate, payratecost, paythb, paythbcost, payprofitthb, paydateadmin, paystatus='2'`) mirroring `report-payments-profit.php`. Mind the column-name casing (`payratecost` not `cost_rate`).

### 🔴 P0-4 — Manual-create inserts paystatus='2' (separation-of-duties bypass) + no LINE notify (W2)
**Owner: ภูม**
`adminCreateYuanPaymentManual` (`yuan-payments-tb.ts` L202) inserts `paystatus: "2"` (approved-immediately). Legacy `payment.php` L34-46 INSERTs with NO `payStatus` → DB default **'1' (pending)** → a *second* admin must verify via the update form. Pacred's path lets one admin create + self-approve in a single click. The Tier-A1 wallet-debit fix HAS landed (wallet pre-check + `tb_wallet` decrement + `tb_wallet_hs` type='6' all present and correct — prior-art's biggest P0 is CLOSED), but the status shortcut + the **missing customer LINE/in-app notify** (legacy fires 2 `sendLine` calls at L65 + L83) remain.
**Fix:** insert `paystatus: "1"`; drop `paydateadmin`/`adminid` stamps at create time (they belong to the approval step); fire `sendNotification` to the customer ("มีรายการฝากโอน/ชำระใหม่จากแอดมิน · รอดำเนินการ"). Also reconcile `tb_wallet_hs.status`: legacy uses `'1'` for the create event, Pacred normalized to `'2'` — confirm with ภูม which the accounting ledger expects (the `acc-payment` join filters on `type=6` only, not status, so likely cosmetic — but document the choice).

### 🟠 P1-5 — Refund-with-slip modal is a dead component on the empty table (W6)
**Owner: ภูม**
`YuanRefundModal` (`refund-modal.tsx`) + its callers `uploadYuanRefundSlip` + `adminMarkYuanPaymentRefunded` (`yuan-payments.ts`) write the **rebuilt `yuan_payments`** table and reverse a **rebuilt `wallet_transactions`** debit. The modal is imported only by `actions-cell.tsx` (`YuanPaymentActions`) which is itself **mounted nowhere** → the entire slip-required refund flow is unreachable AND would no-op against `tb_payment` rows even if reached. It's good Phase-C code pointed at the wrong table.
**Fix (after P0-1):** when the approve/reject form is built on `[id]/page.tsx`, route "คืนเงิน + แนบสลิป" to a `tb_payment`-lane action (extend `adminUpdateYuanPayment` to accept an optional slip + write it to `tb_payment.imagesslipadmin`, since the rebuilt `refund_slip_path` column doesn't exist on `tb_payment`). The wallet credit-back already works on the tb-lane via the existing refund branch.

### 🟠 P1-6 — Two wallet ledgers: customer-submit debit vs admin refund credit hit different tables (AUX)
**Owner: เดฟ** (architecture / integration spine — cross-cutting)
Customer-side `createYuanPayment` (`actions/payment.ts` L404) writes a wallet-paid debit to **rebuilt `wallet_transactions`** (`kind='yuan_payment'`, status='pending'). But the admin reject/refund branch in `adminUpdateYuanPayment` credits **legacy `tb_wallet.wallettotal` + `tb_wallet_hs` type='5'**. So a wallet-paid customer payment that is later rejected has its **debit in one ledger and its refund in another**. Whether the customer's displayed balance nets correctly depends entirely on which ledger the dashboard balance reads — and the legacy refund branch additionally gates on `paydeposit==='1'` while legacy PHP refunded *unconditionally* (legacy always wallet-debits at create). This is a genuine balance-integrity risk that spans the customer/admin boundary; it needs an architecture decision on the canonical wallet ledger before launch, not a one-file patch. (Flagged here for completeness; the customer-submit half is also tracked by task #38.)

---

## Flow-order divergences

1. **Manual-create status (W2):** legacy admin-add → `paystatus='1'` (pending, awaits 2nd-admin verify); Pacred → `paystatus='2'` (auto-approved). **Order broken** — collapses the legacy 2-step create→verify into 1 step. (P0-4)
2. **Approve outcome model (W3):** legacy is a single form with `payStatus` select forcing a conscious choice between สำเร็จ('2')/ไม่สำเร็จ('3') + a required slip + a `payRateCost` input, all behind a "ไม่สามารถแก้ไขได้อีกภายหลัง" confirm; the `adminUpdateYuanPayment` action models a 5-state machine (`pending→processing→completed→…`) with `processing` having NO DB representation (`pacredToPaystatus('processing')→null`). Legacy has no "processing" step. If the future approve UI exposes "เริ่มโอน" (processing), it diverges from legacy's direct 1→2.
3. **Refund condition (W4):** legacy reject ALWAYS refunds the wallet (no `paydeposit` check — every yuan transfer was wallet-debited at create). Pacred refund branch only fires when `paydeposit==='1'`. A migrated row with `paydeposit` null/'0' but a real wallet debit would be rejected WITHOUT refund. Subtle but real.
4. **Status labels (W1):** SAME `tb_payment` row reads as **"อนุมัติแล้ว"** in admin list/detail but **"สำเร็จ"** in the customer page (`paystatusToStatus`) — and legacy uses "สำเร็จ" everywhere. Admin label drift from legacy. (per "100% sameness" the admin should say สำเร็จ/ไม่สำเร็จ/รอดำเนินการ.)
5. **Tab counts (W1):** legacy shows COUNT badges on all 4 tabs (all/1/2/3); Pacred shows only the รอตรวจ count. Operators lose the at-a-glance สำเร็จ/ไม่สำเร็จ totals.

---

## Modals / AJAX / cron / print inventory

| Legacy artifact | Purpose | Pacred status |
|---|---|---|
| `payment.php?page=add` inline modal | admin-add yuan payment (Select2 customer + live THB preview + PromptPay QR) | 🟡 `→ /new` page (not modal); recent-20 `<select>` not Select2; no QR; no wallet-balance display |
| `payment.php?page=update&id=N` | per-row approve/reject form | ❌ read-only detail page; no form |
| `getUserID.php` (AJAX) | populate Select2 with ALL `tb_users` userIDs | 🟡 recent-20 dropdown + `?q=PR…` preset (no live search) |
| `scriptUser.php` (AJAX) | on customer pick → show wallet balance + max-affordable CNY + render QR | ❌ Pacred shows nothing on customer pick (server-side wallet pre-check only) |
| `updateLock.php` (AJAX, 60s heartbeat) | session lock on the row being edited (`payLockDate` + `session` + `adminID`) | ❌ no session lock anywhere (13 admins on prod = collision risk) |
| `QRPay.php` / `QRPay copy.php` (AJAX) | PromptPay QR so admin shows customer a QR to top up wallet | ✅ design-diverge (Pacred yuan-payment is wallet-debit, not pay-by-QR; `lib/promptpay.ts` exists for wallet topup) |
| `printReceipt.php?id=` (from `acc-payment.php` L164) | print accounting receipt | ❌ no yuan-payment print path (Wave 29 printReceipt is for cnt/forwarder) |
| Chart.js graph (`report-payments.php`) | monthly payments line graph | ❌ not ported (table only) |
| daterangepicker presets (Today/Last7/Last30/This/Last Month) | quick date filters on list + acc-payment | ❌ plain `<input type=date>` |
| year/month dropdown (`acc-payment.php` L100-131) | month-end recon chooser | ❌ Pacred date-range only |
| **Cron** | — | none in this lane (legacy has no payment cron) |

---

## Recommended fixes (ranked, with owner)

| Rank | Fix | Effort | Owner | Closes |
|---|---|---|---|---|
| 1 | **Bulk-approve UUID→legacy-slug** — `adminBulkApproveYuanPaymentsTb` use `resolveLegacyAdminId()` not raw `adminId` (varchar(10) overflow) | 15 min | ภูม | P0-2 |
| 2 | **Manual-create paystatus '2'→'1'** + fire customer notify (drop create-time admin stamps) | 30 min | ภูม | P0-4 |
| 3 | **Yuan-profit report → `tb_payment`** — rewrite `getYuanProfitReport` off rebuilt `yuan_payments` | 2 h | ภูม | P0-3 |
| 4 | **Build per-row approve/reject form** on `[id]/page.tsx` (mount `YuanPaymentActions` or a legacy-faithful 1/2/3 form) calling `adminUpdateYuanPayment` w/ `cost_rate` input + confirm; reconcile UI to legacy 2-outcome labels | 4 h | ภูม | P0-1, W3, W4 |
| 5 | **Re-point refund-slip flow to tb-lane** — `adminMarkYuanPaymentRefunded` → `tb_payment` + `imagesslipadmin`; delete/rename the rebuilt-table `yuan-payments.ts` refund + `adminBulkApproveYuanPayments` (rebuilt) + dead `bulk-approve-bar.tsx` to `*-legacy` | 3 h | ภูม | P1-5 |
| 6 | **Wallet-ledger architecture decision** — pick ONE canonical wallet ledger; make customer-submit debit + admin refund use the same one; remove the `paydeposit` gate on refund (or backfill `paydeposit` on migrated rows) | design + ~4 h | เดฟ | P1-6 |
| 7 | **Wire `hratecostdefault` editor** in `/admin/settings/legacy-rates` (read+write); default the new approve-form cost-rate from it | 1 h | ภูม | W10 |
| 8 | **Admin status labels → legacy wording** (รอดำเนินการ/สำเร็จ/ไม่สำเร็จ) + 4 tab COUNT badges scoped to date window | 1 h | ภูม | W1 |
| 9 | **paytype enum reconcile** — legacy is 3 values (1=จ่ายผ่านเว็บไซต์จีน, 2=Alipay, 3=อื่นๆ); Pacred uses 1=Alipay/2=Wechat/3=Union/4=USDT. Decide canonical set; the customer write maps "bank"→'3' (legacy "อื่นๆ") so detail labels read "Union" wrongly | 1-2 h | ภูม | flow-order #—, surprises |
| 10 | **Session-lock** (`payLockDate` heartbeat) + **print-receipt** + **daterangepicker presets** + **year/month chooser** + **Chart.js graph** + **`numberPaymemt` display** + **wallet-balance/QR on add form** | Phase-C ~10-14 h | ภูม | W11, W12, modals |

---

## Notes for ภูม (re-verified vs prior-art)

- ✅ **CLOSED since prior-art:** customer-submit reads/writes `tb_payment` (F2); admin manual-create wallet-debit hole (Tier A1 — wallet pre-check + `tb_wallet` + `tb_wallet_hs` type='6' all present); `adminUpdateYuanPayment` update+refund pivoted to `tb_payment` (Tier A5); `getCurrentYuanRate` reads `tb_settings.rpdefault`; rate editor `/admin/settings/legacy-rates` exists (sell-rate).
- ❌ **STILL OPEN:** P0-1 (no approve/reject UI — biggest), P0-2 (bulk adminid overflow — NEW finding, prior-art missed it), P0-3 (profit report empty), P0-4 (manual-create '2' + no notify).
- **Duplicate action files:** `yuan-payments.ts` now MIXES tables — its `adminUpdateYuanPayment` + `adminSetYuanSlipTransferredAt` are split (update→`tb_payment` ✅; bulk + refund-modal + slip-time → rebuilt `yuan_payments` 💀). The cleaner split is: keep tb-lane writes in `yuan-payments-tb.ts`/`tb-bulk.ts`, move `adminUpdateYuanPayment` there too, and delete the rebuilt-table functions (`adminBulkApproveYuanPayments`, `adminMarkYuanPaymentRefunded`, `uploadYuanRefundSlip`, `adminGetYuanPaymentSlipSignedUrl`, `adminSetYuanSlipTransferredAt`) + the dead `bulk-approve-bar.tsx` once the tb-lane equivalents land.
- **Dead components confirmed by grep:** `YuanPaymentActions` (actions-cell.tsx) and `bulk-approve-bar.tsx` (`adminBulkApproveYuanPayments`) are mounted in ZERO pages. Only `TbYuanBulkBar` (→ `tb-bulk.ts`) is live.
