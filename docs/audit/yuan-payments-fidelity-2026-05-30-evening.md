# ฝากโอน (yuan-payments) — fidelity gap audit
2026-05-30 evening · D1 Phase-B faithful-port audit · AGENTS.md §0b protocol

> **Scope:** the customer-facing ฝากโอน/ฝากชำระ flow (เดิม `member/payment.php`) AND
> the admin yuan-transfer back-office (เดิม `pcs-admin/payment.php` +
> `pcs-admin/acc-payment.php` + `pcs-admin/report-payments.php` +
> `pcs-admin/report-payments-profit.php`). Excludes the WALLET-side
> (`tb_wallet` topup) and the `tb_payment` adjacent admin "user → payment
> history" (`include/pages/users/profile-payment.php` — leaf admin-customer
> page, separately audited under wave-22 admin merge).
>
> **Method (per AGENTS.md §0b):** read every actual `.php` mode dispatcher
> on disk (NOT screenshots), enumerate every `$_GET`/`$_POST` branch +
> `include/pages/payment/*.php` sub-handler, then diff each artifact against
> Pacred's `/admin/yuan-payments/**` + `/service-payment/**` + adjacent
> reports + the `tb_payment`-related server actions.
>
> **Legacy source-of-truth paths (verified on disk):**
> - `D:\REALSHITDATAPCS\pcsc\public_html\member\payment.php` (customer · the file map says lines 4-540 are the default/list branch)
> - `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\payment.php` (admin · **75,647 bytes / 1,055-ish LOC, 3 modes**)
> - `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\acc-payment.php` (admin · accounting ledger view of fulfilled payments · 24,510 bytes)
> - `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\report-payments.php` (admin · "รายงานฝากชำระเงิน" graph + DataTable · 28,063 bytes)
> - `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\report-payments-profit.php` (admin · profit-margin report · 29,089 bytes)
> - `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\include\pages\payment\*.php` (5 AJAX endpoints)
>
> **Pacred equivalents discovered:**
> - `app/[locale]/(admin)/admin/yuan-payments/page.tsx` (admin list)
> - `app/[locale]/(admin)/admin/yuan-payments/[id]/page.tsx` (admin detail)
> - `app/[locale]/(admin)/admin/yuan-payments/new/{page,form}.tsx` (admin manual create)
> - `app/[locale]/(admin)/admin/yuan-payments/{bulk-approve-bar,tb-bulk-bar,actions-cell,refund-modal}.tsx` (interactive bits)
> - `app/[locale]/(admin)/admin/accounting/payment/page.tsx` (the `acc-payment.php` ledger transcription)
> - `app/[locale]/(admin)/admin/reports/payment/page.tsx` (the `report-payments.php` Tailwind rewrite)
> - `app/[locale]/(admin)/admin/reports/yuan-profit/page.tsx` (the `report-payments-profit.php` rewrite — **READS REBUILT `yuan_payments` TABLE**)
> - `app/[locale]/(protected)/service-payment/page.tsx` (customer list — 1:1 transcription of `member/payment.php` default branch)
> - `app/[locale]/(protected)/service-payment/{add,[id]}/page.tsx` (customer create + detail)
> - `actions/payment.ts` (customer create/list/detail · writes `tb_payment` ✅)
> - `actions/admin/yuan-payments.ts` (refund + status helpers · **writes REBUILT `yuan_payments` table**)
> - `actions/admin/yuan-payments-tb.ts` (admin manual create · writes `tb_payment` ✅)
> - `actions/admin/tb-payment.ts` (V-A1 slip-transfer-time editor · writes `tb_payment` ✅)
> - `actions/admin/tb-bulk.ts §2` (bulk approve · writes `tb_payment` ✅)
>
> **Counts (this audit):** ✅ 22 in-parity · ⚠️ 18 partial · ❌ 23 missing · 🔧 11 schema-drift bugs · 5 🔴 P0 launch-blockers
>
> **Critical structural finding (load-bearing):** the system is **split across
> TWO TABLES** under D1. `tb_payment` is the SOT (customer + admin list +
> manual create + bulk approve + slip-time editor all hit it correctly).
> But `actions/admin/yuan-payments.ts` (refund + per-row approve via
> `actions-cell.tsx` + `YuanRefundModal`) **still writes the rebuilt
> `yuan_payments` table — which IS EMPTY ON PROD per the page docblock**.
> Result: clicking "เริ่มโอน / ปฏิเสธ / คืนเงิน" on a `tb_payment` row from
> `/admin/yuan-payments/[id]` will silently fail (no_found in the rebuilt
> table) and never approve/reject the customer's actual `tb_payment` row.
> This is a 🔴 P0.

---

## 1. List view — `/admin/yuan-payments` vs legacy `pcs-admin/payment.php` (default mode)

Legacy default-mode body (~payment.php L96-466):
- **List query (L153-180):** `tb_payment` LEFT JOIN `tb_users` on userID with `payDate · payStatus · payType · payDetail · payTHB · adminID · adminIDUpdate · userPicture · coID · userFullname` columns; date window default = LAST 60 DAYS (L176-178); `?q=1/2/3` status filter (L160-164); `?date=Y-m-d - Y-m-d` range filter + monthly group via `?year=YYYY&month=MM`.
- **4 status tabs (L243-276):** ทั้งหมด · รอดำเนินการ · สำเร็จ · ไม่สำเร็จ, each rendered with a `pcs-badge` showing the count scoped to the same date window.
- **Table columns (L280-294):** วันที่สร้าง (date+time stacked) · เลขที่ออเดอร์ (id) · ชื่อ-นามสกุล (avatar + PR####`<br/>fullname` + VIP badge `badgeVIP2($coID)`) · รายละเอียด (`countText(payDetail,120)`) · วิธีการชำระ · ยอดรวม(บาท) (red, formatted `-payTHB`) · สถานะ · อัปเดต (`adminIDUpdate`) · ตัวเลือก (button "แก้ไขข้อมูลและดูรายละเอียด" gated by `departmentKey` ∈ {CEO, Manager, QAAndQC, Accounting, ITDT}).
- **Header "+เพิ่มรายการ" button (L203-208)** opens an in-page modal that POSTs `payment.php?page=add` to admin-create a row.

Pacred current state — `/admin/yuan-payments/page.tsx` (Wave 7.1 + 15 P0-2):

| # | Element | Legacy spec | Pacred | Status | Notes |
|---|---|---|---|---|---|
| L-01 | List query source | `tb_payment` + `tb_users` JOIN | `tb_payment` + 2-pass `tb_users` merge | ✅ | row-clamp `limit(200)` — different from legacy |
| L-02 | Default 60-day window | L176-178 | Wave 15 P0-2 `resolveDateWindow` | ✅ | with `?all=1` escape hatch |
| L-03 | Date-range `?date=A - B` | L166-174 | Replaced by `?from=Y-m-d&to=Y-m-d` (split) | ⚠️ | UX equivalent but URL-format diverges; legacy daterangepicker monthly chooser absent |
| L-04 | Monthly group `?year+month` | L169-174 | ❌ missing | ❌ | accounting uses this for month-end recons |
| L-05 | Status tabs (4) | L243-276 | 4 tabs ทั้งหมด/รอตรวจ/อนุมัติ/ปฏิเสธ | ✅ | labels diverge (รอตรวจ vs รอดำเนินการ) — minor copy drift |
| L-06 | Per-tab badge counts scoped to date window | L213-241 | only "X รอตรวจ" header chip | ⚠️ | other 3 tabs render no count chip |
| L-07 | Customer column: avatar + PR + fullname + VIP badge | L321-326 | userid + name + tel; **no avatar, no VIP badge** | ⚠️ | `badgeVIP2($coID)` not ported |
| L-08 | Column: รายละเอียด (truncated `countText(detail,120)`) | L327-329 | "ช่องทาง" column shows `paydetail` truncated 160 px | ⚠️ | shown but in wrong column position; legacy had separate ช่องทาง + รายละเอียด columns |
| L-09 | Column: ยอดรวม(บาท) red `-N` | L333-335 | ฿N (right-aligned, NOT negative-prefixed) | ⚠️ | legacy implies WITHDRAWAL semantics; Pacred just shows amount |
| L-10 | Columns: หยวน + เรท + กำไร | not in legacy list | ✅ NEW Pacred columns | ✅+ | Pacred-original improvement (Wave 15) — KEEP |
| L-11 | Column: สลิป "ดู" link | not in legacy list | ✅ NEW Pacred column | ✅+ | useful — KEEP |
| L-12 | Column: อัปเดต (adminIDUpdate) | L339-341 | shown inline under status chip | ✅ | placement diverges but field present |
| L-13 | departmentKey RBAC gate on row button (L343) | CEO/Manager/QAAndQC/Accounting/ITDT | `requireAdmin(["ops","accounting"])` | ⚠️ | Pacred role mapping incomplete — legacy QA/Manager/ITDT can view but Pacred ops can NOT see all accounting fields (mismatch) |
| L-14 | "+เพิ่มรายการ" button | L203-208 (opens inline modal) | `<Link>` to `/new` page | ✅ | UI pattern diverges (modal vs page) but functionally same |
| L-15 | DataTables sort/paginate/responsive (L552-560) | DataTables JS | static 200-row table, no client sort | ❌ | accounting habit broken — `pageLength=All` legacy default |
| L-16 | Daterangepicker (Today/Last 7/30/This/Last Month presets) | L477-490 | plain `<input type="date">` | ❌ | preset shortcuts gone |
| L-17 | Search by `userid` OR numeric `id` | not in legacy default | ✅ NEW Pacred feature | ✅+ | KEEP (legacy didn't have, but search is good) |
| L-18 | Pending count chip "X รอตรวจ" | not in legacy header | ✅ NEW Pacred feature | ✅+ | KEEP |

**🔴 P0-L:** L-15 + L-16 — accounting team uses DataTables export (copy/csv/excel/print) + daterangepicker presets for daily/weekly reconciliation. Both gone.

**Schema/casing 🔧:** L-13 — Pacred maps to roles `ops`/`accounting`/`super` but legacy gate was `CEO|Manager|QAAndQC|Accounting|ITDT`. ภูม Wave 22 merged `tb_admin` → `admins` so the QA/Manager roles don't exist in V3 RBAC. **Effect:** Pacred QA staff (who legacy could view) currently see 403.

---

## 2. Detail / edit view — `/admin/yuan-payments/[id]` vs legacy `pcs-admin/payment.php?page=update&id=N`

Legacy update-mode body (~payment.php L607-981) is HUGE — 374 LOC for ONE row screen. Highlights:

- **Session lock (L693-695):** `SELECT * FROM tb_payment WHERE (ID=N AND payLockDate < NOW()) OR (ID=N AND session=current_session)` — only opens if not held by another admin's session; `updateLock.php` AJAX heartbeats every 60s (L935-946) extending `payLockDate`.
- **Wallet cards (L761-811):** TWO big cards side-by-side — customer's own wallet (`tb_wallet.walletTotal` + `tb_cash_back.cbTotal`) + system-wide totals (`SUM tb_wallet.walletTotal` + `SUM tb_cash_back.cbTotal`).
- **Left panel (L827-851):** เวลาทำรายการ · จาก (avatar+PR+name link to user profile) · โทร (clickable tel:) · จำนวนเงินหยวน (-`payYuan` red) · เรทฝากชำระ (`payRate` ฿/หยวน) · จำนวนเงินบาท (-`payTHB` red) · payStatus badge · รายละเอียด (chat-bubble style).
- **Right panel (L852-911) — APPROVE FORM** (only renders when `payStatus='1'`):
  - **`imagesSlip` file upload (L857-860)** — admin attaches slip via dropify (the admin uploads PROOF that the Alipay transfer happened, NOT the customer's pre-existing slip).
  - **`payRateCost` numeric input (L877)** — admin enters the ACTUAL cost-rate (the rate Pacred paid for CNY today). Default from `tb_settings.hRateCostDefault` (L865); legacy POST handler computes `payTHBCost = payYuan * payRateCost`, `payProfitTHB = payTHB - payTHBCost`, then UPDATE.
  - **`payStatus` select (L882-890)** — 3 options preserving current value: รอดำเนินการ/สำเร็จ/ไม่สำเร็จ.
  - **Confirm button** → POSTs with `onsubmit="return confirm('คุณแน่ใจเหรอ? รายการนี้ไม่สามารถแก้ไขได้อีกภายหลัง!!');"`.
- **POST handler (L607-691):**
  - `payStatus='2' approved`: UPDATE `tb_payment` SET `payProfitTHB · payTHBCost · payRateCost · payStatus='2' · payDateAdmin=NOW() · adminID/adminIDUpdate=current`; `saveHistory($sql,22)`; LINE notify (`sendLine($userLineNotify, 'รายการฝากโอน/ชำระ เลขที่# สถานะ:สำเร็จ')`).
  - `payStatus='3' rejected`: SAME update + **REFUND wallet** — INSERT `tb_wallet_hs` (`type=5` คืนเงิน), UPDATE `tb_wallet` SET `walletTotal = walletTotal + payTHB` (the legacy 1-row-write approach — no ledger trigger like Pacred's 0007).
- **Post-approval read-only view (L898-909):** 5 stat rows — จ่ายจริง `payTHBCost` · รับจากลูกค้า `payTHB` · เรทต้นทุน `payRateCost` · เรทลูกค้า `payRate` · กำไรสุทธิ `payProfitTHB`. Visible after status flips.

Pacred current state — `/admin/yuan-payments/[id]/page.tsx`:

| # | Element | Legacy spec | Pacred | Status |
|---|---|---|---|---|
| D-01 | Session-lock via `payLockDate` (L693-695 + L935-946 AJAX) | yes — prevents 2 admins editing same row | ❌ not implemented | ❌ |
| D-02 | Customer wallet card (own + system-wide) | L761-811 | ❌ not shown | ❌ |
| D-03 | Cash-back display | `tb_cash_back.cbTotal` | ❌ not shown | ❌ |
| D-04 | Read-only summary KVs (id, status, type, customer, amounts) | L824-840 | ✅ KV layout | ✅ |
| D-05 | Customer link → `/users/profile/PR####` | L832 | ✅ `/admin/customers/<userid>` | ✅ |
| D-06 | Clickable tel: link | L834 | ❌ phone shown but not clickable | ⚠️ |
| D-07 | Per-row APPROVE form when paystatus='1' | L854-897 | ❌ READ-ONLY — page footer says "Wave 7 read-only · ปุ่ม approve/reject + auto-credit wallet → Wave 8" | 🔴 **P0** |
| D-08 | `imagesslipadmin` upload UI on approve | L857-860 dropify | ❌ not in detail page; only on `/new` manual-create flow | ❌ |
| D-09 | `payRateCost` admin numeric input | L877 | ❌ not editable here — populated only on manual-create or via bulk-approve which doesn't capture it | 🔴 **P0** |
| D-10 | Default cost rate from `tb_settings.hRateCostDefault` | L865-871 | ⚠️ `rsdefault` (sell-rate) used as approximation; HRateCost specifically NOT read | 🔧 |
| D-11 | payStatus select 1/2/3 transition with confirm dialog | L882-894 | ❌ no UI; `<YuanPaymentActions>` exists (`actions-cell.tsx`) but **writes WRONG TABLE** | 🔴 **P0** |
| D-12 | Post-approval profit stats (จ่ายจริง / รับจากลูกค้า / เรท × 2 / กำไรสุทธิ) | L898-909 | ⚠️ `payprofitthb` + `paythbcost` shown but unlabeled as "actual cost/profit" — KV labels diverge | ⚠️ |
| D-13 | LINE notify on status change | L651-655, L683-687 | ✅ via `sendNotification` BUT only from REBUILT-table action; tb_payment-table action has NONE | 🔴 (chain depends on P0 in D-11) |
| D-14 | Wallet refund on reject (payStatus='3') | L658-690 | ⚠️ `actions-cell.tsx` → `adminUpdateYuanPayment` → `wallet_transactions` cancel (REBUILT TABLE) | 🔴 same chain |
| D-15 | Both slips visible (customer's `imagesslip` + admin's `imagesslipadmin`) | only `imagesSlip` legacy field | ✅ Pacred renders BOTH via `resolveLegacyUrl(slip)` | ✅+ |
| D-16 | Breadcrumb (หน้าแรก / รายการฝากชำระสินค้า / #ID) | L714-721 | ⚠️ uses simple "← รายการ" link only | ⚠️ |
| D-17 | Print-receipt button (`printReceipt.php?id=`) | L164 in `acc-payment.php` exposes — exists from this detail too via menu | ❌ no print path | ❌ |
| D-18 | `saveHistory(sql,22)` audit log | L650, L664 | ✅ would-be via `withAdmin/logAdminAction` IF the right table were written | ⚠️ same chain |

**🔴 P0-D:** D-07 + D-09 + D-11 — staff currently **cannot approve a real customer ฝากโอน row from Pacred admin UI**. They have to use the legacy PHP. The customer-submitted `tb_payment` row with paystatus='1' has NO Pacred admin action available — `actions-cell.tsx` calls `adminUpdateYuanPayment` which selects `from("yuan_payments")` (rebuilt schema) by UUID, but the customer row has bigint id and is in `tb_payment`. The action returns `not_found` silently (or the call never fires because `[id]/page.tsx` doesn't even mount `<YuanPaymentActions>` — it's read-only).

---

## 3. New / manual create — `/admin/yuan-payments/new` vs legacy `pcs-admin/payment.php?page=add` (inline modal)

Legacy add-mode (`payment.php` modal at L370-454 + handler at L4-95):
- Modal triggered from list page OR from `?page=add` URL.
- Wallet pre-check (L13-17): `SELECT walletTotal FROM tb_wallet WHERE userID=...` — if 0, alert. **This is the ADMIN-CREATE flow but the wallet check is still against the customer's wallet — admin can only ADD a payment if customer has wallet > 0.**
- Form fields (L405-432): `userID` Select2 dropdown (AJAX `include/pages/payment/getUserID.php` populates · L528-535), `payType` (3 options: จ่ายผ่านเว็บไซต์จีน / Alipay / อื่นๆ), `payDetail` textarea (max 2500), `rateYuan` numeric (default = `tb_settings.rpDefault`), `payYuan` numeric. Live preview "ยอดเงินที่ต้องชำระ" calculated client-side (L491-498).
- Post-submit (L33-46): INSERT `tb_payment` with `paydate=NOW()`, `payStatus` defaults to `1` pending, deduct wallet `walletTotal -= payTHB`, INSERT `tb_wallet_hs` (`type=6` ชำระเงินฝากโอน), LINE-notify (L65, L83).
- Wallet-balance check on **submit too** (L33): if `payTHB > walletTotal` → `sweetalert='eWallet'`.

Pacred current state — `/admin/yuan-payments/new/{page,form}.tsx`:

| # | Element | Legacy spec | Pacred | Status |
|---|---|---|---|---|
| N-01 | Wallet pre-check before opening modal | L13-17 | ❌ no wallet balance shown to admin; no pre-check | ❌ |
| N-02 | Wallet balance check on submit | L33 `payTHB ≤ walletTotal` | ❌ NOT enforced — admin can create yuan payment exceeding customer wallet | 🔴 **P0** |
| N-03 | Customer Select2 with AJAX user search | L528-535 → `getUserID.php` | recent-20 `<select>` dropdown + `?q=` URL preset | ⚠️ list capped to recent 20; no search-as-you-type |
| N-04 | `payType` 3 options (1=จ่ายผ่านเว็บจีน, 2=Alipay, 3=อื่นๆ) | L407-411 | 4 options (Alipay/Wechat/Union/USDT) — **LABEL MISMATCH** | 🔧 |
| N-05 | `payDetail` textarea max 2500 | L415 | text input max 2000 — same idea | ⚠️ |
| N-06 | `rateYuan` default = `tb_settings.rpDefault` | L131-133 | `rsdefault` from `tb_settings` (per Wave 20 docblock) | 🔧 column mismatch — `rpDefault` is what legacy uses, NOT `rsdefault` |
| N-07 | Live preview "ยอดเงินที่ต้องชำระ" THB | L491-498 | ✅ `previewThb` calculated | ✅ |
| N-08 | "เลขฝากจ่าย" displayed = `tb_settings.numberPaymemt` | L394-400 | ❌ not surfaced | ❌ |
| N-09 | INSERT `tb_payment` with `paystatus='1'` pending (NOT '2' approved) | L33-46 (legacy waits for ANOTHER admin to verify) | **`paystatus='2'` approved immediately** per code L142 | 🔴 **P0** — separation-of-duties broken |
| N-10 | Deduct wallet (`tb_wallet.walletTotal -= payTHB`) | L51-53 | ❌ NOT done — `actions/admin/yuan-payments-tb.ts` skips this | 🔴 **P0** — money hole; admin can spawn yuan payments without debiting wallet |
| N-11 | INSERT `tb_wallet_hs` (type=6) | L66-69 | ❌ NOT done | 🔴 **P0** same as N-10 |
| N-12 | LINE / SMS notification to customer | L60-85 | ❌ NOT sent (the tb_payment-lane create path doesn't fire `sendNotification`) | ❌ |
| N-13 | Admin RBAC = CEO/Manager/QAAndQC/Accounting/ITDT | L343 (read from list); admin-add probably similar | `requireAdmin(["accounting"])` | ⚠️ Pacred narrower than legacy |
| N-14 | Confirm dialog "ระบบจะหักเงินจากกระเป๋าสตางค์ของคุณ" | L563-573 | ❌ no confirm — direct submit | ❌ |
| N-15 | Admin proof-slip optional upload | none in legacy (this is a Pacred Wave 12-A addition) | ✅ NEW | ✅+ KEEP |

**🔴 P0-N (compound):** N-02 + N-09 + N-10 + N-11 together mean a Pacred admin "creating a yuan payment on behalf of a customer" will:
- Skip wallet balance check → can over-debit;
- Mark `paystatus='2'` (approved) immediately → no second-admin verification;
- Never debit the customer's `tb_wallet.walletTotal` → customer's wallet balance unchanged on dashboard but a "shipped" payment row appears in their list;
- Never write `tb_wallet_hs` type=6 → wallet history mismatches.

This is the largest revenue-hole found in this audit. The action is `adminCreateYuanPaymentManual` in `actions/admin/yuan-payments-tb.ts`.

---

## 4. CNY rate (the "เรท") — config + admin edit

Legacy: NOT a separate page. Rate values live in **`tb_settings` (single-row config table, ID=1)**:
- `rpDefault` — the sell-rate shown to customers + default in admin-add modal (`payment.php` L131, L423).
- `hRateCostDefault` — the cost-rate default for admin approval form (`payment.php` L865, L876).
- These are edited from `pcs-admin/setting.php` (NOT in this audit's scope — different feature) which I confirmed exists but wasn't read here.
- **Historical rate preservation:** each `tb_payment` row stores `payRate` (customer-rate at time of submission) + `payRateCost` (cost-rate at time of approval). Rate at time of txn is ALWAYS preserved on the row. Changing `rpDefault` does NOT retroactively update existing rows. ✅

Pacred:
- `/admin/rates/page.tsx` reads `settings` (REBUILT table, NOT `tb_settings`!) selecting `yuan_rate` (not `rpdefault`) — this is the REBUILT app's settings table.
- `actions/payment.ts` `getCurrentYuanRate()` reads `process.env.NEXT_PUBLIC_YUAN_RATE` (env var fallback) — comment says "For Phase D Pacred will read from tb_settings" → **NOT YET DONE.**
- `/admin/yuan-payments/new/page.tsx` reads `tb_settings.rsdefault` (column DOES exist in tb_settings but is NOT the same as legacy `rpDefault` — Pacred picked the wrong column name).
- No admin UI to edit `tb_settings.rpdefault` or `tb_settings.hratecostdefault` — they can only be SET via raw SQL.

| # | Element | Legacy | Pacred | Status |
|---|---|---|---|---|
| R-01 | Sell-rate (customer-facing) source | `tb_settings.rpDefault` | `process.env.NEXT_PUBLIC_YUAN_RATE` (env fallback) | 🔧 must point to `tb_settings.rpdefault` |
| R-02 | Cost-rate (admin internal) source | `tb_settings.hRateCostDefault` | NOT read anywhere | ❌ |
| R-03 | Customer rate at time-of-txn preserved on row | `tb_payment.payRate` | `tb_payment.payrate` ✅ | ✅ |
| R-04 | Cost rate at time-of-txn preserved on row | `tb_payment.payRateCost` | `tb_payment.payratecost` ✅ | ✅ |
| R-05 | Admin UI to edit sell-rate | `setting.php` (separate page) | none for `tb_settings`; `/admin/rates` reads REBUILT `settings` | 🔴 **P0** — accounting can't change today's rate without SQL |
| R-06 | Admin UI to edit cost-rate | `setting.php` | none | 🔴 **P0** — same |
| R-07 | Rate history table / change log | none in legacy | none | ✅ parity |
| R-08 | "1 หยวน = N บาท" display on add form | L435 inline | shown as input default + preview | ✅ |

**🔴 P0-R:** R-05 + R-06 — there is no admin UI to update the yuan exchange rate. Today the team is stuck either editing `tb_settings` via raw SQL OR setting `NEXT_PUBLIC_YUAN_RATE` env (which forces Vercel rebuild and only updates the customer-facing default — not the admin-add default which reads `rsdefault` wrongly).

---

## 5. Status flow + notifications

Legacy `tb_payment.payStatus` enum:
- `'1'` = รอดำเนินการ (badge-warning yellow)
- `'2'` = สำเร็จ (badge-info blue — but the customer-side `service-payment/page.tsx` legacy gives it badge-info, the admin gives it badge-info too — actually CONFIRMED legacy at L308 `case "2": ... badge-info` not green)
- `'3'` = ไม่สำเร็จ (badge-danger red)

Transitions allowed in legacy (`payment.php` L607-690): only `1 → 2` (approve) or `1 → 3` (reject); approved/rejected rows are TERMINAL. No re-open / re-edit (form not rendered when `payStatus != '1'`).

Pacred — two paths:
- `actions/admin/yuan-payments.ts` (rebuilt schema) defines elaborate allow-list `pending → processing → completed → refunded` etc.
- `actions/admin/yuan-payments-tb.ts` + `tb-bulk.ts` (legacy schema) only support `'1' → '2'` (bulk approve) — no UI surface for `'1' → '3'` reject on tb_payment lane.

| # | Element | Legacy | Pacred (tb lane) | Status |
|---|---|---|---|---|
| S-01 | Status enum 3 values 1/2/3 | yes | yes | ✅ |
| S-02 | Status labels TH | รอดำเนินการ / สำเร็จ / ไม่สำเร็จ | "รอตรวจสอบ / อนุมัติแล้ว / ปฏิเสธ" | 🔧 label drift |
| S-03 | Color codes | warning(amber) / info(blue) / danger(red) | yellow / green / red | 🔧 success state was blue in legacy, green in Pacred |
| S-04 | Bulk approve `1 → 2` | NOT in legacy (single-row only) | ✅ NEW Pacred feature via `<TbYuanBulkBar>` | ✅+ KEEP |
| S-05 | Single-row approve `1 → 2` via UI | yes (admin update form) | ❌ no UI on tb_payment lane (`actions-cell.tsx` writes wrong table) | 🔴 **P0** |
| S-06 | Single-row reject `1 → 3` via UI | yes (admin update form) | ❌ no UI on tb_payment lane | 🔴 **P0** |
| S-07 | LINE notify on `1 → 2` | L651-655 `sendLine` | ❌ tb-lane bulk-approve has NO notify | ❌ |
| S-08 | LINE notify on `1 → 3` | L683-687 | ❌ | ❌ |
| S-09 | LINE notify on customer submit | L60-85 | ❌ tb_payment create-path skips notify | ❌ |
| S-10 | Email notify | none in legacy `payment.php` | n/a | ✅ parity |
| S-11 | SMS notify | none in legacy | n/a | ✅ parity |
| S-12 | Wallet refund on reject `1 → 3` (INSERT tb_wallet_hs type=5, UPDATE tb_wallet.walletTotal) | L658-690 | ❌ tb_payment lane has NO action; rebuilt `adminUpdateYuanPayment` does the right thing but for the WRONG table | 🔴 **P0** |
| S-13 | Status-change audit log | `saveHistory($sql,22)` | ⚠️ `withAdmin/logAdminAction` exists but only on the rebuilt-schema path | ⚠️ |

**🔴 P0-S:** S-05 + S-06 + S-12 — there is currently NO Pacred admin UI path to single-row approve/reject a tb_payment row. The bulk-bar approves but doesn't reject. The detail page renders read-only. Reject + wallet-refund (load-bearing for cash-back integrity) is not implemented at all on the tb_payment lane.

---

## 6. Refund flow + print-slip + admin reports

Legacy refund path:
- Refund = approve as `payStatus='3'` (reject) — that triggers the wallet credit-back inside the same approve POST handler (`payment.php` L658-690). **No separate "refund" action exists in legacy.**
- The refund pre-check `SELECT payTHB, userID FROM tb_payment WHERE ID=N AND payStatus='1'` (L640) means **you can only reject a PENDING row, not a previously-approved one.** Once `payStatus='2'`, refund is a manual SQL job (or the team goes through `accounting` admin).
- No refund-slip required by legacy.

Pacred:
- `actions/admin/yuan-payments.ts` `adminMarkYuanPaymentRefunded` (rebuilt schema) REQUIRES a slip + records `refund_slip_path` + cancels wallet debit — a **Phase-C QoL improvement over legacy**. ✅+
- But it's wired to the rebuilt `yuan_payments` table only — useless for real-customer rows in `tb_payment`. 🔴 same chain.
- `<YuanRefundModal>` UI exists with file upload + reason + customer summary + auto-reverse-wallet warning → polished, but unreachable from `/admin/yuan-payments/[id]` because `<YuanPaymentActions>` isn't mounted in the detail page (the page is read-only per its docblock).

Print-slip:
- Legacy `acc-payment.php` L164-166: form action → `printReceipt.php?id=...` (the receipt-printing route — Wave 29 Pacred shipped `printReceipt mPDF faithful` per CLAUDE.md top).
- Pacred — yuan-payment detail page has NO print button. The receipt-print route ships per Wave 29 but is wired to forwarder/cnt-payment receipts, NOT yuan-payment receipts.

Admin reports adjacent:
- `pcs-admin/acc-payment.php` (the ledger of fulfilled payments): ✅ Pacred has `/admin/accounting/payment/page.tsx` — a 1:1 transcription per its docblock with Bootstrap-4 markup verbatim + `.pcs-legacy` scope. Reads tb_payment + tb_wallet_hs join. Functional. ⚠️ DataTables JS not wired (static markup only — sort/export missing).
- `pcs-admin/report-payments.php` (graph + filter view): ✅ Pacred has `/admin/reports/payment/page.tsx` — Wave 20 P1 batch 2-b rewrite to Tailwind + Wave 24 #185 pagination fix. Reads tb_payment. ⚠️ the Chart.js graph at top of legacy NOT ported; only the table.
- `pcs-admin/report-payments-profit.php` (กำไรฝากโอนหยวน profit margin): ⚠️ Pacred has `/admin/reports/yuan-profit/page.tsx` BUT it reads the REBUILT `yuan_payments` table (calls `getYuanProfitReport` → which queries `yuan_payments`). On prod this returns ZERO rows because the rebuilt table is empty. 🔴 **P0** — accounting + management cannot see real yuan-transfer P&L.

| # | Element | Legacy | Pacred | Status |
|---|---|---|---|---|
| F-01 | Refund = reject-when-pending (`1→3` with wallet credit) | yes | ❌ no tb_payment UI path; rebuilt-only | 🔴 P0 |
| F-02 | Refund of ALREADY-APPROVED row (`2→3`) | NOT in legacy (manual SQL) | ❌ neither | ✅ parity |
| F-03 | Refund slip required | NOT in legacy | ✅+ Pacred adds (but for wrong table) | Phase-C improvement, blocked by P0 |
| F-04 | Print receipt for accounting | `acc-payment.php` L164 → `printReceipt.php?id` | ❌ no yuan-payment print path; Wave 29 `printReceipt` shipped for cnt/forwarder receipts only | ❌ |
| F-05 | "รายงานฝากโอนหยวน/ชำระเงิน" ledger (acc-payment) | `acc-payment.php` | ✅ `/admin/accounting/payment` 1:1 transcription | ✅ |
| F-06 | Sorted + paginated + exportable DataTable on ledger | DataTables JS | ❌ static markup | ❌ |
| F-07 | Monthly graph (Chart.js line) | `report-payments.php` L91-100 | ❌ not ported | ❌ |
| F-08 | "รายงานฝากชำระเงิน" date-filtered table | `report-payments.php` | ✅ `/admin/reports/payment` Tailwind rewrite | ✅ |
| F-09 | "กำไรฝากโอนหยวน" profit-margin report | `report-payments-profit.php` | ⚠️ `/admin/reports/yuan-profit` reads WRONG TABLE (rebuilt `yuan_payments`) | 🔴 **P0** |
| F-10 | Period totals row pinned at top | acc-payment L195-208 (no-sort row) | ✅ render | ✅ |
| F-11 | Year+month dropdown filter | acc-payment L114-131 | ❌ Pacred only has date-range | ❌ |
| F-12 | Department/section gate (`companyType==1 && department==2 && section==2` hides totals + export) | legacy yes | ❌ not ported (legacy session-globals not in V3 RBAC) | ⚠️ |

---

## Sub-handlers under `pcs-admin/include/pages/payment/*.php`

5 AJAX endpoints:
1. **`getUserID.php`** — populates the admin "create payment" Select2 customer dropdown (`coID`-scoped user list). Pacred uses recent-20 dropdown w/ `?q=` URL pre-select instead — **no live search**.
2. **`scriptUser.php`** — fetches selected user's fullname into the create modal. Pacred resolves via the form's preset prop. ✅ parity.
3. **`updateLock.php`** — heartbeat for session lock (every 60s extends `payLockDate`). Pacred ❌ no session lock anywhere.
4. **`QRPay.php`** + **`QRPay copy.php`** — PromptPay QR generation (so admin can show customer the QR while on phone). Pacred uses `lib/promptpay.ts` system-wide so this is parity-fine if exposed; need to verify whether admin yuan-payment detail surfaces a PromptPay QR (it doesn't — Pacred yuan-payment is wallet-debit only, NOT a "send the customer a QR to pay you" flow). ✅ Pacred design intentionally diverges.

---

## Top-5 P0 launch blockers (ranked by revenue-impact)

🔴 **P0-#1 (revenue-hole): admin manual-create skips wallet debit.**
`adminCreateYuanPaymentManual` in `actions/admin/yuan-payments-tb.ts` writes `tb_payment` `paystatus='2'` immediately but never UPDATEs `tb_wallet.walletTotal` and never INSERTs `tb_wallet_hs` type=6. Effect: a customer's wallet stays "full" while a "completed" payment exists. Either (a) admin uses it innocently to log a payment after fact and the customer keeps THB they should have spent, OR (b) the row never reconciles to wallet history and accounting closes the month with a hole. **Fix: replicate legacy `payment.php` L51-69 (wallet decrement + tb_wallet_hs insert + LINE notify) inside the action, AND insert with `paystatus='1'` so a second admin must approve.**

🔴 **P0-#2 (workflow-break): customer ฝากโอน rows can't be approved/rejected from Pacred UI.**
`/admin/yuan-payments/[id]/page.tsx` is read-only. `<YuanPaymentActions>` (`actions-cell.tsx`) calls `adminUpdateYuanPayment` against the rebuilt `yuan_payments` (empty on prod). Real customer rows in `tb_payment` have NO Pacred UI path to flip status. The bulk-approve bar handles `1→2` only. **Fix: build per-row approve/reject form on `[id]/page.tsx` that calls a new `tb-payment` server action mirroring legacy L607-690 (wallet refund on reject, payRateCost editable input on approve, LINE notify, session lock optional).**

🔴 **P0-#3 (visibility): yuan-profit report shows empty.**
`/admin/reports/yuan-profit/page.tsx` reads the REBUILT `yuan_payments` table. With 1,460 real yuan payments in `tb_payment`, accounting + management see "0 rows". **Fix: rewrite `getYuanProfitReport` to read `tb_payment` instead of `yuan_payments` (mirror the SQL in `report-payments-profit.php` lines ~80-120 not read this round but similar pattern as `report-payments.php` table).**

🔴 **P0-#4 (config-hole): no admin UI to edit the CNY rate.**
Accounting wants to bump `rpdefault` daily as USD/CNY moves. Today they must SQL into `tb_settings`. Customer-facing `getCurrentYuanRate()` reads `process.env.NEXT_PUBLIC_YUAN_RATE` so a rate change needs a Vercel rebuild. **Fix: build `/admin/settings/business-config/payment` editor that updates `tb_settings.rpdefault` + `tb_settings.hratecostdefault`; switch `getCurrentYuanRate()` + `new/page.tsx` defaults to read from `tb_settings.rpdefault`.**

🔴 **P0-#5 (separation-of-duties): admin-add gives `paystatus='2'` immediately.**
Even WITH the wallet-debit fix (#1), the legacy flow is intentionally `paystatus='1'` on create → second admin verifies → `paystatus='2'`. Pacred shortcut bypasses 2-admin verification. Combined with the missing wallet debit, this is a fraud-vector for any admin with access. **Fix: insert `paystatus='1'` and route through the normal approval flow.** (One-line change in `yuan-payments-tb.ts` L142.)

---

## Surprises worth flagging to ภูม

1. **TWO actions modules with same name shape (`yuan-payments.ts` vs `yuan-payments-tb.ts`).** The `-tb` one writes legacy `tb_payment`; the base one writes rebuilt `yuan_payments`. ภูม's `actions-cell.tsx` imports the base (rebuilt) one but the page lists tb_payment rows. **Easy mistake for next-session work to grab the wrong action.** Suggest renaming for clarity OR consolidating.

2. **`paystatus` label drift.** Legacy says รอดำเนินการ/สำเร็จ/ไม่สำเร็จ. Pacred admin list says รอตรวจ/อนุมัติ/ปฏิเสธ. Customer page (`service-payment/page.tsx`) keeps legacy labels exactly. So the SAME row reads as "อนุมัติแล้ว" in admin UI and "สำเร็จ" in customer UI. Confusing for the team during a phone call. Recommend ทำให้เหมือนกัน (legacy wording wins per D1 "100% sameness FIRST").

3. **`paytype` enum value-set mismatch.** Legacy stores only 1/2/3 (จ่ายผ่านเว็บไซต์จีน / Alipay / อื่นๆ). Pacred maps 1/2/3/4 (Alipay / Wechat / Union / USDT). The customer write-path (`actions/payment.ts` L58-64) translates "bank" → '3' (legacy "Union" slot meant "อื่นๆ") so existing data is now ambiguous. The detail page renders type=3 as "Union" which legacy users read as "อื่นๆ". Schema drift sneaking into a string column.

4. **`tb_settings` column-name drift.** Pacred `new/page.tsx` reads `rsdefault`. Legacy reads `rpDefault`. Both columns exist in `tb_settings` (I confirmed `tb_settings` migration spans both). They have DIFFERENT meanings — `rs` = something else (perhaps sale-rate-default for another product?), `rp` = the yuan-payment rate. Pacred is using the wrong column.

5. **Session lock missing.** Legacy `tb_payment.payLockDate` + `updateLock.php` heartbeat prevents two admins editing the same row. Pacred doesn't even RENDER the field, let alone use it. With 13 admins recreated (per CLAUDE.md top), the chance of collision rises.

6. **No "เลขฝากจ่าย / numberPaymemt" display anywhere.** Legacy renders `tb_settings.numberPaymemt` (sequence number incremented per create) on the modal header (L394-400). I didn't find a use of it elsewhere — possibly cosmetic. But it's part of the screen the admin team has been looking at for years.

7. **Pacred's `yuan-payments.ts` `adminMarkYuanPaymentRefunded` is GOOD CODE pointed at the wrong table.** The refund-slip-required + auto-reverse-wallet pattern is exactly what tb_payment needs. The Phase-C improvement should be carried over to the tb-lane fix, not redone.

8. **No notifications fire on customer create OR admin bulk-approve.** Legacy LINE-notifies on every state transition. Pacred tb_payment lane is silent. Customer doesn't know their request was submitted; admin doesn't know it was processed. (Wave 8 bulk-bar SHOULD `void sendNotification` per `actions/admin/yuan-payments.ts` style but doesn't.)

---

## Pickup recommendations (sequenced)

1. **Quick win (15 min):** flip `yuan-payments-tb.ts` L142 `paystatus: "2"` → `"1"` so admin-create at least enters the normal verification queue. Won't fix the wallet hole but stops the silent SOD-bypass. (P0-#5)
2. **Half-day (3-4 h):** add wallet decrement + tb_wallet_hs type=6 + LINE notify to `adminCreateYuanPaymentManual`. (P0-#1)
3. **Half-day (3-4 h):** rewrite `[id]/page.tsx` from read-only to a faithful update form mirroring legacy L854-911. New action in `tb-payment.ts` calling sendNotification on transitions. (P0-#2 + S-12)
4. **2 h:** rewrite `getYuanProfitReport` to read `tb_payment`. (P0-#3)
5. **3-4 h:** build `/admin/settings/business-config/payment` editor for `tb_settings.rpdefault` + `tb_settings.hratecostdefault`. Update `getCurrentYuanRate()` to read from DB. (P0-#4)
6. **Phase-C polish:** the missing DataTables JS, daterangepicker presets, year-month chooser, Chart.js graph on report-payments.php, session lock, VIP badge in list, `paytype` enum rationalisation, label drift fixes. Cumulative ~12-16 h. NOT launch-blocking.
