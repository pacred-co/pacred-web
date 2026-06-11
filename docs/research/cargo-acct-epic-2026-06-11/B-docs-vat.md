# Workstream B — Customer document choice (ใบกำกับภาษี / ใบขน / ไม่รับเอกสาร) + VAT visibility

> **Owner mandate (verbatim intent):** when a customer picks a document option at
> order time it must PERSIST, and back-office staff must clearly SEE what was
> chosen — VAT vs no-VAT, and whether a tax document must be produced. "วันนี้
> หลังบ้านดูไม่ออกว่าลูกค้าเลือกอะไร … ห้ามเดา ห้ามตกหล่น."
>
> **Method (§0b):** grounded 100% on the staged legacy source
> (`C:/Users/Admin/AppData/Local/Temp/pacred-legacy/member` + `…/pcs-admin`) and
> the live Pacred tree (worktree cwd). Every legacy claim carries a `file:line`.
> AUDIT ONLY — no code changed, no gates run, no git.
>
> **Scope note:** Workstream A audited cart PRICING. This doc is the **document /
> VAT / WHT** lane. The two do not overlap. The COST/declared-value capture
> (Pricing role · ใบขน มูลค่าสำแดง) is its own concern (migration 0158 +
> `shop-cost-section.tsx`) — touched here only where it intersects the doc choice.

---

## 0. TL;DR — the seven findings

1. **Legacy had NO customer document picker at all.** In legacy PCS the customer
   never chose "ใบกำกับ / ใบขน / ไม่รับเอกสาร". The system ALWAYS issued one thing —
   a plain **ใบเสร็จรับเงิน "(ไม่ใช่ใบกำกับภาษี)"** (`printReceipt.php:275,626` ·
   `create-f-receipt.php` header). The only tax behaviour was a **flat 1% WHT**
   deducted for juristic customers. There was **no customer-facing VAT line** on
   any cargo bill.
2. **The legacy "choice" was an implicit CUSTOMER ATTRIBUTE, not a per-order
   pick:** `tb_users.userCompany` (1 = นิติบุคคล). It is set on the customer
   profile by admin, not chosen at checkout. It drives WHT and the back-office
   "ลูกค้าบริษัท / ลูกค้าทั่วไป" split.
3. **The WHT-1% rule (the only tax math in the cargo selling flow)** lives in
   `calPriceForwarderSumCompany()` (`member/include/function.php:1402-1410`):
   deduct `total*0.01` when `userCompany==1 && total>=1000 && fUserCompany!=2`,
   OR forced by `fUserCompany==1`. **There is NO ×0.07 VAT anywhere in the
   selling price.**
4. **The legacy "VAT 7%" the owner saw is an INTERNAL profit estimate, not a
   customer charge.** `report-shops-profit-pay.php:252,284` shows `profit*0.07`
   (`ภาษีมูลค่าเพิ่ม 7%`) computed on **margin** (ราคาขาย − ราคาทุน) for ฝากสั่งซื้อ
   orders. It is an accounting column in a report — never on a customer bill,
   never per-order persisted.
5. **Per-order WHT override exists: `tb_forwarder.fUserCompany`** (set at order
   INSERT, `api-forwarder-cn.php:241-244,254`: `NULL` when corporate, else `0`;
   the WHT fn also honours `1`=force, `2`=exempt). This is the closest legacy
   equivalent to a stored, order-level "tax treatment" flag — but it is purely
   WHT, never a document-type.
6. **Pacred is FAR AHEAD of legacy** — it already added a real 3-mode picker
   (`CartTaxDocPref`), a canonical persistence column (`tax_doc_pref`, migrations
   0127/0140), a mode-aware VAT engine (`computeTaxForMode`), and a consumer that
   issues ใบกำกับ/ใบขน on payment-land (`auto-issue-receipt.ts` forwarder +
   `yuan-payments.ts` shop/yuan, the latter DORMANT behind `shop_yuan_enabled`).
   The choice DOES persist. The customer DOES see it on their receipt print.
7. **🔴 THE GAP = exactly the owner's complaint: the back-office cannot SEE the
   choice.** The admin forwarder detail + edit pages SELECT `tax_doc_pref` into
   the query but **never render it**. The ONLY admin component that shows/edits
   the mode — `tb-edit-panel.tsx` — is **ORPHANED** (imported and rendered
   nowhere → §0d dead). Its backing action `adminUpdateForwarderTaxDocMode` is
   therefore unreachable from the UI. No list/badge anywhere tells staff "this
   order = ใบกำกับ (VAT) / ใบขน / no-doc". That is the build target.

---

## 1. The legacy document-choice model (options · where stored · what the customer sees)

### 1.1 There is exactly ONE document, always — the non-tax receipt

The cargo (ฝากนำเข้า) receipt generator is `pcs-admin/printReceipt.php` (852 LOC,
the live one) and `pcs-admin/create-f-receipt.php` (800 LOC, the creator/older
variant). Both hard-print the same document identity:

- `printReceipt.php:274-276`
  ```php
  <div class="h-title">ใบเสร็จรับเงิน</div>
  <div class="h-title3">(ไม่ใช่ใบกำกับภาษี)</div>
  <div class="h-title2">เลขที่ : '.$ID.'</div>
  ```
  (duplicated at `:625-627` for the สำเนา copy pass.)

There is **no `if (docType=='taxinvoice')` branch anywhere** — the cargo system
literally cannot emit a ใบกำกับภาษี. The string "taxinvoice"/"ใบกำกับ" appears in
only 5 files in the whole tree, all of them this receipt header (printing the
*negative* "ไม่ใช่ใบกำกับภาษี" label) + `create-f-receipt.php`. Grep:
`taxinvoice|ใบกำกับ` → `printReceipt.php`, `create-f-receipt.php`,
`exampleReceiptF.php`, `acc-system-cargo/header-menu/index.php`,
`left-menu/.../sales.php`. None is a generator.

> Conclusion: legacy offered **no document menu** to the customer. ใบขน
> (customs declaration) was a Docs-team operational artifact, never a
> customer-facing VAT document; ใบกำกับภาษี for cargo did not exist.

### 1.2 The implicit "choice" = `tb_users.userCompany` (a profile attribute)

The single field that changes tax behaviour is **`tb_users.userCompany`**
(1 = นิติบุคคล / corporate). It is read everywhere the price/receipt is built:

- selling-price WHT: `getListPayForwarder.php:23,27` (customer payment list),
  `function.php:1402-1410` (the WHT fn), every `api-forwarder-*.php` + `api-sheets-*.php`
  (`if($userCompany==1)` at line ~242/435 etc.).
- back-office receipt list TABS by it: `hs-receipt-forwarder.php:141-143,190-196`
  (`userCompany=1` → "ลูกค้าบริษัท", a red badge with the corporate count;
  `userCompany<>1` → "ลูกค้าทั่วไป").

`userCompany` is set on the **customer profile** (admin-managed), NOT chosen at
checkout. So the legacy "document/VAT decision" is a property of *who the
customer is*, decided once, not *what they want for this order*.

The corporate **billing identity** (name/tax-id/address that prints on the
receipt) lives in `tb_corporate` (joined `printReceipt.php:54`,
`hs-receipt-forwarder.php:222`) with a per-receipt OVERRIDE snapshot on
`tb_receipt`: `reCompName / reCompNumber / reCompAddress` (selected
`printReceipt.php:51`, used `:84-90`). When the override is blank for a juristic,
the code falls back to the main address (`printReceipt.php:69-92`). A handful of
customers are hardcoded (PCS415/PCS71/PCS4136/PCS8765 — `printReceipt.php:70-113`).

### 1.3 What the customer SEES at order/payment time

On the customer payment modal (`getListPayForwarder.php`):
- if `userCompany==1 && totalPriceAll>=1000` → a line
  **"LESS WITHHOLDING TAX 1%"** with the deducted amount (`:243-247`).
- a corporate-only block with the company bank-transfer details
  (`:280-300`) — corporate pays by transfer (not wallet) so WHT can be applied.

The customer is shown **no document selector, no VAT line, no ใบกำกับ option.**
They simply see the 1% deduction if they are a registered juristic.

---

## 2. The VAT-7% rule + WHT (หัก ณ ที่จ่าย นิติบุคคล) rule — with file:line

### 2.1 WHT 1% — the ONLY tax in the cargo selling/billing flow

**Engine:** `member/include/function.php:1402-1410`
```php
function calPriceForwarderSumCompany($userCompany, $fPriceUpdate, $fTotalPrice,
    $fTransportPrice, $fShippingService, $fDiscount, $priceCrate,
    $fTransportPriceCHNTHB, $priceOther, $fUserCompany){
  $pricePayAll = ($fPriceUpdate+$fTotalPrice+$fTransportPrice+$fShippingService
                  +$priceCrate+$fTransportPriceCHNTHB+$priceOther) - $fDiscount;
  if($userCompany==1 && $pricePayAll>=1000 && $fUserCompany!=2 || ($fUserCompany==1)){
      $pricePayAll = $pricePayAll - ($pricePayAll*0.01);   // ← WHT 1%
  }
  return $pricePayAll;
}
```

Rule, decoded:
- **Base** = sum of all forwarder charges minus discount (the post-discount total).
- **Apply 1% WHT when:** customer is juristic (`userCompany==1`) **AND** total
  `>= 1000` **AND** this order is not WHT-exempt (`fUserCompany != 2`),
  **OR** this order forces WHT (`fUserCompany == 1`).
- WHT = `total * 0.01`, subtracted from what the customer pays.

**Per-order override field:** `tb_forwarder.fUserCompany`
- written at order INSERT: `api-forwarder-cn.php:241-244` →
  `$fUserCompany=0; if($userCompany==1){ $fUserCompany=NULL; }` then stored
  (`:247,254`). (Same in `api-forwarder-momo.php:241-244`.)
- semantics used by the WHT fn above: `NULL`/`0` = follow `userCompany`+threshold,
  `1` = force WHT, `2` = exempt this order.

**Receipt-time WHT** (the printed bill) reproduces the same 1% with extra
reconciliation against the actually-paid amount:
- `printReceipt.php:379-400` (юristic branch · `$ReCorporate==1`): if
  `totalBeforeWithholding>=1000` → show "LESS WITHHOLDING TAX 1%" and deduct
  `totalPriceAll*0.01`; else fall back to amount-paid diff heuristics
  (`diff0(...)`) to decide whether WHT was taken.
- the juristic flag for the receipt comes from whether `corporateNumber` is
  present (`printReceipt.php:68,94-96` → `$ReCorporate`), and the WHT label is
  pre-armed at `:117-120`.
- `tb_receipt.totalBeforeWithholding` = the WHT base ("ยอดก่อนหัก"),
  `rAmount` = after-WHT ("ยอดเงินหลังหัก") — shown in the back-office list
  `hs-receipt-forwarder.php:279-280,321-338` and the acc workspace
  `acc-system-cargo/.../receipt-forwarder-item/home.php:19,262-263`.

> **There is NO 7% VAT in this path.** Juristic cargo customers get 1% WHT
> deducted and a non-tax receipt. Full stop.

### 2.2 VAT 7% — internal profit estimate ONLY (ฝากสั่งซื้อ margin)

The "ภาษีมูลค่าเพิ่ม 7%" the owner saw is in the shop-order profit-pay report,
computed on **margin**, not on a customer price:

**`pcs-admin/report-shops-profit-pay.php`**
- per-row (`:227-234`):
  ```php
  $priceUser = round_up(($row['hTotalPriceCHN']+$row['hShippingCHN'])*$row['hRate'],2); // ขาย
  $pricePCS  = round_up($row['hRateCost']*$row['hCostAll'],2);                            // ทุน
  $profit    = ($priceUser - $pricePCS);                                                  // กำไร = ค่าบริการ
  ```
- the VAT column (`:252`): `number_format($profit*0.07,2)` under header
  `ภาษีมูลค่าเพิ่ม 7% (บาท)` (`:206`).
- the footer total (`:284`): `ภาษีมูลค่าเพิ่ม 7% รวม : number_format($profitAll*0.07,2)`.

So VAT 7% = `7% × (selling − cost)` = VAT on PCS's **service margin** for shop
orders. It is:
- an **internal accounting figure** in a staff report (`report-shops-profit-pay`,
  `report-shops-profit`, `report-shops-profit-pay-history`),
- **never** added to the customer's price,
- **never** persisted on an order or a document,
- **not gated** on corporate-vs-individual (it's computed for every priced row).

> The same `*0.07` pattern (no other VAT) is the only ×0.07 in the admin tree:
> grep `0\.07` → the profit reports + a `0.07` promo-discount (7% off) in
> `forwarder.php:2027,2046` (unrelated to VAT). No `/1.07`, no `*1.07`, no VAT
> line anywhere.

### 2.3 Summary of the legacy tax model

| Customer type | Document issued | WHT | VAT to customer | VAT internal |
|---|---|---|---|---|
| Individual (`userCompany≠1`) | ใบเสร็จรับเงิน (ไม่ใช่ใบกำกับ) | none | none | margin×7% (shop report only) |
| Juristic (`userCompany=1`) | ใบเสร็จรับเงิน (ไม่ใช่ใบกำกับ) | 1% if total≥1000 (override via `fUserCompany`) | none | margin×7% (shop report only) |

---

## 3. How legacy back-office staff SAW the choice (which screen / badge)

There was no "choice" to see — but staff DID get clear corporate/WHT signals:

1. **Receipt-history list `hs-receipt-forwarder.php`** ("ประวัติการออกบิลฝากนำเข้า"):
   - **Tabs** "ทั้งหมด / ลูกค้าบริษัท / ลูกค้าทั่วไป" filter by `userCompany`
     (`:153-171,190-196`), with a **red badge** showing the corporate-receipt
     count (`:161-163`).
   - **"ข้อมูลบริษัท" column** prints corporate name / tax-id / address — but
     ONLY when `userCompany==1` (`:310-320`).
   - **"ยอดก่อนหัก" / "ยอดเงินหลังหัก" columns** (`:279-280,321-338`) make the WHT
     visible per receipt.
2. **Acc workspace `acc-system-cargo/.../receipt-forwarder-item/home.php`**:
   shows `reCompNumber / reCompName / totalBeforeWithholding / rAmount` per
   receipt with a running total (`:19,259-263,277`).

So the legacy "is this a VAT/WHT customer?" signal = **the corporate tab + the
ข้อมูลบริษัท column + the ยอดก่อนหัก column**, all driven by `userCompany`. Pacred's
gap (below) is that it has a *richer* per-order choice but surfaces it *worse*.

---

## 4. Pacred current state + GAPS

### 4.1 What Pacred already built (ahead of legacy — keep it)

| Concern | Pacred artifact | Status |
|---|---|---|
| 3-mode picker (ใบกำกับ/ใบขน/ไม่รับฯ) | `app/[locale]/(protected)/cart/cart-tax-doc-pref.tsx` (`CartTaxDocPref`) | ✅ live on `/cart` |
| Same picker at ฝากนำเข้า entry | `service-import/add/service-import-add-fields.tsx:317` (`<CartTaxDocPref defaultMode="none">`) | ✅ live |
| SOT of mode semantics + VAT base | `lib/tax/tax-doc-mode.ts` (cites the exact legacy file:lines above) | ✅ |
| Persistence column | `tb_header_order/tb_forwarder.tax_doc_pref` (migration `0127`) + `tb_payment.tax_doc_pref` (migration `0140`); CHECK in `{receipt,tax_invoice,customs}` | ✅ |
| Mode-aware VAT engine | `computeTaxForMode()` in `tax-doc-mode.ts` (ใบกำกับ=goods+services VAT; ใบขน=service-only VAT; none=no VAT) | ✅ unit-tested |
| Margin VAT (legacy `profit*0.07`) | `computeMarginVat()` in `tax-doc-mode.ts` | ✅ |
| Consumer — forwarder | `lib/admin/auto-issue-receipt.ts` reads `tax_doc_pref` per row → `pickForwarderTaxDocMode` → issues ใบกำกับ/ใบขน into `tb_forwarder_tax_invoice` (migration `0129`) | ✅ live |
| Consumer — shop/yuan | `actions/admin/yuan-payments.ts:93-95,282-284` issues into `tb_shop_tax_invoice` (migration `0152`) | ⚠️ DORMANT behind `tax_invoice.shop_yuan_enabled` (`lib/tax/shop-yuan-flag.ts`, default `false`) |
| Customer sees own choice | `service-import/receipts/print/page.tsx:216,499-554,623` renders the correct header (ใบกำกับ vs ใบเสร็จ) from `tax_doc_pref` | ✅ |
| WHT 1% (juristic) | `lib/tax/wht.ts` (`legacyReceiptAmount`) — faithful to `function.php:1402-1410` | ✅ |

> The persistence + consumption loop is genuinely wired (not a §0e dead-write).
> A forwarder order with `tax_doc_pref='tax_invoice'` DOES mint a ใบกำกับ at
> payment-land. The CUSTOMER sees their choice on the printed receipt.

### 4.2 🔴 The GAPS (this is the owner's exact complaint)

**GAP-B1 — Admin cannot SEE the customer's doc choice on the order.**
The forwarder detail (`forwarders/[fNo]/page.tsx`) and edit
(`forwarders/[fNo]/edit/page.tsx:164,204`) pages SELECT `tax_doc_pref` into the
row type and query — but **never render it**. Grep for any render usage
(`r.tax_doc_pref`, `TaxDoc`, `modeFromPref`, a badge) in those files → **zero
matches** beyond the select. It is a **dead read**: staff opening the order see
the bill-to name, cost, WHT flag — but NOT whether the customer asked for ใบกำกับ
(VAT) / ใบขน / no-doc.

**GAP-B2 — The only admin doc-mode component is ORPHANED (§0d).**
`forwarders/[fNo]/tb-edit-panel.tsx` is the sole admin UI that shows + edits the
mode (`modeFromPref`, `TAX_DOC_MODE_META`, the 3 radio tiles, confirm-dialog,
calls `adminUpdateForwarderTaxDocMode`). Grep `TbEditPanel|tb-edit-panel` across
the repo → **imported nowhere, rendered nowhere.** The edit page renders
`TbForwarderActionPanel`, `AdminForwarderEditForm`, `TbForwarderPaymentPanel`,
`TbForwarderDriverAssignPanel` — not this one. Therefore
`adminUpdateForwarderTaxDocMode` (`actions/admin/forwarders-field-edits.ts:1014`)
is **unreachable from the UI** — staff cannot view or correct the mode on a
forwarder order at all.

**GAP-B3 — No glanceable VAT/needs-doc badge on any LIST.**
`forwarders/page.tsx` (the order list) has no doc/VAT column (grep
`tax_doc_pref|ใบกำกับ|ใบขน` → none). Same for the shop `service-orders` list. Staff
cannot scan "which orders need a ใบกำกับ issued" without opening each one — and
even opening doesn't show it (GAP-B1). There is **no "รอออกใบกำกับ / รอออกใบขน"
admin queue** — the only place the modes are even read for display is the
orphaned panel.

**GAP-B4 — Shop `service-orders` detail also lacks the doc badge.**
`service-orders/[hNo]/shop-cost-section.tsx` mentions ใบขน but only in the
COST/declared-value (Pricing) context (`:77,88-90`) — it does not surface the
customer's `tb_header_order.tax_doc_pref` choice. (The shop/yuan VAT issuance is
also dormant — GAP-B2 of workstream-economics, separate flag.)

**GAP-B5 — No `userCompany`/juristic indicator on the admin order header.**
The forwarder detail page reads `fusercompany` and the customer's `userCompany`
(`page.tsx:263,308,314,324`) but renders **no badge** from them. Legacy at least
surfaced "ลูกค้าบริษัท" prominently (`hs-receipt-forwarder.php` tab+column). The
juristic/WHT-applies signal is invisible to staff on the Pacred order view.

> **Net:** Pacred captures MORE than legacy (a real per-order 3-way doc choice
> with VAT engine) but DISPLAYS it to staff LESS than legacy (legacy at least
> tabbed by corporate; Pacred shows nothing on the order). The whole fix is
> **surfacing**, not capture — the data is already in `tax_doc_pref`.

---

## 5. Concrete build plan

The capture + persistence + consumption already exist (§4.1). The work is to
make the choice VISIBLE + EDITABLE to the back-office, plus a clear VAT/no-VAT +
needs-doc badge. No schema change is required for the core fix (migrations 0127 +
0140 already store everything). Next free migration = **0178** if any index is
wanted.

### Step 1 — Render a doc/VAT badge on the forwarder order (detail + edit) — fixes GAP-B1/B5
- On `forwarders/[fNo]/page.tsx` (read-only detail) and `…/edit/page.tsx`, add a
  small badge near the order header derived from the already-loaded `tax_doc_pref`
  via `modeFromPref` + `TAX_DOC_MODE_META[mode]`:
  - `tax_invoice` → red "ใบกำกับภาษี · VAT 7% (มูลค่าสินค้า)"
  - `customs` → amber "ใบขนสินค้า · VAT 7% (ค่าบริการ)"
  - `none` → grey "ไม่รับเอกสาร · ใบเสร็จ (ไม่มี VAT)"
- Add a juristic chip from `userCompany==1` / `fusercompany` →
  "นิติบุคคล · หัก ณ ที่จ่าย 1%" (mirror legacy `hs-receipt-forwarder.php` corporate
  signal). Build a tiny shared `TaxDocBadge` (+ `JuristicWhtChip`) in
  `components/admin/` so list + detail + workspace reuse it (badge text from
  `TAX_DOC_MODE_META`, never hard-coded — same discipline as `tb-edit-panel`).

### Step 2 — Un-orphan the doc-mode editor — fixes GAP-B2
- Mount `<TbEditPanel … currentTaxDocPref={r.tax_doc_pref} />` on the forwarder
  EDIT page (it already takes the prop, `tb-edit-panel.tsx:86,113`), OR extract
  just the mode-selector + `adminUpdateForwarderTaxDocMode` call into a focused
  `EditTaxDocModeField` (consistent with the page's other inline-edit fields:
  `EditBillToField`, `EditShipByField`, …). Pass `currentTaxDocPref` (the edit
  page already selects it, `:164,204` — currently a dead read). Keep the
  confirm-before-mutate dialog (§0f) the panel already has (`:208-219`).
- Verify reachability (§0d): from the order list → ดู/แก้ไข → the mode is visible
  and editable in ≤3 clicks. Then either delete the now-redundant standalone
  `tb-edit-panel.tsx` or make the edit page its sole consumer (no second orphan).

### Step 3 — Add a doc/VAT column to the order LISTs — fixes GAP-B3/B4
- Forwarder list `forwarders/page.tsx`: add a "เอกสาร" column rendering
  `TaxDocBadge` per row (select `tax_doc_pref` in the list query — small, indexed
  already by `idx_tb_forwarder_tax_doc_pref`, migration `0127:55`).
- Shop list `service-orders` + detail: same, off `tb_header_order.tax_doc_pref`
  (indexed `idx_tb_header_order_tax_doc_pref`, `0127:53`).

### Step 4 — A "รอออกเอกสารภาษี" admin queue (optional but high-value) — closes GAP-B3
- A filtered list of orders where `tax_doc_pref IN ('tax_invoice','customs')` AND
  no tax-invoice issued yet (left-join `tb_forwarder_tax_invoice` /
  `tb_shop_tax_invoice`). Lives under the accounting/etax hub. Reuses the badge.
  This is the "back-office can act on the choice" surface the owner wants — staff
  see at a glance which paid orders still owe a ใบกำกับ/ใบขน.

### Step 5 — Make the juristic/VAT customer obvious at the customer level too
- Mirror legacy's "ลูกค้าบริษัท" tab: on the customer-360 / users list, surface a
  `userCompany==1` chip (data already loaded in many places, e.g.
  `pcs-chrome.ts:314`). Low effort, high recognisability for CS.

### Money/tax guardrails (do not regress)
- **Do NOT change the VAT base logic** — `computeTaxForMode` is the SOT and is
  unit-tested; this workstream is display-only. The ใบขน "service-only VAT base"
  policy still carries the flagged TODO (`tax-doc-mode.ts:187-195`) — surfacing
  the choice does not resolve it; leave it flagged.
- **Shop/yuan issuance stays DORMANT** until the owner flips
  `tax_invoice.shop_yuan_enabled` (carryover owner item). The badge can still
  show "ใบกำกับ (รอเปิดระบบ)" for shop orders so staff know the intent even while
  issuance is gated.
- **WHT 1%** stays exactly `function.php:1402-1410` (Pacred `lib/tax/wht.ts`) —
  no change.
