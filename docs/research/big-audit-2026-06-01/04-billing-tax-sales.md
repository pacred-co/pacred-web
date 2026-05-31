# Big audit 2026-06-01 — Cluster 04: BILLING / TAX / RECEIPT + SALES / COMMISSION

> Agent cluster: receipt (ใบเสร็จ) · tax-invoice (ใบกำกับ RD-86) · WHT (หัก ณ ที่จ่าย) ·
> combine-bill · sales-rep commission earn→withdraw · interpreter (ล่าม) commission.
> Data probed live on prod `yzljakczhwrpbxflnmco` 2026-06-01. Legacy source =
> `…/pcsc/public_html/member/pcs-admin/`. Builds on `legacy-resweep-2026-05-31/_MASTER-FRESH.md`.

---

## 0. TL;DR — the shape of this cluster

The **money-document + commission** layer is the most mature, most-faithful part of the
whole port — and also the one with the largest pile of **dead rebuilt twins** sitting next
to the live legacy tables. Three distinct truths:

1. **Receipts + WHT + combine-bill = faithfully ported and LIVE.** `tb_receipt` (13.8k rows),
   `tb_bill` (10.6k), the doc-no minter (`FRC/FRG{yyMM}-{NNNNN}`), the auto-issue-on-payment
   hook, and a WHT/VAT engine that *exceeds* legacy. No gap.
2. **Sales-rep commission earn→withdraw = faithfully ported and LIVE** on the `tb_user_sales`
   family (earn-trigger fires on real delivery — contested item #6 from prior audit is
   **RESOLVED: it fires**). BUT three older admin surfaces (`/admin/commissions`,
   `/admin/forwarder-sales`, `/admin/withdrawals`) still read **dead rebuilt** tables (0 rows) —
   Potemkin screens.
3. **TWO legacy admin batch-payout systems are NOT ported at all:**
   `tb_withdraw_comm_sale_*` (25 batches / 3,204 items) and `tb_withdraw_comm_interpreter_*`
   (46 batches / 2,947 items). 6,151 line-items of real payout history with **no Pacred reader
   or writer**. This is the single biggest faithful-port gap in the cluster.

All Pacred-NEW stacks here (`tax_invoices`, `freight_invoices`, `commission_*`,
`sales_payouts`, `withholding_tax_entries`, `invoice_adjustments`) = **0 rows on prod** —
Phase-C scaffolding, not legacy gaps.

---

## 1. DATA INVENTORY — legacy `tb_*` (real data)

| Table | Rows | Purpose ("หัวข้อ" it stores) | Key columns |
|---|---:|---|---|
| `tb_receipt` | **13,789** | ใบเสร็จรับเงิน(ใบกำกับภาษี) per forwarder-payment. THE Thai money-doc-of-record. | `rid` (`FRG2605-00218`), `rstatus`, `ramount`, `totalbeforewithholding`, `userid`, `corporatetype` (1=นิติ/2=บุคคล), `recompnumber`/`recompname`/`recompaddress` (the bill-to identity snapshot), `issuedate`, `statusprint`/`statusprintcopy` (ต้นฉบับ/สำเนา print flags), `documentissuer`/`documentapprover` (signer names), `refwhid` (→`tb_wallet_hs.id` the payment) |
| `tb_receipt_item` | **37,252** | Receipt ↔ forwarder fan-out (one receipt covers N shipments). | `rid` (FK→receipt), `fid` (→`tb_forwarder.id`) |
| `tb_bill` | **10,643** | Combine-bill header (ใบรวมบิล/ใบส่งสินค้า) — groups forwarders for a single delivery. | `billid`, `date`, `printstatus`, `adminid` |
| `tb_bill_item` | **26,031** | Bill ↔ forwarder fan-out. | `billid`, `fid` |
| `tb_customrate_hs` | **463** | Audit log: who changed a customer's custom HS shipping rate, when. | `userid`, `adminid`, `date` |
| `tb_user_sales` | **4,104** | **Sales-rep / affiliate EARN record** — one per forwarder shipment. `useridmain` (the referring rep, e.g. `PR888`/`SIN.VIP`) earns for customer `userid` on shipment `idf`. | `useridmain`, `userid`, `idf` (→`tb_forwarder.id`), `usstatus` (1=earned), `date` |
| `tb_user_sales_pay` | **440** | Junction: which earn rows are bundled into which payout. | `idus` (→`tb_user_sales.id`), `idusap` (→`tb_user_sales_admin_pay.id`) |
| `tb_user_sales_admin_pay` | **5** | **Sales-rep payout request/record** — bank details + slip + amount. | `useridmain`, `amount`, `status` (3=paid), `dateslip`, `imagesslip`, `name_blank`(bank)/`no_blank`(acct)/`name_account`, `admincreate`, `file` |
| `tb_sales_report` | **17,027** | Per-forwarder sales-rep attribution snapshot (rep credited at the time). | `fid`, `sradminidsale` (→`tb_admin.adminID`), `srdate` |
| `tb_withdraw_comm_sale_h` | **25** | **ADMIN batch payout — SALES-rep commission** (1% of net forwarder price). Header w/ WHT. | `amount`, `commbefore`, `withholding`, `status` (1=pending/2=slip/3=fail), `adminid` (the rep being paid), `namebank`/`nameuserbank`/`nouserbank`, `imagesslip`, `title` |
| `tb_withdraw_comm_sale_item` | **3,204** | Which forwarders are in a sales-comm batch. | `fid`, `wcsid` (→header) |
| `tb_withdraw_comm_interpreter_h` | **46** | **ADMIN batch payout — INTERPRETER (ล่าม) commission** on yuan-transfer orders. Header w/ WHT. | `amount`, `commbefore`, `withholding`, `status`, `adminid` (interpreter), bank fields, `imagesslip`, `title` |
| `tb_withdraw_comm_interpreter_item` | **2,947** | Which yuan-orders are in an interpreter batch + the per-order margin. | `hno` (→`tb_header_order.hNo`), `diffyaun` (yuan margin), `wciid` (→header) |
| `tb_set_comm_interpreter` | **15** | Per-interpreter commission **% setting** (admin config). | `percom` (e.g. 100.0), `adminid` (interpreter), `adminidupdate`, `dateupdate` |
| `tb_account_pcs` | **98** | Company bank accounts (the "pay-FROM" source for both withdraw flows). | (bank name / account name / account number) |

**Note on prompt-supplied counts:** the brief listed `tb_receipt`=25, `tb_user_sales_admin_pay`=5
etc. Live prod shows `tb_receipt`=13,789 (the 25 was stale or a filtered subset);
`tb_user_sales_admin_pay`=5 is correct (only 5 sales-rep payouts ever made — see §3 gap).

**Tables in brief NOT present on prod (legacy):** `tb_forwarder_tax_invoice`,
`tb_forwarder_tax_invoice_item`, `tb_forwarder_wht_entry` — these are **Pacred-NEW**
(migration 0129), not legacy. See §2.

---

## 2. REBUILT / NEW TWINS — canonical vs dead-write

All probed live: **every non-`tb_` table in this cluster = 0 rows on prod.**

| Rebuilt/new table | Rows | Status | Canonical truth |
|---|---:|---|---|
| `tax_invoices`, `tax_invoice_lines`, `tax_invoice_seq` | 0 | **DEAD (World-A)** | Superseded by faithful `tb_forwarder_tax_invoice*` (also 0 — see below). Legacy never had a separate tax-invoice table; `tb_receipt` *is* the tax invoice. |
| `tb_forwarder_tax_invoice`, `_item`, `tb_forwarder_wht_entry` | 0 | **Pacred-NEW, faithful-flavoured, UNUSED** | Written by `lib/admin/forwarder-tax-invoice.ts`, called only from the auto-receipt path for `corporate=1` customers. Empty because (a) recent (0129), (b) legacy has no equivalent so there's no backfill, (c) only fires for juristic. Not a gap — a *new* RD-86 e-tax construct. |
| `freight_invoices`, `freight_invoice_lines`, `freight_invoice_payments` | 0 | **Pacred-NEW (V-E1/ADR-0016)** | The international-freight invoice stack (FCL/LCL ecosystem expansion). Full code (`actions/admin/freight-invoices.ts`), 0 rows = no freight customers yet. Not a legacy gap. |
| `withholding_tax_entries` (0044) | 0 | **DEAD (World-A)** | Legacy WHT lives inline on `tb_receipt.totalbeforewithholding` + the `tb_withdraw_comm_*.withholding` columns. |
| `invoice_adjustments` | 0 | **Pacred-NEW (V-A5)** | Manual ±amount credit/debit-note line. No legacy equivalent (legacy did per-cent corrections by editing rows). Genuinely useful new feature. |
| `sales_commissions`, `sales_payouts` | 0 | **DEAD (TOMBSTONED)** | `actions/admin/sales-payouts.ts` is tombstoned (ADR-0020). Canonical = `tb_user_sales` family via `actions/commissions-tb.ts` + `actions/admin/sales-payouts-tb.ts`. The live `/admin/sales-payouts` page IS repointed to faithful. |
| `commission_accruals`, `commission_tiers`, `commission_withdrawals`, `commission_withdrawal_items` | 0 | **DEAD (World-A) — but still READ by live pages** | `actions/admin/commissions.ts` + `/admin/commissions` + `/admin/withdrawals` write/read these empty tables. **Potemkin** — see §3 finding G2. |
| `carriers` | 5 | seed | NEW-stack freight ref data (not billing). |
| `accounting_periods`, `period_close_event` | 0 | **Pacred-NEW** | Month-end close construct — no legacy equivalent. Phase-C. |
| `qa_inspections`, `bookings`, `customs_declarations*`, `freight_quotes` | 0 / 404 | **Pacred-NEW ecosystem** | Not billing/sales — noted for maturity only. `quote_items`/`shipments`/`parties` not even REST-exposed (404). |

**Canonical map for this cluster:**
- Receipt → `tb_receipt`/`tb_receipt_item` (LIVE) · `lib/admin/auto-issue-receipt.ts` + `lib/admin/mint-receipt-doc-no.ts`
- Combine-bill → `tb_bill`/`tb_bill_item` (LIVE) · `actions/admin/combine-bill.ts`
- Sales-rep commission → `tb_user_sales` + `tb_user_sales_admin_pay` + `tb_user_sales_pay` (LIVE) · `actions/commissions-tb.ts` + `actions/admin/sales-payouts-tb.ts` + `actions/admin/earn-trigger-tb-user-sales.ts`
- Sales attribution → `tb_sales_report` (LIVE) · `actions/admin/reports.ts`
- WHT/VAT math → `lib/tax/wht.ts` (LIVE, exceeds legacy)
- **Admin batch comm-withdraw (sale + interpreter)** → **NOT PORTED** (see §3 G1)
- **Customer-affiliate dashboard** → split: `/sales/*` (faithful tb) vs `/commissions/*` (dead rebuilt) — see §3 G3

---

## 3. LEGACY GAPS — what Pacred lacks or only partially has

### 🔴 G1 — Two admin batch commission-payout systems NOT ported (biggest gap)
**Legacy:** `pcs-admin/withdraw-commission-sale.php` + `withdraw-commission-interpreter.php`
(+ `include/pages/withdraw-commission-{sale,interpreter}/{home,add,detail,listPayComm*}.php`).
Two full batch-payout workflows:
- **Sales-rep batch** (`tb_withdraw_comm_sale_h/item`): admin selects unpaid forwarders for a
  rep → computes **1% of `fTotalPriceNetAll`** (`add.php:333`) from paid `tb_wallet_hs` rows →
  creates a batch header w/ WHT + bank acct (from `tb_account_pcs`) → status 1 → upload slip →
  status 2. RBAC: `CEO/Manager/Accounting/ITDT/SaleCargo/SalesAll` (reps see only their own).
- **Interpreter batch** (`tb_withdraw_comm_interpreter_h/item`): same shape but commission =
  per-order yuan margin × `tb_set_comm_interpreter.perCom` from `tb_header_order` (yuan orders).

**Pacred:** **zero code touches `tb_withdraw_comm_*` or `tb_set_comm_interpreter`** (verified:
`grep -rln tb_withdraw_comm` = 0 files). The Pacred `/admin/commissions` + `/admin/withdrawals`
write the **dead rebuilt** `commission_*` stack instead. **6,151 line-items + 71 batches of real
payout history are invisible & unmanageable in Pacred.** This is distinct from the sales-rep
earn→withdraw loop (which IS ported on `tb_user_sales_admin_pay`) — these are the *admin-driven
batch* payouts that pay reps/interpreters in bulk per month. Effort: **L** · value: **P0**.

### 🟠 G2 — Potemkin commission/forwarder-sales admin pages (read dead tables)
- `/admin/commissions/page.tsx` reads `commission_withdrawals` + `commission_accruals` (0 rows).
- `/admin/withdrawals/page.tsx` — same dead stack.
- `/admin/forwarder-sales/page.tsx` reads `team_leaders` + `sales_commissions` (0 rows).
These render green/empty against real prod data → staff see "no commissions" while 4,104
`tb_user_sales` earns + 25/46 legacy batches exist. Either repoint to `tb_user_sales*` /
the (to-be-built) `tb_withdraw_comm_*` readers, or delete + redirect. Effort: **M** · value: **P0**
(actively misleading on a money surface).

### 🟠 G3 — Customer-affiliate commission dashboard split-brain
Legacy `report-user-sales.php` is the customer-facing "ลูกค้าตัวแทน" dashboard:
ยอดขาย + ค่าคอม + เบิกจ่ายแล้ว + a **minimum-withdrawal-threshold** rule
("เบิกเงินแต่ละครั้งจะต้องมียอดขั้นต่ำ …", L311). Pacred has TWO customer routes:
`/commissions/*` (reads dead rebuilt) **and** `/sales/*` (reads faithful `tb_user_sales`).
Need to confirm which is linked in the customer nav and **kill the dead one**; also verify the
**min-withdraw threshold** business rule is enforced (not found in `actions/commissions-tb.ts`
on a quick grep — `actions/commissions.ts` only checks `amount ≤ available`). Effort: **M** · value: **P1**.

### 🟠 G4 — Per-rep KPI / ranking / target dashboard
Legacy `report-sale-new.php` (56 KB — the biggest sales file) has tabs:
**"ข้อมูลแบบรวมตามรหัสลูกค้า"** (aggregate by customer), **"ข้อมูลแบบแยกรายการ"** (itemized),
**"รายการพนักงานขาย"** (sales-staff ranking) + a `target` concept. Pacred has `sales-by-rep`
+ `sales-monthly` + `agent-payouts` but **no rep-vs-target ranking / leaderboard**. The data
(`tb_sales_report` 17k + `tb_user_sales` 4.1k) fully supports it. Effort: **M** · value: **P1**.

### 🟡 G5 — `tb_customrate_hs` rate-history surface
Legacy `hs-customrate.php` → "ประวัติการอัปเดตเรทราคาของลูกค้า" (who changed which customer's
custom HS rate). 463 rows. Pacred has the per-customer rate editor (`actions/customer-rate.ts`)
but it's unclear there's an **org-wide audit list** of all rate changes (the legacy home page).
Verify; if missing, small add. Effort: **S** · value: **P2**.

### ✅ RESOLVED (prior-audit contested items)
- **#6 sales-rep earn-trigger on delivery** (`_MASTER-FRESH.md` L41, marked CONTESTED):
  **RESOLVED — it fires.** `fireUserSalesEarnTriggerOnDelivery` is imported & called in BOTH
  `actions/admin/driver-work.ts:314` (real driver-deliver path) AND `actions/admin/forwarders.ts`
  (admin bulk status→delivered). Earns a `tb_user_sales` row when customer's `coid` is a VIP coid.
- **agent-commission payout report** (prior gap): BUILT — `actions/admin/reports-agent-payouts.ts`
  + `/admin/reports/agent-payouts` (reads faithful `tb_user_sales_admin_pay`).
- **pay-on-behalf → auto-receipt** (A1 gap, `_MASTER-FRESH.md` L17): still open per that audit
  (pay-on-behalf doesn't mint `tb_receipt`); the auto-issue hook IS wired to the standard
  wallet-approve + bulk-approve paths (`tb-bulk.ts:234`, `wallet-trans.ts:270`).

---

## 4. MAX-POTENTIAL UPGRADES — "ดึงศักยภาพสูงสุด"

### Tax / receipt
- **U1 · e-Tax Invoice & e-Receipt (RD ETDA) submission** — `M/L · P1`. The
  `tb_forwarder_tax_invoice*` + `withholding_tax_entries` scaffolding is already RD-86-shaped.
  Wire to RD's e-Tax Invoice by Email / API: auto-submit each issued receipt → legally-stamped
  PDF + XML, push to customer. Kills manual filing; the data (corporatetype, recompnumber,
  WHT base) is all captured. High owner value (Pacred = new juristic, wants clean tax posture).
- **U2 · e-Withholding Tax (e-WHT) remit** — `M · P1`. `lib/tax/wht.ts` already notes e-WHT
  drops service WHT 1%→… on remit. Build the bank-API remit + auto-generate the 50-ทวิ
  certificate per `tb_withdraw_comm_*.withholding` + `tb_receipt.totalbeforewithholding`.
- **U3 · One-click PEAK / FlowAccount sync** — `M · P1`. `tb_receipt` (13.8k) + `tb_bill` +
  `tb_withdraw_comm_*` are a complete AR/AP ledger. Export to PEAK (the team already pivoted
  accounting toward receipt-flow, Wave 29) → real double-entry books, month-end close via the
  existing `accounting_periods`/`period_close_event` tables (currently empty).

### Commission / sales
- **U4 · Auto-commission accrual engine** — `M · P0`. Today the 1% sales + interpreter-% accrual
  is computed lazily inside the `add.php`-equivalent selector. Make it a **trigger** (like the
  earn-trigger): on `tb_wallet_hs` paid → write a typed accrual row → reps/interpreters see a
  live "owed" balance, admin batches just confirm. Removes the per-month manual SQL the legacy
  forced. Pairs with closing G1+G2.
- **U5 · Sales leaderboard + target tracking** — `S/M · P1`. Build G4 as a live KPI dashboard
  (use the `audit-kpi-dashboard` skill): rep ranking, MTD vs target, conversion (signups→first
  shipment), commission-earned trend. `tb_sales_report` (17k) + `tb_user_sales` (4.1k) +
  `tb_users.adminIDSale` already hold everything.
- **U6 · Debtor / AR-aging analytics** — `M · P1`. Cross `tb_receipt` (issued) vs `tb_wallet_hs`
  (paid) vs `tb_forwarder` outstanding → an aging report (0-30/30-60/60-90/90+) per customer +
  per sales-rep. Surfaces revenue at risk; feeds collections. The `pending-payments` report
  exists but isn't aged.
- **U7 · Customer-affiliate self-serve growth loop** — `S · P2`. The affiliate dashboard
  (`tb_user_sales`, `useridmain`) is a referral engine. Add a shareable referral code +
  real-time earnings + auto-withdraw-when-threshold-met → turns 8.9k customers into a sales force
  (the owner's vision: "ดึงลูกค้าไว้ในระบบ").

### Cross-cutting
- **U8 · Unify the commission SOT** — `M · P0` (debt-paydown). The cluster has THREE commission
  data models live in code: `tb_user_sales` (canonical), the dead `commission_*` rebuilt stack,
  and the un-ported `tb_withdraw_comm_*` legacy batch stack. Consolidate to ONE (extend
  `tb_user_sales*` to cover batch + interpreter, OR port `tb_withdraw_comm_*` faithfully and
  delete `commission_*`). Write an ADR. Prevents the next dev from wiring a 4th dead twin.

---

## 5. Evidence index (files read)
- Legacy: `withdraw-commission-{sale,interpreter}.php` + their `include/pages/.../{home,add}.php`
  (commission = `fTotalPriceNetAll*0.01`; interpreter = yuan-margin × perCom);
  `hs-customrate.php`; `printReceipt.php` (ใบเสร็จ+ใบกำกับ, ต้นฉบับ/สำเนา); `report-sale-new.php`
  (rep ranking/target); `report-user-sales.php` (affiliate min-threshold); `forwarder-bill.php`
  (combine-bill → `tb_bill`/`tb_bill_item`).
- Pacred: `lib/admin/auto-issue-receipt.ts`, `mint-receipt-doc-no.ts`, `forwarder-tax-invoice.ts`,
  `lib/tax/wht.ts`; `actions/commissions-tb.ts`, `actions/admin/sales-payouts-tb.ts`,
  `actions/admin/sales-payouts.ts` (tombstone), `actions/admin/commissions.ts`,
  `actions/commissions.ts`, `actions/admin/earn-trigger-tb-user-sales.ts`,
  `actions/admin/reports-agent-payouts.ts`, `actions/admin/combine-bill.ts`,
  `actions/admin/freight-invoices.ts`, `actions/admin/invoice-adjustments.ts`;
  pages `/admin/{commissions,withdrawals,forwarder-sales,sales-payouts,reports/*}`,
  `/(protected)/{commissions,sales}/*`.
- Prior audit: `docs/research/legacy-resweep-2026-05-31/_MASTER-FRESH.md` (items #6, A1, A2, staff-purge).
- Prod probes: row counts + sample rows via REST service-role (2026-06-01).
