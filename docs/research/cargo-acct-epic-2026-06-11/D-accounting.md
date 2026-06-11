# Workstream D — FULL accounting loop (cost / sell / profit / VAT / WHT · doc gen · pay-to-China · pay-out · receive+pay ledger)

> **AUDIT ONLY — 2026-06-11.** Source of truth = staged legacy PHP at
> `C:/Users/Admin/AppData/Local/Temp/pacred-legacy/member/pcs-admin/**` + the owner's
> manual cost/profit ledger `cost-profit.xlsx`. Cross-referenced against current Pacred
> (`actions/admin/**`, `lib/tax/**`, `lib/forwarder/**`, `app/[locale]/(admin)/admin/accounting/**`).
> No code changed. Method = §0b (open every `.php`, enumerate modes, extract exact money math + every table written).
>
> **HEADLINE:** The accounting loop is **~75% already built and legacy-faithful in Pacred** — the
> shop cost/profit/VAT formula, the yuan-transfer profit capture, the forwarder receipt + WHT 1% +
> 50-ทวิ print tracking, the shop-disbursement (จ่ายค่าสั่งซื้อจีน), the wallet ledger, and the
> commission tables/actions all exist and match legacy math line-for-line. The real GAPS are: (1) the
> **ใบกำกับภาษี / VAT issuance** lane (ships DORMANT, never flipped on); (2) the **import-duty (อากรขาเข้า) + VAT-inclusive total** the xlsx adds but the app omits; (3) **commission auto-rate computation** (legacy enters the rate manually); (4) the **ใบเสร็จ PCS→Pacred rebrand**; (5) a couple of **dead-write / reachability** checks. Nothing here is a from-scratch build.

---

## 0 · The 6 money lanes + the wallet ledger key

Every cargo money movement is a `tb_wallet_hs` row. The `type` enum is the canonical ledger key
(decoded from `pcs-admin/include/function.php` L472-475):

| `type` | meaning | sign on wallet | legacy report page |
|---|---|---|---|
| **1** | เติมเงิน (top-up) | + | `acc-topup.php` |
| **2** | ชำระฝากสั่งซื้อ (shop order pay) | − | `acc-shop.php` / `acc-shop-refund.php` |
| **3** | ถอนเงิน (direct withdraw) | − | `acc-withdraw.php` |
| **4** | ชำระฝากนำเข้า (forwarder pay) | − | `acc-forwarder.php` / `acc-forwarder-refund` |
| **5** | คืนเงิน (refund) | + | `acc-shop-refund.php` (type=5,status=2) |
| **6** | ฝากโอน/ชำระหยวน (yuan-transfer) | − | `acc-payment.php` |

Sub-fields seen on `type=4`/`type=1` writes (from `pay-users.php`): `typeNew` (5/6 = new forwarder-pay
lineage), `typeService` ('2' = forwarder), `refOrder` (fID/hNo), `refOrder2`/`whID` (links a pay to the
top-up that funded it), `paydeposit='1'`. `status`: 1=รอ, 2=สำเร็จ, 3=ไม่สำเร็จ.

The three prices the owner insists never be conflated (decoded across all files + the xlsx):
- **ต้นทุน / COST** — what Pacred pays the supplier/shipping-line (China item cost × cost-rate, container transport, crate, other — all at cost).
- **ราคาขาย / SELL** — what the customer is billed (item × sell-rate + transport + service fees).
- **ค่าบริการ / กำไร = SELL − COST.** VAT 7% is charged on **this margin** (`profit × 0.07`), NOT on the gross sell. Confirmed in BOTH the app reports AND the owner's xlsx.

---

## 1 · The full money model — exact formulas (file:line)

### 1a · SHOP (ฝากสั่งซื้อ) — `report-shops-profit-pay.php` + `acc-shop.php`

Per shop-order header (`tb_header_order`):

```
priceUser (ราคาขาย) = round_up( (hTotalPriceCHN + hShippingCHN) × hRate , 2 )      # report-shops-profit-pay.php L228, L250
pricePCS  (ต้นทุน)   = round_up(  hRateCost × hCostAll , 2 )                        # L229, L249
profit   (ค่าบริการ) = priceUser − pricePCS                                          # L230
VAT 7%               = profit × 0.07                                                # L252, L284
```
- `hTotalPriceCHN` = sum of item ¥ prices (sell), `hShippingCHN` = China-domestic shipping ¥, `hRate` = customer yuan rate.
- `hCostAll` = cost ¥ basis, `hRateCost` = cost yuan rate. Cost is gated `if(hCostAll != 0)` else shows "รอคำนวณ".
- Totals row: `ราคาทุนรวม / ราคาขายรวม / ค่าบริการรวม(กำไรรวม) / ภาษีมูลค่าเพิ่ม 7% รวม` (L281-285).
- `acc-shop.php` is the same formula minus `round_up`, PLUS a **refund subtraction**: joins `tb_wallet_hs.type=5 AND status=2` per `hNo` → columns `ลูกค้าจ่ายมา / คืนเงินลูกค้า / ราคาขาย / ต้นทุน / ค่าบริการ`; cancelled (`hStatus=6`) orders get `profit=0` (L238-240).

**Pacred state:** ✅ FULLY BUILT.
- The cost-rate is a **per-order admin setter**: `actions/admin/service-orders-shop-workflow.ts` L452 `hCostAllTh = roundUp(hCostAll × hRateCost, 2)`, writes `hcostall/hratecost/hcostallth` (L466-468) — matches legacy exactly.
- The accounting report is a 1:1 faithful port: `app/[locale]/(admin)/admin/accounting/shop/page.tsx` (transcribes `acc-shop.php` incl. refund-lookup map). Global cost-rate defaults live in `tb_settings.hratecostdefault/hratecostsale` (`actions/admin/tb-settings.ts` L370-371).

### 1b · YUAN-TRANSFER (ฝากโอน/ชำระหยวน) — `payment.php` + `acc-payment.php`

Customer request (`payment.php` L30, L34-52): `payTHB = payRate(customer) × payYuan` → deduct
`tb_wallet.walletTotal` → INSERT `tb_payment`(payStatus=1) + `tb_wallet_hs`(type=6, status=1).

Admin confirm 1→2 (`payment.php` L615-644): captures the **cost rate** `payRateCost` and computes
the profit:
```
payTHBCost   (จ่ายจริง)   = payYuan × payRateCost                 # L624
payProfitTHB (กำไรสุทธิ)  = payTHB − payTHBCost                   # L625
```
Stored on `tb_payment`: `payProfitTHB, payTHBCost, payRateCost, payStatus=2, payDateAdmin, adminID`. Default cost-rate = `tb_settings.hRateCostDefault` if not entered (L864-872). Display block L903-907 = จ่ายจริง / รับจากลูกค้า / เรทต้นทุน / เรทลูกค้า / กำไรสุทธิ.

Reject 1→3 (`payment.php` L658-689): **refund** — `walletTotal += payTHB`, INSERT `tb_wallet_hs`(type=5, status=2).

`acc-payment.php` states the profit SQL explicitly (L86-89):
`sumUser = payYuan×payRate · sumCost = payYuan×payRateCost · profit = sumUser − sumCost` (join `tb_wallet_hs.type=6`, `payStatus=2`).

**Pacred state:** ✅ FULLY BUILT. `actions/admin/yuan-payments-tb.ts` L156-158:
`payratecost = d.payratecost ?? d.payrate` (default cost=sell-rate) · `paythbcost = payyuan×payratecost` ·
`payprofitthb = paythb − paythbcost` — exact. Report pages: `accounting/payment/page.tsx`,
`reports/yuan-profit/page.tsx` (`SUM(payProfitTHB) WHERE payStatus=2`).

### 1c · FORWARDER (ฝากนำเข้า) — `acc-forwarder.php` (the embedded "คำอธิบายระบบ" modal is the spec)

The `acc-forwarder.php` help-modal (L172-191) documents every component verbatim. Per forwarder
row (`tb_forwarder`):

```
COST (ต้นทุน)        = fCostTotalPrice + fTransportPrice + fShippingService + priceCrate
                       + priceOther + fPriceUpdate + fTransportPriceCHNTHB                # L257
                       (1.1 import CN→TH cost  1.2 TH transport=cost-only  1.3 ฿50 legacy service
                        1.4 crate=cost-only  1.5 other=cost-only  — these 4 carry NO margin)

SELL pre-discount (ราคาจริง) = fTotalPrice + fTransportPrice + fPriceUpdate + fShippingService
                       + priceCrate + fTransportPriceCHNTHB + priceOther                  # L260
                       (NOTE: uses fTotalPrice = SELL China-import, vs cost using fCostTotalPrice)

SELL net (มูลค่าสินค้า) = (ราคาจริง) − fDiscount                                          # L263

WHT 1% (นิติบุคคล)  : if fUserCompany==1 → walletPayUser = net − net×0.01 ; WHT = net×0.01  # L271, L311
                       else walletPayUser = net ; WHT = '-'                                # L274, L314

ค่าบริการ (profit)   = walletPayUser − fCostTotalPrice(=COST)                              # L318
                       (modal §9: ((ลค จ่าย wallet + ลค จ่าย cash back) − ต้นทุน))
```
Selling vs cost differ on the China-import line only: SELL uses `fTotalPrice`, COST uses `fCostTotalPrice`;
the TH-transport/crate/other/update lines are identical on both sides (cost = sell → zero margin, by design).
`cbhAmount` (cash-back) joins via `tb_cash_back_hs` and is added to the customer-paid side.

**Pacred state:** ✅ FULLY BUILT. `lib/forwarder/calc-company-total.ts` `calPriceForwarderSumCompany()`
is the exact port (sum of the 7 buckets − discount, then `−×0.01` if `fUserCompany==='1'`). The richer
per-charge-type engine `lib/tax/wht.ts computeForwarderTax()` maps the same buckets to WHT classes
(transport 1% / service 3% / rental 5% / goods 0%) + VAT (intl leg zero-rated) — ADR-0015. Report page:
`accounting/forwarder/page.tsx` (faithful port of `acc-forwarder.php`).

### 1d · WHT — the 1% juristic gate (the load-bearing rule)

Two distinct WHT models coexist in legacy (both ported):
1. **Legacy flat 1% (the RECEIPT path)** — `grenrateReceiptF` / `printReceipt.php` L385-399:
   applies `total × 0.01` **only when** customer is juristic (`corporateNumber != ''`) **AND**
   `totalBeforeWithholding >= 1000` (the ฿1,000 RD threshold). `fUserCompany='1'` (set at pay-time in
   `pay-users.php` L399) forces it regardless of amount. Pacred = `lib/tax/wht.ts legacyReceiptAmount()`
   (`LEGACY_RECEIPT_WHT_MIN=1000`, `LEGACY_RECEIPT_WHT_PCT=1`) — exact, + `actions/admin/forwarder-invoice.ts`
   L312 `applyJuristic1Pct = corporate===1 && pricePayAll>=1000`.
2. **Per-charge-type WHT (the correct RD engine, for the tax-INVOICE step)** — owner-confirmed 2026-05-30:
   transport 1% / service 3% / rental 5% / goods 0%; WHT base = pre-VAT; juristic only. Pacred = `lib/tax/wht.ts computeTax()`.

Juristic ⇔ `tb_users.userCompany='1'` + a `tb_corporate` row (registered `type==2`). There is NO
separate per-customer "WHT enable" field in legacy — Pacred derives the same way.

### 1e · CONTAINER cost (ค่าตู้) — `report-cnt.php` → `getListCNTPay.php`

The China-transport / shipping-line payout, per `fCabinetNumber` (`getListCNTPay.php` L37-40):
```
ค่าขนส่งจีนรวม = SUM(fTransportPriceCHNTHB) + SUM(priceCrate) + SUM(fCostTotalPrice)   # per cabinet
```
Excludes cabinets already paid (`tb_cnt_item.fCabinetNumber IS NULL`). Pay-out batches into a bank
account (`tb_account_pcs` / `optionBankAccountMember`).

**Pacred state:** ✅ BUILT — `app/[locale]/(admin)/admin/report-cnt/pay/cnt-payment-form.tsx` +
`actions/admin/cnt-payment.ts`; container detail at `report-cnt/[fNo]/`.

---

## 2 · Document generation (ใบแจ้งหนี้ / ใบเสร็จ / ใบหัก / ใบกำกับ)

### 2a · ใบเสร็จรับเงิน (forwarder) — `printReceipt.php` (852 lines, the doc keystone)

- **Document type = ใบเสร็จรับเงิน "(ไม่ใช่ใบกำกับภาษี)"** (L275) — the in-app receipt is a
  **non-VAT receipt**, NOT a ใบกำกับภาษี. The actual VAT ใบกำกับ is the separate manual "NNB" process
  in the xlsx (see §4).
- Issuer **hardcoded "บริษัท พีซีเอส คาร์โก้ จำกัด"** tax-ID `0105560160694`, address flips on
  `date > 2025-03-20` (L293-297). → **Pacred must rebrand.**
- Reads `tb_receipt` (header) + `tb_receipt_item` (fID list) joined to `tb_forwarder`. Lines per row:
  No. / Order / Tracking / boxes / weight / volume / **ค่าขนส่ง = fTotalPrice** (the sell China-import).
- Footer totals: Total(fTotalPrice) / Delivery Charge CHN(fTransportPriceCHNTHB) / Delivery Charge TH(fTransportPrice) /
  Other(fPriceUpdate+fShippingService+priceCrate+priceOther) / Discount / **LESS WITHHOLDING TAX 1%** / Total Amount.
- WHT gate (L385-399, dup'd L735-749): juristic + `totalBeforeWithholding>=1000` → `Dis1per = totalPriceAll×0.01`,
  `Total Amount = totalPriceAll − Dis1per`. Baht-in-words via `Convert()`.
- **Two passes**: ต้นฉบับ (`printType!='copy'`) + สำเนา (`printType!='Orgi'`, `str_replace ต้นฉบับ→สำเนา`).
  Printing flips `tb_receipt.statusPrint='1' + adminIDprint + rDatePrint` (L65-66) — the **50-ทวิ / original-vs-copy
  audit trail**.
- 13 rows/page A4 pagination, mPDF + THSarabunNew. **Per-customer hardcoded overrides** PCS415 / PCS71 /
  PCS4136 / PCS8765 (L70-113) — legacy data fixes.

**Pacred state:** ✅ FULLY BUILT + legacy-faithful, and MORE robust:
- `actions/admin/forwarder-invoice.ts` = manual multi-fid issue (`adminIssueForwarderInvoice`, same-userid +
  `fstatus=5` gate, WHT 1% L312) + cancel + **`adminMarkReceiptPrinted`** (statusprint=1, mirrors L65-66) +
  **`adminBackfillReceiptItems`** (subset-sum recovery for orphaned receipts — a Pacred safety addition).
- Auto-issue on payment-land: `lib/admin/auto-issue-receipt.ts` (matches `grenrateReceiptF`).
- Customer-facing receipt render: `app/[locale]/(protected)/service-import/[fNo]/.../invoice` (the `invoiceF.php` port,
  per CLAUDE.md 2026-06-10). Doc-number minter `lib/admin/mint-receipt-doc-no.ts` (FRC/FRG yyMM-NNNNN).
- `tb_receipt` columns present: `rstatus / ramount / totalbeforewithholding / statusprint / statusprintcopy /
  adminidprint / rdateprint / recompnumber / recompname / recompaddress / corporatetype / documentissuer / documentapprover`.

### 2b · ใบแจ้งหนี้ (invoice) — `hs-forwarder-invoice.php` dispatcher → `add.php`

- `add.php` (28.8 KB) = the multi-item invoice composer UI: pick a customer (scoped `fStatus=5`,
  same member), list their forwarder items, sum (Total / Delivery CHN / Delivery TH / Other / Discount /
  Total Amount), record credit. The actual issuance happens via the receipt flow (legacy never wired
  ใบแจ้งหนี้ end-to-end — confirmed in Pacred's own header comment).
- History lists: `hs-forwarder-receipt.php` + `hs-receipt-forwarder.php` (near-identical; both → `printReceipt.php`,
  filter `userCompany` tabs ทั้งหมด/บริษัท/ทั่วไป, show `totalBeforeWithholding` + `rAmount` + print-original/copy status).

**Pacred state:** ✅ BUILT — `/admin/accounting/forwarder-invoice` (list + `[id]`), the manual-override path
in `forwarder-invoice.ts`. ⚠️ Pacred correctly treats ใบแจ้งหนี้ as subordinate to the receipt flow (legacy-faithful).

### 2c · ใบเสร็จ (shop / topup / withdraw / yuan / refund)

`acc-shop.php`, `acc-topup.php`, `acc-withdraw.php`, `acc-payment.php`, `acc-shop-refund.php` all post
selected rows to the SAME `printReceipt.php?id=` — i.e. the receipt generator is shared across all
cargo lanes (the `id` is the `tb_receipt.rID`). **Pacred state:** receipts surface at `/admin/accounting/receipts`
+ per-lane report pages; the shared receipt renderer is `lib/receipt/load-receipt-document.ts`.

---

## 3 · Pay-out + pay-on-behalf + commission flows

### 3a · จ่ายค่าสั่งซื้อจีน (shop disbursement) — `report-shops-profit-pay.php` create + `-history.php` pay

The supplier reimbursement: admin selects cleared shop orders → INSERT `tb_shop_pay_h` (header:
date/amount/status=1/adminIDCreate/bank) + `tb_shop_pay_sub` (hNo↔sphID fan-out) + UPDATE
`tb_header_order.hShopPay='1'` (dedup gate `hShopPay<>1`, else 'eRe'). The **amount disbursed = pricePCSAll
(ต้นทุนรวม)** — the China cost, not the sell. History page uploads the bank slip → status 1→2
(`tb_shop_pay_h.status=2, imagesSlip, adminIDUpdate`).

**Pacred state:** ✅ FULLY BUILT — `actions/admin/shop-disbursement.ts` (faithful incl. the NOT-NULL
gotchas + `tb_shop_pay_sub.hcostallth = pricePCS`), UI at `/admin/shop-disbursement` (+ `/history`).

### 3b · จ่ายค่าตู้/ขนส่งจีน — `report-cnt` pay (see §1e). ✅ BUILT.

### 3c · จ่ายแทนลูกค้า (pay-on-behalf, the most complex) — `pay-users.php` (1140 lines)

Admin pays a customer's order **from the customer's wallet** (topping up via slip first if short).
Two POST branches:
- **`paymentOrder` (shop, L4-200):** `pricePay = (hTotalPriceCHN+hShippingCHN)×hRate + hShippingService`
  → deduct wallet → `tb_wallet_hs(type=2)` → `hStatus=3`. If wallet short + slip provided: top-up
  (`type=1`) then pay, linking via `tb_wallet_paydeposit(whID, hNo)`.
- **`paymentForwarderNew` (forwarder, L202-490):** resolves SVIP (`tb_rate_custom_cbm`) / VIP
  (`coID<>'PCS'`) / pro11.11 (`tb_promotion promoID=16`) / **เหมา (PCSF + fTransportPrice=0 → ฿50 fee,
  L329/L388)** / corporate. Total = `(fTotalPrice + fTransportPrice + fPriceUpdate + fShippingService +
  priceCrate + fTransportPriceCHNTHB + priceOther) − fDiscount` (L320), **−×0.01 if corporate && >=1000**
  → sets `fUserCompany='1'` (L399, the flag printReceipt later reads). On pay: `tb_wallet_hs(type=4,
  typeNew=6, typeService=2)`, `tb_forwarder.fStatus=6 + paydeposit=1`, `tb_wallet_paydeposit`.

**Pacred state:** ✅ BUILT — `actions/admin/pay-user.ts` + `app/[locale]/(admin)/admin/wallet/pay-user/pay-user-client.tsx`.
⚠️ **VERIFY** the SVIP/VIP/pro11.11/เหมา pricing-resolution branch is fully ported (it's the densest legacy
logic — see Gap G6).

### 3d · COMMISSION — sales (เซลล์) + interpreter (ล่ามจีน)

- **`withdraw-commission-sale.php`** — admin records a payout to a salesperson over selected forwarder
  rows the rep owns (`tb_users.adminIDSale`). Header `tb_withdraw_comm_sale_h` (amount, **commBefore,
  withholding** — both **admin-entered**, L88-90) + fan-out `tb_withdraw_comm_sale_item(fID, wcsID)`.
  Slip upload flips status 1→2 (L37). **The commission RATE is manual** — legacy does not auto-compute it.
- **`withdraw-commission-interpreter.php`** — payout to interpreters over shop orders, with **`diffYaun`
  per item** (`tb_withdraw_comm_interpreter_item(hNo, diffYaun, wciID)`, L104-107) = the yuan rate-spread
  (customer rate − cost rate, same payProfit logic as §1b but per the interpreter's orders).

**Pacred state:** ✅ tables + actions exist — `actions/commissions-tb.ts`, `actions/admin/sales-payouts-tb.ts`,
UI at `app/[locale]/(protected)/sales/report/...` + `/admin/withdraw`, `/admin/forwarder-sales`. ⚠️ Confirm
the commission base is **admin-entered** (legacy-faithful) and not silently auto-accrued — see Gap G4.
(CLAUDE.md flags a separate W6 freight-commission ledger that ships DORMANT — distinct from this cargo
commission and out of D scope.)

### 3e · RECEIVE side — top-up + refunds

- **Top-up (`type=1`)**: customer uploads slip → `tb_wallet_hs(type=1, status=1, imagesSlip)` → admin
  approves → `status=2` + `walletTotal +=`. Report `acc-topup.php` (`status=2 AND imagesSlip<>''`).
- **Direct withdraw (`type=3`)**: `acc-withdraw.php` (status=2) — "ถอนเงิน โอนโดยตรง", columns ยอดถอน /
  เงินโอนคืน / ค่าบริการ.
- **Refunds (`type=5`)**: shop refund `acc-shop-refund.php` (type=5,status=2 over `tb_order`/`tb_header_order`);
  yuan refund via `payment.php` reject; forwarder refund `acc-forwarder-refund` (not present at root — likely a
  dispatcher/handler variant).

**Pacred state:** ✅ BUILT — wallet deposit/withdraw at `app/[locale]/(protected)/wallet/*`, refunds at
`/refunds`, admin reports at `/admin/accounting/{payment,disbursements,reconcile,ar-aging}`.

---

## 4 · The `cost-profit.xlsx` model (the owner's manual reconciliation ledger)

File = `ลงข้อมูลฝากจ่าย_ต้นทุนกำไร`. 5 sheets: `ต้นทุน-กำไร (รวม)` [hidden], `PR ฝากจ่าย 05-69`,
`PR ฝากจ่าย 06-69` [visible monthly], `VAT` [hidden], `Sheet2`. It is the owner's **per-shipment manual
cost/profit/VAT worksheet** that runs ALONGSIDE the app (the app gives the per-row numbers; the owner
reconciles VAT + import-duty + the NNB ใบกำกับ here).

The "PR ฝากจ่าย" sheet columns (decoded from the string table — the cost→sell→VAT→ใบกำกับ pipeline):

| Block | Columns |
|---|---|
| Identity | ลำดับ · Shipment · รหัส/ชื่อลูกค้า · นิติบุคคล/บุคคลธรรมดา · รายชื่อบริษัท · เลขที่ตู้สินค้า PCS · เลขแทคกิ้ง · เลขที่ตู้ NNB |
| Two issue tracks | **ใบเสนอราคา** (เลขที่ใบเสนอราคา · วันที่ออก) · **ใบเสร็จรับเงิน/ใบกำกับภาษี** (เลขที่ใบกำกับภาษี · วันที่ออก VAT) |
| **COST** | จำนวน · ราคา · รวมเป็น · ค่าขนส่ง(จีน) · อัตราแลกเปลี่ยน(ต้นทุน) · **รวม (ต้นทุน THB)** |
| **SELL** | หัก ส่วนลด · **อากรขาเข้า (%)** · **อากรขาเข้า (บาท)** · **รวมราคาก่อน vat** · **ราคารวม Vat** · ลูกค้าชำระ · เลขที่ใบกำกับ · **ขาย-ต้นทุน (กำไร)** |
| **VAT / NNB** (right block, header "เบิกต้นทุน VAT NNB") | ราคาขายต้นทุน(AH) · **หัก VAT 7% (AI, shown NEGATIVE)** · ราคาขายต้นทุนสุทธิ(AJ) |
| Footer | รวมเบิกต้นทุน · รวม กำไร/ขาดทุน |

Concrete row sample (R9): cost ฿55,715.80 (¥11,705 × 4.76) → sell ฿56,301.05 (× 4.81) → ขาย-ต้นทุน
฿585.25 → **หัก VAT 7% = −฿38.29 → สุทธิ ฿546.96**. This confirms the **VAT-on-margin** model
(7% applied to the ขาย-ต้นทุน gross-up, the NNB ใบกำกับ basis), matching the app's `profit×0.07`.

**Two things the xlsx has that the APP does NOT compute:**
1. **อากรขาเข้า (import duty)** — a `%` and `บาท` column on the sell side (between discount and pre-VAT total).
   The app's forwarder/shop reports have NO import-duty line.
2. **ราคารวม Vat (VAT-inclusive total)** — the xlsx rolls SELL → +import-duty → pre-VAT → **VAT-inclusive**;
   the app's `printReceipt.php` receipt is the **non-VAT** ใบเสร็จ and never shows a VAT-inclusive total.
   The VAT/NNB ใบกำกับ is done manually here.

---

## 5 · Pacred current state — summary scorecard

| Capability | Legacy file | Pacred | Status |
|---|---|---|---|
| Shop cost/sell/profit (hRateCost×hCostAll) | report-shops-profit-pay.php | service-orders-shop-workflow.ts L452 + accounting/shop | ✅ exact |
| Shop VAT 7% on margin | report-shops-profit-pay.php L252 | accounting/shop (display) + lib/tax | ✅ |
| Yuan-transfer cost/profit (payRateCost) | payment.php L624-625 · acc-payment.php | yuan-payments-tb.ts L156-158 | ✅ exact |
| Forwarder cost/sell/profit/WHT | acc-forwarder.php | calc-company-total.ts + lib/tax/wht.ts | ✅ exact |
| WHT 1% juristic gate (≥1000) | printReceipt.php L385 · grenrateReceiptF | wht.ts legacyReceiptAmount + forwarder-invoice.ts L312 | ✅ exact |
| Per-charge-type WHT (transport1/svc3/rent5) | (ADR-0015, not legacy) | lib/tax/wht.ts computeTax | ✅ (Pacred-correct, for invoice step) |
| ใบเสร็จรับเงิน PDF (13/pg, orig+copy) | printReceipt.php | service-import/[fNo]/invoice + forwarder-invoice.ts | ✅ (rebrand pending) |
| 50-ทวิ / print-original-vs-copy audit | printReceipt.php L65-66 | adminMarkReceiptPrinted (statusprint) | ✅ |
| Manual multi-fid receipt issue | hs-forwarder-invoice/add.php | adminIssueForwarderInvoice | ✅ + better |
| Shop disbursement (จ่ายจีน) | report-shops-profit-pay.php + history | shop-disbursement.ts | ✅ exact |
| Container cost pay-out (ค่าตู้) | report-cnt getListCNTPay.php | cnt-payment.ts + report-cnt/pay | ✅ |
| Pay-on-behalf (shop) | pay-users.php paymentOrder | pay-user.ts | ✅ |
| Pay-on-behalf (forwarder + VIP/เหมา) | pay-users.php paymentForwarderNew | pay-user.ts | ⚠️ verify VIP/pro/เหมา branch (G6) |
| Commission — sales | withdraw-commission-sale.php | sales-payouts-tb.ts | ✅ (rate manual — verify G4) |
| Commission — interpreter (diffYuan) | withdraw-commission-interpreter.php | commissions-tb.ts | ⚠️ verify diffYuan capture (G4) |
| Top-up / withdraw / refund reports | acc-topup/withdraw/shop-refund.php | wallet/* + accounting/* | ✅ |
| Wallet ledger (type 1-6) | function.php L472 | lib/wallet/* + tb_wallet_hs reads | ✅ |
| **ใบกำกับภาษี / VAT issuance (shop+yuan)** | (manual NNB / xlsx) | tax-doc-mode.ts + etax + tb_*_tax_invoice | 🟠 **DORMANT** (G1) |
| **อากรขาเข้า (import duty) line** | xlsx only | — | 🔴 **MISSING** (G2) |
| **VAT-inclusive total (ราคารวม Vat)** | xlsx only | — | 🔴 **MISSING** (G2) |

---

## 6 · GAPS + concrete build plan (sequenced)

> Order = money-risk × effort. Everything below is gap-closing on a built loop, not new construction.
> "NEXT FREE migration = 0178" per CLAUDE_TECHNICAL (0177 was the last; confirm before applying).

### G1 — 🟠 ใบกำกับภาษี / VAT issuance lane is DORMANT (biggest open item; owner-input-blocked)
The whole VAT/ใบกำกับ layer EXISTS in Pacred (`lib/tax/tax-doc-mode.ts` — รับเอง/ใบกำกับ/ใบขน modes + VAT-base
per mode; `tb_forwarder_tax_invoice` LIVE, `tb_shop_tax_invoice` DORMANT; etax hub at `/admin/accounting/etax`;
`peak-export`) but **issuance never goes live** — gated behind `business_config tax_invoice.shop_yuan_enabled`
(default OFF, see `lib/tax/shop-yuan-flag.ts`). Legacy issues real ใบกำกับ only via the manual NNB / xlsx
process (§4) — so the app lane is *ahead* of legacy but unverified.
**Plan:** (a) run ONE test order through shop+yuan issuance on dev → verify VAT base = service-fee/margin
(not gross), serial_no minting, PEAK export; (b) accountant signs off the ใบขน VAT base; (c) flip the flag.
**Owner-blocked** (PEAK GL codes + VAT-base sign-off — both already standing OWNER ACTION ITEMs in CLAUDE.md).

### G2 — 🔴 Import-duty (อากรขาเข้า) + VAT-inclusive total not modelled (the xlsx-only delta)
The owner's xlsx adds an **อากรขาเข้า %/บาท** line and a **ราคารวม Vat** (VAT-inclusive) total on the sell
side; neither exists in the app's forwarder/shop money model or the ใบเสร็จ. This is the manual gap that
forces the owner back into Excel.
**Plan:** add optional `import_duty_pct` / `import_duty_thb` per forwarder row (mig — new cols on `tb_forwarder`
or a sidecar like the `cost_*` cols mig 0158 added), surface in the cost/declared editor
(`components/admin/cargo-cost-line-editor.tsx` + `cargo-declarations`), and compute a VAT-inclusive total in
the etax/ใบกำกับ path (G1) so the xlsx round-trip dies. ⚠️ Duty rate is HS-code-driven + policy-sensitive
(ADR-0016 มูลค่าสำแดง) → **owner/accountant input** on default duty handling. Medium effort, gated on G1.

### G3 — 🟡 ใบเสร็จ PCS→Pacred rebrand (faithful-port debt)
`printReceipt.php` hardcodes "บริษัท พีซีเอส คาร์โก้ จำกัด" + tax-ID `0105560160694` + PCS address.
**Verify** the Pacred receipt renderer (`service-import/[fNo]/invoice`, `lib/receipt/load-receipt-document.ts`)
pulls issuer from `components/seo/site.ts` (Pacred `0105564077716`), not a copied PCS hardcode. Also audit the
per-customer hardcodes (PCS415/71/4136/8765) — legacy data fixes that should NOT carry to Pacred. Low effort.

### G4 — 🟡 Commission: confirm rate is admin-entered + interpreter diffYuan captured
Legacy commission RATE is **manually entered** (`withdraw-commission-sale.php` `commBefore`/`withholding`
POST fields) — NOT auto-computed. Pacred has `sales-payouts-tb.ts` + `commissions-tb.ts`; **verify** (a) the
sales-commission base stays manual/admin-confirmed (don't silently auto-accrue — would mis-state liability),
and (b) the interpreter payout captures `diffYuan` (the rate-spread) per shop order. The owner's standing
"commission 50/50 vs ใครเซอร์วิสได้คอม + W6 tier rates" decision (CLAUDE.md) gates any *auto* rate. Low effort
to verify; auto-rate is owner-blocked.

### G5 — 🟡 Reachability + dead-write sweep (§0d/§0e) on the accounting surfaces
All the report/disbursement/receipt pages exist; confirm each is ≤3-click reachable from the
`accounting-menubar.ts` hub and that no write-surface targets a 0-row rebuilt twin (the §0e trap — e.g.
verify shop-disbursement writes `tb_shop_pay_h` not a `shop_pay_*` rebuilt table; verify commission writes the
`tb_withdraw_comm_*` tables). Quick "Potemkin sweep". Low effort.

### G6 — 🟡 Verify pay-on-behalf forwarder pricing-resolution (VIP/SVIP/pro11.11/เหมา)
`pay-users.php paymentForwarderNew` (L202-490) is the densest legacy money logic (SVIP `tb_rate_custom_cbm`,
VIP `coID<>'PCS'`, pro11.11 `tb_promotion promoID=16`, เหมา PCSF→฿50). Confirm `actions/admin/pay-user.ts` ports
ALL four branches + the `fUserCompany='1'` set-at-pay-time (it's what drives downstream WHT display). If any
branch is stubbed, the customer is over/under-charged silently. Medium effort — needs side-by-side read.

### G7 — 🟢 (housekeeping) Two WHT modules — confirm intentional, not drift
`lib/tax/wht.ts` AND `lib/billing/wht.ts` both exist. Confirm they're the (correct engine) vs (a billing
helper) and not a stale duplicate of the same rule. If duplicated → consolidate. Trivial.

---

## 7 · Reference — every legacy file read (file:line anchors)

- `report-shops-profit-pay.php` (434) — shop cost/sell/profit/VAT + disbursement create (L228-230, L249-252, L29-55).
- `report-shops-profit-pay-history.php` (500) — disbursement batch list + pay (slip → status 1→2, L162).
- `payment.php` (1047) — yuan-transfer: customer req (L30), admin confirm cost/profit (L624-625), refund (L658-689).
- `acc-shop.php` (381) — shop AR report + refund subtraction (L233-240).
- `acc-forwarder.php` (481) — forwarder report + the canonical cost/sell/WHT spec modal (L172-191, L257-318).
- `acc-payment.php` (354) — yuan profit SQL (L86-89).
- `acc-topup.php` (310) / `acc-withdraw.php` (329) — top-up (type=1) / withdraw (type=3) reports.
- `acc-shop-refund.php` (349) — refund report (type=5, status=2).
- `acc-system-cargo.php` (6) → `include/pages/acc-system-cargo/{home,pages/income/home}.php` — P&L roll-up shell.
- `printReceipt.php` (852) — ใบเสร็จรับเงิน (ไม่ใช่ใบกำกับ) PDF + WHT 1% (L385-399) + print-orig/copy (L65-66).
- `hs-forwarder-invoice.php` (30) → `include/pages/hs-forwarder-invoice/add.php` (28.8KB) — invoice composer.
- `hs-forwarder-receipt.php` (497) / `hs-receipt-forwarder.php` (536) — receipt history lists.
- `withdraw-commission-sale.php` (119) + `add.php` — sales commission (manual rate, `tb_withdraw_comm_sale_*`).
- `withdraw-commission-interpreter.php` (120) — interpreter commission (`diffYuan`, `tb_withdraw_comm_interpreter_*`).
- `pay-users.php` (1140) — pay-on-behalf shop (L4-200) + forwarder VIP/เหมา (L202-490).
- `report-cnt.php` → `include/pages/report-cnt/getListCNTPay.php` — container cost pay-out (L37-40).
- `include/function.php` L472-475 — the `tb_wallet_hs.type` enum (the ledger key).
- `cost-profit.xlsx` — owner's manual cost/profit/VAT/อากร/NNB-ใบกำกับ reconciliation (§4).
