# Legacy cabinet (เลขตู้) lifecycle — deep-dive 2026-05-28

> Source-of-truth: `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\*` (legacy PHP, read-only)
> Question: ใครคีย์ `tb_forwarder.fCabinetNumber` · เมื่อไหร่ · คีย์แล้วเกิดอะไรขึ้น?
> Answers ภูม's specific hypothesis: *"MOMOคีย์เลขตู้ พอคีย์แล้วสถานะแม่งจะเปลี่ยนทันทีเลย"*

---

## §1 TL;DR — answer ภูม's question (the honest answer)

**MOMO ไม่ได้คีย์เลขตู้เองโดยอัตโนมัติ — admin staff คีย์ผ่านปุ่ม "สร้างใหม่/อัปเดต"** บนหน้า `api-forwarder-momo.php?page=manualUpdate` ซึ่ง form ดึง `container_code` มา **prefill** จาก `tb_tmp_forwarder_momo` (staging table) ที่ได้จากการ pull MOMO API ก่อนหน้า. Staff คลิกปุ่มยืนยัน → INSERT/UPDATE `tb_forwarder` พร้อม fCabinetNumber + fStatus + fDateToThai + fDateContainerClose ในการ submit ครั้งเดียวกัน.

**สถานะไม่ได้เปลี่ยนเพราะ cabinet ถูก SET — มันเปลี่ยนเพราะ form submit ตั้ง `fStatus=3` พร้อมกัน เมื่อ `fDateToThai` (manifest_date จาก MOMO) มีค่า.** Logic คือ: *"ถ้า manifest_date มี → fStatus=3 (ส่งมาไทย) → fCabinetNumber รับค่า"*. ทั้งสามอย่าง (status + cabinet + date) มาด้วยกันใน UPDATE ตัวเดียว — แต่ trigger คือคน คลิกปุ่ม, ไม่ใช่ trigger DB / observer.

**ไม่มี trigger MySQL · ไม่มี cron · ไม่มี observer / mid-API auto-flip** — ทุกการเปลี่ยน fStatus มาจาก admin click ปุ่มอย่างชัดเจน. ภูม's mental model **ถูกครึ่งหนึ่ง**: MOMO data feed ตู้มาให้จริง (staged ใน tmp table) แต่ admin ต้องคลิก "สร้างใหม่/อัปเดต" เพื่อ commit เข้า `tb_forwarder`. แต่ที่ภูม **เข้าใจถูกเต็มๆ** คือ — เมื่อคลิกครั้งเดียวนั้น status + cabinet + dates ทั้งหมดถูก set พร้อมกัน (atomic UPDATE) → ดูเหมือนระบบทำเองทั้งหมด เพราะ form ตัวเดียวทำงานหลายอย่างพร้อมกัน.

---

## §2 Every WRITE to tb_forwarder.fCabinetNumber (complete enumeration)

| File:line | Mode | Trigger (POST var) | Source of value | Side effects in same UPDATE |
|---|---|---|---|---|
| `api-forwarder-momo.php:260` | INSERT (new row) | `$_POST['add']` from `manualUpdate` page | `$_POST['container_code']` (form-prefilled from `tb_tmp_forwarder_momo.container_code`) | fStatus + fDateToThai + fDateContainerClose all set together |
| `api-forwarder-momo.php:444` | UPDATE existing | `$_POST['update']` from `manualUpdate` page | Same as above | Same as above |
| `api-forwarder-cn.php:260` | INSERT | `$_POST['add']` (CN cargo) | `$_POST['container_code']` | fStatus + fDateToThai + fDateContainerClose |
| `api-forwarder-cn.php:444` | UPDATE | `$_POST['update']` | Same | Same |
| `api-sheets-sang-2023.php:198` | INSERT | sheet-row "บันทึกใหม่" (manual `add`) | `$_POST['fCabinetNumber']` (user types into row) | fStatus auto=3 IF fDateToThai filled, else =2 |
| `api-sheets-sang-2023.php:493` | UPDATE | sheet-row "อัปเดต" | Same | Same |
| `api-sheets-mk.php:204` | INSERT | sheet-row save | `$_POST['fCabinetNumber']` | fStatus auto=3/2 by fDateToThai presence |
| `api-sheets-mk.php:443` | UPDATE | Same | Same | Same |
| `api-sheets-mx.php:198/443` | INSERT/UPDATE | Same | Same | Same |
| `api-sheets-ctt.php:~198/443` | INSERT/UPDATE | Same | Same | Same |
| `api/update-forwarder/JMFCARGO/PUT/index.php:158/282` | UPDATE/INSERT | external JMF API PUT call | `$_POST['fCabinetNumber']` from JMFCARGO upstream | fStatus + fDateToThai together |
| `forwarder.php:1533` | UPDATE (cabinet-ONLY) | `$_POST['update_fCabinetNumber']` from edit modal | `$_POST['fCabinetNumber']` (admin types in modal) | **ONLY adminIDUpdate** — fStatus untouched |
| `import-excel.php:775/990` | UPDATE | `$_POST['update']` from Excel batch import | spreadsheet column | fStatus set in same UPDATE |
| `report-cnt.php:935` | UPDATE on `tb_cost_container` (not tb_forwarder) | "customRate" form submit | n/a |
| `cnt.php:51` | NOT a writer — `echo`s SQL only (dev/debug page) | — | — | — |

**Total real writers to `tb_forwarder.fCabinetNumber`: ~12 distinct code paths in 9 files** + 6 sheets variants (sang/mk/mx/ctt all the same shape).

---

## §3 MOMO sync — does it carry cabinet?

**YES — MOMO upstream sends `container_code` as part of every SM record.**

**Flow** (read in order):
1. **Pull stage** — `api-forwarder-momo.php?page=updateAPI` calls upstream MOMO `cargothai.tech` API → returns array of SM records, each carrying `container_code` + `container_name` + `manifest_date` + `estimated_date` + product_list (`include/pages/api-forwarder-momo/pageUpdateAPI.php:164`).
2. **Stage table** — INSERT/UPDATE `tb_tmp_forwarder_momo` with `container_code` (line 197, 227, 229) — this is a TEMP table, not the canonical one.
3. **Item stage** — INSERT into `tb_tmp_forwarder_item_momo` with line items (line 328-332).
4. **Admin review** — `api-forwarder-momo.php?page=manualUpdate` shows a big table joining `tb_tmp_forwarder_item_momo` + `tb_tmp_forwarder_momo` with **per-row checkboxes & "สร้างใหม่/อัปเดต" buttons** (`include/pages/api-forwarder-momo/pageManualUpdate.php:193-365`).
5. **Commit** — admin clicks button → form POST → handler in `api-forwarder-momo.php:30-267` (add) or `:272-470` (update) → INSERT/UPDATE `tb_forwarder` with the staged values.

Key code (api-forwarder-momo.php:151):
```php
if($fStatusNew=='3'){
    $fCabinetNumber = mysqli_real_escape_string($conn, $_POST['container_code']);
    if(!empty($_POST['manifest_date'])){
        $manifest_date = ...
        if($fTransportType==1){ // truck
            $fDateToThai=(new DateTime ...)->modify('+7 day')->format('Y-m-d');
        }else{ // sea
            $fDateToThai=(new DateTime ...)->modify('+14 day')->format('Y-m-d');
        }
        $fDateContainerClose = $manifest_dateFormat;
    }
}else{
    $fCabinetNumber = '';
    $fDateToThai = '';
}
```

**Crucial:** `fStatusNew` is computed in the table renderer (`pageManualUpdate.php:331-334`):
```php
$fStatusNew = 2;  // default = "เข้าโกดังจีน"
if(($row['manifest_date']!='0000-00-00 00:00:00')){
    $fStatusNew = 3;  // = "ส่งมาไทย" (in transit to TH)
}
```

So the form ALWAYS sends `fStatusNew=3` when manifest_date exists in MOMO data — and 3 is what causes cabinet to be set.

---

## §4 CN sync — does it carry cabinet?

**YES — IDENTICAL flow to MOMO**. `api-forwarder-cn.php` is essentially a copy of `api-forwarder-momo.php` (same exact line numbers for cabinet handling — 152, 260, 345, 444). Just calls a different upstream API. Staff workflow identical: pull → stage → admin clicks button on `manualUpdate` page → commit. Cabinet code came from `$_POST['container_code']` originating from CN upstream API response.

---

## §5 Google Sheets sync — cabinet column?

**YES — 4 sheets sync files (`api-sheets-sang-2023.php` · `api-sheets-mk.php` · `api-sheets-mx.php` · `api-sheets-ctt.php`)** each accept `fCabinetNumber` POST field directly from a form that renders Google Sheet rows side-by-side with an editable input column.

Key code (api-sheets-sang-2023.php:26):
```php
$fCabinetNumber = mysqli_real_escape_string($conn, trim($_POST['fCabinetNumber']));
```

Status logic (api-sheets-sang-2023.php:38-46):
```php
if(empty($_POST['fDateToThai'])){
    $fDateToThai='';
    $fDateContainerClose=NULL;
    $fStatus=2;  // "เข้าโกดังจีน"
}else{
    $fDateToThai = mysqli_real_escape_string($conn, $_POST['fDateToThai']);
    $fDateContainerClose = mysqli_real_escape_string($conn, $_POST['fDateContainerClose']);
    $fStatus=3;  // "ส่งมาไทย"
}
```

Same atomic pattern: fCabinetNumber + fStatus + fDateToThai + fDateContainerClose all SET together by the same form-submit. Admin sees the spreadsheet row, types/edits the cabinet field, clicks save, all four fields flip simultaneously.

**Sheet column = `fCabinetNumber` field directly** — the row in Google Sheets has a cabinet column, the import script displays the value in an editable input, and admin reviews+submits. No automatic write from sheet to DB.

---

## §6 Manual entry — where + how (3 distinct surfaces)

### §6.1 `forwarder.php` row-edit modal (one-off cabinet edit, no status change)
**File:** `include/pages/forwarder/update.php:163-172` (form) + `forwarder.php:1530-1539` (handler)

Admin opens `/admin/forwarder/update/<ID>` → sees per-row inline "แก้ไข" link next to "เลขที่ตู้" → modal opens with single input + Save button → submit → UPDATE `tb_forwarder` SET `fCabinetNumber`=… WHERE ID=… **— that's it.** No fStatus touch. No date touch.

This is the **post-hoc correction** path — used when MOMO/sheets data was wrong and admin needs to fix a single cabinet field.

### §6.2 `api-forwarder-momo.php?page=manualUpdate` and `api-forwarder-cn.php?page=manualUpdate` (per-row bulk via API stage)
Described in §3-4. Admin sees pre-staged MOMO/CN data and clicks "สร้างใหม่" or "อัปเดต" per row. Cabinet field is **prefilled** but editable (`pageManualUpdate.php:472`):
```php
<input type="text" class="input-api text-right" name="container_code" value="<?= $row['container_name'];?>">
```

### §6.3 Google Sheets sync pages (per-row, admin can override)
Described in §5. Spreadsheet-style page with editable cabinet column per row.

### §6.4 NO BULK CABINET ASSIGNMENT
There is NO "select N forwarders → type 1 cabinet → assign" UI. Each row goes through its own form submit. The closest thing is `forwarder-search-muti.php` but that's READ-ONLY (just lists multi-tracking searches across cabinets).

---

## §7 Status auto-flip on cabinet set — the verdict

**No "trigger on cabinet change" exists.** But because admin-facing forms ALWAYS set fStatus + fCabinetNumber + fDateToThai + fDateContainerClose in the SAME UPDATE/INSERT statement, the end-result LOOKS like an auto-flip from the user's perspective.

### §7.1 Patterns observed

| Trigger | What happens to fStatus | What happens to cabinet |
|---|---|---|
| MOMO/CN manual commit form submit (fStatusNew=3) | fStatus = 3 (forced by form's hidden field) | cabinet ← `$_POST['container_code']` |
| MOMO/CN manual commit form submit (fStatusNew=2) | fStatus = 2 | cabinet cleared to `''` |
| Sheets sync row submit, `fDateToThai` filled | fStatus = 3 | cabinet ← `$_POST['fCabinetNumber']` |
| Sheets sync row submit, no `fDateToThai` | fStatus = 2 | cabinet ← `$_POST['fCabinetNumber']` (still set, just status stays at 2) |
| `forwarder.php` row inline cabinet edit | UNTOUCHED | cabinet ← `$_POST['fCabinetNumber']` |
| Barcode scan `include/pages/barcode-import/index.php:167` | **AUTO fStatus=4** when scanned `fiAmount >= fAmount` | UNTOUCHED |
| `report-cnt.php` "บันทึกรายการรอชำระเงิน" button (`update_forwarder_to5`) | fStatus = 5 (รอชำระเงิน) | UNTOUCHED |

### §7.2 The barcode auto-flip — the ONE true auto-flip in the legacy

**`include/pages/barcode-import/index.php:167-170`:**
```php
if($fiAmount>=$fAmount && ($fID!='ไม่พบข้อมูล')){
    //จำนวนกล่องเท่ากันแล้วเปลี่ยนสถานะ
    $sql="UPDATE `tb_forwarder` SET fStatus=4, fDateStatus4=NOW(), adminIDUpdate='$adminID', fPallet='$fiPallet' WHERE ID=$fID;";
    $result = $conn->query($sql);
    $fStatus=4;
}
```

When admin scans (USB barcode) the last expected box, the count `fi2Amount` hits `fAmount` → fStatus auto-flips 3→4 ("ถึงโกดังไทยพร้อมส่ง"). **Cabinet number is irrelevant to this flip** — it triggers off box count, not cabinet.

### §7.3 No MySQL TRIGGER / no Postgres STORED PROC
Grep'd entire pcs-admin tree for `CREATE TRIGGER`, `CREATE PROCEDURE`, `BEFORE UPDATE`, `AFTER UPDATE` → zero matches. All status logic lives in PHP request handlers.

---

## §8 Cabinet → cnt-payment link

**Manual chain — admin must explicitly click 2 things in sequence:**

1. **Cabinet must be assigned** to all relevant forwarder rows (per §3-§6).
2. Admin opens `/admin/report-cnt.php?id=<fCabinetNumber>` → sees all forwarder rows in that cabinet → fills bill amount + uploads slip → clicks **"addPay"** button → handler at `report-cnt.php:1-100` runs:
   - INSERT `tb_cnt` (the master payment record)
   - INSERT `tb_cnt_item` (cabinet ↔ cnt mapping)
   - INSERT `tb_cnt_pay_idorco` (per-forwarder rows by fIDorCO)
   - INSERT `tb_cnt_pay_trackingchn` (per-forwarder rows by fTrackingCHN)

**No auto-creation.** Setting a cabinet on a forwarder does NOT auto-spawn a `tb_cnt` row — only the explicit admin "addPay" submission does.

The cnt-payment record is for tracking THE CARGO COMPANY'S PAYMENT to the upstream forwarder (PCS pays the freight company per cabinet, then bills each customer downstream). It's separate from customer-side billing.

---

## §9 The truth about ภูม's mental model

### "MOMO คีย์เลขตู้" — **PARTIALLY TRUE** (50%)
- ✅ **TRUE that MOMO's upstream data carries the cabinet** (`container_code`) — staged in `tb_tmp_forwarder_momo`
- ❌ **FALSE that MOMO writes directly to `tb_forwarder`** — admin must click "สร้างใหม่/อัปเดต" per row to commit
- The form **prefills** the cabinet value from staged data, but the admin can edit it before commit — this gives the appearance that "MOMO keyed it" because staff rarely edit the prefilled value

### "คีย์เลขตู้แล้วสถานะแม่งจะเปลี่ยนทันที" — **PARTIALLY TRUE** (looks true, mechanically false)
- ❌ **FALSE there's a trigger** on cabinet change that flips status — no DB trigger, no observer
- ✅ **TRUE that the user experience LOOKS like auto-flip** because the form handler sets fStatus + fCabinetNumber + fDateToThai + fDateContainerClose in the SAME UPDATE — staff fill cabinet, status changes "automatically" because the form's `fStatusNew=3` (or sheet's `fStatus=3`) hidden value or computed value rides along
- The actual cause of the flip is **the form's logic chain**: `if manifest_date present → fStatusNew=3 → fCabinetNumber gets set + status flips to 3 together`

### What's the legacy's actual workflow (step-by-step)?
1. **MOMO/CN/Sheets upstream cron** (or admin-triggered fetch) → pull data → stage in `tb_tmp_forwarder_*` (no impact on `tb_forwarder`)
2. **Admin opens `manualUpdate` page** → table renders staged rows side-by-side with existing `tb_forwarder` matches by tracking
3. **Form is built per row** with logic:
   - If `manifest_date` ≠ '0000-00-00 00:00:00' → render hidden `fStatusNew=3` (else 2)
   - Prefill `container_code` input from staged value
4. **Admin clicks button** ("สร้างใหม่" / "อัปเดตเข้าจีน" / "อัปเดตส่งมาไทย") → POST → `api-forwarder-momo.php` (or CN/sheets) → single atomic UPDATE/INSERT sets fStatus + fCabinetNumber + fDateToThai + fDateContainerClose
5. **Customer notified** via LINE/Email IF fStatus changed (logic later in same handler)
6. **Later**: admin scans barcodes → if all boxes scanned (`fiAmount >= fAmount`) → auto-flip fStatus=4 (the ONE true auto-flip)
7. **Later**: admin opens report-cnt → manually submits cnt-payment → INSERT `tb_cnt` (not auto)

### What this means for Pacred
ภูม's intuition is **directionally right** — the legacy IS more automated than Pacred at the moment, but not in the way ภูม pictures it. The "automation" is **form-side**: a single admin click on `manualUpdate` does FOUR field updates atomically (status + cabinet + 2 dates) PLUS triggers customer notification PLUS recomputes cost. Pacred currently might be making admin do 4 separate clicks.

The **REAL gap** in Pacred is likely:
- ✅ Pacred has the staging tables (`tb_tmp_forwarder_momo` etc.) since Phase A
- ❓ Does Pacred have the `manualUpdate` review page where staff can bulk-review-and-commit MOMO/CN stage rows in a single form? If not → THAT'S the missing "automation" ภูม feels
- ❓ Does Pacred's UPDATE handler flip status + cabinet + 2 dates in ONE transaction when staff hits the button? Or does it require multiple separate UPDATEs?

The PHP pattern to copy: **one form button → POST → one atomic UPDATE setting all 4 cargo-status fields together**. Not a trigger; just a well-designed form action.

---

## §10 Source citations

| File | Lines | Role |
|---|---|---|
| `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\api-forwarder-momo.php` | 151-170, 247-260, 344-363, 437-444 | The MOMO INSERT/UPDATE writer |
| `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\api-forwarder-cn.php` | (mirror of MOMO) | The CN INSERT/UPDATE writer |
| `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\include\pages\api-forwarder-momo\pageUpdateAPI.php` | 164-232, 279-332 | The MOMO upstream pull → stage `tb_tmp_forwarder_momo` |
| `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\include\pages\api-forwarder-momo\pageManualUpdate.php` | 193-365, 472 | The admin review form (the trigger of all the auto-feeling magic) |
| `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\api-sheets-sang-2023.php` | 26, 38-51, 191-198, 312, 324-330, 491-493 | Sheets sync writer (Sang) |
| `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\api-sheets-mk.php` | 29-30, 45-51, 197-204, 443 | Sheets sync writer (MK) |
| `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\api-sheets-mx.php` | (mirror of MK) | Sheets sync writer (MX) |
| `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\api-sheets-ctt.php` | 45-51, 443 | Sheets sync writer (CTT) |
| `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\api\update-forwarder\JMFCARGO\PUT\index.php` | 38, 152-158, 269-282 | JMF external PUT API |
| `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\forwarder.php` | 1530-1539 | Inline cabinet-only edit (no status flip) |
| `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\import-excel.php` | 326, 329-332, 775, 990 | Excel batch import writer |
| `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\include\pages\forwarder\update.php` | 159-172, 764-777 | The forwarder detail page modal HTML for cabinet edit |
| `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\include\pages\barcode-import\index.php` | 167-170 | The ONE true status auto-flip (barcode scan completeness) |
| `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\report-cnt.php` | 1-100, 760-810, 835-880 | cnt-payment submission flow + `update_forwarder_to5` (fStatus=5) |
| `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\cnt-hs.php` | 41-90 | Alternate cnt-payment submission flow (similar to report-cnt) |
| `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\cnt.php` | 35-55 | DEV/DEBUG only — echoes SQL, doesn't execute |

---

## §11 Open questions for ภูม / next session

1. **Does Pacred have `manualUpdate` page parity?** If `/admin/api-forwarder-momo/manual` doesn't bulk-stage-and-commit in one form, that's the perceived "MOMO automation gap"
2. **Does Pacred's UPDATE flip 4 fields atomically?** Or 4 separate UPDATEs? Probably the latter → port the legacy pattern: one form, one transaction
3. **Should Pacred add a true DB trigger** for "when fCabinetNumber transitions from '' to non-'', AND fDateToThai is set, AND fStatus<3 → flip fStatus=3"? Legacy doesn't have one — but adding one would be a Phase-C improvement that doesn't break fidelity
4. **Customer notification on status flip** — legacy emits LINE Notify + Email IN the same handler. Does Pacred wire this? If not → port `lineNotifyForwarder($sMessage)` calls from `api-forwarder-momo.php:~520` (Agent A's 2026-05-25 close-out wired ONE of these — there may be more)
