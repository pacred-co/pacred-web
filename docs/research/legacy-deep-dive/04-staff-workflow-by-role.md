# Legacy staff workflow by role — deep-dive 2026-05-28

> **Source of truth:** `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\`. Read-only audit. Read by walking the per-role left-menu files (`include/pages/left-menu/<Company>/<Department>/<Section>.php`) + the per-role home-dashboard files (`include/pages/home/<Company>/<Department>/<Section>.php`) + the `$departmentKey` gate sprinkled across every action handler.
>
> **Headline finding:** Legacy PCS Cargo has TWO orthogonal "role" axes:
> 1. **`adminType`** (1-7) = EMPLOYMENT TYPE, not job role (พนักงานประจำ / ทดลองงาน / เด็กฝึกงาน / สหกิจ / พาสเนอร์ / ฟรีแลนซ์ / คนในบ้าน) — set in `pcs-admin/include/function.php:3119-3155`.
> 2. **`(companyType, department, section)`** triple = ACTUAL JOB ROLE. Resolved via `checkRightsName()` (`function.php:3040-3070`) against the org-chart JSON at `pcs-admin/include/pages/organization-chart/dataJson.php` (40 sections across 3 companies). The resolved `$departmentKey` + `$sectionKey` is the gate used in every `if($departmentKey=='CEO' || $departmentKey=='Accounting' ...)` check.
>
> Pacred has been treating `adminType` as the role — that's wrong. The legacy code 100% uses **`departmentKey`** (e.g. `'CEO'`, `'Manager'`, `'QAAndQC'`, `'Accounting'`, `'ITDT'`, `'CSPurchasing'`, `'SaleCargo'`, `'Warehouse'`) for action-button gating.

---

## §1 Role enumeration (canonical — from `organization-chart/dataJson.php`)

40 sections across 3 companies. Pacred Phase-1 cares almost entirely about Company 1 (Cargo & Freight shared services) + Company 3 (Cargo). Company 2 (Freight) is its own ecosystem — deferred to Phase C+.

### Company 1 — `CargoAndFreight` (shared services)

| No | departmentNo | department | sectionNo | section | sectionName (TH/EN) | Headcount in legacy JSON | Primary screens |
|---|---|---|---|---|---|---|---|
| 1 | 0 | CEO | 0 | CEO | CEO | 5 emp | dashboard (Cargo + Freight + All) · everything |
| 2 | 1 | Manager | 1 | Manager | Manager | 1 emp | same as CEO |
| 3 | 2 | HR | 2 | HRManager | HR Manager | 0 emp | HR / org chart / payroll |
| 4 | 2 | HR | 3 | HR | HR | 1 emp + 1 intern | admin-table · time-attendance · บัญชีตัวเอง |
| 5 | 2 | HR | 4 | Maid | Maid (แม่บ้าน) | 2 emp | check-in/out only |
| 6 | 3 | QAAndQC | 5 | QAManager | QA Manager | 0 emp | every overdue queue + everything Manager sees |
| 7 | 3 | QAAndQC | 6 | QA | QA | 1 emp | same as QA Manager |
| 8 | 3 | QAAndQC | 7 | QC | QC | 0 emp + 1 intern | same as QA |
| 9 | 4 | Accounting | 8 | AccountingManager | Accounting Manager | 0 emp | wallet · cnt-payment · withdraw · reports |
| 10 | 4 | Accounting | 9 | AdminAccounting | Admin Accounting | 1 emp + 1 intern | wallet deposit/withdraw approval · cnt approval · forwarder-check (billing) |
| 11 | 5 | Marketing | 10 | ManagerMarketing | Manager Marketing | 0 emp | ads · landing |
| 12 | 5 | Marketing | 11 | Pricing | Pricing | 1 emp | rate management · hs-customrate · forwarder pricing |
| 13 | 5 | Marketing | 12 | MarketingORCreative | Marketing/Creative | 0 emp + 1 intern | content/social |
| 14 | 5 | Marketing | 13 | GraphicOrEditing | Graphic/Editing | 0 emp + 1 intern | media |
| 15 | 6 | ITDT | 14 | ITProjectManager | IT PM | 0 emp + 1 partner | full system access |
| 16-18 | 6 | ITDT | 15-17 | FrontEnd/BackEnd/FullStack | dev | 0 emp + 3 interns | full system access |
| 40 | 5 | Marketing | 18 | SalesAll | Sales All | 1 emp | cross-company sales view |

### Company 2 — `Freight` (FCL/LCL/customs/export — DEFERRED Phase C+)

| No | departmentNo | department | sectionNo | section | sectionName | Notes |
|---|---|---|---|---|---|---|
| 19-20 | 1 | SaleFreight | 1-2 | SalesManager/Sales | Freight sales | not in Pacred Phase 1 |
| 21-26 | 2 | FreightExport | 3-8 | ManagerExport/CSDoc/Shipping/Clearance/Messenger | Freight export ops | not in Pacred Phase 1 |
| 27-32 | 3 | FreightImport | 9-14 | ManagerImport/CSDoc/Shipping/Clearance/Messenger | Freight import ops | not in Pacred Phase 1 |

### Company 3 — `Cargo` (the core revenue path — Pacred Phase 1)

| No | departmentNo | department | sectionNo | section | sectionName | Headcount in legacy JSON | Primary screens |
|---|---|---|---|---|---|---|---|
| 33 | 1 | SaleCargo | 1 | SalesManager | Sales Manager | 0 emp | sales report · commission · transfer-rep |
| 34 | 1 | SaleCargo | 2 | Sales | Sales | 2 emp + 3 interns | customer mgmt · wallet · withdraw-commission-sale |
| 35 | 2 | CSPurchasing | 3 | ManagerPurchasing | Manager Purchasing | 1 emp | purchasing oversight · shops · withdraw-commission-interpreter |
| 36 | 2 | CSPurchasing | 4 | Purchasing | Purchasing (ล่ามจีน / interpreter) | 0 emp + 3 interns | cart · shops · payment (yuan transfer) · commission entry |
| 37 | 3 | Warehouse | 5 | Managerwarehouse | Manager warehouse | 0 emp | warehouse oversight (menu file = 1 line EMPTY in legacy) |
| 38 | 3 | Warehouse | 6 | Warehouse | Warehouse (โกดังพี่ระดับล่าง) | 0 emp + 3 interns | barcode-d-import · forwarder-import-warehouse · combine-bill |
| 39 | 3 | Warehouse | 7 | Driver | Driver (คนขับรถ) | 1 emp + 3 partners | forwarder-driver-w (งานที่ต้องส่ง) only |

### `adminType` (employment type — NOT role)

From `pcs-admin/include/function.php:3119-3155` (`optionEmployeeType()` + `verifyEmployee()`):
- `1` พนักงานประจำ (full-time)
- `2` ทดลองงาน (probation)
- `3` เด็กฝึกงาน (intern)
- `4` สหกิจศึกษา (cooperative student)
- `5` พาสเนอร์ (partner)
- `6` ฟรีแลนซ์ (freelance)
- `7` คนในบ้าน (family/in-house) — gets `'คนในบ้าน'` everywhere in `checkRightsName()`

Pacred maps `adminType` → `tb_admin.adminType` but uses it only for HR display badges — NOT for permission gating.

---

## §2 Day-in-the-life per role (the 12 roles that matter for Pacred Phase 1)

### 2.1 CEO (departmentKey='CEO', section=0)
**Menu file:** `include/pages/left-menu/CargoAndFreight/CEO/CEO.php`
**Home:** `include/pages/home/Cargo/CEO/CEO.php` (with `?c=cargo|freight|all` switch)

**Daily flow:**
1. Lands on dashboard (3 modes via `index.php?c=cargo|freight|all` — `index.php:24-46`)
2. Sees HR section (`menu-hr-manage-human-resource` + `menu-hr-manage-corporate-assets`)
3. Sees both Freight + Cargo + Cargo-and-Freight QA dropdowns (lines 27-36 of CEO.php)
4. Sees Cargo full menu (wallet · purchasing · forwarder · payment · report · acc)
5. Sees Settings (Cargo settings)
6. Has authority to approve cnt payment + wallet topup + withdraw (all `departmentKey=='CEO'` gates)

**Writes:** rarely directly — usually reviews then assigns.

### 2.2 Manager (departmentKey='Manager', section=1)
**Menu file:** identical to CEO (`header.php:81,87` both `require CEOManager.php`)
**Same authority as CEO.** Effectively co-founder/COO role. Sees Dashboard All/Freight/Cargo.

### 2.3 QA & QC (departmentKey='QAAndQC', sections=5/6/7)
**Menu file:** `include/pages/left-menu/CargoAndFreight/QAAndQC/QAAndQC.php` (113 lines)
**Home:** `include/pages/home/CargoAndFreight/QAAndQC/QA.php`

**Daily flow — this role IS the "babysit every queue" role:**
1. Lands on dashboard (Dashboard All / Freight / Cargo as 3 picks)
2. **THE 10 "Your Work Cargo" follow-up queues** (QAAndQC.php L17-83):
   - `delayedPaymentShop.php?s=1` — รอชำระสินค้าเกิน 1 วัน
   - `delayedPaymentForwarder.php?s=1` — รอชำระค่านำเข้าเกิน 2 วัน
   - `orderCancellationList.php?s=1` — รายการยกเลิกออเดอร์
   - `creditOverdueForwarder.php?s=1` — เครดิตเกินกำหนด
   - `shopS1Over10Min.php?s=1` — สั่งซื้อรอเกิน 10 นาที
   - `chineseShopDelay.php?s=1` — สั่งซื้อรอร้านจีนส่งเกิน 2 วัน
   - `delayedWarehouseChineseEntry.php?s=1` — รอเข้าโกดังจีนเกิน 2 วัน
   - `thaiDeliveryDelay.php?s=1` — กำลังมาไทยเกินกำหนด
   - `ownerlessProducts.php?s=1` — สินค้าไม่มีเจ้าของ
   - `shippingPrepOverdue.php?s=1` — เตรียมส่งเกินกำหนด
   - `newClientFollowUpDelay.php?s=1` — ไม่ติดต่อลูกค้าใหม่เกิน 2 วัน
3. Has same authority as Accounting (approve cnt + wallet deposit/withdraw — gated by `departmentKey=='QAAndQC'` in `cnt-hs.php:185` + `wallet/w-s-deposit-detail.php:18`)
4. Sees all Cargo menu groups (wallet · purchasing · forwarder · payment · report · acc · settings)

**Pacred currently maps this role to NOTHING.** This is a P0 launch-blocker.

### 2.4 Accounting Manager (departmentKey='Accounting', section=8)
**Menu file:** `include/pages/left-menu/CargoAndFreight/Accounting/AccountingManager.php` (37 lines)
**Home:** `include/pages/home/CargoAndFreight/Accounting/AccountingManager.php`

**Daily flow (less broad than QAAndQC but same approval rights):**
1. Lands on dashboard (counts from `executeQueryAndGetRowCount()` at top of menu)
2. menu-user (customer search)
3. menu-withdrawal-list (the cross-company withdrawal queue)
4. Freight acc menu
5. Cargo: wallet · purchasing · forwarder · payment · report · **acc** (the heavy one)
6. Cargo settings
7. **Daily approval queue actions:**
   - `wallet/deposit/` — approve customer wallet topup slips (`w-s-deposit-detail.php`)
   - `wallet/withdraw/` — approve customer wallet withdraw requests
   - `cnt-hs.php` — approve cnt-payment requests from CSPurchasing (`cntStatus=1 → cntStatus=2` after slip upload, gated `departmentKey=='Accounting'` at `cnt-hs.php:796`)

### 2.5 Admin Accounting (departmentKey='Accounting', section=9)
**Menu file:** `include/pages/left-menu/CargoAndFreight/Accounting/AdminAccounting.php` (37 lines — IDENTICAL to AccountingManager menu)
**Home:** `include/pages/home/CargoAndFreight/Accounting/AdminAccounting.php`

Same daily flow as Accounting Manager. The two sections are differentiated only at the HR/reporting layer, not at the operational layer.

### 2.6 Pricing (Marketing department, section=11)
**Menu file:** `include/pages/left-menu/CargoAndFreight/Marketing/Pricing.php` (35 lines)

**Daily flow:**
1. Cargo & Freight: menu-user only (no withdrawal-list)
2. Freight: nothing
3. Cargo: wallet · purchasing · forwarder · payment · report · acc (full Cargo menu but no withdrawal authority)
4. Cargo settings (the `menu-settings.php` — rate config · china-address · etc.)

**Owns:** `hs-customrate.php` · `check-sang-cost.php` · `settings.php` rate config · `forwarder-quotation.php` cost templates.

### 2.7 SaleCargo Sales (departmentKey='SaleCargo', section=2)
**Menu file:** `include/pages/left-menu/Cargo/SaleCargo/Sales.php` (103 lines)
**Home:** `include/pages/home/Cargo/SaleCargo/Sales.php`

**Daily flow:**
1. Lands on counts dashboard (sees customer counts + corporate-pending count)
2. menu-wallet (full wallet ops + pay-users.php)
3. **ระบบจัดการลูกค้า** (customer management): users-search · users/vip · users/svip · **users/corporation** (with juristic-pending badge) · users/credit · users/comparison
4. menu-purchasing (cart / shops)
5. บริการฝากนำเข้า: forwarder-search · forwarder-search-muti · forwarder/ · forwarder/?q=1 (รอเข้าโกดังจีน) · **CargoCenter API** (the api-forwarder-cn) · `report-cnt.php` · `forwarder-import-warehouse/` · `forwarder-driver.php` · `forwarder-bill.php`
6. menu-payment (yuan)
7. menu-report
8. **withdraw-commission-sale.php** — own commission requests (history + add) + the new commission calculator
9. (Optional) settings if `adminID==admin_mew` OR `admin_fogus` (hard-coded supervisor whitelist — L87)

**The Sales role is FAT** — they have most of the customer-touching screens but NOT wallet-approval, NOT cnt-approval, NOT withdrawal-approval. They INITIATE these flows; QAAndQC/Accounting/CEO approve them.

### 2.8 SaleCargo SalesManager (departmentKey='SaleCargo', section=1)
**Menu file:** `include/pages/left-menu/Cargo/SaleCargo/SalesManager.php` (EMPTY — 1 line)

Effectively a fall-through to the Sales menu via `header.php` switch case — same daily flow as Sales but with the supervisor whitelist privileges already noted.

### 2.9 CSPurchasing — Purchasing/ล่ามจีน (departmentKey='CSPurchasing', section=4)
**Menu file:** `include/pages/left-menu/Cargo/CSPurchasing/CSPurchasing.php` (53 lines)

**Daily flow (ล่ามจีน — the China interpreter who actually places orders):**
1. Lands on count dashboard
2. users-search (customer search only — no full customer mgmt)
3. menu-purchasing (cart / shops / cart/add) — **THE PRIMARY SCREEN** — this is where they actually place orders on Taobao/1688 on customer's behalf
4. บริการฝากนำเข้า (limited): forwarder-search · forwarder/ · forwarder/?q=1 · forwarder/add/ · forwarder-action.php?action=Note (their note queue)
5. payment/ + payment/add (yuan transfer requests — they fulfill these on Alipay)
6. **withdraw-commission-interpreter.php** — their own commission requests (history + อนุมัติรายการ for ManagerPurchasing)

### 2.10 CSPurchasing — ManagerPurchasing (departmentKey='CSPurchasing', section=3)
Same menu file (ManagerPurchasing.php = EMPTY) — fall-through to CSPurchasing menu. Adds approval rights on `withdraw-commission-interpreter.php?q=1` queue (approve interpreter commission).

### 2.11 Warehouse — Warehouse staff (departmentKey='Warehouse', section=6)
**Menu file:** `include/pages/left-menu/Cargo/Warehouse/Warehouse.php` (82 lines — fat menu, this role IS busy)

**Daily flow (Thailand warehouse staff):**
1. menu-wallet (read-only)
2. menu-purchasing (read-only)
3. **บริการฝากนำเข้า — the heavy menu (L12-28):**
   - forwarder-search + forwarder-search-muti
   - forwarder/ — all imports
   - **forwarder-import-warehouse/** — ประวัติเข้าโกดังไทย (the table of items already received) — they UPDATE this via the modal in `forwarder-import-warehouse.php:3-37` (the `updateIm` button that flips `fStatus=3 → 4` + sets `fDateStatus4=NOW()` + records pallet count from `tb_forwarder_import2`)
   - forwarder/?q=6 — รายการเตรียมส่ง (ready-to-ship queue)
   - **forwarder-driver.php** — assign driver (the `add` button bundles N items into a `tb_forwarder_driver` row with `fdStatus=1`, then driver receives via `forwarder-driver-w.php`)
   - forwarder-bill.php — combine-bill print
   - hs-receipt-forwarder.php — receipt history
   - forwarder/add/ — add manual import
4. forwarder-driver-w.php — งานที่ต้องส่ง (driver work queue) + forwarder-driver.php — ประวัติงาน
5. **barcode menus — THE HEAVY UI** (L31-62 — 4 separate barcode flows):
   - ค้นหารายการฝากนำเข้า (scanner / camera) → `barcode-d-all` / `barcode-c-all`
   - **บันทึกสินค้าเข้าโกดัง** → `barcode-d-import/` — the China-warehouse-entry scanner (status 1→3 flip)
   - ค้นหาสินค้าเตรียมส่ง (scanner / camera)
   - สแกนจากหน้ากล่อง (scanner / camera) — barcode-d-from / barcode-c-from
6. forwarder-action.php?action=NoteShop (shop notes) + ?action=Note (forwarder notes)
7. report-driver-2023.php — driver report

**This role has the most barcode-scanner UI**. Warehouse status transitions fStatus 1→3, 3→4, 4→5 all happen through their scans.

### 2.12 Warehouse — Driver (departmentKey='Warehouse', section=7)
**Menu file:** `include/pages/left-menu/Cargo/Warehouse/Driver.php` (33 lines — narrow)

**Daily flow (delivery driver — typically a partner, adminType=5):**
1. **forwarder-driver-w.php** — งานที่ต้องส่ง (THE ONLY operational screen they need) — when admin assigns them N items, this is where they see it
2. forwarder-driver.php — ประวัติงาน (history)
3. ค้นหารายการฝากนำเข้า — barcode-d-all / barcode-c-all (look up an item if customer calls)
4. forwarder-action.php?action=NoteShop + ?action=Note (read-only check)
5. report-driver-2023.php — their own driver report
6. NO Learning · NO Settings · NO Reports beyond their own.

### 2.13 HR (departmentKey='HR', section=3) — minimal Pacred Phase 1 scope
HR.php menu (not enumerated above) — admin-table CRUD + time-attendance + employment-types reports. Pacred Phase 1 can defer this if launch staff = admin_mew/admin_fogus + a handful — keep ภูม's current `/admin/admins` form.

### 2.14 ITDT — full system access for devs
Same as CEO menu effectively (the ITDT.php menu is in left-menu/CargoAndFreight/ITDT/) — used by ภูม / เดฟ themselves.

---

## §3 The cargo flow end-to-end — choreography per fStatus

(canonical: `tb_forwarder.fStatus` 1→7 + special 8/9/99, sourced from `forwarder/detail.php:155-186` switch ladder + the action-handler files)

| fStatus | Label (legacy TH) | Who triggers next move (role) | When | What button / page | Side effects (DB + notify) |
|---|---|---|---|---|---|
| **1** | รอสินค้าเข้าโกดังจีน | Auto (from shops.php L1677-1721) OR CSPurchasing manual via `forwarder/add/` OR API import (`api-forwarder-cn.php`, momo, jmf, ttp) | When customer cart "ส่งของจีนแล้ว" triggered by Purchasing OR admin enters tracking manually | shops dispatcher (auto) · `forwarder.php` form (manual) · API webhook (CargoCenter) | INSERT `tb_forwarder` fStatus=1, fDate=NOW · LINE notify customer · LINE notify admin group |
| **1→3** | สินค้าถึงโกดังจีน → กำลังส่งมาไทย | Warehouse (China side — but in Pacred this is the China-warehouse-scan API endpoint) OR the cargo API (`api-forwarder-cn` etc.) | When goods arrive China warehouse + container is loaded | (Various — usually external API or `barcode-d-import/`) | UPDATE fStatus=3, fDateStatus3=NOW, fWarehouseChina=... |
| **3→4** | กำลังส่งมาไทย → สินค้าถึงไทย | **Warehouse staff (TH warehouse)** | When container arrives Thai warehouse + items unloaded | `forwarder-import-warehouse.php` `updateIm` form (L3-37) — fills `tb_forwarder_import2` row with palletNo, links via `fID`, flips fStatus=4 | UPDATE fStatus=4, fDateStatus4=NOW, fPallet=<value>, adminIDUpdate · also via `barcode-d-import` scanner with auto-flip rule (Wave 17 #195) |
| **4→5** | สินค้าถึงไทย → รอชำระเงิน | **Accounting (or QAAndQC, CEO)** — via the bulk-bill queue | When admin has computed all prices + ready to invoice | `forwarder-check.php` checkbox-multi-select → "callPriceUser" button (`forwarder-check.php:23-79`) | UPDATE fStatus=5 + fDateStatus5=NOW per row · also creates `tb_check_forwarder` entries · LINE notify customer per item with total |
| **5→6** | รอชำระเงิน → เตรียมส่ง | Customer (pays via wallet/QR) → auto-confirm OR Accounting confirms slip OR `gateway-prepare.php` | When `tb_payment` for the item shows paid (wallet OR Omise OR Bank transfer slip approved) | Various: `wallet/withdraw.php` to deduct · `payment/checkPay.php` · or admin manually triggers `gateway.php` | UPDATE fStatus=6, fDateStatus6=NOW · LINE notify customer · receipt generated via `f-receipt/` dir |
| **6→6.1** | เตรียมส่ง → กำลังจัดส่ง (driver assigned) | **Warehouse (assigns driver)** | When driver is ready to leave | `forwarder-driver.php` `add` button (L23-99) — bundles N fIDs into one `tb_forwarder_driver` row with `fdStatus=1` | INSERT `tb_forwarder_driver` + `tb_forwarder_driver_item` rows · UI shows item as "กำลังจัดส่ง" per `detail.php:53-58` |
| **6.1→7** | กำลังจัดส่ง → ส่งแล้ว | **Driver** — confirms delivery via mobile UI on `forwarder-driver-w.php` OR Warehouse marks delivered | When item physically handed to customer | `forwarder-driver-w.php` driver UI (taps confirm) OR `forwarder-import-warehouse2.php` admin override | UPDATE fStatus=7, fDateStatus7=NOW, fPhotoEnd=<photo> · LINE notify customer + admin · auto-flip `tb_forwarder_driver.fdStatus=2` when all items delivered |
| **7** | สำเร็จ | (terminal) | — | — | (Sales commission becomes available, contributing to `withdraw-commission-sale.php` queue) |
| **99** | ยกเลิก / ใส่ตู้ผิด | Sales OR CEO/Manager/QAAndQC/Accounting/ITDT (whoever has the bulk button) | When item flagged stuck/wrong | `forwarder.php` `moveStatusTo99` / `removeStatusTo99` bulk button (L4-60) | INSERT `tb_log_forwarder_status` audit trail · also flip back via `removeStatusTo99` restoring `fStatusOld` |

### The container (ตู้) parallel flow
| Stage | Who | When | Where |
|---|---|---|---|
| **Open container** (assign fCabinetNumber) | Warehouse | When container being loaded in China | `forwarder/update/<id>` form sets `fCabinetNumber` |
| **Close container** (`fDateContainerClose`) | Warehouse | When container leaves China | Same form OR API |
| **Container in transit** | (system-tracked) | — | report-cnt.php shows tabs by status |
| **เบิกเงินค่าตู้** (cnt-payment request) | **CSPurchasing / Manager Purchasing** — they front the money | When container arrives + needs final-mile cost | `cnt-hs.php` checkbox-multi-select (รายการตู้ที่จะเบิก) → addPay button (`cnt-hs.php:4-101`) — uploads PDF slip + fills nameBlank/noBlank/nameAccount/cntAmount | INSERT `tb_cnt` cntStatus=1, `tb_cnt_item`, `tb_cnt_pay_idorco`, `tb_cnt_pay_trackingchn` |
| **Approve cnt-payment** | **CEO / Manager / QAAndQC / Accounting / ITDT** (gate at `cnt-hs.php:185,796`) | When manager reviews the slip + approves | `cnt-hs.php` per-row approve button on `cntStatus=1` row | UPDATE `tb_cnt` cntStatus=2, dateUpdate=NOW, adminIDUpdate, cntImagesSlip=<approval slip> |

---

## §4 Daily admin "inbox" queues — the SOT (sourced from `executeQueryAndGetRowCount()` SQL at top of each menu file)

| Queue label | URL | Owner role (departmentKey) | What lands here (SQL) | What flushes it |
|---|---|---|---|---|
| **รอตรวจสอบเติมเงิน** (`countDeposit`) | `/admin/wallet/deposit/` | Accounting · CEO · Manager · ITDT · QAAndQC | `tb_wallet_payment` WHERE wpStatus=1 (slip uploaded, awaiting verify) | Admin approves slip in `w-s-deposit-detail.php` → wpStatus=2 + wallet credited |
| **รอตรวจสอบถอนเงิน** (`countWithdraw`) | `/admin/wallet/withdraw/` | Accounting · CEO · Manager · ITDT · QAAndQC | `tb_wallet_payment` WHERE wpStatus=1 + type=withdraw | Admin approves + executes bank transfer + uploads transfer slip |
| **รอตรวจสอบฝากชำระหยวน** (`countPayment1`) | `/admin/payment/` | CSPurchasing (fulfill) · Accounting (verify) | `tb_payment` WHERE paymentStatus=1 | CSPurchasing pays via Alipay → uploads slip → marks done |
| **รอดำเนินการฝากสั่ง** (`countShops1`) | `/admin/shops/?q=1` | CSPurchasing | `tb_header_order` WHERE hStatus=1 | CSPurchasing places order on Taobao/1688 + records cTrackingNumber per item |
| **หมายเหตุฝากสั่ง** (`countNoteShop`) | `/admin/forwarder-action.php?action=NoteShop` | CSPurchasing · Warehouse · Sales (all see) | `tb_order` WHERE cNote<>'' AND cStatus<>7 (or similar) | Admin reads + replies to customer note → clears cNote |
| **หมายเหตุนำเข้า** (`countNote`) | `/admin/forwarder-action.php?action=Note` | Sales · Warehouse · CSPurchasing | `tb_forwarder` WHERE fNote<>'' AND fStatus<>7 | Admin resolves + clears fNote |
| **รายการเตรียมส่ง** (`countForwarder6`) | `/admin/forwarder/?q=6` | Warehouse | `tb_forwarder` WHERE fStatus=6 AND not yet assigned to driver | Warehouse assigns to driver via `forwarder-driver.php` |
| **มอบงานคนขับรถ** (count via `status_driver_item`) | `/admin/forwarder-driver.php` | Warehouse | `tb_forwarder_driver` WHERE fdStatus=1 (assigned but not delivered) | Driver confirms delivery |
| **งานที่ต้องส่ง** (`count_driver1`) | `/admin/forwarder-driver-w.php` | Driver | `tb_forwarder_driver_item` WHERE fdiStatus<>3 AND assigned to me | Driver hits confirm |
| **ประวัติเข้าโกดังไทย** (`countErrorF4`) | `/admin/forwarder-import-warehouse/` | Warehouse | `tb_forwarder_import2` rows not yet linked to fID (orphan scans) | Warehouse runs `updateIm` form linking fID + flipping fStatus=4 |
| **forwarder-check (bulk-bill)** (`countCheckF`) | `/admin/forwarder-check.php` | Accounting · CEO · Manager · QAAndQC · ITDT | `tb_check_forwarder` rows (flagged-for-billing snapshot) | Admin clicks "callPriceUser" → all rows flip fStatus=5 + LINE notify |
| **cnt-payment (เบิกเงินค่าตู้)** (`countDrawMoneyCNT`) | `/admin/cnt-hs.php` | Accounting · CEO · Manager · QAAndQC · ITDT (approve) ; CSPurchasing (initiate) | `tb_cnt` WHERE cntStatus=1 | Approval → cntStatus=2 + cash disbursed via the credited acc-system entry |
| **withdraw-commission-interpreter (อนุมัติรายการ)** | `/admin/withdraw-commission-interpreter.php?q=1` | ManagerPurchasing (approve) ; Purchasing (initiate) | `tb_withdraw_commission_interpreter` WHERE status=1 | Approval → status=2 → paid |
| **withdraw-commission-sale (อนุมัติ)** | `/admin/withdraw-commission-sale.php` | SalesManager · CEO · Manager · Accounting · ITDT · SalesAll (gate at `home.php:46`) | `tb_withdraw_commission_sale` rows | Approval flow |
| **เช็คข้อมูลลูกค้านิติบุคคล** (`countComp`) | `/admin/check-juristic.php` + `/admin/users/corporation/` | Sales · Accounting | `tb_corporate` WHERE corporateStatus=1 (pending DBD verify) | Admin clicks "ค้นหาข้อมูลนิติบุคคล" → curls DBD API → confirms match → corporateStatus=2 |
| **QAAndQC 10 overdue queues** | see §2.3 | QAAndQC | various `tb_*` joined to NOW()-N hours | QA contacts customer/admin to unstick |

The "home count" badge (`countHome`) is the sum that QAAndQC + Accounting + CEO see on their main menu:
```
countHome = countDeposit + countShopPay1 + countWithdraw + countShops1 + countShops2 + countShops4
          + countForwarder1 + countForwarder5 + countForwarder6 + countPayment1 + countErrorF4
```

---

## §5 Pacred Phase 1 launch readiness per role

| Role (departmentKey/section) | Pacred has this role's screens? | Critical gaps for Phase 1 launch | Recommend for D1? |
|---|---|---|---|
| **CEO** (section 0) | ⚠️ Partial — `/admin/kpi` + `/admin/board` exist, but no Cargo/Freight/All toggle, no `menu-hr-manage-*` subdialect | Add per-mode dashboard switch · OK to defer multi-company dashboards to Phase B/C | ✅ MUST work day-1 (it's ภูม + พี่ป๊อป) |
| **Manager** (section 1) | ⚠️ Falls through to CEO scope in Pacred — adequate | — | ✅ same as CEO |
| **QAAndQC** (sections 5/6/7) | ❌ **The 10 follow-up queues don't exist in Pacred at all** — this is the biggest gap | Need: delayedPaymentShop · delayedPaymentForwarder · orderCancellationList · creditOverdueForwarder · shopS1Over10Min · chineseShopDelay · delayedWarehouseChineseEntry · thaiDeliveryDelay · ownerlessProducts · shippingPrepOverdue · newClientFollowUpDelay (11 surfaces) | ⚠️ If a QAAndQC staff member exists day-1 → block until built. If only CEO+Sales+Accounting+Warehouse staff at launch → defer |
| **Accounting** (sections 8/9) | ✅ Mostly — `/admin/wallet/deposit/[id]` approval works · `/admin/report-cnt` cnt approval landed Wave 16 · `forwarder-check` bulk-bill landed Wave 16 | Gap: `withdraw-commission-sale` approve queue · `withdraw-commission-interpreter` approve queue · `acc-system` rich reports | ✅ MUST work day-1 |
| **Pricing** (section 11) | ⚠️ Partial — `/admin/rates/*` exists for VIP/HS · `check-sang-cost.php` Wave 17 | Gap: `forwarder-quotation.php` cost-template editor · `hs-customrate` UI | 🟡 Can launch without — Pricing has 1 staff person + can edit via SQL while waiting |
| **SaleCargo Sales** (section 2) | ✅ Mostly — `/admin/customers` + `/admin/forwarders` + `/admin/shops` exist · Wave 22 admins merge landed | Gap: hard-coded supervisor settings whitelist (`admin_mew`/`admin_fogus`) · `users/credit` + `users/comparison` views · CargoCenter API dashboard (`api-forwarder-cn.php?page=dashboard`) | ✅ MUST work day-1 — this role is 2 emp + 3 interns |
| **SaleCargo SalesManager** (section 1) | ⚠️ Falls through OK | Same as Sales | ✅ |
| **CSPurchasing Purchasing** (ล่ามจีน, section 4) | ✅ Mostly — `/admin/service-orders/cart` Wave 21 + cart/add + `/admin/payment/manual` + `/admin/yuan-payments/new` Wave 20 · `/admin/withdraw-commission-interpreter` Wave 22-23 | Gap: `forwarder/add/` direct manual import form · note-shop queue UI polish · cart→shop fulfillment screen | ✅ MUST work day-1 — 3 interns rely on this |
| **CSPurchasing ManagerPurchasing** (section 3) | ⚠️ Falls through OK | Same as Purchasing + approve queue | ✅ |
| **Warehouse Warehouse** (section 6) | ⚠️ Partial — `/admin/forwarders/combine-bill` Wave 23 · `/admin/barcode/driver/import` Wave 17 · `/admin/forwarders/warehouse-history` Wave 20 | Gap: the 4 barcode UI flows aren't fully built (only `barcode-d-import` is solid) — `barcode-d-all` · `barcode-c-all` · `barcode-d-prepare` · `barcode-c-prepare` · `barcode-d-from` · `barcode-c-from` need real camera/scanner UI per legacy. `forwarder-driver.php` assign-driver UI gap | ⚠️ If launch has Warehouse staff using mobile-scanner workflow → block. If launch is admin-only (warehouse staff still on legacy) → defer |
| **Warehouse Driver** (section 7) | ❌ `/admin/driver-mobile/*` does NOT exist in Pacred at all | Need: simple mobile-friendly `งานที่ต้องส่ง` + "ส่งแล้ว" confirm UI · per-driver login (or shared `Warehouse → Driver` toggle) | ⚠️ Drivers can stay on legacy if D1 doesn't enforce migration — defer 30d |
| **HR** (sections 2/3/4) | ⚠️ Pacred has `/admin/admins` (Wave 22) — adequate. No time-attendance UI. Maid has nothing. | Defer time-attendance + payroll to Phase C | ✅ Adequate |
| **ITDT** (sections 14-17) | ✅ ITDT just uses CEO menu — works | — | ✅ |
| **Freight (all sections, Company 2)** | ❌ Not in Pacred at all | Entire Freight workflow needs Phase C build (FCL/LCL/customs export) | 🔴 Defer to Phase C |

### Minimum-viable role set for Phase 1 launch:
1. **CEO / Manager** (พี่ป๊อป + 1-2 others) — has everything ✅
2. **Sales** (2 emp + 3 interns) — partial ⚠️ MUST close gaps before launch
3. **CSPurchasing / Purchasing** (3 interns) — partial ⚠️ MUST close gaps
4. **Accounting** (1 emp + 1 intern) — mostly OK ✅
5. **Warehouse staff** (3 interns) — partial ⚠️ → either close barcode gaps OR keep on legacy
6. **Driver** (1 emp + 3 partners) — NOT IN PACRED → keep on legacy

### Can defer to Phase B/C:
- QAAndQC (the 11 overdue queues — biggest backlog if QA hired)
- Pricing UI polish
- HR time-attendance + payroll
- Maid check-in/out
- All Freight (Company 2)
- Marketing/Creative/Graphic

---

## §6 The owner's mental model gap — "ไม่เป็นโลจิก"

ภูม / พี่ป๊อป's complaint that Pacred "ไม่เป็นโลจิก" maps to **3 specific choreography mismatches** I can name from this audit:

### Gap 1: Per-role menu, not "one fat admin sidebar"
Legacy switches **the entire left-menu** based on `(companyType, department, section)` (`header.php:74-122` is a 3-level nested switch). Pacred shows ONE fat sidebar to all admins. Result: a Driver logging into Pacred sees Accounting screens they shouldn't and gets overwhelmed; a CSPurchasing intern sees Manager queues they can't act on. **Legacy filters; Pacred dumps.**

**Fix:** route `lib/auth/sidebar-config.ts` (currently the single menu) through a `getRoleMenu(departmentKey, sectionKey)` switch — exactly mirroring `header.php:74-122` + `index.php:20-130`.

### Gap 2: Status transitions are role-owned in legacy, free-for-all in Pacred
Every legacy status flip has an **owner role** that's hard-coded into the button gate (`$departmentKey=='Warehouse'` etc.) AND into the menu (only Warehouse sees `forwarder-import-warehouse` link). Pacred currently has admin actions accessible to anyone who is `is_admin()=TRUE`. Result: an Accounting staff can flip fStatus=4 (warehouse-arrived) by accident; a Sales rep can approve their own wallet withdrawal.

**Fix:** every server-action `actions/admin/*.ts` needs a `requireDepartmentKey(['Warehouse', 'CEO', 'Manager'])` gate matching the legacy gate. The audit table in §3 column "Who triggers next move" is the SOT for the matrix.

### Gap 3: Queues vs lists
Legacy "Your Work" sections (QAAndQC.php L17-83) are **action queues** — every link is `?s=1` filtered to "needs action NOW", with a fallback link to history. Pacred's `/admin/*` mostly shows "all rows ever" with a date filter — staff have to mentally project "what needs action" themselves. This is the most expensive cognitive overhead in the legacy port.

**Fix:** every list page that maps to a legacy queue (the §4 table) needs a default filter on the "pending/overdue" state — NOT the full table.

### Concrete actionable summary (per ภูม's "RBAC + role-aware UI" decision):
1. Implement `departmentKey` (Cargo/Freight/etc.) + `sectionKey` (Sales/Warehouse/etc.) columns on `admins` (currently `tb_admin` has them but Pacred ignores) — Wave 22 already merged the table, so add a migration to expose the 2 enum columns.
2. Build a `getRoleMenu(deptKey, sectionKey)` resolver in `lib/auth/sidebar-config.ts` matching the 14-section switch.
3. Build a `requireDepartmentKey(allowedKeys[])` server-side gate, then sprinkle on each `actions/admin/*.ts` function per §3 + §4 ownership.
4. Convert the 11 QAAndQC overdue queues into Pacred `/admin/qa/*` pages (or punt to Phase B if no QA staff exists at launch).
5. Build the missing role pages per §5 critical-gap column.

---

**Audit duration:** 35 min. Files inspected: org-chart JSON (1) + 14 left-menu files + 8 page dispatchers (forwarder, cnt-hs, forwarder-check, forwarder-action, forwarder-driver-w, shops, check-juristic, wallet/w-s-deposit-detail) + index.php role-routing + header.php role-resolution. The §3 status-choreography table cross-references `forwarder/detail.php:155-186` for the status ladder + 4 action-handler files for the per-status writers. SOT for Pacred mapping: Wave 22 admins-merge intel (`docs/research/tb-admin-merge-intel-2026-05-27.md`) + Wave 23 P0 list (`docs/research/admin-tech-debt-master-2026-05-27.md`).
