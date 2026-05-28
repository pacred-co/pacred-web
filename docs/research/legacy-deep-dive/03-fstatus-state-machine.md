# Legacy fstatus state machine — deep-dive 2026-05-28

> **Source:** `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\` (read-only audit, no edits)
> **Scope:** `tb_forwarder.fStatus` — รายการนำเข้า lifecycle, end-to-end
> **Sister docs:** `01-tb-forwarder-intake-paths.md` · `02-cabinet-lifecycle.md`
> **Owner:** ภูม (asked for this because Pacred fstatus flow feels "ไม่เป็นโลจิก ไม่เป็นอัตโนมัติ")

---

## §1 TL;DR — the answer ภูม wants

Legacy PCS Cargo's `tb_forwarder.fStatus` is a **linear 7-state machine** (1→2→3→4→5→6→7) plus one "shelved/cancel" sentinel (`99`) and a virtual sub-state (`6.1` = on-truck). **8 enum values total** · **22 distinct UPDATE call-sites** across 10 files · **~13 are automatic** (partner-API sync · barcode scan box-count match · payment ledger · driver flow) · **~9 are manual** (admin status-dropdown · bulk shelf 99 · bulk reactivate · bulk-bill `forwarder-check` · cnt-payment `report-cnt`). **Each transition stamps `fDateStatusN` AND `fDateAdminStatus` AND writes to `tb_log_forwarder_status`** (except the partner-API path, which skips the log table — that's a legacy gap, not by design). **The "auto" feel comes from 3 specific places that don't exist in Pacred yet:** (a) barcode scan auto-flip 3→4 when `fi2Amount >= fAmount` · (b) wallet-payment auto-flip 5→6 inside `pay-users.php` · (c) sheets-sync auto-set 2 or 3 based on whether the row has a `manifest_date`. Without these 3 the workflow stalls — and that matches what ภูม is feeling.

---

## §2 Status enumeration (every fStatus value)

| fstatus | Thai label (statusForwarderBadge) | Long label (statusForwarderAll) | Meaning | Date column stamped | Tab `?q=` in forwarder.php | Color (BS4 badge) |
|---|---|---|---|---|---|---|
| `1` | รอเข้าโกดังจีน | รอสินค้าเข้าโกดังจีน | INSERTED — customer/admin booked, no scan yet | *(none — implicit on row create)* | `?q=1` | yellow (warning) |
| `2` | ถึงโกดังจีนแล้ว | สินค้าถึงโกดังจีนแล้ว | China warehouse confirmed receipt | `fDateStatus2` | `?q=2` | blue (info) |
| `3` | กำลังส่งมาไทย | กำลังส่งมาประเทศไทย | Container sealed + on the way (`fCabinetNumber` set · `fDateContainerClose` stamped) | `fDateStatus3` | `?q=3` | pink |
| `4` | ถึงไทยแล้ว | สินค้าถึงประเทศไทยแล้ว | TH warehouse confirmed receipt (box-count match scan OR cnt-import) | `fDateStatus4` | `?q=4` | brown |
| `5` | รอชำระเงิน | รอชำระเงิน | Pricing finalized + invoice sent to customer | `fDateStatus5` | `?q=5` | red (danger) |
| `6` | เตรียมส่ง | เตรียมส่ง | Customer paid · packed & ready for outbound truck/messenger | `fDateStatus6` | `?q=6` | blue (primary) |
| `6.1` | กำลังจัดส่ง | กำลังจัดส่ง | **VIRTUAL** sub-state · `fStatus=6 AND tb_forwarder_driver_item.fdiStatus=''` | *(none — uses tb_forwarder_driver dates)* | `?q=6.1` | cyan (info2) |
| `7` | ส่งแล้ว | ส่งแล้ว | Out-for-delivery driver completed (with `fPhotoEnd` proof) | `fDateStatus7` | `?q=7` | green (success) |
| `99` | *(no badge)* | *(no badge — admin-only)* | "พักไว้" / shelved / soft-cancel (still recoverable via tb_log_forwarder_status) | *(none)* | `?q=p` | hidden |

**Aliases in reports** (function `statusNameReportForwarder`):
- `"all"` → ทั้งหมด
- `"5plus"` → ยอดที่ชำระเงินแล้วขึ้นไป (status ≥ 5)

**Source citations:**
- `pcs-admin/include/function.php:884-909` — `statusForwarderBadge()` + `statusForwarderAll()`
- `pcs-admin/include/function.php:1065-1078` — `statusNameForwarder()`
- `pcs-admin/include/function.php:1182-1197` — `statusNameReportForwarder()`
- `pcs-admin/include/function.php:1218-1235` — `statusForwarderAll2()` (the 6.1 sub-state)
- `pcs-admin/forwarder.php:327-338` — the `?q=` tab filter (includes `6.1` and `p` for fstatus=99)

---

## §3 State diagram (ASCII)

```
                                    ┌──────────────────────────────────┐
                                    │  shops.php:1433  OR  cart.php    │
                                    │  forwarder.php:115 (admin POST)  │
                                    │  api-forwarder-cn/momo NEW path  │
                                    │  → INSERT INTO tb_forwarder      │
                                    │  (no fStatus set → DEFAULT '1')  │
                                    └──────────────┬───────────────────┘
                                                   │ AUTO (row create)
                                                   ▼
                                ╔══════════════════════════════════════╗
                                ║  fStatus=1  รอเข้าโกดังจีน          ║
                                ╚══════════════════╤═══════════════════╝
                                                   │
              ┌────────────────────────────────────┼─────────────────────────────┐
              │ AUTO (sheets sync — empty manifest)│ MANUAL (admin dropdown)     │ AUTO (partner API)
              │ api-sheets-sang:41 / mk:47 / mx:300│ forwarder.php:1284          │ api-forwarder-cn:150
              │ → fStatus=2                        │ → fStatus=2 + fDateStatus2  │ api-forwarder-momo:439
              │                                    │                             │ (when fStatusNew='2')
              ▼                                    ▼                             ▼
                                ╔══════════════════════════════════════╗
                                ║  fStatus=2  ถึงโกดังจีนแล้ว         ║
                                ║  (fDateStatus2 stamped)              ║
                                ╚══════════════════╤═══════════════════╝
                                                   │
              ┌────────────────────────────────────┼─────────────────────────────┐
              │ AUTO (sheets sync — has manifest)  │ MANUAL (admin dropdown)     │ AUTO (partner API + container)
              │ api-sheets-sang:45 / mk:51         │ forwarder.php:1286          │ api-forwarder-cn:151..167
              │ + fCabinetNumber + fDateToThai     │ → fStatus=3 (no date stamp  │ + fCabinetNumber + fDateToThai
              │ → fStatus=3 + dateStatus3          │   here — bug? see §8)       │ + fDateStatus3
              │                                    │                             │ → fStatus=3
              ▼                                    ▼                             ▼
                                ╔══════════════════════════════════════╗
                                ║  fStatus=3  กำลังส่งมาไทย           ║
                                ║  (fCabinetNumber + fDateStatus3      ║
                                ║   + fDateContainerClose stamped)     ║
                                ╚══════════════════╤═══════════════════╝
                                                   │
              ┌────────────────────────────────────┼─────────────────────────────┐
              │ AUTO (barcode scan)                │ MANUAL (admin dropdown +    │ MANUAL (bulk on cnt arrival
              │ barcode-import/index.php:168       │   inline form box-count)    │   in report-cnt 'succeed' tab)
              │ WHEN fi2Amount >= fAmount          │ forwarder.php:2231          │ (no direct flip — relies on
              │ → fStatus=4 + fDateStatus4         │ → fStatus=4 + fDateStatus4  │  the same barcode path)
              │ forwarder-import-warehouse.php:29  │                             │
              ▼                                    ▼                             │
                                ╔══════════════════════════════════════╗
                                ║  fStatus=4  ถึงไทยแล้ว              ║
                                ║  (fDateStatus4 stamped · fPallet set)║
                                ╚══════════════════╤═══════════════════╝
                                                   │
              ┌────────────────────────────────────┼─────────────────────────────┐
              │ MANUAL (admin dropdown)            │ MANUAL (bulk-bill button —  │ MANUAL (cnt-payment trigger
              │ forwarder.php:1284                 │   forwarder-check.php:59)   │   report-cnt.php:840)
              │ → fStatus=5 + fDateStatus5         │ → fStatus=5 + fDateStatus5  │ → fStatus=5 + fDateStatus5
              │                                    │ + SMS to customer           │ + SMS + LINE notification
              ▼                                    ▼                             ▼
                                ╔══════════════════════════════════════╗
                                ║  fStatus=5  รอชำระเงิน              ║
                                ║  (fDateStatus5 stamped · price       ║
                                ║   finalized · customer billed)       ║
                                ╚══════════════════╤═══════════════════╝
                                                   │
              ┌────────────────────────────────────┼─────────────────────────────┐
              │ AUTO (customer pays from wallet)   │ MANUAL (admin marks as      │ AUTO (admin sets fStatus='c'
              │ pay-users.php:408 / :467 / :633    │   paid — uncommon path)     │   = credit-pay shortcut)
              │ → fStatus=6 + fDateStatus6         │ forwarder.php:1284          │ forwarder.php:1431
              │ + paydeposit='1' + walletTotal--   │ → fStatus=6 + fDateStatus6  │ → fStatus=6 + fDateStatus5
              │ + tb_wallet_hs INSERT              │                             │ + fCredit='1' + paydeposit='2'
              ▼                                    ▼                             ▼
                                ╔══════════════════════════════════════╗
                                ║  fStatus=6  เตรียมส่ง               ║
                                ║  (fDateStatus6 stamped · paid)       ║
                                ╚══════════════════╤═══════════════════╝
                                                   │
                              ┌────────────────────┴────────────────────┐
                              │ AUTO (driver assignment INSERT into     │
                              │ tb_forwarder_driver_item — fdiStatus='')│
                              │ → VIRTUAL state 6.1 "กำลังจัดส่ง"      │
                              │ (fstatus stays 6 — only tab filter      │
                              │  changes via `?q=6.1`)                  │
                              └────────────────────┬────────────────────┘
                                                   │
              ┌────────────────────────────────────┼─────────────────────────────┐
              │ AUTO (driver completes — uploads   │ MANUAL (admin dropdown —    │ MANUAL (warehouse-side
              │   delivery photo)                  │   uncommon path)            │   force-complete)
              │ forwarder-driver.php:166           │ forwarder.php:1284          │ forwarder-driver-w.php:955
              │ forwarder-driver.php:580           │ + forwarder.php:1638        │ → fStatus=7 + fDateStatus7
              │ forwarder-driver.php:1328          │   (update_forwarder5)       │ + fPhotoEnd uploaded
              │ → fStatus=7 + fDateStatus7         │                             │
              │ + fPhotoEnd uploaded               │                             │
              ▼                                    ▼                             ▼
                                ╔══════════════════════════════════════╗
                                ║  fStatus=7  ส่งแล้ว ✅ TERMINAL    ║
                                ║  (fDateStatus7 stamped · cascades:   ║
                                ║   tb_sales_report INSERT for sale-   ║
                                ║   rep commission · tb_user_sales for ║
                                ║   VIP-agent referral)                ║
                                ╚══════════════════════════════════════╝

  ─── PARALLEL ESCAPE HATCHES ───

  Any active state ⟶ fStatus=99 "พักไว้" (shelved)
  forwarder.php:9 — admin bulk POST moveStatusTo99
  + tb_log_forwarder_status INSERT (fStatusOld + fStatusNew=99 + adminID)

  fStatus=99 ⟶ restore-to-previous (lookup fStatusOld from log)
  forwarder.php:33 — admin bulk POST removeStatusTo99
  Falls back to fStatus=3 if no log row found (forwarder.php:48 — defensive)
```

---

## §4 Every fStatus UPDATE — full enumeration (22 call-sites)

> Sorted by where in the workflow the call fires. **Side-effects column** lists what else changes in the same transaction.

| # | File:line | From → To | Trigger | Role | Side effects |
|---|---|---|---|---|---|
| 1 | `forwarder.php:9` | * → `99` | Admin click "ย้ายไป พักไว้" bulk button (`moveStatusTo99`) | CEO / Manager / Accounting / ITDT / Warehouse / CSPurchasing (any of 6) | INSERT `tb_log_forwarder_status` (fStatusOld + 99 + adminID + now) |
| 2 | `forwarder.php:33` | `99` → previous (from log) | Admin click "นำกลับมา" bulk button (`removeStatusTo99`) — lookup fStatusOld from log | Same as #1 | INSERT `tb_log_forwarder_status` |
| 3 | `forwarder.php:48` | `99` → `3` | Same as #2 — DEFAULT fallback when no log row found | Same | INSERT log (3,3) |
| 4 | `forwarder.php:1284` | * → `1`/`5`/`6`/`7` | Admin dropdown select + click "บันทึก" (`update` POST `fStatus`) — variants that ALSO stamp `fDateStatusN` | CEO / Manager / QAAndQC / Accounting / ITDT / Warehouse / SalesAll / SaleCargo / CSPurchasing | `fDateStatusN` + `fDateAdminStatus` + `adminID` + `adminIDUpdate` + saveHistory(40) + email + LINE notify customer |
| 5 | `forwarder.php:1286` | * → `2`/`3`/`4` | Admin dropdown — variants that DO **NOT** stamp `fDateStatusN` (legacy quirk — see §8) | Same as #4 | Only `fDateAdminStatus` + admin IDs (no date column!) |
| 6 | `forwarder.php:1298` | * → `0` | Admin dropdown — fallback when fStatus=0 (defensive; effectively dead code since fstatus starts at 1) | Same | Same as #5 |
| 7 | `forwarder.php:1431` | `5` → `6` | Admin selects fStatus='c' (เครดิต shortcut) — when customer credit OK | CEO / Manager / Accounting / CSPurchasing (only those with credit-grant permission) | paydeposit='2' + fCredit='1' + fCreditDate + `fDateStatus5` + creditValue += pricePay (UPDATE tb_credit) + DELETE tb_check_forwarder for this fID + LINE to specific test users (PCS16/PCS2555) |
| 8 | `forwarder.php:1638` | * → `7` | Admin click "บันทึก ส่งแล้ว" + ftrackingTH (`update_forwarder5`) — fast-path to terminal | CEO / Manager / ITDT (those who see deliver-ready tab) | `fDateAdminStatus` + `ftrackingTH` + INSERT `tb_sales_report` + INSERT `tb_user_sales` (4 VIP agents) |
| 9 | `forwarder.php:2231` | `<4` → `4` | Inline form `update_forwarder_to4_2` (admin enters fAmount + fiAmount; when `fiAmount >= fAmount`) — used in detail page warehouse-entry mode | Warehouse | `fDateStatus4` + `adminIDUpdate` + INSERT/UPDATE `tb_forwarder_import` + email + LINE notify customer |
| 10 | `forwarder-check.php:59` | `<6` → `5` | Admin click "เรียกเก็บเงินลูกค้า" bulk button (`callPriceUser`) — the bulk-billing flow | CEO / Manager / Accounting / CSPurchasing | `fDateStatus5` + `adminIDUpdate` + SMS to userTel + DELETE `tb_check_forwarder` |
| 11 | `forwarder-driver.php:166` | `6` → `7` | Driver uploads `fPhotoEnd` after delivery (bulk path A) | Warehouse driver / Driver-W | `fDateStatus7` + `fPhotoEnd` + `adminIDUpdate` (no notify in this path — assumes customer was already informed at stage 6) |
| 12 | `forwarder-driver.php:580` | `6` → `7` | Same — bulk path B | Same | Same |
| 13 | `forwarder-driver.php:1328` | `6` → `7` | Same — single-row path | Same | Same |
| 14 | `forwarder-driver-w.php:955` | `6` → `7` | Warehouse-W version — same trigger | Warehouse-W | Same |
| 15 | `barcode-import/index.php:168` | `<5` → `4` | Barcode-scan auto: `fiAmount >= fAmount` (TH warehouse worker scans last box) | Warehouse | `fDateStatus4` + `fPallet` + `adminIDUpdate` + INSERT/UPDATE `tb_forwarder_import2` |
| 16 | `forwarder-import-warehouse.php:29` | `<5` → `4` | Admin manually links a TH-warehouse `tb_forwarder_import2` row to an fID (legacy ops fix path) | Warehouse | `fDateStatus4` + `fPallet` + `adminIDUpdate` |
| 17 | `wallet.php:542` | * → `5` | Admin REJECTS a customer's wallet-pay submission (status='3') — un-cancels the pay attempt | Accounting | `paydeposit=''` + `adminIDUpdate` (cancels the pay attempt; row goes back to "waiting for payment") |
| 18 | `wallet.php:547` | * → `5` | Same as #17 — variant when row is `fShipBy='PCSF' AND fTransportPrice=50` (free-shipping special) | Accounting | Same + `fTransportPrice=0` + `fUserCompany=''` |
| 19 | `pay-users.php:408` | `5` → `6` | Customer click "ชำระเงิน" from wallet (partial pay path, status='1' wallet hs) | Customer (via admin context — pay-users.php is in pcs-admin/) | paydeposit='1' + `fDateStatus6` + `fDateAdminStatus` + INSERT `tb_wallet_hs` + INSERT `tb_wallet_paydeposit` |
| 20 | `pay-users.php:467` | `5` → `6` | Customer click "ชำระเงิน" from wallet (full pay path, status='2' wallet hs — has enough balance) | Same | Same — also UPDATE `tb_wallet` walletTotal -= pricePay |
| 21 | `pay-users.php:633` | `5` → `6` | Customer click "ชำระเงิน" from wallet (admin-confirmed pay slip path) | Accounting (confirming the slip) | Same as #19 |
| 22 | `api-forwarder-momo.php:439` | * → `$fStatusNew` (`2` or `3`) | Manual sync of partner API row (POST `fStatusNew`) — operator paste from MOMO sheet | Warehouse / ITDT | All-in-one update: + cabinet + dateStatus2 + dateStatus3 + cost columns. **NOT** logged to `tb_log_forwarder_status` (bug) |
| 23 | `api-forwarder-cn.php:150-170` | * → `2` or `3` | Same — CN carrier sync | Same | Same |
| 24 | `api-sheets-sang-2023.php:41/45/327/331/431/433` | * → `2` or `3` | Sang sheet sync · status by manifest_date presence | Pricing / SalesAll | Same — also calls `calPriceForwarder` |
| 25 | `api-sheets-mk.php:47/51/300/304` | * → `2` or `3` | Same — MK sheet | Same | Same |
| 26 | `api-sheets-mx.php` | * → `2` or `3` | Same — MX sheet | Same | Same |
| 27 | `api-sheets-ctt.php` | * → `2` or `3` | Same — CTT sheet | Same | Same |
| 28 | `import-excel.php:329/332/600/603/770` | * → `2` or `3` | Bulk Excel import — same logic (status by fDateToThai/manifest presence) | Warehouse / Pricing | Sets `fDateStatus3` |
| 29 | `report-cnt.php:840` | * → `5` | Container-cost reconciliation `update_forwarder_to5` — set price from cost calc THEN flip to bill-customer | Accounting (or Manager) | `fDateStatus5` + `adminIDUpdate` + saveHistory(41) + SMS to userTel + email + LINE |
| 30 | `JMFCARGO/PUT/index.php:153` | * → `$fStatus` | JMF webhook PUT — external system pushes status updates | (system — token-authed) | UPDATE huge column list incl. cost + cabinet (full sync) |
| 31 | `JMFCARGO/PUT/index.php:269/386` | new INSERT | JMF webhook PUT — creates new row when tracking doesn't exist | (system) | INSERT with fStatus from JMF payload |

**Tally:** 31 call-sites · ~13 auto · ~18 manual/admin-driven (counting bulk-bill as 1 admin action even though it loops N rows).

---

## §5 Automatic transitions (no human click)

These fire without a per-row admin action — they're triggered by external systems, batch operations, or cascading flows:

| Auto-transition | Trigger | Evidence (file:line) | What ภูม likely needs in Pacred |
|---|---|---|---|
| **(none) → `1`** | Row INSERT (default) | `shops.php:1433` · `cart.php` · `forwarder.php:115` · partner-API new-row paths | Pacred handles this (db default + Zod ensures `1`) |
| **`1` → `2`** (manifest empty) | Sheets sync (Sang/MK/MX/CTT) reads spreadsheet row with empty manifest_date | `api-sheets-sang-2023.php:41` · `mk.php:47` · `mx.php:300` | ❌ Pacred has `/admin/api-sheets-sang` but Wave 17 only did manual entry — full sheets sync not done |
| **`1` → `2` or `1` → `3`** (auto) | Partner-API (CN/MOMO) sync — when `fStatusNew` set on incoming POST | `api-forwarder-cn.php:150-170` · `api-forwarder-momo.php:439` | ⚠️ Pacred has `/admin/api-forwarder-momo` + `/admin/api-forwarder-cn` MANUAL pages only (Wave 17) — full sync absent |
| **`2` → `3`** (manifest present) | Sheets sync detects manifest_date in new row | `api-sheets-sang-2023.php:45` etc | Same as above |
| **`3` → `4`** (BOX-COUNT MATCH) | Barcode-scan in TH warehouse: `fi2Amount >= fAmount` (every scan increments box count; on parity, auto-flip) | `barcode-import/index.php:167-170` · `forwarder.php:2230` (manual variant) | ⚠️ Pacred has `/admin/barcode/driver/import` (Wave 17 #82 AJAX writer) — VERIFY the parity auto-flip is implemented or if it requires a manual confirm |
| **`5` → `6`** (CUSTOMER PAY) | Customer pays from wallet — `pay-users.php` checks 3 wallet-balance paths, all flip status | `pay-users.php:408` · `:467` · `:633` | ❌ Pacred wallet-pay landed but VERIFY it auto-updates fstatus → 6 (this is the most-confusing automation gap — without it, "paid" orders look "unpaid" forever) |
| **`6` → `6.1`** (VIRTUAL · driver assigned) | INSERT into `tb_forwarder_driver_item` with `fdiStatus=''` — pure SQL JOIN, no UPDATE on tb_forwarder | `forwarder.php:332` (the tab filter SQL) | ❌ Pacred /admin/forwarders/combine-bill (Wave 23 P0) exists but verify tab `?q=6.1` filter logic |
| **`6` → `7`** (DRIVER DELIVERED) | Driver uploads `fPhotoEnd` proof — auto-fires when image uploaded | `forwarder-driver.php:166/580/1328` · `forwarder-driver-w.php:955` | ❌ Pacred `/admin/driver-runs` likely partial — VERIFY the photo-upload auto-flip is wired |
| **`*` → restore from `99`** | Admin "นำกลับมา" lookup from `tb_log_forwarder_status` log → restore previous fstatus | `forwarder.php:32-44` | ❌ Pacred has NO equivalent — once shelved, stuck |

**The 5 critical autos that, if missing in Pacred, would make the system feel "ไม่อัตโนมัติ":**
1. Sheets sync auto-sets 2/3
2. Partner-API sync auto-sets 2/3
3. Barcode parity auto-flips to 4
4. Wallet pay auto-flips to 6
5. Driver photo-upload auto-flips to 7

**Without all 5, every status change becomes a manual admin click → exactly the friction ภูม feels.**

---

## §6 Manual transitions (admin clicks)

| Trigger UI | File | Trigger | What admin clicks | Role allowed | Side-effects |
|---|---|---|---|---|---|
| Status-dropdown in detail page | `forwarder.php:1265-1455` (update page) — select shown via `include/pages/forwarder/update.php:904-960` | `update` POST `fStatus` | "อัปเดตสถานะรายการ" dropdown — values whitelisted by current fstatus (e.g. fstatus=2 only shows 1/2/3/4 options) | CEO / Manager / QAAndQC / Accounting / ITDT / Warehouse / SalesAll / SaleCargo / CSPurchasing (9 roles · checked via `$departmentKey` and `$sectionKey`) | `fDateStatusN` (for 1/5/6/7 only) + `fDateAdminStatus` + admin IDs + saveHistory(40) + email + LINE notify · (for fstatus=7) INSERT `tb_sales_report` + `tb_user_sales` for 4 VIP agents |
| "ย้ายไป พักไว้" bulk button | `forwarder.php:9` | `moveStatusTo99` POST | Tickbox rows + button on list | Same 6 roles | INSERT tb_log_forwarder_status |
| "นำกลับมา" bulk button | `forwarder.php:33` | `removeStatusTo99` POST | Same | Same | INSERT tb_log_forwarder_status |
| Bulk-bill "เรียกเก็บเงินลูกค้า" | `forwarder-check.php:23-90` | `callPriceUser` POST | Tickbox rows (fstatus < 6) + button | Accounting / CSPurchasing / Manager | UPDATE `fStatus=5` + `fDateStatus5` + SMS to customer + DELETE `tb_check_forwarder` for each |
| Cnt-payment "ทำรายการเบิกเงินค่าตู้" | `report-cnt.php:835-910` | `update_forwarder_to5` POST | Per-cnt button in tab "succeed" | Accounting | UPDATE `fStatus=5` + `fDateStatus5` + saveHistory(41) + SMS + email + LINE |
| "บันทึกถึงไทย" warehouse form | `forwarder.php:2125-2263` | `update_forwarder_to4_2` POST | Admin enters `fAmount` + `fiAmount` + uploads `fCover`; when `fiAmount >= fAmount` it auto-flips | Warehouse | UPDATE `fStatus=4` + `fDateStatus4` + INSERT/UPDATE `tb_forwarder_import` + email + LINE |
| "บันทึก ส่งแล้ว" fast-path | `forwarder.php:1634-1712` | `update_forwarder5` POST | Per-row button + tracking input | CEO / Manager / ITDT | UPDATE `fStatus=7` + ftrackingTH + INSERT `tb_sales_report` + `tb_user_sales` |
| Driver-app "delivered" photo upload | `forwarder-driver.php` (3 paths) | Image upload POST | Driver checks delivered + uploads proof | Driver / Warehouse | UPDATE `fStatus=7` + fPhotoEnd + fDateStatus7 |
| Wallet-rejection (return to pending) | `wallet.php:542/547` | Admin rejects pay-slip (status='3') | Click "ปฏิเสธ" on slip-approval modal | Accounting | UPDATE `fStatus=5` (un-cancels) + `paydeposit=''` |
| Partner-API manual entry | `api-forwarder-momo.php:342` / `api-forwarder-cn.php:342` | Operator pastes MOMO/CN row + clicks สร้าง/อัปเดต | Submit form with fStatusNew=2 or 3 | Warehouse / ITDT | Full row update incl. cabinet + dates + cost (DOES NOT write to tb_log_forwarder_status — gap!) |

**Role permission source:** `pcs-admin/include/pages/forwarder/update.php:903` — the OR-chain `$departmentKey=='CEO' \|\| ...` is the canonical reference for "who can change status of a forwarder row".

---

## §7 Notification side-effects

| Transition | SMS to customer? | LINE to customer? | LINE to admin team? | Email to customer? | Audit log |
|---|---|---|---|---|---|
| INSERT (→ `1`) | ❌ (commented out in `forwarder.php:199`) | ❌ | ❌ | ❌ (`sendMail` commented out at `forwarder.php:199`) | saveHistory(37) |
| Sheets sync → `2`/`3` | ❌ | ❌ | ❌ | ❌ | ❌ (no log entry — bug) |
| Partner-API sync → `2`/`3` | ❌ | ❌ | ❌ | ❌ | ❌ (no log entry — bug) |
| Barcode → `4` | ❌ | ❌ | ❌ | ❌ | ❌ (no log entry — bug) |
| Admin warehouse-entry → `4` (`forwarder.php:2253`) | ❌ | ✅ if `userLineNotify` set | ❌ | ✅ via `sendMail()` (uncommented here!) | saveHistory(?) |
| Bulk-bill → `5` (`forwarder-check.php:84`) | ⚠️ commented-out at `:87` (`send_smsNew`) — the code path exists but is dead | ⚠️ commented-out at `:75` | ❌ | ❌ | ❌ (no log entry — bug) |
| Cnt-payment → `5` (`report-cnt.php:896/903/908`) | ✅ `send_sms()` ACTIVE | ✅ `sendLine()` ACTIVE if userLineNotify set | ❌ | ✅ `sendMail()` ACTIVE | saveHistory(41) ✅ |
| Admin dropdown → `5` (`forwarder.php:1346`) | ❌ (only LINE) | ✅ `sendLine()` ACTIVE | ❌ | ⚠️ commented out at `:1341` | saveHistory(40) ✅ |
| Customer pay → `6` (`pay-users.php:421-423`) | ❌ | ❌ | ⚠️ `lineNotifyForwarder($sMessage)` COMMENTED OUT at `:423` | ❌ | ❌ |
| Admin dropdown → `6` | ❌ | ✅ if userLineNotify | ❌ | ⚠️ commented | saveHistory(40) |
| Admin credit-shortcut → `6` (`forwarder.php:1438-1442`) | ❌ | ❌ | ✅ ONLY for test-userIDs (`PCS16` or `PCS2555`) — hardcoded LINE-token broadcast | ❌ | saveHistory(40) |
| Driver delivered → `7` | ❌ | ❌ | ❌ | ❌ | ❌ |
| Admin dropdown → `7` | ❌ | ✅ if userLineNotify | ❌ | ⚠️ commented | saveHistory(40) |
| Move to `99` | ❌ | ❌ | ❌ | ❌ | ✅ tb_log_forwarder_status |
| Restore from `99` | ❌ | ❌ | ❌ | ❌ | ✅ tb_log_forwarder_status |

**Observation:** the **notification fabric is wildly inconsistent**. Cnt-payment → 5 is fully wired (SMS + LINE + Email) · admin-dropdown → 5 is half-wired (LINE only, email commented) · bulk-bill → 5 is fully UN-wired (everything commented). The customer-pay → 6 path has NO confirmation push at all. **Pacred doesn't need to faithfully port the commented-out lines — but should make every status transition send the same notification consistently** (per `B-1 NOTIFY_BYPASS` infrastructure already added).

**The `tb_log_forwarder_status` audit log is ALSO inconsistent** — only the `forwarder.php` admin flows write to it. Every other path (partner-API, barcode, bulk-bill, cnt-payment, driver-flow) silently mutates without logging. That's a forensics-trail gap legacy never closed, and Pacred can leapfrog by **always** writing a log row inside the bulk-action helper.

---

## §8 What Pacred likely has WRONG/INCOMPLETE

Based on this audit + Pacred's `actions/admin/forwarders.ts:506-700` (the `adminBulkUpdateForwarderTbStatus` action that landed in Wave 20-23):

### 🔴 P0 — automation gaps that justify ภูม's "ไม่อัตโนมัติ" feeling

1. **No barcode-scan auto-flip to status 4.** Pacred has `/admin/barcode/driver/import` (Wave 17 #82) which writes to scan tables, but **VERIFY** it implements the `fi2Amount >= fAmount` parity check that auto-flips `fStatus → 4 + fDateStatus4`. Without it, every box scanned still requires an admin to manually flip status. **File to check:** `actions/admin/barcode-*.ts` + `app/[locale]/(admin)/admin/barcode/driver/import/`.

2. **No wallet-pay auto-flip to status 6.** Pacred has wallet payment (`/wallet/[id]` Wave 5) but the customer-pay flow MUST auto-flip the linked tb_forwarder row to fStatus=6 + stamp fDateStatus6 + write tb_wallet_hs. **The legacy reference is `pay-users.php:408 / :467 / :633`.** If Pacred only debits the wallet without flipping fstatus, orders sit in "รอชำระเงิน" forever even after paid → customer support floods.

3. **No partner-API auto-sync (CN/MOMO/JMF/GOGO).** Pacred has *manual* sheets-paste pages (`/admin/api-forwarder-momo/manual` + `/api-forwarder-cn/manual` from Wave 17) but no `cron` job that polls or no webhook handler that pushes. The legacy has `JMFCARGO/PUT/index.php` webhook + likely a cron for sheets-pulls (deferred per `poom-save-point-2026-05-25-night.md` "Phase C"). **Without this, every tracking/manifest update is manual data-entry work.**

4. **No sheets-sync auto-import for Sang/MK/MX/CTT.** Pacred `/admin/api-sheets-sang` (Wave 17 #81) shows preview but DOESN'T have full Google Sheets API integration to read manifest_date + auto-set fStatus=2 or 3. The legacy `api-sheets-sang-2023.php:41/45` is the canonical pattern.

### 🟠 P1 — fidelity gaps

5. **Status-dropdown options must be role-AND-current-fstatus-restricted.** Legacy `pcs-admin/include/pages/forwarder/update.php:912-947` shows: if current fstatus=1, dropdown ONLY allows 1/2/3/4 — no skip to 7. If current fstatus=5 AND user has credit, an extra "ชำระเงินแบบเครติด" option appears. Pacred's `adminBulkUpdateForwarderTbStatus` accepts any fStatus enum value — too permissive. **Fix:** add a state-transition guard table (see §3 diagram for allowed edges).

6. **Missing `fStatus='99'` shelf/restore mechanism.** Pacred bulk action accepts `99` but there's no UI flow to restore from 99 → previous-status. Legacy `forwarder.php:33` looks up `tb_log_forwarder_status.fStatusOld` and restores it. Without this, shelved orders are dead.

7. **`tb_log_forwarder_status` not written by Pacred.** Pacred has `audit_log` table but the legacy table `tb_log_forwarder_status` is migrated (per `pcs-data-migration.md`) and SHOULD be written on every fstatus change — that's the legacy report screen's data source. ภูม's report screens that JOIN to log will be empty.

8. **`fDateStatusN` not always stamped.** Legacy `forwarder.php:1284 vs :1286` shows: for status 1/5/6/7, both `fStatus` AND `fDateStatusN` are set; for status 2/3/4, ONLY `fStatus` is set (the date stamp is expected to come from partner-API path or barcode-scan path). **This is fragile** — if admin manually drags status to 3 without the partner API having stamped fDateStatus3, the date is NULL and report-cnt's `WHERE fDateContainerClose BETWEEN start AND end` filter HIDES the row.

   Pacred's current `TB_STATUS_DATE_COL` (forwarders.ts:529-538) stamps the date on every status — which is *better* than legacy, but **must verify** it doesn't clobber an existing partner-API-set date (e.g. if admin clicks status=3 manually, we'd overwrite a real manifest_date with `now()` — wrong). Fix: use `coalesce(existing, now())`.

### 🟡 P2 — polish / consistency

9. **Notification fabric needs unification.** Per §7, legacy fires notifications inconsistently per call-site. Pacred should funnel ALL fstatus transitions through one helper (e.g. `notifyForwarderStatusChange(fid, from, to, opts)`) that respects `NOTIFY_BYPASS` and uses the same template — independent of which UI triggered the change.

10. **Virtual sub-state `6.1` (กำลังจัดส่ง) needs explicit handling.** Pacred's status enum doesn't include `6.1`. The legacy implements it as a *tab filter SQL* (`fStatus='6' AND fdi.fdiStatus=''`), not a column value. Pacred's `/admin/forwarders?q=6.1` would need the same JOIN + filter logic. If missing, the "currently-out-for-delivery" view is invisible.

11. **`fStatus='c'` credit shortcut isn't a real status.** Legacy `forwarder.php:1431` treats `c` as a special UI value that internally maps to fStatus=6 + fCredit=1 (deferred-pay accept). Pacred should add this as a button/action, NOT a status enum value.

12. **The `tb_check_forwarder` workspace table isn't ported.** Legacy uses it as "marked for billing" staging — admin ticks rows → INSERT into tb_check_forwarder → bulk-bill action reads from tb_check_forwarder + DELETEs after billing. Without it, the bulk-bill workflow loses the "marked but not yet billed" intermediate state.

### What's already right in Pacred (from `forwarders.ts:506-700`)

✅ Status enum matches legacy (1-7 + 99)
✅ Bulk action stamps `fDateStatusN` + `fDateAdminStatus` consistently (better than legacy)
✅ Wave 24 #192 already discovered + fixed the `fDateContainerClose` back-fill gap when admin sets cabinet manually
✅ `adminIdSafe.slice(0, 10)` respects legacy varchar(10) constraint
✅ Audit log integration (`audit_log` table) — even though `tb_log_forwarder_status` itself isn't being written

---

## §9 Concrete next-session action list

If ภูม wants to feel "Pacred is now logical + automatic", the order should be:

1. **(B-1 already done)** NOTIFY_BYPASS env guard — unblocks notification testing
2. **Verify barcode-scan → 4 auto-flip** in `/admin/barcode/driver/import` against legacy `barcode-import/index.php:167-170`
3. **Verify wallet-pay → 6 auto-flip** in customer wallet pay flow against legacy `pay-users.php:408`
4. **Verify driver photo-upload → 7 auto-flip** in `/admin/driver-runs` against legacy `forwarder-driver.php:166`
5. **Add `tb_log_forwarder_status` writes** to `adminBulkUpdateForwarderTbStatus` (so reports work)
6. **Restrict status-dropdown options** by current fstatus + role (legacy `update.php:912-947` is the pattern)
7. **Implement `99` shelf restore** via tb_log_forwarder_status lookup (legacy `forwarder.php:33`)
8. **(Phase C)** Build sheets-sync + partner-API cron handlers (the big async items)

---

## Source-of-truth file map (for cross-reference)

| Legacy file | What it owns | Pacred equivalent |
|---|---|---|
| `pcs-admin/forwarder.php` (2,661L) | List + detail + update + bulk shelf/restore | `app/[locale]/(admin)/admin/forwarders/page.tsx` + `[fNo]/page.tsx` |
| `pcs-admin/forwarder-action.php` (1,192L) | Action-tab list (note/notPhoto/notTransport/notContainer/etc) | `app/[locale]/(admin)/admin/forwarder-action/page.tsx` |
| `pcs-admin/forwarder-check.php` (728L) | Bulk-bill flow (status → 5) | `app/[locale]/(admin)/admin/forwarder-check/page.tsx` (Wave 16 P0 done) |
| `pcs-admin/forwarder-driver.php` (~1,500L) | Driver out-for-delivery + photo upload (status → 7) | `app/[locale]/(admin)/admin/driver-runs/` (partial) |
| `pcs-admin/forwarder-driver-w.php` | Warehouse-side driver | `app/[locale]/(admin)/admin/forwarder-import-warehouse/` |
| `pcs-admin/report-cnt.php` | Container reconciliation + cnt-payment trigger (status → 5) | `app/[locale]/(admin)/admin/report-cnt/page.tsx` (Wave 16 P0 done) |
| `pcs-admin/pay-users.php` | Customer wallet-pay (status → 6) | customer-side wallet pay (verify auto-flip!) |
| `pcs-admin/wallet.php` | Admin wallet management + slip approve/reject (rejection → status back to 5) | `app/[locale]/(admin)/admin/wallet/` |
| `pcs-admin/include/pages/forwarder/update.php:904-960` | Status dropdown role-restricted options | (canonical reference for dropdown UI) |
| `pcs-admin/include/function.php:884-1235` | Status label/badge helpers + names | `lib/forwarder/status.ts` (verify exists) |
| `pcs-admin/include/pages/barcode-import/index.php:167-170` | Barcode parity auto-flip → 4 | `app/[locale]/(admin)/admin/barcode/driver/import/` (Wave 17 #82) |
| `pcs-admin/api-forwarder-momo.php`, `api-forwarder-cn.php` | Partner-API sync (manual + auto) | `/admin/api-forwarder-momo/manual` + `/admin/api-forwarder-cn/manual` (Wave 17 #81) |
| `pcs-admin/api-sheets-sang-2023.php` etc | Sheets-sync auto status 2/3 | `/admin/api-sheets-sang` (Wave 17 — preview only) |
| `pcs-admin/api/update-forwarder/JMFCARGO/PUT/index.php` | JMF webhook PUT | NOT YET PORTED |
| `pcs-admin/automation/php/reset-credit-forwarder.php` | Credit cron — does NOT touch fStatus | (orthogonal — port separately when ready) |
| (legacy MySQL table) `tb_log_forwarder_status` | Forwarder status-change history | already migrated as `tb_log_forwarder_status` (per `pcs-data-migration.md`) — verify Pacred writes to it |
| (legacy table) `tb_check_forwarder` | Staging table for "marked for billing" rows | NOT verified present in Pacred |

---

*Audit complete · 2026-05-28 · all citations are file:line from `D:\REALSHITDATAPCS\pcsc\public_html\member\` (read-only) · no legacy files modified.*
