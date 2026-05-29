# 🔬 Legacy PCS Accounting — Reality Audit (2026-05-30)

> 4-agent deep-audit triggered by ภูม flag (Wave 28 = "มั่ว" · entry-paths missing · chrome ลวกๆ · ไม่ตรง PCS). The findings change Wave 29 direction entirely — Pacred Wave 28 F3 (`/admin/accounting/forwarder-invoice`) is built on the WRONG mental model.

## TL;DR — 3 บรรทัด

1. **Legacy "ระบบบัญชี" = 95% UI stub.** 3 dropdowns × ~50 sub-screens · 20 root .php files (9,559 LOC) · แต่เกือบทุก URL `?page=*` มี **NO handler** · `acc-system-cargo.php` = 7 LOC dispatcher · `hs-forwarder-invoice/add.php` form **ไม่มี save endpoint**
2. **What ACTUALLY works = 1 document + 1 button.** `ใบเสร็จรับเงิน` (Receipt · NOT tax invoice) via `tb_receipt + tb_receipt_item` · prefix `FRC`/`FRG` · WHT 1% **inline deduction** (auto if corporateNumber AND amount ≥ ฿1000) · **ONE BUTTON `callPriceUser` ใน `/admin/forwarder-check`** ปิดออเดอร์ + วางบิล + auto-gen receipt หลังลูกค้าจ่าย
3. **Wave 28 F3 = WRONG target.** Pacred ไป port "ใบแจ้งหนี้" flow ที่ legacy **ไม่เคย wire backend** · doc-number format ก็ผิด · workflow ก็คนละแบบ · **ต้อง revert ทิ้ง แล้ว pivot ไป receipt-flow**

---

## 1. Legacy accounting menubar = scaffolding theater

### ที่ legacy SHOW ใน menubar (`include/pages/acc-system-cargo/header-menu/index.php` · 599 LOC)
- **รายรับ (Income)** — 7 doc types × 3 product lines = **~21 sub-pages**: ใบเสนอราคา / ใบรับเงินมัดจำ / ใบแจ้งหนี้ / ใบเสร็จ / ใบลดหนี้ / ใบเพิ่มหนี้ / ใบวางบิล × ฝากสั่งซื้อ / ฝากนำเข้า / ฝากโอนหยวน
- **รายจ่าย (Expense)** — 6 doc types: PO · มัดจำ · expense · กำกับภาษีซื้อ · รับลดหนี้ · รับเพิ่มหนี้
- **หน้าหลัก (Dashboard)**

### ที่ legacy WIRE จริงๆ
```
✅ tb_receipt + tb_receipt_item       (Receipt — the ONLY working doc)
❌ tb_quotation                       (doesn't exist)
❌ tb_credit_note                     (doesn't exist)
❌ tb_debit_note                      (doesn't exist)
❌ tb_tax_invoice                     (doesn't exist)
❌ tb_wht                             (doesn't exist)
```

### Stub evidence (Agent C citations)
- `acc-system-cargo.php` = **7 lines** (just `require` home dashboard)
- `pages/income/home.php` lines 19-21: buttons with `href=""` (empty)
- `hs-forwarder-invoice/add.php` form: **NO save endpoint** (submit ไม่ทำอะไร)
- `forwarder-quotation.php` = misleadingly named, actually routes `withdraw-commission-sale`
- Every menubar URL `?subP=creditNote-*` / `debitNote-*` / `quotation-*` — **NO handler exists**

**Verdict:** legacy team ทำ menubar ใส่ไว้เพื่อ vision · backend ไม่เคยมี.

---

## 2. The REAL revenue path (ที่ทำงานจริงใน legacy)

From `forwarder-check.php:23-104` + `functions.php:430-579` + `gatway-receipt-forwarder.php:50-61`:

```
STEP 1: Admin /admin/forwarder-check
   → ติ๊ก rows → POST callPriceUser
   → tb_forwarder.fStatus 4→5 ("รอชำระเงิน")
   → SMS+LINE customer

STEP 2: Customer pays
   → tb_wallet_hs row created (typeService='2')

STEP 3: ⚡ AUTO-MAGIC — functions.php:574
   → INSERT INTO tb_receipt + tb_receipt_item
   → No admin click needed
   → Receipt is born WHEN payment lands

STEP 4: Admin opens forwarder detail
   → gatway-receipt-forwarder.php?fID=X
   → looks up tb_receipt_item → 302 redirect → printReceipt.php?id=<rID>
   → mPDF generates ต้นฉบับ + สำเนา (2 pages)
   → flips tb_receipt.statusPrint=1
```

**KEY:** order-close + invoice-issue คือ **same one-click action** = `callPriceUser`. ภูม's mental model "สมัคร → ปิดออเดอร์ → วางบิล (3 steps)" ไม่มีใน legacy. legacy = **2 clicks** (callPriceUser + print).

---

## 3. Receipt doc spec (ที่ Pacred ต้อง port ให้ตรง)

### Doc-number minter (`functions.php:457-486`)
```php
prefix = corporateType=1 ? "FRC" : "FRG"       // นิติบุคคล vs บุคคล
yyMM   = date('ym', strtotime(dateSlip))        // 4 digits — MONTHLY counter
seq    = (last_seq_this_month + 1).padStart(5, '0')
docNo  = `${prefix}${yyMM}-${seq}`              // FRG2605-00219
```

**Pacred Wave 28 mints `PR260529-3`** → ผิดทุกองค์ประกอบ (prefix · date granularity · padding).

### Print layout (`printReceipt.php:243-432` + `create-f-receipt.php:239-435`)
- Header: PCS Cargo logo · บริษัท พีซีเอส คาร์โก้ จำกัด · PCS Cargo CO., LTD.
- Stamp: **`ต้นฉบับ`** (page 1) / **`สำเนา`** (page 2 — auto-duplicate)
- Title: ใบเสร็จรับเงิน (green #8BC34A) + **`(ไม่ใช่ใบกำกับภาษี)`** red (mandatory disclaimer)
- Issuer block: tax-ID `0105560160694` + Bangkok address + phone `02-444-7046`
- Customer block: name + corporateNumber (tax ID) + 230-char address
- Items: 7-col table (**ลำดับ** / OderNo / Tracking / กล่อง / Wt / CBM / Amount) · 13 rows/page · pagination "1/3"
- Footer 6-line summary: Total · Delivery CHN · Delivery TH · Other · Discount · **LESS WITHHOLDING TAX 1%** (auto when corporateNumber AND amount ≥ ฿1000)
- Total amount **in Thai words** (Convert helper)
- 4 signature boxes side-by-side: ผู้ออก · ผู้อนุมัติ · ตราประทับ + sin-wandee.jpg signature · ผู้รับ (customer)
- On print: flip `tb_receipt.statusPrint=1, adminIDprint, rDatePrint=NOW()`

### Pacred Wave 28 print = **wrong document class**
Hidden gaps:
- ❌ WHT 1% line (tax compliance risk)
- ❌ ต้นฉบับ/สำเนา 2-page output
- ❌ "ไม่ใช่ใบกำกับภาษี" disclaimer
- ❌ Bilingual issuer block (PCS Cargo logo + name)
- ❌ Stamp.png + signature image embedded
- ❌ 4-box signatures (Pacred has 2)
- ❌ Thai-word amount
- ❌ 7-col items (Pacred 6-col — missing ลำดับ + OderNo)
- ❌ Pagination
- ❌ No statusprint write on print

---

## 4. Barcode finding (Agent A · separate issue but related)

- **Legacy axis = camera (`barcode-c-*`) vs USB scanner (`barcode-d-*`)** — NOT cargo vs driver
- Pacred mis-named: `cargo/` = camera · `driver/` = USB
- Legacy sidebar: single canonical `menu-barcode.php` (26 lines) · "บันทึกสินค้าเข้าโกดัง" = **TOP-LEVEL flat menu** (line 10)
- Pacred ฝัง 1 ชั้น nested ใน "บันทึกเข้าโกดังไทย" group → ภูม "ไม่มีทางเข้า" complaint
- 2 orphan Pacred pages (`/admin/barcode/page.tsx`, `/admin/barcode/driver/page.tsx`) ยังอ่าน abandoned `forwarders` table

---

## 5. Wave 29 action plan (proposed)

### 🔴 P0 — DOC-NUMBER FORMAT FIX (every new Pacred invoice pollutes prod data right now)
**Task:** Port `functions.php:457-486` to TypeScript helper `lib/admin/mint-receipt-doc-no.ts`. Replace `forwarder-invoice.ts:125-148` minter. Format: `{FRC|FRG}{yyMM}-{00001..00999}`. Effort: 1-2 hr.

### 🔴 P0 — PIVOT Wave 28 F3 from "invoice" to "receipt"
ภูม goal "ปิดออเดอร์ → วางบิล" = legacy `callPriceUser` flow, NOT separate invoice issue. Options:
- **Option A:** Delete `/admin/accounting/forwarder-invoice/{add,page}` · Auto-create receipt server-side when payment lands (like legacy `functions.php:574`). Effort: 4-6 hr.
- **Option B:** Keep `/admin/accounting/forwarder-invoice` as a **manual override** queue (for cases auto-gen fails) · rename to "/receipt" · ใส่ batch checkbox multi-select. Effort: 3-4 hr.
- **Recommended: A** (faithful) + B as backup edge-case tool

### 🔴 P0 — PORT printReceipt mPDF → Pacred print page
Replace `forwarder-invoice/[id]/page.tsx` with faithful receipt print:
- 7-col items table
- WHT 1% inline deduction (auto when corporateNumber AND ≥฿1000)
- ต้นฉบับ + สำเนา (2 physical pages on print)
- "ไม่ใช่ใบกำกับภาษี" disclaimer
- 4-box signatures + ตราประทับ + sin-wandee signature image
- Bilingual issuer block + tax-ID
- Thai-word amount
- Pagination "N/M"
- `statusprint` DB write
Effort: 6-8 hr.

### 🟠 P1 — Batch billing (multi-row checkbox)
Refactor `add-form.tsx` from radio → checkbox multi-select. `tb_receipt_item` already supports many-fid-per-rid. Effort: 2-3 hr.

### 🟠 P1 — Barcode sidebar fix
- Rename axis: `cargo/` → `camera/` · `driver/` → `scanner/` (workflow rename · keep redirects)
- Promote "บันทึกสินค้าเข้าโกดัง" to TOP-LEVEL flat sidebar item (like legacy line 10)
- Delete 2 orphan pages that read abandoned `forwarders` table
Effort: 2-3 hr.

### 🟡 P2 — Migration data audit
Existing 10 `FRG/FRC` rows on `/admin/accounting/forwarder-invoice` list are **migrated legacy** (Phase A) — verify they reconcile + don't get double-counted by Wave 28's `PR` format rows already created. SQL audit needed.

### 🟢 P3 (Phase C — defer) — The other 49 stub doc types
ใบเสนอราคา · ใบรับเงินมัดจำ · ใบลดหนี้ · ใบเพิ่มหนี้ · ใบวางบิล · รายจ่าย entirely — **legacy never built backends.** Pacred can either ship them later as green-field OR skip if ภูมิ team doesn't actually use them.

---

## 6. ภูม's E2E loop goal — re-mapped to legacy reality

```
ภูม's brief: "ลูกค้าสมัคร → ปิดออเดอร์ → วางบิลให้ลูกค้า"

Reality mapping (legacy-faithful):
├─ ลูกค้าสมัคร       → /register → tb_users.userActive='0'        (Wave 28 F1 ✅)
├─ เซลล์ approve      → /admin/customers/pending → SMS+LINE         (Wave 28 F1 ✅)
├─ ลูกค้าสั่ง         → /service-order/cart → tb_header_order        (prior wave ✅)
├─ ลูกค้านำเข้า       → /service-import → tb_forwarder               (prior wave ✅)
├─ goods arrive       → tb_forwarder.fStatus 4 (รอแจ้งค่าบริการ)     (Wave 26 barcode ✅)
├─ ⚡ "ปิดออเดอร์ + วางบิล" = ONE CLICK
│  → /admin/forwarder-check → callPriceUser
│  → tb_forwarder.fStatus 4→5 + SMS+LINE                            (Wave 17 P0 ✅ EXISTING)
├─ ลูกค้าจ่าย         → tb_wallet_hs (typeService='2')               (existing ✅)
├─ ⚡ AUTO-GEN RECEIPT (Wave 29 P0)
│  → server-side INSERT tb_receipt + tb_receipt_item                ⚠️ NEW
├─ Customer SMS link  → /service-import/[fNo]/invoice (Wave 28 F4) ✅
└─ Admin prints      → printReceipt with FRG/FRC format + WHT      ⚠️ Wave 29 redo
```

**Net change:** `callPriceUser` flow มีอยู่แล้วครบ. ที่ขาดคือ:
1. Auto-receipt server-side บน payment-land hook
2. Doc-number minter ใหม่
3. printReceipt mPDF faithful port

---

## Source citations (from 4 parallel agents)

- Agent A: `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\barcode-{c|d}-{all|from|import|prepare}.php` · `include/pages/left-menu/OOP/Cargo/menu-barcode.php` · `gateway.php:38-188`
- Agent B: `acc-system-cargo.php:1-7` · `include/pages/acc-system-cargo/header-menu/index.php:1-599` · `hs-forwarder-invoice.php:1-30` · `hs-receipt-forwarder.php:1-536` · `create-f-receipt.php:1-800`
- Agent C: `functions.php:457-486, 430-579, 574` · `forwarder-check.php:23-104` · `gatway-receipt-forwarder.php:50-66` · `printReceipt.php:46-65, 243-432` · `pages/income/home.php:19-21`
- Agent D: Pacred `actions/admin/forwarder-invoice.ts:125-148, 275, 307-317` · `add-form.tsx:118-187, 154-161` · `[id]/page.tsx:251-413` · `/service-import/[fNo]/invoice/page.tsx:24-26, 417-441, 451-457, 462`

## Cross-links
- [`AGENTS.md`](../../AGENTS.md) §0a workflow vs UI philosophy · §0b deep-audit-from-source · §0c verify-deep-flow
- [`docs/research/legacy-deep-dive/_SYNTHESIS.md`](legacy-deep-dive/_SYNTHESIS.md) (prior session, G1 review-grid + G2-G3 atomic flips)
- [`docs/learnings/audit-discipline.md`](../learnings/audit-discipline.md) — why we re-audited from PHP source not from Wave 28 commits
