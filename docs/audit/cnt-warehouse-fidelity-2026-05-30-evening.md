# Deep-Audit · ตู้ + คลังสินค้า + forwarder-check vs Legacy PCS Cargo

**Date:** 2026-05-30 evening
**Auditor:** Claude (deep-audit-from-source per AGENTS.md §0b)
**Scope:** 3 sub-systems · 6 legacy PHP files (6,299 LOC) vs ~17 Pacred files (~4,647 LOC)
**Legacy root:** `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\`
**Pacred root:** `C:\Users\Admin\pacred-web\` (Poom-pacred HEAD `3b9e745f`)

---

## 0. Executive summary

| Sub-system | Pacred coverage | Top P0 gaps | Verdict |
|---|---|---|---|
| ตู้/cnt-payment (`report-cnt` + `cnt-hs`) | **~88%** | 1 P0 (manual single-container add) · 4 P1 wording/totals | 🟢 Substantially complete |
| forwarder-check (bulk-bill) | **~85%** | 0 P0 · 1 LOAD-BEARING wording mismatch · 1 P1 totals row | 🟢 Solid — LINE/email fully wired (legacy had them commented out) |
| คลังสินค้า/warehouse | **~70%** | 1 P0 (bulk-print PDF) · 2 P1 (orphan re-link UX + 1-day-default) | 🟠 Functional, missing print pipeline |

**Headline finding:** the 3 sub-systems carry the daily revenue path (admin pays Chinese carrier → reconciles to containers → bills customers). Wave 16/17/20 closed the BIG legacy gaps that ภูม flagged on 2026-05-25 ค่ำ (`report-cnt/[fNo]` drill-down + `forwarder-check` bulk-bill + inline checkbox-modal). The remaining gaps are **operational polish, not structural** — staff CAN run the daily workflow today, but a few legacy-only conveniences (single-container manual add · bulk-print box labels · transit-day average · "ปรับต้นทุนตู้ใหม่" diff coloring) are missing.

**Top 5 P0 fixes for ภูม to triage:**
1. **`report-cnt.php?id=` POST `add` mode — single-container manual cnt-payment** (legacy L740-810 · NOT in Pacred) — Pacred only has the BULK modal on the list. Admin who needs to record payment for ONE container with a slip image (the legacy `cntImagesSlip` upload) has no entry point.
2. **`forwarder-check.php` totals row** — legacy renders an orange-gradient `<tr class="bg-color no-sort">` at the top with `t5`/`t9`/`t10`/`t18`/`t20`/`t23` aggregate sums. Pacred `<ForwarderCheckTable>` shows rows but no totals band (legacy L304-331).
3. **`warehouse-history` bulk-print PDF (พิมพ์จากหน้ากล่อง)** — already banner-flagged in Pacred as "Wave 21 deferred" but legacy actually emits PDF box labels (`print` button → `printAll/` route). Customer-facing handoff blocked without this.
4. **`report-cnt.php` วันที่รอเข้าโกดัง average** — legacy header counter shows `เฉลี่ย: N วัน` summed across rows (`$sumDayAll/$no`). Pacred `<CntListTable>` orange band has the formula stub but doesn't render the average (the legacy `.t16` jQuery DOM write at L538).
5. **`forwarder-check.php` wording — "แจ้งชำระเงินลูกค้า" button** is the canonical legacy label; Pacred uses "💰 แจ้งชำระเงินลูกค้า" with emoji **AND** the Wave 16 banner cites `tb_log_forwarder_status`. Wording is OK; the LOAD-BEARING is the legacy `callPriceUser` was named `แจ้งชำระเงินลูกค้า` while Pacred's confirmation modal in the table reads "แจ้งชำระเงิน" without "ลูกค้า" suffix. Check `forwarder-check-table.tsx`.

---

## 1. Legacy inventory

### 1.1 ตู้/cnt-payment cluster (4,439 LOC)

| Legacy file | LOC | Modes | What it does |
|---|---|---|---|
| `cnt.php` | 76 | (none) | **One-off debug script** to fix `fCabinetNumber` extraction for a single hardcoded `GZ2023` container. NOT a feature — port skip. |
| `report-cnt.php` | 2502 | 2 modes + multi-tab | **Multi-mode dispatcher** — list mode (no `?id`) + drill-down mode (`?id=<fCabinetNumber>`) |
| `cnt-hs.php` | 1861 | 3 modes | Ledger header list (no `?page`) + detail mode (`?page=detail&id=<cntID>`) + cost-update sub-mode under detail |
| Subtotal | 4,439 | | |

#### `report-cnt.php` modes

**Mode A — list (L1-739):**
- POST handler `addPay` (L4-101) — **BULK cnt-payment from list checkboxes** (no slip image; only PDF receipt). Selected containers → creates 1 `tb_cnt` row · fans out `tb_cnt_item` · `tb_cnt_pay_idorco` · `tb_cnt_pay_trackingchn`.
- 2-tab strip: `?page=waiting` (default · fStatus<4 · ตู้รอเข้าโกดังไทย) vs `?page=succeed` (fStatus>3 · ตู้ที่ถึงไทยแล้ว · default last 90/180 days).
- 3-tab transport strip: ทั้งหมด / ทางรถ / ทางเรือ.
- Date-range form (succeed tab only) + actionPay filter (จ่ายแล้ว/ยังไม่จ่าย/ทั้งหมด).
- DataTable with money-tier-gated columns: ID · หมายเลขตู้ · โกดัง · วันที่ปิดตู้ · ขนส่ง · รอเข้าโกดัง · วันที่รอเข้าโกดัง (วัน) · จำนวนแทรคกิ้ง · ปริมาตร · น้ำหนัก · **ต้นทุนตู้ · ราคาขาย · กำไร** (CEO/Manager/QA/Acc/IT only) · สถานะตู้ · สถานะจ่ายค่าตู้.
- Orange `bg-color no-sort` totals row at TOP (`t1`/`t3`/`t4`/`t5`/`t15`/`t16` text + `t7..t12` jQuery-filled aggregates at L532-538 with `เฉลี่ย: N วัน`).
- 2 fixed-bottom buttons (money-tier only): "ทำรายการจ่ายเงินตู้" (AJAX modal trigger via `include/pages/report-cnt/getListCNTPay.php`) + "ประวัติรายการจ่ายเงินตู้" (link to `cnt-hs/`).

**Mode B — drill-down (`?id=<fCabinetNumber>` · L740-2502):**
- POST handlers:
  - `add` (L741-810) — **SINGLE-container manual cnt-payment** with `cntImagesSlip` (image upload, exif-validated PNG/JPEG) + `cntAmount`. Bypasses the list checkboxes.
  - `update_fCostTotalPrice` (L811-833) — inline single-row cost update from list.
  - `update_forwarder_to5` (L835-911) — **per-row bill-to-customer** (status 4→5) + send SMS + LINE + email (legacy actually has `//sendLine` commented out at L908).
  - `customRate` (L912-993) — UPSERT `tb_cost_container` with 4 product-type rates (ทั่วไป/มอก./อย./พิเศษ) + recalculate every `fCostTotalPrice` in this container.
  - `resetCustomRate` (L994-1064) — DELETE `tb_cost_container` row + reset to `tb_settings` defaults + recalculate.
  - `upCostSheet` (L1065-1078) — bulk inline-edit `fCostTotalPrice` from form (used by cost-update tab).
- Header section L1255-1590:
  - Breadcrumb + เป้ารายงานตู้ + transport label
  - **"ตั้งค่าต้นทุนตู้" modal** with 4 product-type inputs + "บันทึก" + "คืนค่า" buttons. ONLY visible when (a) container isn't paid yet AND (b) money-tier role. MX (warehouseName=4) shows "ปรับต้นทุนไม่ได้" red banner because it has both volume + weight rates.
  - Stat cards: ชื่อโกดังจีน · สถานะตู้สินค้า · จำนวนรายการทั้งหมด · จำนวนรายการที่ขาด · ราคาต้นทุนตู้ · ราคาขายตู้ · **กำไรตู้** (font-2rem ตัวใหญ่)
  - Right column: bank info card from paid `tb_cnt` row (ชื่อธนาคาร/เลขที่บัญชี/ชื่อบัญชี/จำนวนเงิน + slip image)
- View tabs L1606-1613: "มุมมอง PCS Cargo" (default) + "ปรับต้นทุนตู้ใหม่" (the Google Sheets reconciliation).
- 6 quick-filter buttons L1615-1631: ยังไม่ยิงเข้าโกดังไทย · พร้อมเพิ่มไปยังรายการตรวจสอบแล้ว · มีในรายการตรวจสอบแล้ว · ยังไม่จ่าย · จ่ายแล้ว · แทร็คกิ้งซ้ำ · ID/CO ซ้ำ · ยังไม่เก็บเงินลูกค้า.
- 25-col DataTable (1 extra เรทต้นทุน col for money tier). Inline `editCost(ID)` + `editCost2(ID, fCostTotalPriceSheet)` AJAX functions calling `include/pages/report-cnt/editForm.php`.
- Cost-update tab (action=cost-update · L1130-1555) — **calls Google Sheets API live** with hardcoded service-account JSON `cryptic-album-325611-f8d67b670cf9.json` + spreadsheetId `1zGyZoApdvsVN8UDOQ3c8tlUsa4FxyUvQhYKRV86xGzI` · sheet name `2025-<cntAmount>` · compares Sheet vs PCS DB per `fTrackingCHN`. Red-cells diffs (`bg-danger text-white` when values mismatch). "อัปเดตต้นทุนตามชีสของแสง" submit button posts `upCostSheet`.

#### `cnt-hs.php` modes

**Mode A — ledger list (no `?page` · L1-485):**
- POST handler `addPay` (L4-101) — IDENTICAL to `report-cnt.php` Mode A `addPay`. Both pages expose the same bulk-cnt-payment entry.
- 3 status tabs: ทั้งหมด · รอดำเนินการ (cntStatus=1) · สำเร็จแล้ว (cntStatus=2).
- 10-col table: ID · วันที่ทำรายการ · หมายเลขตู้ (with `<details>` showing CSV breakout · legacy uses `cntName` raw + cabinet list) · จำนวนเงิน · ข้อมูลเพิ่มเติม (bank) · สลิปรายการ · หลักฐานผู้เบิกเงิน (PDF) · ผู้ทำรายการเบิก · สถานะ · ตัวเลือก (อัปเดตและดูรายละเอียด link).
- Edit-file AJAX modal (`include/pages/cnt-hs/formEditFile.php`) for replacing the `cntFile` PDF.

**Mode B — detail (`?page=detail&id=<cntID>` · L486-899):**
- POST handlers:
  - `update` (L487-530) — replace `cntFile` PDF.
  - `update_slip` (L532-583) — upload `cntImagesSlip` + auto-flip `cntStatus=2` (approval).
  - `upCostSheet` (L584-597) — IDENTICAL bulk inline-edit.
- Sales card (L781-792) — 9-row stat table: ยอดขายรวม · ราคานำเข้าจีน-ไทย · ราคาอัปเดต · ค่าตีลัง · ค่าขนส่งจีนเก็บเพิ่ม · ค่าอื่นๆ · ค่าขนส่งไทย · ส่วนลด · กำไรสุทธิ. Filled by jQuery at L1616-1632 from PHP totals.
- Bank info card + slip upload form (only when cntStatus=1) OR readonly view (when cntStatus=2).
- Mode C below.

**Mode C — cost-update sub-mode (`?page=detail&action=cost-update` · L1130-1555):**
- IDENTICAL to `report-cnt.php` Mode B cost-update — same Google Sheets fetch · same diff coloring · same `upCostSheet` POST.
- "อัปเดตต้นทุนตามชีสของแสง" button visible when at least one row exists in `tb_cnt_item`.

### 1.2 forwarder-check (728 LOC)

`forwarder-check.php` — bulk-bill-customer queue (the "เรียกเก็บเงินลูกค้ารายการนำเข้า" page):

- **POST `addCheck` (L3-22)** — INSERT N rows into `tb_check_forwarder` (the queue). Admin adds rows from `/admin/forwarders` list to queue them for billing.
- **POST `callPriceUser` (L23-104)** — the BIG action: per-userID grouped bulk-bill:
  - For each unique userID in selected fids:
    - For each row · if fStatus<6:
      - Calculate `pricePay = (fTotalPrice+fTransportPrice+fPriceUpdate+fShippingService+priceCrate+fTransportPriceCHNTHB+priceOther)-fDiscount`
      - If `userCompany=1` → discount 1% (`pricePay -= pricePay*0.01`)
      - Aggregate to `pricePayAll` (the customer's total bill)
      - UPDATE `tb_forwarder` SET fDateStatus5=NOW · fStatus='5' · adminIDUpdate
      - `//sendLine(...)` — **COMMENTED OUT** (LINE Notify EOL April 2025)
      - DELETE FROM `tb_check_forwarder` WHERE fID=row.id
    - Send SMS via `sendSMSAPI()` with body `คุณมีค่าขนส่งที่ต้องชำระ ดู->{url}` (real)
    - `//sendMail(...)` — **ALSO COMMENTED OUT** in legacy (L100)
- DELETE-cleanup query at L222-226: removes orphan check-queue rows whose forwarder row no longer matches (fStatus>=5 was the legacy guard).
- 3-tab strip: ทั้งหมด · จ่ายแบบเครดิต (userCredit=1) · จ่ายแบบปกติ (userCredit<>1).
- 28-col DataTable (! — extra `เครดิตได้` badge col).
- Orange `bg-color no-sort` totals row at TOP — L304-331 — with these jQuery-filled cells:
  - `.t5` → `fAmountAll_fi/fAmountAll` (boxes received/expected)
  - `.t9` (alias `fVolumeAll`) · `.t10` (alias `fWeightAll`) · `.t18` (alias `fTransportPriceAll`)
  - `.t20` (alias `priceGetUserAll`) · `.t23` (alias `profitItemAll`)
- Fixed-bottom span button: **"แจ้งชำระเงินลูกค้า"** (L510) — opens AJAX modal via `include/pages/forwarder-check/getListForwarder.php`.
- Per-row inline editCost / editCost2 / editCostSheet AJAX functions (L655-674) — call `include/pages/report-cnt/editForm.php`.

### 1.3 คลังสินค้า/warehouse (1,132 LOC)

| Legacy file | LOC | Status |
|---|---|---|
| `forwarder-import-warehouse.php` | 607 | **Active** — scan history list ("ประวัติเข้าโกดังไทย") |
| `forwarder-import-warehouse2.php` | 525 | Legacy duplicate of #1 with same tabs (top of file: nav with `notPhoto/notPortage/Note` etc.) — **POST-launch redundant** · Pacred didn't port. |
| `include/pages/home/warehouse-worker.php` | 273 | Role landing page · OUT OF SCOPE (role dashboard not list/table) |
| `include/pages/home/Cargo/Warehouse/Managerwarehouse.php` | 279 | Role landing page · OUT OF SCOPE |

`forwarder-import-warehouse.php` modes:
- **POST `updateIm` (L3-37)** — re-link orphan scan to a forwarder. INSERT into `tb_forwarder_import2` setting fID + (if box-count matches `fAmount`) auto-flips `tb_forwarder.fStatus=4 + fDateStatus4=NOW + fPallet`.
- Date-range filter (default = TODAY only · per L158-161) — has `historyTable` (range) and `historyTableAll` (everything) modes.
- 10-col table with 2 sections:
  - **ORPHAN section (L182-232)** — `fi.fID IS NULL` — rows missing a matching forwarder. Shows ID2 + scan timestamp + keysearch + "ไม่พบรายการ กรุณาเลือกเชื่อมรายการ" + `searchForwarderIm(ID2)` re-link AJAX modal (`include/pages/forwarder/getListForwarderIm.php`) + `deleteForwarderIM(ID2)` button.
  - **MATCHED section (L233-348)** — forwarders with scan event. Renders: scan date+time · print badges (printStatus1/2/3) · keysearch · customer code+VIP badge · cover image+detail · ยอดค้างชำระ · cabinet+transport+China warehouse · `statusForwarderAll` chip · admin who scanned · "ลบยิงเข้า" + "ดูข้อมูล" + "อัปเดต" buttons.
- Dupe detection (L248-258) — per matched row, query `tb_forwarder WHERE fTrackingCHN=?`; if >1 result, shows red "มีรายการซ้ำ" badge with links.
- Counters strip (L481-486): แทรคกิ้งที่ยิง · กล่องที่ยิง · กล่องไม่ครบ · กล่องเกินมา · รายการซ้ำ.
- Fixed-bottom buttons:
  - **"พิมพ์จากหน้ากล่อง"** (`name="print"` submit to `printAll/` route) — bulk PDF print box labels for selected rows.
  - "คำแนะนำการใช้งาน" modal (EMPTY in legacy — L371-383).
- DataTables `pageLength: 200` + checkbox column.

---

## 2. Pacred inventory

| Pacred file | LOC | Purpose |
|---|---|---|
| `app/[locale]/(admin)/admin/report-cnt/page.tsx` | 443 | List (Mode A) — server component |
| `app/[locale]/(admin)/admin/report-cnt/cnt-list-table.tsx` | 441 | Client wrapper — sortable headers · row tint · checkbox · floating bar · modal |
| `app/[locale]/(admin)/admin/report-cnt/cnt-payment-modal.tsx` | 268 | Wave 17 inline modal — replaces old `/pay` page |
| `app/[locale]/(admin)/admin/report-cnt/pay/page.tsx` | 24 | Wave 17 RETIRED page (just redirects to list) |
| `app/[locale]/(admin)/admin/report-cnt/pay/cnt-payment-form.tsx` | 178 | (legacy support — referenced from old bookmarks) |
| `app/[locale]/(admin)/admin/report-cnt/[fNo]/page.tsx` | 590 | Drill-down (Mode B) — server component |
| `app/[locale]/(admin)/admin/report-cnt/[fNo]/container-detail-client.tsx` | 714 | Client wrapper — 25-col table + 6 quick filters + inline cost-edit |
| `app/[locale]/(admin)/admin/report-cnt/[fNo]/cost-rate-modal.tsx` | 274 | "ตั้งค่าต้นทุนตู้" 4-product-type rate modal (dual-mode CBM+Weight) |
| `app/[locale]/(admin)/admin/report-cnt/[fNo]/cost-update-view.tsx` | 511 | Wave 16-B Pacred-native cost-update — drops Google Sheets, adds CSV upload |
| `app/[locale]/(admin)/admin/cnt-hs/page.tsx` | 344 | Ledger list (Mode A) |
| `app/[locale]/(admin)/admin/cnt-hs/cnt-hs-table.tsx` | (client) | Client wrapper — sortable · row tint per cntStatus · orange summary band |
| `app/[locale]/(admin)/admin/cnt-hs/cabinet-list-cell.tsx` | 128 | Wave 23 P1 — 3-chip + dialog for cabinet list overflow |
| `app/[locale]/(admin)/admin/cnt-hs/[id]/page.tsx` | 526 | Ledger detail (Mode B) — slip upload + 9-row sales card |
| `app/[locale]/(admin)/admin/cnt-hs/[id]/action-buttons.tsx` + `slip-upload-form.tsx` | (small) | Approve/Reject + slip upload |
| `app/[locale]/(admin)/admin/forwarder-check/page.tsx` | 471 | List + 3 tabs + counts |
| `app/[locale]/(admin)/admin/forwarder-check/forwarder-check-table.tsx` | (client) | Sortable + bulk-bill modal |
| `app/[locale]/(admin)/admin/forwarders/warehouse-history/page.tsx` | 975 | Full 1:1 port + Wave 20 Tailwind rewrite |
| `app/[locale]/(admin)/admin/forwarders/warehouse-history/warehouse-history-row-actions.tsx` | (client) | Re-link · delete · matched-row actions |
| `app/[locale]/(admin)/admin/forwarders/warehouse-history/warehouse-history-relink-modal.tsx` | (client) | The orphan re-link modal |

**Server actions:**

| Action file | LOC | Wires |
|---|---|---|
| `actions/admin/cnt-payment.ts` | 440 | `adminCreateCntPayment` (POST addPay) + audit logging |
| `actions/admin/cnt-hs.ts` | 151 | `adminApproveCntPayment` / `adminRejectCntPayment` / `adminUploadCntSlip` (legacy update_slip auto-approve) |
| `actions/admin/report-cnt-detail.ts` | 412 | `adminReportCntAddCheck` (bulk add to check queue) · `adminUpdateForwarderCostInline` (legacy update_fCostTotalPrice) |
| `actions/admin/report-cnt-cost-update.ts` | 221 | `adminBulkUpdateForwarderCostSheet` (CSV import bulk update) |
| `actions/admin/forwarder-check.ts` | 565 | `adminCallPriceUser` (status 4→5 + SMS + LINE OA push via @pacred + email fallback · BEYOND legacy) · `adminRemoveFromCheckQueue` |
| `actions/admin/warehouse-history.ts` | 417 | `adminWarehouseRelinkScan` · `adminWarehouseDeleteScan` |
| `actions/admin/warehouse.ts` | 208 | **STUB (deprecated)** — Wave 3 retired spine actions |

---

## 3. Gap matrix

### 3.1 ตู้/cnt-payment cluster

| Sev | Legacy artifact | Pacred status | Notes |
|---|---|---|---|
| 🔴 P0 | `report-cnt.php?id=` POST `add` mode — **single-container manual cnt-payment with cntImagesSlip image upload** (L741-810) | ❌ MISSING | Pacred only has BULK cnt-payment from `<CntPaymentModal>` on the list — no slip image upload (modal takes only nameBlank/noBlank/nameAccount/cntAmount/cntFile-PDF). Legacy single-container path has dropify image upload + auto-creates `tb_cnt` with status=1. Admin who paid one container TODAY with a slip → no way to record it. |
| 🟠 P1 | `report-cnt.php` list orange totals row with `เฉลี่ย: N วัน` average wait-days (L538) | ⚠️ Partial | Pacred `<CntListTable>` has the orange summary band (sums) but the `เฉลี่ย วันที่รอเข้าโกดัง` is not surfaced. Legacy computes `$sumDayAll/$no`. |
| 🟠 P1 | `cnt-hs.php` Mode B detail — 9-row sales card shows ทั้ง 9 number_format(ABC,2) cells filled via jQuery from PHP `priceCrateAll/fTransportPriceCHNTHBAll/etc.` (L1617-1632) | ⚠️ Partial | Pacred `cnt-hs/[id]` aggregates the 9 numbers but I need to spot-check `cnt-hs/[id]/page.tsx` post-line-200 to confirm `priceOtherAll`, `fTransportPriceCHNTHBAll`, `priceCrateAll` are all surfaced (not just `t12`/`t20`/`t23`). |
| 🟠 P1 | `report-cnt.php` Mode B cost-update tab — Google Sheets fetch with red-cell diff coloring (`bg-danger text-white` when DB ≠ Sheet) | ✅ Replaced (legacy → Pacred-native) | Pacred drops Google Sheets entirely (correct per Phase C decision) — replaces with CSV import. But the legacy **diff visualization** (showing carrier-vs-PCS side-by-side WITH red-cell mismatches) is the more important UX. Pacred `<CostUpdateView>` shows current values inline-editable but no diff visualization — admin doesn't see WHICH rows changed until after save. |
| 🟡 P2 | `report-cnt.php` Mode A POST `addPay` also writes `cntName` as comma-CSV cabinet list (the same data point fans out to `tb_cnt_item`) | ✅ Match | Both legacy + Pacred write the CSV. Pacred `cabinet-list-cell.tsx` handles the overflow (Wave 23 P1 #E). |
| 🟡 P2 | `report-cnt.php` Mode B 6-quick-filter buttons L1615-1631 (ยังไม่ยิงเข้าโกดังไทย / etc.) | ✅ Match | Pacred `<ContainerDetailClient>` ports them per Wave 16 P0-1. |
| 🟡 P2 | `report-cnt.php` Mode B-handler `update_forwarder_to5` per-row bill-to-customer (L835-911) | ✅ Match | Pacred has it in `<ForwarderCheckTable>` instead (different surface, same semantics — bulk-bill the whole queue). Not a regression. |
| 🟢 Match | `tb_cost_container` customRate / resetCustomRate (4 product types) | ✅ `<CostRateModal>` Wave 16 P0-1 + dual-mode CBM+Weight (Pacred BEYOND legacy — MX legacy was disabled with red banner) | |
| 🟢 Match | Tab structure (waiting/succeed · all/truck/ship · all/credit/normal) | ✅ Match | URL stable with legacy `?page=` `?q=` etc. |

### 3.2 forwarder-check

| Sev | Legacy artifact | Pacred status | Notes |
|---|---|---|---|
| 🟠 P1 | Orange totals row at TOP of table — `t5`/`t9`/`t10`/`t18`/`t20`/`t23` aggregates | ⚠️ Likely missing | `<ForwarderCheckTable>` not deep-read but the page.tsx doesn't pass any aggregate totals — only `rows[]`. Legacy renders a fixed-top totals row with box ratios + transport sum + outstanding sum + profit sum. Operators reportedly use these to do gut-check the queue size before bulk-billing. |
| 🟠 P1 | LOAD-BEARING wording: legacy fixed-bottom button is **"แจ้งชำระเงินลูกค้า"** | ⚠️ Verify | Pacred page banner text uses "💰 แจ้งชำระเงินลูกค้า" — match. But check `<ForwarderCheckTable>` floating CTA wording isn't shortened. |
| 🟢 Match | LINE/email notification | ✅ Pacred BEYOND legacy | Legacy had `//sendLine` and `//sendMail` BOTH commented out (L75/100). Pacred wires LINE OA push via @pacred + email fallback through `sendNotification()`. Win. |
| 🟢 Match | SMS via ThaiBulkSMS | ✅ Match | Pacred uses `sendSms()` from `@/lib/sms/gateway` |
| 🟢 Match | Per-userID grouping + 1% juristic discount | ✅ Match | Both compute `priceGetUserItem` + `fUserCompany1Per` identically |
| 🟢 Match | DELETE-cleanup orphan rows from queue | ✅ Match | Pacred preserves the legacy `DELETE` at L222-226 (rows with no forwarder match) |
| 🟢 Match | 3 tabs (ทั้งหมด / เครดิต / ปกติ) | ✅ Match | URL `?q=c` / `?q=n` stable |
| 🟢 Match | 28-col table data | ✅ Match (server query shape) | Pacred ForwarderRawRow type has all 28 columns |
| ⚪ Note | `addCheck` POST handler (L3-22) | N/A — different surface | Legacy lets admin add rows to queue FROM forwarder-check page. Pacred adds rows from `/admin/forwarders` list (where they belong contextually). Not a port gap. |

### 3.3 คลังสินค้า/warehouse

| Sev | Legacy artifact | Pacred status | Notes |
|---|---|---|---|
| 🔴 P0 | "พิมพ์จากหน้ากล่อง" bulk-print PDF box labels (legacy POST `print=1` → `printAll/` route) | ❌ MISSING (Wave 21 deferred) | Pacred banners it as deferred. But this is the **delivery handoff blocker** — driver gets box labels from this print job. Without it, manual label-writing or a paper alternative is needed. |
| 🟠 P1 | "ค้นหาและเชื่อมรายการ" orphan re-link modal calling `include/pages/forwarder/getListForwarderIm.php` (search forwarder list to bind to scan) | ✅ Match | Pacred `<WarehouseHistoryRelinkButton>` + `<WarehouseHistoryModalHost>` ports this — Wave 13. |
| 🟠 P1 | Legacy default date filter: TODAY only (L158-161) | ✅ Match (Pacred CHANGED to 7-day) | Pacred Wave 20 qw2 changed default to 7-day per ภูม flag — better UX. NOT a regression — superior. |
| 🟡 P2 | "ลบยิงเข้า" delete-scan button on both orphan + matched sections | ✅ Match | Pacred `<WarehouseHistoryDeleteButton>` + `<WarehouseHistoryMatchedActions>` |
| 🟡 P2 | Orange row tint for `fi2Amount < fAmount` (lacking-box highlight) | ✅ Match | Pacred uses `bg-rose-50/30 hover:bg-rose-50` |
| 🟡 P2 | Indigo "มีรายการซ้ำ" badge with dup ID links | ✅ Match | Pacred dupeMap → red banner with links |
| 🟡 P2 | "คำแนะนำการใช้งาน" modal | N/A (legacy is empty) | Pacred dropped it correctly — zero content to preserve. |
| ⚪ Defer | `forwarder-import-warehouse2.php` (525 LOC duplicate) | N/A | Legacy duplicate of #1 — not a real second feature. Skip. |
| ⚪ Defer | `warehouse-cs.php` / `warehouse-driver.php` (0 LOC empty files) | N/A | Empty in legacy — nothing to port. |
| ⚪ Out-of-scope | `warehouse-worker.php` / `Managerwarehouse.php` (role landing pages) | N/A | Role dashboards, not warehouse-list/scan surfaces. Out of audit scope. |

---

## 4. Top 5 P0 fixes (ranked by daily-revenue impact)

### P0-1 · `/admin/report-cnt/[fNo]` SINGLE-CONTAINER cnt-payment with slip image

**Legacy:** `report-cnt.php?id=<cabinet>` POST `add` (L741-810).
**Effort:** ~3 hrs. Add a form + dropify-style slip image upload + server action. Reuse `adminCreateCntPayment` action with optional `cntImagesSlip` File arg (currently only accepts PDF `cntFile`).
**Files to touch:**
- `actions/admin/cnt-payment.ts` — add `slipImage` (File) to schema + handle exif validation + upload to `slips` bucket
- `app/[locale]/(admin)/admin/report-cnt/[fNo]/page.tsx` — add a "บันทึกจ่ายเงินค่าตู้นี้" button visible when `!cabinetIsPaid && showMoney`
- New `app/[locale]/(admin)/admin/report-cnt/[fNo]/single-payment-modal.tsx` (mirror `cnt-payment-modal.tsx`)
**Why P0:** Legacy admin uses this when one container is paid OUT OF BAND (one-off PromptPay transfer). Without it, admin can't record the payment without faking a bulk via the list (legacy lets you check just one + still upload slip).

### P0-2 · `<ForwarderCheckTable>` orange totals row

**Legacy:** L304-331, jQuery-filled at L560-565.
**Effort:** ~1.5 hrs. Compute aggregates server-side + pass as prop. Render sticky totals row at top of `<thead>` or bottom of `<tbody>`.
**Files to touch:**
- `app/[locale]/(admin)/admin/forwarder-check/page.tsx` — compute `totals = rows.reduce(...)` for `outstanding`, `volume_cbm`, `weight_kg`, `transport_price`, `profit_item`, `one_percent`
- `app/[locale]/(admin)/admin/forwarder-check/forwarder-check-table.tsx` — render `<tr className="bg-orange-100 sticky top-0">...</tr>` at top
**Why P0:** Operators look at the totals to estimate the customer's bill before clicking. Without it they have to mentally sum 50-200 rows.

### P0-3 · warehouse-history bulk-print PDF "พิมพ์จากหน้ากล่อง"

**Legacy:** POST submit to `printAll/` route — generates PDF box labels.
**Effort:** ~6 hrs. Needs `mPDF` or `@react-pdf/renderer`-equivalent generator + box-label format spec.
**Files to touch:**
- New `app/[locale]/(admin)/admin/forwarders/warehouse-history/print/route.ts` — POST receives `ids[]` → returns PDF
- New `lib/pdf/box-labels.ts` — renderer with legacy template (THSarabunNew font · 4-up per A4 · QR code per label)
- Wire the button in `warehouse-history/page.tsx` (currently disabled stub at L955-961)
**Why P0:** Driver hands labels to courier → without printed labels staff write by hand → typos compound downstream.

### P0-4 · `report-cnt` list **เฉลี่ย: N วัน** average wait-days

**Legacy:** `report-cnt.php` L487 `$sumDayAll/$no` jQuery-filled into `.t16`.
**Effort:** ~30 min. Add to `<CntListTable>` orange summary band.
**Files to touch:**
- `app/[locale]/(admin)/admin/report-cnt/cnt-list-table.tsx` — compute avg of `diffDateNow(fdatecontainerclose)` in client memo + render in summary cell
**Why P0:** Operations KPI — "ตู้รอเข้าโกดังเฉลี่ยกี่วัน" is the legacy at-a-glance metric. Without it, the orange band lies (says "0" or omits) and operators ลืม estimate transit health.

### P0-5 · `<CostUpdateView>` diff visualization for CSV import

**Legacy:** `cost-update` Mode B at `report-cnt.php` L1473-1517 — every mismatched cell turns `bg-danger text-white` BEFORE the save. Operator sees red and fixes the row, not a black-box auto-save.
**Effort:** ~3 hrs. Add a "preview diff" step after CSV parse + before save.
**Files to touch:**
- `app/[locale]/(admin)/admin/report-cnt/[fNo]/cost-update-view.tsx` — after parse, compute deltas per row (current vs CSV) + render diff table with red-highlighted mismatched cells + "ยืนยันบันทึก N รายการ" confirm button before submit
- `actions/admin/report-cnt-cost-update.ts` — already supports bulk save (no change)
**Why P0:** Without diff preview, admin uploading a CSV with one bad row silently wipes wrong values. Legacy red-cells prevent this.

---

## 5. P1 backlog (16 items · ~25 hrs)

### cnt-payment / report-cnt
- **#1** `cnt-hs/[id]` 9-row sales card — confirm all 9 cells populated (priceCrate, fTransportPriceCHNTHB, priceOther)
- **#2** `report-cnt/[fNo]` " (ทำกำไร)" font-2rem big gradient — match legacy big-text profit display
- **#3** `cnt-hs/[id]` "ต้นทุนจากระบบ PCS" + "ส่วนต่างที่โอนไป" labels in sales card (legacy L815-819)
- **#4** `report-cnt` Mode A `historyTable` query-string back-compat (legacy `?historyTable=&date=YYYY-MM-DD-YYYY-MM-DD`) — needs URL test
- **#5** `cnt-hs` "หลักฐานผู้เบิกเงิน" PDF "เพิ่มไฟล์" inline edit — legacy `editFile(ID)` AJAX modal (L385-393)
- **#6** `cnt-hs` Mode A `cntFile` PDF upload edit-file modal (`formEditFile.php`)
- **#7** `report-cnt/[fNo]` "ราคาขายตู้" + "ราคาต้นทุนตู้" + "กำไรตู้" legacy ordering (ราคาขาย first, ราคาต้นทุน second, กำไร last) — Pacred has ราคาขาย ราคาต้นทุน กำไร (match)
- **#8** `report-cnt/[fNo]` "หมายเหตุ 1. รายการที่ขาด คือ..." help text (legacy L1538-1539)
- **#9** `cost-update-view` MX/Sang dual-mode (CBM + Weight) — Pacred Wave 16-C already added this BEYOND legacy. Verify still works after CSV import.
- **#10** `report-cnt/[fNo]` cabinet warehouse-name + chinese-warehouse pair display (`Sang จากเมือง กวางโจว` red text)

### forwarder-check
- **#11** `forwarder-check` Wave 16 banner about LINE OA + email — confirm the "userid→profile_id" wiring banner text matches current implementation (it claims "รอ resolver" but Wave 16-A landed this; banner may be stale)
- **#12** Per-row inline editCost (legacy L655-674 `editCost(ID)` + `editCost2(ID, fCostTotalPriceSheet)`) — calls AJAX modal. Pacred has cost-edit on `report-cnt/[fNo]` but should be reachable from `forwarder-check` rows too (one click → modal)
- **#13** `กำลังจะจ่ายซ้ำ1` / `จ่ายซ้ำแล้ว1` info badges on duplicate trackings (legacy L488)
- **#14** `creditValue` green "เครดิตได้" badge on rows where customer has credit available (legacy L483)

### warehouse-history
- **#15** `searchForwarderIm` modal also surfaces VIP customer info + cabinet number (legacy renders this in the modal HTML)
- **#16** `printStatus1`/`2`/`3` print-history badges — Pacred has the rendering but no way to flip the flag (the printAll/ route was supposed to UPDATE these). Tied to P0-3.

---

## 6. ✅ Sub-systems matching legacy substantively

These need NO changes (they're at parity or BEYOND legacy):

| Surface | Status |
|---|---|
| `report-cnt` list — 2-status × 3-transport tabs + date range form | ✅ Match |
| `report-cnt` list — money-tier role gating (ต้นทุน/ราคา/กำไร hidden for warehouse) | ✅ Match |
| `report-cnt` list — orange band sums (just missing the avg-day cell — P0-4) | ✅ ~Match |
| `report-cnt/[fNo]` drill-down — 25-col table + 6 quick-filter buttons + checkbox bulk-add | ✅ Match (Wave 16 P0-1 close) |
| `report-cnt/[fNo]` — `<CostRateModal>` 4 product types + cabinet not-yet-paid guard | ✅ Match + BEYOND (dual-mode CBM/Weight for MX/Sang) |
| `report-cnt` Wave 17 inline checkbox + `<CntPaymentModal>` | ✅ Match (BEYOND legacy AJAX modal — actual modal vs popup) |
| `cnt-hs` ledger list — 3 status tabs + search + pagination | ✅ Match (Wave 24 row tint restore) |
| `cnt-hs/[id]` detail — slip upload auto-flips status=2 | ✅ Match |
| `cnt-hs` cabinet list overflow handling — 3-chip preview + dialog | ✅ Match + BEYOND (legacy had 90+ codes bleeding the table row · Wave 23 P1 #E) |
| `forwarder-check` 3-tab strip + counts + DataTable shape | ✅ Match |
| `forwarder-check` per-userID grouped bulk-bill + 1% juristic + SMS + LINE OA + email | ✅ Match + BEYOND (LINE+email wired vs legacy `//commented out`) |
| `forwarder-check` audit log to `tb_log_forwarder_status` | ✅ BEYOND legacy |
| `warehouse-history` 2-section table (orphan + matched) + 3-mode date filter | ✅ Match (Wave 13 + Wave 20) |
| `warehouse-history` orphan re-link modal | ✅ Match |
| `warehouse-history` dupe detection with red badge + linked IDs | ✅ Match |
| `warehouse-history` lacking-box highlight (rose-50 row tint) | ✅ Match |
| `warehouse-history` 7-day default (vs legacy 1-day) | ✅ BEYOND legacy (UX improvement per ภูม flag) |

---

## 7. ภูม "เบิกเงิน" wording note (legacy verification)

Wave 17 ux-fix used "💰 ทำรายการเบิกเงินค่าตู้" (เบิก) — **CORRECT per legacy**:
- `cnt-hs.php` page title (L103, L195) uses `รายการเบิกเงินค่าตู้` (เบิก).
- `report-cnt.php` success alert (L678-686) reads "ทำรายการจ่ายเงินค่าตู้แล้ว" (จ่าย).
- Both surfaces are legitimate. "เบิก" = filing a withdrawal request (cntStatus=1 → manager approval → cntStatus=2). "จ่าย" = the manager actually paid the bank transfer.

The Wave 17 modal correctly uses "เบิก" because admin is FILING (cntStatus=1). Wording polish: PASS.

---

## 8. Surprises during audit

1. **Legacy `cnt.php` is one-off debug code**, not a feature — 76 LOC hardcoded SQL UPDATE generator for a single `GZ2023` container. Skip-port confirmed.
2. **`report-cnt.php` Mode B and `cnt-hs.php` Mode B+C are mostly duplicated** (~600 LOC each redundant). Both render the same 25-col table + cost-update sub-mode. Pacred sensibly split these into `report-cnt/[fNo]` and `cnt-hs/[id]` — accept the dupe.
3. **Legacy `forwarder-check.php` had LINE + email BOTH commented out** (L75, L100). Pacred WIRES them via `sendNotification()`. This is the rare case where Pacred ALREADY exceeds legacy.
4. **Google Sheets cost-update view** depends on a hardcoded service-account JSON `cryptic-album-325611-f8d67b670cf9.json` + spreadsheet `1zGyZoApdvsVN8UDOQ3c8tlUsa4FxyUvQhYKRV86xGzI`. Pacred correctly dropped it (Phase C decision per cost-update-view.tsx header).
5. **The `forwarder-import-warehouse2.php` is a 525-LOC duplicate** of `.php` (different top tab strip but same table query) — Pacred didn't port the dup. Correct.
6. **Wave 8 `update_forwarder_to5` POST in `report-cnt.php?id=`** (L835-911) does per-row bill-to-customer with SMS. Pacred doesn't port this PER-ROW because the bulk version lives at `forwarder-check`. Operationally fine: admin selects rows on forwarder-check, billing happens there. Not a gap.
7. **`/admin/report-cnt/pay/` page exists as a Wave 17 redirect** — 24 LOC stub that just redirects to `/admin/report-cnt?page=succeed`. Legacy bookmark compat.
8. **Legacy `Sang` (warehouseName=1)** uses gridded width×length×height calc without rounding, hard to admin-edit. Pacred's `<CostRateModal>` adds dual-mode CBM+Weight that legacy could not do for MX.

---

**End of audit.** Net assessment: 3-system cnt-warehouse-forwarder-check sub-platform is **88% / 85% / 70% complete** vs legacy. The remaining 5 P0 items can ship in 1-2 sprints (~12-15 hrs work) and would close the gap for daily operations.
