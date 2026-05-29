# Legacy tb_forwarder intake paths — deep-dive 2026-05-28

**Read-only audit of `D:\REALSHITDATAPCS\pcsc\public_html\member\` to answer:** "รายการนำเข้า (tb_forwarder rows) ในระบบ legacy PCS Cargo มาจากไหนบ้าง — และอะไร auto vs manual?"

**Methodology:** `grep INSERT.*tb_forwarder` across `pcs-admin/**` → 14 file hits, then deep-read each + tracing the upstream cron/Sheets/API mechanism. Customer-facing PHP root (`/member/*.php` outside `pcs-admin/`) was also grepped — confirmed **zero customer-side direct INSERT** into `tb_forwarder` (customers only trigger inserts via shop→forwarder auto-spawn in `pcs-admin/shops.php`).

**Bottom line:** In legacy PCS, `tb_forwarder` rows have **7 distinct intake paths**. **NONE is fully end-to-end automatic.** The closest to "automatic" is JMF (webhook-PUSH from partner), but JMF appears mostly dormant. The "API sync" buttons (MOMO, CN, GOGO, Sheets) **only fetch data into staging tables** — admin must then click a button per-row to commit to `tb_forwarder`. **The "manual" feel of Pacred is correct fidelity to legacy.** What's missing is the **batch-review UI** that legacy ports admin spam through 200+ rows per sync.

---

## §1 Every code path that creates a tb_forwarder row

| # | Path | Source file | Trigger | Frequency | Who/what fills which columns |
|---|---|---|---|---|---|
| 1 | **MOMO manual-merge** | `pcs-admin/api-forwarder-momo.php:247` (`?page=manualUpdate` + `$_POST['add']`) | Admin clicks "สร้างใหม่" button per row on the MOMO check-SM grid (which is pre-populated from `tb_tmp_forwarder_momo` staging) | Per-row admin click (after cron-fed sync runs) | API supplies sm_code · productTracking · QTY · weight · width · length · height · CBM · container_code · sm_date · manifest_date · transport_code (EK/SEA); admin supplies userID · fShipBy · fProductsType (typeCode); system computes fStatus (2 if no manifest, 3 if manifest), fDateToThai (sm_date+7 if EK, +14 if SEA), fWarehouseName=7 (cargo center), fIDorCO='CC'+productID, fWarehouseChina=1 (Guangzhou), pricing via `calPriceForwarder()` |
| 2 | **CN / CargoCenter manual-merge** | `pcs-admin/api-forwarder-cn.php:247` (`?page=manualUpdate` + `$_POST['add']`) | Same UX as MOMO — admin clicks per row on grid fed from `tb_tmp_forwarder_cn` (different source API, same staging→commit pattern) | Per-row admin click | Same column set as MOMO; sourced from `cargothai.tech` API |
| 3 | **JMF webhook (PUSH)** | `pcs-admin/api/update-forwarder/JMFCARGO/PUT/index.php:269` | JMF Cargo's external server POSTs to our endpoint with `token=dZWm4pQICIEqtLFfBBhFIxHZgiIWFT7mwz390ddx9cHeslPlYhQzelL7YR8Q3jFu` (hard-coded shared secret) | Whenever JMF pushes (out of our control) | JMF supplies fTrackingCHN · fCabinetNumber · fAmount · fWeight · fWidth · fLength · fHeight · fVolume · fStatus · fDateStatus2 · fDateStatus3 · fProductsType · fIDorCO · fTransportType · fWarehouseChina · fWarehouseName · userID (param `userIDSub`); system computes adminIDCreator='JMF', pricing via `calPriceForwarder()`, addresses from `tb_address_main` or fallback PCS warehouse |
| 4 | **Sheets-Sang (warehouse "Sang" partner)** | `pcs-admin/api-sheets-sang-2023.php:185` (`$_POST['add']`) | Cron `update-sheet-sang.php` pulls Google Sheet tab `API-SangNew` → writes `database/sheet-sang/index.json` → admin opens this page → reviews each row → clicks per-row "submit" button | Per-row admin click (after cron fetches Sheet) | Sheet supplies fTrackingCHN · fAmount · weight · CBM · cabinetNumber · transport type · costSheet · dateStatus2/3; admin selects userID · fShipBy · fProductsType in dropdown; system sets fWarehouseName=1, computes fStatus (2 if no fDateToThai, 3 if has it), price via `calPriceForwarder()` |
| 5 | **Sheets-MK** | `pcs-admin/api-sheets-mk.php:191` (`$_POST['add']`) | Same as Sang; cron pulls Google Sheet tab `MK` → `database/mkcargo/index.json` → admin per-row commit | Per-row admin click | MK Cargo (Mukgo) warehouse data |
| 6 | **Sheets-MX** | `pcs-admin/api-sheets-mx.php:191` (`$_POST['add']`) | Same; cron pulls Google Sheet tab `MX` → `database/mxcargo/index.json` | Per-row admin click | MX Cargo warehouse |
| 7 | **Sheets-CTT** | `pcs-admin/api-sheets-ctt.php:191` (`$_POST['add']`) | Same; cron pulls Google Sheet tab `CTT-New` → `database/ctt/index.json` | Per-row admin click | CTT Cargo warehouse |
| 8 | **Customer shop→forwarder auto-spawn** | `pcs-admin/shops.php:1677` (when admin approves a shop order with no existing refOrder forwarder) | When admin confirms a shop order's tracking arrival, the system auto-creates the linked tb_forwarder if one doesn't exist (`if(empty($_POST['refOrder']))`) | Per-shop-order admin confirm (one INSERT per cTrackingNumber as it arrives) | fTrackingCHN from form, refOrder=hNo (shop order #), userID/fShipBy/fTransportType/fCover from shop order, fPriceUpdate from form, addresses from form, **fStatus defaults to 1 (รอสินค้าเข้าโกดัง)** because no weight/dims yet; admin will weigh & dimension it later via `forwarder.php` edit flow |
| 9 | **Manual admin add (the "blank form")** | `pcs-admin/forwarder.php:115` (`$_POST['save']`) | Admin opens `/admin/forwarders/add` and types every field by hand | Whenever admin wants to create a row outside any sync (e.g. walk-in, missing data, recovery) | Admin types: fTrackingCHN, fDetail, fAmount, userID, fShipBy, fTransportType, addressID; system populates address from `tb_address` table, fStatus defaults to **1 (รอสินค้าเข้าโกดัง)** by INSERT-time default |
| 10 | **CSV import** | `pcs-admin/import-excel.php:518` | Admin uploads .csv via dropify, then approves rows | Per CSV file (admin batch upload) | CSV supplies fTrackingCHN, fDetail, fAmount, userID, fShipBy, fTransportType, fWeight, dims, fVolume, fWarehouseChina, fProductsType, fCabinetNumber; pricing via `getPrice()`, cost+profit calculated; **fStatus from CSV row** |
| 11 | **GOGO Sheets ingest (UI-only · no INSERT executed)** | `pcs-admin/api-forwarder-gogo.php` (no INSERT INTO tb_forwarder in file) | Cron pulls Google Sheet tab `gogo` → `database/gogo/index.json` → admin opens this page → admin then commits each row through **a separate handler** (likely `forwarder.php` or `forwarder-search.php` based on the form action) | Admin per-row review | This file is **read+display only**; the actual INSERT happens when admin clicks the per-row button which submits the form elsewhere |

**Total: 10 distinct INSERT paths · 6 of them are "API/Sheet-fed but admin clicks per row" · 2 are "PUSH webhook from partner" · 1 is shop→forwarder auto-spawn · 2 are pure manual.**

### Cross-cutting: ALL paths call shared logic

Every path (except shop→forwarder auto-spawn) calls these helpers from `member/include/function.php`:
- **`calPriceForwarder($conn, $userID, $coID, ..., $fWeight, $fVolume, $fProductsType, $fTransportType, ...)`** — computes the customer-facing price (fTotalPrice, fRefRate, fRefPrice) using customer's discount tier, custom rate, comparison rules — returns 3 candidate prices and the path picks the "max" (calPriceType==0), "weight-only" (1), or "CBM-only" (2)
- **`calPriceForwarderCost($conn, $fCabinetNumber, $fVolume, $fWeight, $fWarehouseChina, $fWarehouseName, $fProductsType, $fTransportType)`** — computes Pacred's cost (fCostTotalPrice), used for profit calc
- **`setPayMethodShip($fShipBy)`** — derives payMethod from shipping mode (PCS/PCSE/PCSF)

Every successful INSERT (paths 1-8) also fires:
- `sendMail($userEmail, $title, $body)` — customer notification
- `sendLine($userLineNotify, $sMessage)` — LINE Notify push to customer (if they have userLineNotify configured)
- `lineNotifyForwarder($sMessage)` — admin notification to a group

---

## §2 MOMO sync — the most-important automation path

**ภูม's question implicitly orbits this one** because ปอน just landed MOMO API. Let me walk it carefully.

### §2.1 The two-stage architecture

MOMO uses a **staging-then-commit** pattern. The "sync" never directly creates `tb_forwarder` rows — it only refreshes a staging table.

```
            ┌────────────────────────────┐
            │ MOMO upstream API          │   (Tiso AI / Cargo Center vendor)
            │ tiso-ai.com/api-cn-wh-pcs- │
            │ old/?action=import_track   │
            └────────────┬───────────────┘
                         │ admin clicks "ดึงข้อมูล" button
                         │ (or cron-triggered URL hit)
                         ▼
            ┌────────────────────────────────────────┐
            │ pageUpdateAPI.php                      │
            │ — Calls API with Sdate..Edate window   │
            │ — Loops response, INSERTs/UPDATEs into │
            │   tb_tmp_forwarder_momo (header)       │
            │   tb_tmp_forwarder_item_momo (lines)   │
            │ — NO tb_forwarder INSERT yet           │
            └────────────┬───────────────────────────┘
                         │ admin opens pageManualUpdate.php
                         │ — joins tmp_*_momo to tb_forwarder
                         │ — shows "สร้างใหม่" / "อัปเดตเข้าจีน" /
                         │   "อัปเดตส่งมาไทย" buttons per row
                         ▼
            ┌────────────────────────────────────────┐
            │ Admin clicks "สร้างใหม่" (POST 'add')  │
            │ → api-forwarder-momo.php:247           │
            │ → INSERT INTO tb_forwarder ...         │
            │ → sendMail + sendLine + adminNotify    │
            └────────────────────────────────────────┘
```

### §2.2 Upstream API call (pageUpdateAPI.php L82-93)

```php
$curl = curl_init();
curl_setopt_array($curl, array(
    CURLOPT_URL => 'https://tiso-ai.com/api-cn-wh-pcs-old/?action=import_track&date='.$Sdate.'+'.$Edate,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 0,
    CURLOPT_CUSTOMREQUEST => 'GET',
));
$response = curl_exec($curl);
$data = json_decode($response, true);
```

- **No auth token** in this call — relies on IP-allowlist or being internal-only (security smell but not in scope)
- Default date window is "today only" (`$Sdate = date('Y-m-d')`)
- Returns `$data['data']` array of SM (Shipping Manifest) records, each with a `product_list` of trackings

### §2.3 Staging-table INSERT (pageUpdateAPI.php L190-232)

For each SM-header row: dedupe-check on `sm_code` then either UPDATE existing or INSERT new into `tb_tmp_forwarder_momo` (25+ columns: container_name, container_code, due_date, box_total, box_weight, box_cbm, sm_code, sm_date, manifest_date, estimated_date, etd, eta, re, created_at, note, note_amount, transport_name, transport_code, warehouse_name, warehouse_code, status, status_date, sm, userID, hNo, api_lastTimeUpdated).

For each tracking inside `product_list`: same UPSERT into `tb_tmp_forwarder_item_momo` (productID, productTracking, productQTY, productWidth/Length/Height, productWeightAll, productCBMAll, productTypeCode, containerCode, userID, productCostCHN, transport_code).

**Key point:** This step is **information-gathering only**. The customer-facing `tb_forwarder` table is untouched.

### §2.4 The commit step — admin per-row click

Admin then navigates to `?page=manualUpdate&date=<Sdate-Edate>`. The page (`pageManualUpdate.php`):

1. Reads `tb_tmp_forwarder_momo` rows for the date window
2. **LEFT JOINs against `tb_forwarder`** (L170 `SELECT ID, fStatus, refOrder, fCover, fTrackingCHN, fProductsType, userID FROM tb_forwarder WHERE DATE(fDate)>'2024-11-01';`)
3. For each row, decides which button to show:
   - **"สร้างใหม่"** (`name="add"`) — if no existing tb_forwarder with this tracking, show red button
   - **"อัปเดตเข้าจีน"** (`name="update"`) — if existing row has `fStatus<2` and no manifest yet — update to status 2 (เข้าโกดังจีน)
   - **"อัปเดตส่งมาไทย"** (`name="update"`) — if existing row has `fStatus<3` and manifest exists — update to status 3 (กำลังส่งมาไทย)

Each button submits ONE row to `api-forwarder-momo.php?page=manualUpdate` (NOT a bulk submit — one HTTP POST per click).

### §2.5 The INSERT (api-forwarder-momo.php L247-262)

When the admin clicks "สร้างใหม่":

```sql
INSERT INTO `tb_forwarder` (
  subUserID, payMethod, fUserCompany, priceOther, fWarehouseName, fDateStatus2, fDateStatus3,
  fCostTotalPriceSheet, fStatus, fTrackingCHN, fAmount, fDate, userID, fShipBy, fTransportType,
  adminIDCreator, fAddressName, fAddressLastname, fAddressNo, fAddressSubDistrict, fAddressDistrict,
  fAddressProvince, fAddressZIPCode, fAddressNote, fAddressTel, fAddressTel2,
  fDateToThai, fWeight, fWidth, fLength, fHeight, fVolume, fTransportPrice, fWarehouseChina,
  fProductsType, fDiscount, crate, priceCrate, fTransportPriceCHNTHB, priceMore, customRate,
  fRefRate, fRefPrice, fTotalPrice, customRateKG, customRateCBM, fCabinetNumber,
  fDateContainerClose, fIDorCO, fAmountCount, smPCS
) VALUES (...)
```

- **fStatus** set from `$_POST['fStatusNew']` which is computed earlier:
  - `fStatusNew = 2` (ถึงโกดังจีนแล้ว) if no manifest date yet
  - `fStatusNew = 3` (ปิดตู้ ส่งมาไทย) if manifest date exists
- **fDateToThai** = manifest_date + 7 days (EK = ทางรถ) or + 14 days (SEA)
- **fWarehouseName = 7** ("cargo center" — MOMO's identifier)
- **fIDorCO = 'CC' + productID** (CC prefix marks origin as CargoCenter/MOMO)
- **fAmountCount = 1** (one tracking per row)
- **smPCS = $sm** (shipping manifest ref)
- **payMethod** derived from fShipBy via `setPayMethodShip()`
- **Pricing** (customRate, fRefRate, fRefPrice, fTotalPrice) computed via `calPriceForwarder()` using customer's tier
- **Addresses** lifted from `tb_address_main` of the userID — if no main address, defaults to "รับที่โกดัง PCS กทม" (12 ซอย เพชรเกษม 77 แยก 3-6)

Side-effect: `sendMail()` + `sendLine()` to customer, `lineNotifyForwarder()` to admin group.

### §2.6 What's "automatic" about MOMO

- **AUTOMATIC:** the staging-table refresh (admin clicks a single date-range button, system fetches all SM records and dumps to staging)
- **MANUAL:** the per-row commit to `tb_forwarder` (admin has to click "สร้างใหม่" or "อัปเดต..." on every row — there's **no bulk "approve all" button**)

This is the key insight: **even legacy MOMO is not "click once, all rows land in tb_forwarder"**. The admin has to click 100+ times per sync window to commit everything.

---

## §3 CN / CargoCenter sync

**Identical structure to MOMO**, different upstream API.

### Upstream API (pageUpdateAPI.php L87)

```php
CURLOPT_URL => 'https://cargothai.tech/api/service/GetContainer?_token=a807f4fe8c5bbf0010f6b3abfc52b4&Sdate='.$Sdate.'&Edate='.$Edate.'&limit='.$limit.'&page='.$pageAPI,
```

- Uses bearer token `a807f4fe8c5bbf0010f6b3abfc52b4` (hard-coded — security smell)
- Paginated (limit/page params)
- A second endpoint `GetDetail?sm=<sm_code>` fetches per-SM product list

### Staging tables: `tb_tmp_forwarder_cn` (likely named, same shape as MOMO's)
### Commit code: `api-forwarder-cn.php:247` — same INSERT shape as MOMO, also uses fWarehouseName='7' and fIDorCO='CC'+productID
### Same admin per-row click pattern

CN is for the **same warehouse partner** (Cargo Center group) under a different vendor/brand. Likely legacy fork — both endpoints exist for redundancy or differentiation between specific shippers.

---

## §4 JMF sync (legacy partner status)

**Status: PROBABLY DORMANT / LOW-VOLUME.** The JMF dashboard (`pcs-admin/api-forwarder-jmf.php` → `home.php`) shows the JMF logo and "0 บาท / 0 รายการ" stat cards — appears unused.

### Architecture: PUSH webhook (the only PUSH path)

JMF Cargo runs their own platform and **POSTs to our endpoint** when they update their data. Our endpoint:

`pcs-admin/api/update-forwarder/JMFCARGO/PUT/index.php`

- Auth: hard-coded shared secret `token=dZWm4pQICIEqtLFfBBhFIxHZgiIWFT7mwz390ddx9cHeslPlYhQzelL7YR8Q3jFu` (POSTed in form body)
- Header: `Content-Type: application/json; charset=UTF-8` (returns JSON; receives POST form-urlencoded)
- Method: if `tb_forwarder` row with this `fTrackingCHN` already exists → UPDATE (line 152); else → INSERT (line 269)
- Note the inserted row has `adminIDCreator='JMF'` (literal string) — marks the origin

### What JMF supplies
- fTrackingCHN, userIDSub (→ userID), fStatus, fDateStatus2, fDateStatus3, fWarehouseChina, fWarehouseName, fTransportType, fCabinetNumber, fIDorCO, fDateContainerClose, fAmount, fCover, fIMG1..4, fProductsType, fWeight/Width/Length/Height/Volume, fCrate, fCostTotalPriceSheet

### Why dormant
JMF Cargo (JMF บริษัท เจเอ็มเอฟ คาร์โก้ อิมพอร์ต เซอร์วิส จำกัด, tax 0735563005872) appears to be an older partner. The home dashboard shows hardcoded zeros — none of the stat cards are queried from data. The whole flow is plumbed but probably unused in current operations.

**Pacred decision implication:** JMF integration is **probably not worth porting** unless there's a contractual reason. Confirm with ภูม before discarding.

---

## §5 Google Sheets sync (CTT / MK / MX / Sang warehouses + GOGO)

**This is the dominant intake mechanism** by row volume — 4 Thailand-China warehouse partners feed via a shared Google Sheets workbook.

### §5.1 The single source workbook

ALL 4 partners (and GOGO) share one Google Sheet:

```
spreadsheetId = "15g49hwP8dx1bOVbVKcp1V33I_o1gSLJYeqEIdRS4Mpk"
```

- 5 named tabs: `API-SangNew`, `CTT-New`, `MK`, `MX`, `gogo`
- Auth via service account JSON at `pcs-admin/cryptic-album-325611-f8d67b670cf9.json` (Google Cloud project `cryptic-album-325611`)
- **Each partner's warehouse staff types/imports their daily container data into their tab in this shared Google Sheet** — that's the human input source

### §5.2 The cron — `pcs-admin/api/autorun/update-sheet-sang.php`

Despite the file name, this **single PHP script pulls all 5 tabs** in sequence:

```php
$service = new Google_Service_Sheets($client);
$spreadsheetId = "15g49hwP8dx1bOVbVKcp1V33I_o1gSLJYeqEIdRS4Mpk";

// Sang
$range = 'API-SangNew!A1:U';
$response = $service->spreadsheets_values->get($spreadsheetId, $range);
file_put_contents('../../database/sheet-sang/index.json', json_encode($values));

// CTT
$range = 'CTT-New!A1:R';
file_put_contents('../../database/ctt/index.json', ...);

// MK
$range = 'MK!A1:T';
file_put_contents('../../database/mkcargo/index.json', ...);

// MX
$range = 'MX!A1:T';
file_put_contents('../../database/mxcargo/index.json', ...);

// gogo
$range = 'gogo!A1:T';
file_put_contents('../../database/gogo/index.json', ...);

// Log
file_put_contents('system_log.json', $newDataJson);
```

The `system_log.json` shows recent successful runs (May 22 15:00 — repeated every few seconds at peak times, suggesting multiple manual triggers per day OR cron + manual mixed).

### §5.3 Cron schedule

**No `crontab` file exists** in the repo. The script is **invoked by external cPanel cron** OR by an admin manually visiting the URL. From `system_log.json` activity pattern (multiple hits within the same minute, then long gaps), it appears to be **manually triggered by admin** at the start of each day or when warehouse pushes update — not on a fixed timer.

This means: **"automatic Sheets sync" is admin-pushed, not time-triggered.**

### §5.4 The admin commit page (per partner)

Each partner has its own admin page:
- `pcs-admin/api-sheets-sang-2023.php` — reads `database/sheet-sang/index.json`
- `pcs-admin/api-sheets-mk.php` — reads `database/mkcargo/index.json`
- `pcs-admin/api-sheets-mx.php` — reads `database/mxcargo/index.json`
- `pcs-admin/api-sheets-ctt.php` — reads `database/ctt/index.json`

Each renders a big table where every row has its OWN admin form with a "submit" button. The handler at the top of the file (`if(isset($_POST['add']))`) processes ONE row at a time, INSERTs into `tb_forwarder`, and side-effects mail/LINE.

### §5.5 GOGO is the same pattern but DIFFERENT

`api-forwarder-gogo.php` is a viewer page over `database/gogo/index.json`. It does NOT itself contain `INSERT INTO tb_forwarder`. The per-row commit must go through another handler — likely the admin types a userID and clicks a button that POSTs to `forwarder.php` (path #9 — manual admin add) using prefilled defaults.

---

## §6 Manual entry — admin "add forwarder" form

**File:** `pcs-admin/forwarder.php:115` (`?page=add` or no page param, with `$_POST['save']`)

The most boring path. Admin opens the blank form, types every field, picks a customer, picks an address, hits save. INSERTs with the smallest column set (no weight/dims/pricing — those get filled later when goods arrive). **fStatus defaults to 1 (รอสินค้าเข้าโกดัง).**

When is this used in legacy:
- Walk-in customer reports a tracking → admin creates the placeholder row manually
- Customer hands over a tracking off-channel (LINE, phone) → admin types it
- A row was somehow deleted and needs recreation
- API sync missed a row and admin types it manually instead of waiting

In current operations this is rare but ALWAYS needed as a fallback.

---

## §7 Customer-side intake — shop→forwarder auto-spawn

**File:** `pcs-admin/shops.php:1677-1721`

**The closest thing to "fully automatic" customer-side intake** — but it's actually admin-triggered, just downstream of customer shop-order creation.

### The trigger
When a shop order moves through its lifecycle:
1. Customer creates shop order (`tb_header_order` row) — `/service-order/` flow
2. Admin processes the order — receives goods, generates tracking numbers (`tb_order` rows with `cTrackingNumber`)
3. **For each tracking number, admin confirms arrival → if no existing forwarder ref, system auto-spawns one in `tb_forwarder`**

### The INSERT (shops.php:1677)

```sql
INSERT INTO `tb_forwarder` (
  `fFreeShipping`, `fTrackingCHN`, `fDetail`, `fDate`, `userID`, `fShipBy`, fCover,
  `fPriceUpdate`, `fTransportType`, `adminIDCreator`, `fAddressName`, `fAddressLastname`,
  `fAddressNo`, `fAddressSubDistrict`, `fAddressDistrict`, `fAddressProvince`,
  `fAddressZIPCode`, `fAddressNote`, `fAddressTel`, `fAddressTel2`, `refOrder`, fShippingService
) VALUES (...)
```

Notes:
- **refOrder = hNo** (the shop order #) — this is the key linkage. The forwarder row is forever bound to its parent shop order
- **fCover = $cImages** — the product image from the shop order (so customer sees their own product photo on the forwarder card)
- **fPriceUpdate = $fPriceUpdate** — extra service fee inherited from shop order
- **No weight/dims/CBM yet** — those columns are NULL until admin weighs the package
- **fStatus DEFAULTS to 1** ("รอสินค้าเข้าโกดัง") because no goods received yet — the WHOLE POINT is this row is a future-promise placeholder

Side-effects:
- Email + LINE Notify to customer ("รายการฝากนำเข้าใหม่ #ID — รอสินค้าเข้าโกดังจีน")
- LINE Notify to admin group
- If all tracking numbers in the shop order now have forwarders → update parent `tb_header_order.hStatus` to 5 (สำเร็จ)
- If the shop order had a promo applied → copy promotion into `tb_promotion` with the new fID

### Why this matters for Pacred

This is the path where customer behaviour (placing a shop order) **chain-creates a forwarder row** without any sync API involvement. Pacred ported this as Wave 20 P0 (per CLAUDE.md "Wave 21 P0 — shop→forwarder auto-spawn (taxonomy §6 gap)"). Verify the Pacred port matches this 21-column INSERT and the email/LINE side-effects.

---

## §8 Summary — which paths are AUTOMATIC vs MANUAL in legacy

### Fully automatic (no admin click between data source and tb_forwarder row): 1 path
- **#3 JMF webhook** — JMF POSTs to our endpoint, we INSERT/UPDATE immediately. The closest legacy has to "set-it-and-forget-it". But — JMF is dormant.

### Semi-automatic (cron/API fetches into staging, admin clicks per row to commit): 7 paths
- **#1 MOMO manual-merge** — high volume in current ops, per-row click
- **#2 CN/CargoCenter manual-merge** — moderate volume, per-row click
- **#4 Sheets-Sang** — moderate volume, per-row click (after manual cron-trigger or scheduled cron)
- **#5 Sheets-MK** — moderate volume, per-row click
- **#6 Sheets-MX** — moderate volume, per-row click
- **#7 Sheets-CTT** — moderate volume, per-row click
- **#10 CSV import** — admin uploads CSV, then per-row approval

### Fully manual (human types every field): 2 paths
- **#9 Manual admin add** — blank form, walk-in customer scenarios
- **#11 GOGO viewer + manual commit** — admin reviews GOGO sheet, then manually adds rows via the standard form

### Special: customer-triggered auto-spawn: 1 path
- **#8 shop→forwarder auto-spawn** — customer creates shop order, admin confirms each tracking arrival, system auto-INSERTs the forwarder row (placeholder, fStatus=1, no weight yet)

---

## §9 What the team's confusion likely is

### What ภูม / พี่ป๊อป is missing about legacy

> **"The new system feels manual"** — this is **correct**, because **legacy is also manual**.

The legacy MOMO/CN/Sheets flow is not "click sync → 200 rows magically appear in tb_forwarder". It's:
1. Admin clicks a sync button (or cron pre-syncs)
2. **Staging table fills with up to 200+ rows from upstream**
3. Admin opens the per-row review grid
4. **Admin clicks "สร้างใหม่" on every row that doesn't yet have a forwarder** (the system pre-computes the right button per row)
5. Each click = one HTTP POST = one tb_forwarder INSERT = one customer email + one LINE Notify

**The "automation" is the staging refresh, not the row commit.** That's a deliberate human-in-the-loop checkpoint — admin verifies userID lookup, customer's chosen shipping mode (PCSE/PCSF), and product type before the row commits and the customer is notified.

### Why this design exists in legacy

Three reasons admin keeps a manual click on the row commit:
1. **userID matching is unreliable** — the upstream warehouse types the customer code into the sheet; if a digit is wrong, the wrong customer gets billed. Per-row click forces admin to verify the userID dropdown matches what the upstream typed.
2. **Pricing is customer-specific** — `calPriceForwarder()` needs `coID`, `userComparison`, custom rates. The admin's click pulls all that context per-row.
3. **Customer notifications are expensive** — bulk commit = bulk emails + bulk LINE. The per-row click rate-limits the alerts naturally.

### What's likely different between Pacred and legacy (causing the "manual feel" complaint)

Compare these UX features in legacy vs Pacred:

| Feature | Legacy | Pacred (suspect status) |
|---|---|---|
| Staging table refresh button | Big red "ดึงข้อมูลจาก API" with date-range picker, shows count "บันทึกใน PCS : ในระบบ MOMO = 187 : 200" | **Likely present** (ปอน landed MOMO API sync) — but may not show the "X of Y" count |
| Per-row review grid | Big DataTable with pre-computed "สร้างใหม่" / "อัปเดตเข้าจีน" / "อัปเดตส่งมาไทย" button per row | **Likely missing or partial** — Pacred may force admin into the slow blank-form path instead of the review-grid pattern |
| Auto-pre-fill from staging | When admin clicks "สร้างใหม่", every field is pre-filled from `tb_tmp_forwarder_momo` + `tb_tmp_forwarder_item_momo` (admin only verifies userID + fShipBy) | **Likely missing** — Pacred admin may be re-typing fields legacy auto-fills |
| "Skip already-existing" filtering | Grid hides rows that already have a tb_forwarder match, shows only NEW ones to commit | **Likely missing** — Pacred may show all rows including dupes |
| Status pre-computation | Legacy pre-computes `fStatusNew` (2 if no manifest, 3 if manifest) before showing the button | **Likely missing** — Pacred admin may pick status manually each time |

**Recommendation for ภูม:** confirm with พี่ป๊อป which scenario is the pain point. Two possibilities:
- **(a)** พี่ป๊อป is fine with per-row clicks (legacy parity) — gap is the review-grid UX (missing pre-fill, missing per-row button)
- **(b)** พี่ป๊อป wants TRUE automatic commit (a UX upgrade beyond legacy) — that's a Phase-C enhancement, NOT a faithful-port requirement, and risks the customer-misbilling problem legacy carefully avoided

If (a), Pacred Wave-25-or-later needs the review-grid pattern. If (b), it's a Phase-C item that needs explicit owner sign-off because it diverges from "faithful port" + introduces a real business risk (wrong customer billed).

### Also worth flagging to ภูม

- **JMF webhook is probably dead** — confirm with พี่ป๊อป before porting it. If still in use, the hard-coded shared secret needs rotation as part of the port.
- **All 4 Sheets partners share ONE Google Sheet workbook** (`15g49hwP8dx1bOVbVKcp1V33I_o1gSLJYeqEIdRS4Mpk`) with 5 tabs — Pacred can replicate this with one cron + one Sheets API key, not 4 separate integrations.
- **The 2 hard-coded API tokens** in legacy (`a807f4fe8c5bbf0010f6b3abfc52b4` for cargothai, `dZWm4pQ...` for JMF) — both are checked into the repo. Port them to env vars + rotate during the Pacred migration.
- **shop→forwarder auto-spawn is the ONLY path with refOrder set** — Pacred must preserve this linkage or shop-order → forwarder navigation breaks.
- **Customer never directly creates a tb_forwarder row in legacy** — every path is admin-mediated. If Pacred has any customer-side direct INSERT, that's a divergence (likely intentional Phase-C improvement, but flag it).

---

## Appendix — file × line reference for fast lookup

| Path | File | INSERT line | Key trigger |
|---|---|---|---|
| MOMO commit | `pcs-admin/api-forwarder-momo.php` | 247 | `?page=manualUpdate` + POST `add` |
| MOMO staging refresh | `pcs-admin/include/pages/api-forwarder-momo/pageUpdateAPI.php` | 226 (`tb_tmp_forwarder_momo`) + 328 (`tb_tmp_forwarder_item_momo`) | `?page=updateAPI` + GET `date` |
| MOMO admin per-row grid | `pcs-admin/include/pages/api-forwarder-momo/pageManualUpdate.php` | reads staging + tb_forwarder | `?page=manualUpdate` GET |
| CN commit | `pcs-admin/api-forwarder-cn.php` | 247 | `?page=manualUpdate` + POST `add` |
| CN staging refresh | `pcs-admin/include/pages/api-forwarder-cn/pageUpdateAPI.php` | 241 + 331 | `?page=updateAPI` |
| JMF webhook (PUSH receiver) | `pcs-admin/api/update-forwarder/JMFCARGO/PUT/index.php` | 269 (INSERT) + 152 (UPDATE) | external POST with bearer token |
| Sheets-Sang | `pcs-admin/api-sheets-sang-2023.php` | 185 | POST `add` |
| Sheets-MK | `pcs-admin/api-sheets-mk.php` | 191 | POST `add` |
| Sheets-MX | `pcs-admin/api-sheets-mx.php` | 191 | POST `add` |
| Sheets-CTT | `pcs-admin/api-sheets-ctt.php` | 191 | POST `add` |
| Sheets cron (all 5 tabs) | `pcs-admin/api/autorun/update-sheet-sang.php` | (no INSERT — writes JSON files) | external cron URL hit |
| GOGO viewer | `pcs-admin/api-forwarder-gogo.php` | (no INSERT — display only) | admin opens page |
| Shop→forwarder auto-spawn | `pcs-admin/shops.php` | 1677 | admin confirms shop order tracking arrival |
| Manual admin add | `pcs-admin/forwarder.php` | 115 | POST `save` |
| CSV import | `pcs-admin/import-excel.php` | 518 | POST `save` after CSV upload |
| `tb_forwarder_import2` (barcode arrival ledger — NOT tb_forwarder) | `pcs-admin/include/pages/barcode-import/index.php` | 140, 155 | scanner POST |
| `tb_forwarder_driver` (delivery jobs — NOT tb_forwarder) | `pcs-admin/forwarder-driver.php` | 46 | admin creates delivery batch |

---

**End of deep-dive.** Confidence: high — `INSERT.*tb_forwarder` grep is canonical for "every path that creates a row", I read each hit and traced the upstream. The only thing I haven't verified is whether external cPanel cron actually hits `update-sheet-sang.php` on a fixed schedule (the `system_log.json` activity pattern looks admin-triggered, but cPanel cron could explain the regular daily clusters too) — confirm with พี่เดฟ if it matters.
