# ฝากนำเข้า (forwarders / cargo import) — Fidelity Audit

**Date:** 2026-05-30 evening (single-agent deep audit, AGENTS.md §0b protocol)
**Scope:** legacy `pcs-admin/forwarder*.php` + `include/pages/forwarder*` + Pacred `/admin/forwarders/**`, `/admin/forwarder-*`, `/admin/drivers`, `/admin/report-cnt`, `actions/admin/forwarder*`
**Prior art (DELTA only — not duplicated):** `docs/audit/cargo-flow-deep-audit-2026-05-25.md` (47-gap), `fidelity-gap-2026-05-24.md`, `admin-pages-audit-2026-05-25-night.md`
**Method:** opened every `.php` source file on disk in `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\` + mapped every Pacred surface; enumerated multi-mode dispatchers + sub-handlers per AGENTS.md §0b.

---

## TL;DR

The forwarder surface is the most complete D1 port in the admin back-office — **the list page (11+ legacy modes), detail page, edit, new, check-bill, combine-bill, warehouse-history, notes, container-cost-check stub, bulk-search, driver list, audit-queues, container detail, cost-update, print** are all live. Functional revenue path (status 1 → 7, billing flip, driver assign, combine bill, scan-print) works end-to-end on `tb_*` schema.

**Remaining gaps are surgical, not structural:**

- 1 🔴 P0 — `[fNo]/page.tsx` row-update form still operates on rebuilt `forwarders.id` (UUID), not legacy `tb_forwarder.id` (int) — so the AdminForwarderUpdateForm + DriverAssignForm + CostAdjustmentsPanel + BillToOverridePanel surfaces are **dead on legacy rows** (the renderLegacyForwarderView fallback is read-only). The `TbForwarderActionPanel` covers status/cabinet/tracking-th/note only; the full-fat detail editor still binds to the rebuilt UUID detail.
- 4 🔴 P0 — workflow leaves still absent from any UI: `printAll/?print=N` per-row print-status flip + `update_fCover` per-row cover replace + `update_fAddress` address-from-saved-list re-pick + the 4-source carrier ZIP / free-shipping mismatch + the per-`coID` agent-customer (`tb_user_sales`) auto-insert on fStatus=7.
- 8 🟠 P1 — 3 update-form actions missing (`update_fTransportType` · `update_fUserID` · `update_fDateToThai` extra fields), legacy `forwarder-search.php` 7-key search (separate from list + bulk-search), per-row "+เพิ่มสถานะพิเศษ"/"ย้ายกลับสถานะปกติ" actions (toolbar shows status filter but mutate buttons are wired only for status ≠ p path), credit-mode (`fStatus='c'`) lifecycle UPDATE missing (sets paydeposit=2 + fCredit=1 + fCreditDate + decrements tb_credit.creditValue), "Save Note" sub-action that pushes LINE OA + LINE Notify + bot LINE, container-close-date filter (`fDateContainerClose`), per-row `printStatus1..4` badges editable.
- 7 🟡 P2 — defer to Phase C (Phase A internal-carrier API panels, `forwarder-quotation.php` 70-LOC stub itself, `forwarder-search-muti` MOMO Sack API, `forwarder-driver-w.php` standalone warehouse-driver scan, container-cost-check Sheets API, the legacy `forwarder-quotation` quote-template builder, optional adminID change `update_fAdminID`).

**Counts:** **✅ ~31 matching · ⚠️ ~12 partial · ❌ ~9 missing · 🔧 ~5 stub** out of ~57 features audited.

---

## Section 1 — Legacy PHP inventory

### 1.1 Entry-point files (`member/pcs-admin/forwarder*.php`)

| File | LOC | Modes | Key features |
|---|---:|---|---|
| `forwarder.php` | 2,661 | `?page=add` (default + create modal) · `?page=detail` (id-required, includes `include/pages/forwarder-back-up/detail.php`) · `?page=update` (id-required, 20+ POST sub-actions) | List + 4 source-tabs + 10 status-tabs + create modal + status flip + delete + move-to-special + cover upload + cabinet edit + ETA + address-from-tb_address + every cost field + credit lifecycle |
| `forwarder-check.php` | 728 | default (queue) · `?q=c` credit-only · `?q=n` normal-only | `tb_check_forwarder` queue, multi-select, `callPriceUser` POST flips fStatus 4→5 + delete-from-queue + SMS + email + LINE (mostly commented out in legacy) |
| `forwarder-bill.php` | 1,277 | default (list bills) · `?page=add` (create) · `?page=detail` (per-bill detail + photo upload + delete bill) | `tb_bill` + `tb_bill_item` combine + `pages/forwarder-bill/deleteForwarder.php` |
| `forwarder-driver.php` | 2,103 | default (driver-batch list) · `?page=add` (create driver run · multi-select forwarders) · `?page=detail` (per-batch detail · photo-end upload · scan-in) | `tb_forwarder_driver` + `tb_forwarder_driver_item`, LINE2 push to driver, fdiStatus flip, auto-expire to fdStatus=3 |
| `forwarder-driver-w.php` | 1,812 | warehouse-side flip (`update_fStatus`) | Warehouse staff drive-by-tracking scan, sets `fdiStatus` |
| `forwarder-action.php` | 1,192 | 9 audit queues via `?action=` (Note · NoteShop · notPhoto · notPortage · notContainer · NotDateContainerClose · fCreditError · NotShipFree · NotShipFreeError) + 11 QA-redirect actions | Audit queues filter `tb_forwarder` by various NULL / empty / ZIP-mismatch conditions |
| `forwarder-bill.php` (mode add) | (within 1277) | dedicated mode | "กรอกเลขที่ออเดอร์นำเข้า EX. 1,5,6" comma-list create |
| `forwarder-import-warehouse.php` | 607 | default | "ประวัติเข้าโกดังไทย" — orphan + matched sections from `tb_forwarder_import2` |
| `forwarder-import-warehouse2.php` | 525 | default | Alternate (newer) version of the same — diverged for ~1 year |
| `forwarder-quotation.php` | 70 | stub | Legacy never finished — 70 LOC includes-only |
| `forwarder-sale.php` | 363 | default | Sales rep performance dashboard (commission % per sale) |
| `forwarder-search.php` | 266 | default + `?keyType=…` 7 keys | Standalone full-page search (keyTrack/coID/cnt/closedate/fID/userID/refOrder) |
| `forwarder-search-muti.php` | 668 | default + POST `fTracking` | Multi-line tracking lookup — **calls MOMO Sack API live** |

### 1.2 Include sub-handlers (`include/pages/forwarder/*` + `forwarder-*`)

| Sub-handler | LOC | Notes |
|---|---:|---|
| `forwarder/getListForwarder.php` | ~250 | AJAX feed for list (legacy DataTables) |
| `forwarder/calPrice.php` + `calPriceNew.php` | ~200 each | rate matrix lookup (rate_g_kg/cbm + rate_vip_kg/cbm + rate_custom_*) |
| `forwarder/detail.php` | ~3,000+ | The **detail page body** included by `forwarder.php?page=detail` — 7-step timeline, cost cards, every modal |
| `forwarder/update.php` + `update copy.php` | ~1,500 | UPDATE handlers |
| `forwarder/deleteForwarder.php` | ~50 | Hard delete fStatus=1 only |
| `forwarder/deleteForwarderImport.php` | ~50 | Delete from `tb_forwarder_import` audit table |
| `forwarder/scriptFullname.php` | ~30 | AJAX populate user fullname after coID picked |
| `forwarder/scriptfTrackingCHN.php` | ~30 | AJAX dupe-check on tracking input |
| `forwarder/checkFTrackingCHN.php` | ~30 | Same shape |
| `forwarder/getUserID.php` + `…All.php` + `…All2.php` + `…All3.php` | ~50 each | AJAX user picker (filtered by coID, 4 variants) |
| `forwarder/getDataAddress.php` | ~50 | AJAX address picker (filtered by userID) |
| `forwarder/updateLock.php` | ~30 | Toggle `tb_forwarder.fLock` |
| `forwarder/api-flash-express.php` | ~150 | Live Flash Express tracking proxy |
| `forwarder-check/getListForwarder.php` | ~250 | AJAX feed for check-bill list |
| `forwarder-action/getListForwarder.php` + `menu.php` | ~250+50 | AJAX feed + per-action tab menu (audit queues) |
| `forwarder-bill/deleteForwarder.php` | ~30 | Hard-delete tb_bill+items |
| `forwarder-driver/{addFrom,addFromBill,call,deleteFD,deleteForwarder,saveLo,takePhoto,takePhotoINwarehouse}.php` | ~50-200 each | Per-action sub-handlers — 7 modes for the standalone driver page |
| `report-cnt/{editForm,getListCNTPay,getListForwarder-to-check,getListForwarder}.php` | ~50-100 each | Container-detail inline cost edit + feeds |

### 1.3 Database tables touched

`tb_forwarder` (main, ~280K rows on prod) · `tb_forwarder_item` · `tb_forwarder_driver` · `tb_forwarder_driver_item` · `tb_forwarder_tran_th_sub` (combine-tracking-thailand) · `tb_forwarder_import` + `tb_forwarder_import2` (warehouse-receive) · `tb_check_forwarder` · `tb_bill` · `tb_bill_item` · `tb_log_forwarder_status` · `tb_promotion` (legacy tagPro) · `tb_credit` (credit-limit walking sum) · `tb_user_sales` (agent commission rows) · `tb_sales_report` · `tb_address` + `tb_address_main` · `tb_users` · `tb_admin` · `tb_co` · `tb_settings` (freeShipping flag) · `tb_rate_g_kg/cbm` · `tb_rate_vip_kg/cbm` · `tb_rate_custom_cbm`.

---

## Section 2 — Pacred inventory

| Route | File | Lines | Status | Maps to legacy |
|---|---|---:|---|---|
| `/admin/forwarders` | `app/[locale]/(admin)/admin/forwarders/page.tsx` | 1,093 | ✅ | `forwarder.php` (list + add modal) |
| `/admin/forwarders/[fNo]` | `…/[fNo]/page.tsx` | 765 | ⚠️ | `forwarder.php?page=detail` + `include/pages/forwarder/detail.php` — dual mode (rebuilt UUID + legacy renderLegacyForwarderView fallback) |
| `/admin/forwarders/[fNo]/edit` | `…/[fNo]/edit/page.tsx` | 80+ | ✅ | `forwarder.php?page=update` dimensions subset |
| `/admin/forwarders/new` | `…/new/page.tsx` + `form.tsx` | 210 + 600+ | ✅ | `forwarder.php` create modal (9 cascading fields) |
| `/admin/forwarders/combine-bill` | `…/combine-bill/page.tsx` | 200+ | ✅ | `forwarder-bill.php` default + delete row action |
| `/admin/forwarders/combine-bill/add` | `…/combine-bill/add/page.tsx` | ~ | ✅ | `forwarder-bill.php?page=add` |
| `/admin/forwarders/combine-bill/print` | `…/combine-bill/print/page.tsx` | 60 | ✅ | legacy `printBill.php` (HTML + window.print, no mPDF) |
| `/admin/forwarders/warehouse-history` | `…/warehouse-history/page.tsx` | 500+ | ✅ | `forwarder-import-warehouse.php` (orphan + matched + relink + delete) |
| `/admin/forwarders/notes` | `…/notes/page.tsx` | 200+ | ✅ | `forwarder-action.php?action=Note` (subset) |
| `/admin/forwarders/container-cost-check` | `…/container-cost-check/page.tsx` | 58 | 🔧 stub | `check-sang-cost.php` (Phase C — Sheets API) |
| `/admin/forwarders/bulk-search` | `…/bulk-search/page.tsx` + `bulk-search-form.tsx` | 53 + ~ | ✅ (rebuilt-only) | `forwarder-search-muti.php` (subset — no MOMO Sack API call) |
| `/admin/forwarders/print` | `…/print/page.tsx` | ~ | ✅ | `printAll.php` (HTML window.print) |
| `/admin/forwarder-check` | `app/[locale]/(admin)/admin/forwarder-check/page.tsx` | 200+ | ✅ | `forwarder-check.php` (3 tabs + bulk-bill + SMS/LINE/email) |
| `/admin/forwarder-action` | `…/forwarder-action/page.tsx` | 60+ | ✅ | `forwarder-action.php` 9-queue dispatcher + 10 QA URL redirects |
| `/admin/forwarder-import-warehouse` | `…/forwarder-import-warehouse/page.tsx` | 39 | ✅ (redirect) | `forwarder-import-warehouse.php` → `/admin/forwarders/warehouse-history` |
| `/admin/forwarder-sales` | `…/forwarder-sales/page.tsx` | ~ | ✅ | `forwarder-sale.php` |
| `/admin/drivers` | `…/drivers/page.tsx` | 300+ | ✅ | `forwarder-driver.php` default list |
| `/admin/drivers/new` | `…/drivers/new/page.tsx` | ~ | ✅ | `forwarder-driver.php?page=add` |
| `/admin/drivers/[id]` | `…/drivers/[id]/page.tsx` | ~ | ✅ | `forwarder-driver.php?page=detail` |
| `/admin/drivers/work` | `…/drivers/work/page.tsx` | ~ | ✅ | `forwarder-driver-w.php` warehouse-side |
| `/admin/report-cnt` | `…/report-cnt/page.tsx` | ~ | ✅ | `report-cnt.php` list |
| `/admin/report-cnt/[fNo]` | `…/report-cnt/[fNo]/page.tsx` | ~ | ✅ | `report-cnt.php?id=` mode-b + cost-update view |
| `/admin/cargothai` | `…/cargothai/page.tsx` | 200+ | ✅ | `cargo-from-china.php` (Pacred-native, Sprint 7) |
| `/admin/forwarders/[fNo]/update-form.tsx` | client island | ~280 | ⚠️ | `forwarder.php?page=update` core sub-set |
| `/admin/forwarders/[fNo]/tb-action-panel.tsx` | client island | ~ | ✅ | `forwarder.php?page=update` (Wave 23 close-out) — covers `update_data` subset |
| `/admin/forwarders/[fNo]/driver-assign-form.tsx` | client island | ~ | ⚠️ | `forwarder-driver.php?page=add` per-row variant — **rebuilt UUID only** |
| `/admin/forwarders/[fNo]/cost-adjustments-panel.tsx` | client island | ~ | ⚠️ | Pacred-native U2-4 — `tb_log_forwarder_cost` Pacred-only, **rebuilt UUID only** |
| `/admin/forwarders/bulk-actions-toolbar.tsx` | client island | ~ | ⚠️ | `forwarder.php` moveStatusTo99 + removeStatusTo99 — **wired but reads rebuilt `forwarder_status` enum, not legacy `fstatus` numeric** |
| `actions/admin/forwarders.ts` | server | 7 functions | ⚠️ | adminUpdateForwarder · adminBulkUpdateForwarderStatus · adminMarkForwarderPaid · adminBulkUpdateForwarderTbStatus (the legacy-tb variant) · adminSetForwarderBillToOverride · markForwarderPrinted · adminRestoreForwarderFromSpecial — **only `adminBulkUpdateForwarderTbStatus` + `markForwarderPrinted` + `adminRestoreForwarderFromSpecial` truly hit `tb_forwarder`** |
| `actions/admin/forwarders-bulk.ts` | server | 3 functions | ⚠️ | bulkUpdateStatus · bulkAssignDriver · bulkCancel — **all rebuilt-UUID** |
| `actions/admin/forwarders-new.ts` | server | ~ | ✅ | adminCreateForwarder + cascades — hits `tb_forwarder` properly |
| `actions/admin/forwarders-edit.ts` | server | 1 fn | ✅ | adminEditForwarderDimensions — hits `tb_forwarder` properly |
| `actions/admin/forwarder-check.ts` | server | 2 fns | ✅ | callPriceUser bulk-bill + removeFromCheckQueue |
| `actions/admin/combine-bill.ts` | server | ~3 fns | ✅ | adminCreateCombineBill + adminDeleteCombineBill + print URL builder |
| `actions/admin/forwarder-drivers.ts` | server | 4 fns | ⚠️ | searchDriversByQuery + assign + … — **rebuilt-UUID** |
| `actions/admin/forwarder-cost-adjustments.ts` | server | ~ | ⚠️ | Pacred-native — rebuilt UUID |
| `actions/admin/forwarder-cost.ts` | server | ~ | ✅ | Cost edit (`fpriceupdate` etc) |
| `actions/admin/forwarder-invoice.ts` | server | ~ | ✅ | Wave 20 — `tb_receipt` mint |
| `actions/admin/api-forwarder-manual.ts` | server | ~ | ✅ | Per Wave 17 manual entry forms |

---

## Section 3 — Gap matrix

### 3.1 List page (`/admin/forwarders` vs `forwarder.php` default mode)

| Feature | Legacy | Pacred | Gap | Pri | ETA |
|---|---|---|---|---|---:|
| 4 source-tabs (ทั้งหมด/users/system/admin) | `?create=` | `?create=` | ✅ | — | — |
| 10 status-tabs with per-status counts | `?q=1..7,6.1,c,p` | `?status=1..7,6.1,c,p` + counts (✅ except 6.1 count is 0) | ⚠️ 6.1 count TODO | P2 | 1h |
| Date-range filter w/ 30d default | `historyTable`/`historyTableAll` form | `?date_from/to`/`?all=1` Pacred | ✅ | — | — |
| Cover thumbnail per row | direct fCover | resolveLegacyUrlMap (signed) | ✅ | — | — |
| Per-row `printStatus1..4` "พิมพ์แล้ว" badges | 4 colored pills | 4 booleans → 4 pills | ✅ | — | — |
| `fStatusCarOn/Off` "ขึ้นรถ/ลงรถ" pills | 2 yellow/secondary pills | 2 booleans → 2 pills | ✅ | — | — |
| Multi-select + bulk-bar | row checkbox + bottom fixed bar | row checkbox + sticky toolbar | ⚠️ wired to **rebuilt enum**, not `fstatus` | **P0** | 4h |
| "เพิ่มไปสถานะพิเศษ" / "ย้ายกลับสถานะปกติ" buttons | POST moveStatusTo99/removeStatusTo99 with audit log INSERT | UI button via bulk-actions-toolbar `bulkCancel` (rebuilt enum) | ❌ does NOT write `tb_forwarder.fstatus='99'` + `tb_log_forwarder_status` | **P0** | 3h |
| "พิมพ์จากหน้ากล่อง" + "พิมพ์ที่ส่งอยู่สินค้า" bottom bar buttons (`name=print value=1/4`) | GET form action → printAll.php | exists at `/admin/forwarders/print` but the **bottom-bar buttons in the list are NOT wired to call it with selected IDs** | ❌ | P0 | 2h |
| Customer cell badges (`badgeVIP3` · `badgeAdminSale`) | 6 chip variants | is_svip + is_corporate + is_comparison + is_juristic + sale_admin | ✅ | — | — |
| ETA range calc (rถ +2d / เรือ +4d) | inline | inline (ftransporttype) | ✅ | — | — |
| `fNote` highlighted box + "ยังไม่อ่าน" indicator | text-white bg-danger + read flag | inline | ✅ | — | — |
| Per-row outstanding balance | `calPriceForwarderMain(...)` | `calcForwarderOutstanding(...)` lib (faithful port) | ✅ | — | — |
| Default-queue redirect per role | not in legacy (single role) | super skips / warehouse → status=3 / accounting → status=4 / sales → status=1 | ✅ | enhancement | — |
| Server-side keyword search (incl name + phone via tb_users prefetch) | LIKE in JOIN | PostgREST .or() across 5 cols + tb_users prefetch | ✅ | — | — |
| Empty Pacred-table 1%-VAT "ค่าขนส่งจีน, ราคาขายรวม" summary row (status=5 + money-tier) | total at footer | ❌ not in Pacred list | ⚠️ | P1 | 1.5h |
| 6.1 ของกำลังจัดส่ง count badge | `$status_driver_item` count | filterOpts[6.1].n = 0 (TODO) | ⚠️ | P2 | 1h |

### 3.2 Detail page (`/admin/forwarders/[fNo]` vs `forwarder.php?page=detail` + `include/pages/forwarder/detail.php`)

| Feature | Legacy | Pacred | Gap | Pri | ETA |
|---|---|---|---|---|---:|
| Resolution by numeric `id` (tb_forwarder.id) | yes | `renderLegacyForwarderView` fallback | ✅ | — | — |
| Resolution by `fidorco` slug | not in legacy (always int) | yes | ✅ enhancement | — | — |
| 7-step status timeline | tabs with active/visited PNG icons | Lucide icons + colored badge | ✅ (better UX) | — | — |
| Customer card + avatar + LINE/email + phone | yes (tb_users JOIN) | yes (renderLegacyForwarderView) | ✅ | — | — |
| Cost breakdown 9 lines | transport + update + crate + qc + shipping + chnthb + other + discount + total | same 9 lines | ✅ | — | — |
| Combine-bill back-link (`tb_bill_item.fID`) | "เลข bill" badge | ❌ not shown in Pacred detail | ⚠️ | P1 | 0.5h |
| sales rep + creator badges | adminIDSale + adminIDCreator + refOrder | sourceTag + sale-admin chip | ✅ | — | — |
| 7 quick-action ribbon buttons (พิมพ์จากกล่อง · พิมพ์ที่อยู่ · ใบเสร็จ) | yes (if status≥3 and ≥5 + paydeposit≠1 + credit≠1) | ❌ only "ดูตู้คอนเทนเนอร์" + "แก้ไขขนาด" | ❌ | **P0** | 3h |
| `fStatusCarDateOn/Off + adminOn/Off` (who/when ขึ้น-ลงรถ) | shown in detail | ❌ not in Pacred renderLegacyForwarderView | ⚠️ | P1 | 1h |
| `crate` / `payMethod` / `fShipBy` (named label) | 3 lines | crate field + paymethod (limited) | ⚠️ partial | P1 | 0.5h |
| Combined tracking-thailand info ("รายการนี้ถูกคิดค่าขนส่งในไทยรวมกับ…" warning) | `tb_forwarder_tran_th_sub` join | ❌ not shown | ⚠️ | P1 | 1h |
| Photo end (fPhotoEnd) display when delivered | `<img>` + popup | ❌ not shown | ⚠️ | P1 | 0.5h |
| AdminForwarderUpdateForm (rebuilt) | — | wired to rebuilt UUID only | ❌ **dead on legacy rows** | **P0** | 4h |
| DriverAssignForm (rebuilt) | — | wired to rebuilt UUID only | ❌ dead on legacy rows | P1 | 3h |
| CostAdjustmentsPanel (rebuilt) | — | wired to rebuilt UUID only | ❌ dead on legacy rows (Pacred-native model anyway) | P1 | 2h |
| BillToOverridePanel | — | wired to rebuilt UUID only | ❌ dead on legacy rows | P1 | 1h |
| TbForwarderActionPanel (legacy) | status / cabinet / tracking-th / note | wired to `tb_forwarder` | ✅ (Wave 23 P0 #4) | — | — |
| "บันทึก หมายเหตุ" saveNote sub-action (LINE OA push + bot push + read flag) | full | TbForwarderActionPanel writes fnote only — **no LINE OA push from detail** | ⚠️ | **P0** | 2h |
| update_fTransportType POST | inline button | ❌ not in form | ❌ | P1 | 1h |
| update_fUserID POST (re-assign owner) | inline | ❌ not in form | ❌ | P1 | 0.5h |
| update_fAddress POST (pick from saved list) | dropdown | ❌ not in form (address shown read-only) | ❌ | **P0** | 2h |
| update_fCover POST (replace cover image) | file input | ❌ not in form | ❌ | P1 | 1h |
| update_fCabinetNumber POST | inline | ✅ via TbForwarderActionPanel | ✅ | — | — |
| update_fDateToThai + fDateContainerClose POST | inline | ❌ not in form | ❌ | P1 | 1h |
| update_data (all-fields bulk update for "บันทึก") | mega POST with rate matrix recalc | ❌ — the Pacred edit page covers a subset | ⚠️ | P1 | 4h |

### 3.3 Create modal (`/admin/forwarders/new` vs `forwarder.php?page=add` POST `save`)

| Feature | Legacy | Pacred | Gap | Pri | ETA |
|---|---|---|---|---|---:|
| coID cascade | `tb_co` dropdown | `tb_co` dropdown | ✅ | — | — |
| userID cascade (filtered by coID) | `tb_users WHERE coid=...` | `fetchUsersByCoid` | ✅ | — | — |
| fTrackingCHN dupe-check (AJAX) | `scriptfTrackingCHN.php` live check | ❌ not in form | ⚠️ | P2 | 1h |
| fDetail required textarea | yes | yes | ✅ | — | — |
| fAmount (1-10000) | yes | yes | ✅ | — | — |
| fCover upload (resize 450×N) | GD library | upload only — no resize | ⚠️ acceptable | P2 | — |
| fShipBy dropdown | hardcoded 46 carriers | hardcoded 46 carriers (matches legacy values) | ✅ | — | — |
| addressID picker (filtered by userID + main flag) | `tb_address` + `tb_address_main` | `fetchAddressesByUserid` w/ main flag | ✅ | — | — |
| `PCS` ship hardcoded address (12 ซ.เพชรเกษม 77) | yes | yes | ✅ | — | — |
| fTransportType (1=รถ, 2=เรือ ONLY) | yes (no 3=air at create) | yes (TRANSPORT_OPTIONS = 2) | ✅ | — | — |
| LINE Notify to customer on insert | sendLine(userLineNotify, ...) | via `sendNotification` (LINE OA, fallback email) | ✅ better | — | — |
| Admin LINE notify (`lineNotifyForwarder`) | yes | ⚠️ partial — need to verify | ⚠️ | P2 | 0.5h |
| Sale-mail to customer | contentMailForwarderNew (commented out) | sendNotification handles | ✅ | — | — |

### 3.4 Check-bill page (`/admin/forwarder-check` vs `forwarder-check.php`)

| Feature | Legacy | Pacred | Gap | Pri | ETA |
|---|---|---|---|---|---:|
| Tabs (ทั้งหมด/credit/normal) + counts | 3 tabs | 3 tabs | ✅ | — | — |
| `addCheck` POST (drop into queue) | yes | ❌ not in this page — done from `/admin/report-cnt` per-row | ⚠️ different entry path | P2 | — |
| `callPriceUser` POST (bulk-bill 4→5) | yes — SMS + email + LINE | yes — SMS + LINE OA push + email fallback | ✅ better | — | — |
| `tb_check_forwarder` cleanup orphans | DELETE WHERE fStatus<5 | done in action | ✅ | — | — |
| Money columns (ต้นทุน · กำไร · 1%) gated by department | yes | yes (showMoneyColumns gating) | ✅ | — | — |
| 28-column table (every cost field) | 28 cols | 11 grouped cols | ⚠️ design decision per AGENTS §0a | P2 | — |

### 3.5 Combine-bill (`/admin/forwarders/combine-bill` vs `forwarder-bill.php`)

| Feature | Legacy | Pacred | Gap | Pri | ETA |
|---|---|---|---|---|---:|
| Default list with 90-day default | yes | yes | ✅ | — | — |
| `?page=add` create (comma-list) | yes | `/combine-bill/add` page | ✅ | — | — |
| `?page=detail` per-bill (photo upload + delete + driver assignment) | yes | ❌ — Pacred has `/combine-bill/print` but no editable detail | ❌ | P1 | 3h |
| `update_fPhotoEnd` (driver upload photo to mark delivered) | yes — flips fStatus=7 + fdiStatus=2 + tb_user_sales | ❌ | ❌ | P1 | 3h |
| Print delivery-slip A4 | mPDF | HTML + window.print | ✅ (Phase C: react-pdf) | — | — |
| Bulk-select + bulk-print + bulk-delete | DataTables checkboxes | row-actions only (no bulk) | ⚠️ | P2 | 2h |

### 3.6 Driver assignments (`/admin/drivers` vs `forwarder-driver.php`)

| Feature | Legacy | Pacred | Gap | Pri | ETA |
|---|---|---|---|---|---:|
| Default list with 90-day default | yes | yes | ✅ | — | — |
| Auto-expire (endTime past → fdStatus=3) | runs on page load | ❌ not in Pacred (would need cron / on-read) | ⚠️ | P1 | 2h |
| `?page=add` (create driver run multi-select) | yes — INSERT tb_forwarder_driver + N tb_forwarder_driver_item + LINE2 push | `/drivers/new` | ✅ | — | — |
| Multi-select forwarders | yes | yes | ✅ | — | — |
| Driver picker by adminID | tb_admin dropdown | drivers profile picker (rebuilt-UUID-aware) | ⚠️ — must verify legacy adminID is preserved | P2 | 1h |
| LINE2 push to driver bot (2 tokens) | hardcoded token + driver token | ⚠️ verify env-var mapping | P1 | 1h |
| `?page=detail` per-batch + photo-end upload + scan-in | yes | `/drivers/[id]` | ✅ | — | — |
| `update_fPhotoEnd` flips fStatus=7 + fdiStatus=2 + checks all-batch-done → fdStatus=2 | yes + agent commission insert | ⚠️ verify Pacred drivers/[id] does this | P1 | 1h |
| `tb_user_sales` agent-customer auto-insert (THADA.VIP→PCS888 etc.) on fStatus=7 | 4 hardcoded mappings | ❌ likely not ported | **P0** | 1h |
| warehouse-side flip (`forwarder-driver-w.php`) | 1812 LOC | `/drivers/work` page exists | ⚠️ verify scope | P2 | — |

### 3.7 Audit queues (`/admin/forwarder-action` vs `forwarder-action.php`)

| Queue | Legacy | Pacred | Gap | Pri | ETA |
|---|---|---|---|---|---:|
| Note (fnote<>'') | yes | yes (also has standalone /admin/forwarders/notes) | ✅ | — | — |
| NoteShop (tb_header_order.hNote<>'') | yes | yes | ✅ | — | — |
| notPhoto | yes | yes | ✅ | — | — |
| notPortage | yes | yes | ✅ | — | — |
| notContainer (fCabinetNumber empty) | yes | yes | ✅ | — | — |
| NotDateContainerClose (fDateContainerClose empty) | yes | yes | ✅ | — | — |
| fCreditError (credit overdue) | yes | yes | ✅ | — | — |
| NotShipFree (eligible-for-free-ship ZIP but fShipBy<>PCSF) | yes — uses union of 6 PHP ZIP arrays | yes (Wave 2) — uses same source-of-truth ZIPs | ✅ | — | — |
| NotShipFreeError (PCSF but ZIP not free) | yes | yes | ✅ | — | — |
| 10 QA-queue legacy URL redirects | — | yes (Wave 26) | ✅ enhancement | — | — |

### 3.8 Warehouse history (`/admin/forwarders/warehouse-history` vs `forwarder-import-warehouse.php`)

| Feature | Legacy | Pacred | Gap | Pri | ETA |
|---|---|---|---|---|---:|
| Orphan section (fi.fID IS NULL) | yes | yes | ✅ | — | — |
| Matched section (LEFT JOIN tb_forwarder) | yes | yes | ✅ | — | — |
| 3 date modes (historyTable + historyTableAll + default 30d) | yes — default 30d | Pacred default = 7d (Wave 20 qw2) | ⚠️ different default; legacy = 30 days | P2 | 0.5h |
| Dupe-tracking badge ("มีรายการซ้ำ") | yes — per row | ⚠️ verify present | P2 | 0.5h |
| Cover thumbnail + popup | yes | yes (resolveLegacyUrlMap) | ✅ | — | — |
| Relink modal | — | yes (Wave 13) | ✅ enhancement | — | — |
| Delete | yes | yes | ✅ | — | — |
| Bulk-print PDF | — | banner-flagged Wave 21 deferred | ⚠️ banner-honest | P2 | — |
| Mark-as-no-match sentinel write (fid='0') | — | ❌ deferred | ⚠️ banner-honest | P2 | — |

### 3.9 Search (`forwarder-search.php` standalone)

| Feature | Legacy | Pacred | Gap | Pri | ETA |
|---|---|---|---|---|---:|
| 7-key search (tracking · coID · cnt · close-date · fID · userID · refOrder) | dedicated page | ❌ not as standalone — keyword search on list covers most but not "close-date" or "refOrder" or "coID" | ⚠️ | P1 | 2h |
| Multi-line bulk search via MOMO Sack API | yes | `/bulk-search` covers part — **NO MOMO Sack call** | ⚠️ | P2 | — |
| Result highlighting (`<mark>`) | yes | search-bar component renders matches inline | ✅ | — | — |

### 3.10 Quotation (`forwarder-quotation.php` 70 LOC)

| Feature | Legacy | Pacred | Gap | Pri | ETA |
|---|---|---|---|---|---:|
| Quotation builder | 70 LOC includes-only stub — legacy never finished | ❌ not in Pacred | ✅ acceptable (parity) | — | — |

### 3.11 Misc tables / actions / sub-flows

| Feature | Legacy | Pacred | Gap | Pri | ETA |
|---|---|---|---|---|---:|
| `tb_log_forwarder_status` audit-log INSERT on any fstatus flip | every status change writes | needs verify on every Pacred action — TbForwarderActionPanel does, bulk-actions does NOT | ⚠️ | P1 | 2h |
| `updateLock` (toggle tb_forwarder.fLock) | yes (super-only) | ❌ not in Pacred | ⚠️ | P2 | 1h |
| `fCredit='c'` lifecycle UPDATE (credit-out) | sets paydeposit=2 + fCredit=1 + fCreditDate + fDateStatus5 + decrements `tb_credit.creditValue` | ⚠️ TbForwarderActionPanel doesn't include credit flip | ❌ | P1 | 2h |
| Credit-cleanup on bill (DELETE tb_check_forwarder) | yes | yes | ✅ | — | — |
| `tb_user_sales` agent-commission INSERT on fStatus=7 (THADA.VIP→PCS888 etc.) | yes (4 mappings) | ❌ not ported | **P0** | 1h |
| `tb_sales_report` INSERT on fStatus=7 with sale-admin | yes | ⚠️ verify in adminBulkUpdateForwarderTbStatus | P1 | 1h |
| Flash Express tracking proxy | yes (api-flash-express.php) | ❌ not ported | ⚠️ | P2 | 2h |
| Print-status badges flip on print | `name=print value=1/4` updates printStatus1/printStatus4 | `markForwarderPrinted` action exists | ✅ | — | — |

---

## Section 4 — Top P0 fixes (close before launch / Wave 31)

**Total P0 ETA: ~17 hours dev (2 days realistic).**

### P0-1 — `/admin/forwarders/[fNo]/page.tsx` legacy-row editor (~4h)

Current state: the page tries rebuilt `forwarders` (UUID) first, falls through to `renderLegacyForwarderView` for legacy rows. The fallback is **read-only**. Operators clicking ✏️ on a legacy row land in `/edit` (dimensions only) — they cannot change status / cabinet / tracking-th / note from a single "Save" button as in legacy `forwarder.php?page=update`.

The `TbForwarderActionPanel` (added Wave 23) closes some of the gap (status + cabinet + tracking-th + note). Remaining gaps are: address pick-from-list, cover replace, transport-type swap, sale-rep reassign, ETA + container-close-date, photo-end upload, credit-mode flip.

**Files:**
- `app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx` (~765 LOC) — extend renderLegacyForwarderView aside actions
- `app/[locale]/(admin)/admin/forwarders/[fNo]/tb-action-panel.tsx` — add tabs/sections for address + cover + ETA + credit
- `actions/admin/forwarders.ts` — add server actions for the 6 missing field updates

### P0-2 — Detail page quick-action ribbon (~3h)

Legacy `include/pages/forwarder-back-up/detail.php` L110-134 has 7 ribbon buttons (พิมพ์จากกล่อง · พิมพ์ที่อยู่ · ใบเสร็จ · 4 status-flag pills). Pacred shows 2 buttons. Missing: ใบเสร็จ link (`gatway-receipt-forwarder.php?type=1&fID=`), print-from-box link with fid, print-address link with fid.

**Files:**
- `app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx` — extend the action panel
- Link to existing `/admin/forwarders/print` route with `?print=1&id[]=N` shape

### P0-3 — List-page status-99 toggle + bulk-print wiring (~5h)

Two list-page mutate buttons that fire `tb_forwarder.fstatus` changes are wired to the **rebuilt enum**, not the legacy numeric `fstatus`:

- `bulk-actions-toolbar.tsx` `bulkCancel` writes `forwarder.status='cancelled'` (rebuilt) — should also write `tb_forwarder.fstatus='99'` + INSERT `tb_log_forwarder_status` row for selected rows.
- "เพิ่มไปสถานะพิเศษ" / "ย้ายกลับสถานะปกติ" buttons (legacy `forwarder.php` L727-731) are not present at all.
- Bottom-bar "พิมพ์จากหน้ากล่อง / พิมพ์ที่ส่งอยู่สินค้า" buttons (legacy GET form) don't call `/admin/forwarders/print?print=1&id[]=…` with the multi-select set.

**Files:**
- `app/[locale]/(admin)/admin/forwarders/bulk-actions-toolbar.tsx` — add status-99 + restore + bulk-print
- `actions/admin/forwarders.ts` — `adminBulkSetForwarderSpecial(ids)` + `adminBulkRestoreForwarderSpecial(ids)` (already exists for single, needs bulk)
- `actions/admin/forwarders-bulk.ts` — rewrite to write `tb_forwarder` not rebuilt

### P0-4 — saveNote LINE OA + LINE-Notify push (~2h)

Legacy `forwarder.php?page=detail` `saveNote` POST sends LINE OA push to **3 endpoints**: bot token, user's userLineNotify, and the per-feature webhook. Pacred TbForwarderActionPanel writes `fnote` only — **no LINE/email outbound on note save**.

**Files:**
- `actions/admin/forwarders.ts` (or new `actions/admin/forwarders-notes.ts`) — add `adminSaveForwarderNote` that triggers `sendNotification` to the customer + admin webhook
- `app/[locale]/(admin)/admin/forwarders/[fNo]/tb-action-panel.tsx` — wire "ส่งแจ้งเตือนลูกค้า" toggle

### P0-5 — `tb_user_sales` agent-customer auto-insert on fStatus=7 (~1h)

Legacy `forwarder.php?page=update` + `forwarder-driver-w.php` + `forwarder-driver.php?page=detail` all INSERT into `tb_user_sales` when `coID` matches one of the 4 hardcoded agent codes (THADA.VIP→PCS888, SIN.VIP→PCS352, OOAEOM.VIP→PCS2678, SWAN→PCS4155). Pacred status-flip helpers don't do this. **Revenue: agents lose commission visibility.**

**Files:**
- `lib/notifications/status-flip-helper.ts` — extend `appendStatusLog` to also write tb_user_sales when fStatus=7 + map matches
- Or `actions/admin/forwarders.ts` `adminBulkUpdateForwarderTbStatus` — insert after status flip

### P0-6 — `update_fAddress` re-pick from customer's saved addresses (~2h)

Detail page legacy section lets admin pick a different `addressID` from the customer's `tb_address` rows; selecting unpacks all 11 fAddress* columns. Pacred renderLegacyForwarderView shows the address **read-only** — no re-pick. Real workflow: customer calls in to change delivery address → admin must edit each of 11 fields manually today.

**Files:**
- `app/[locale]/(admin)/admin/forwarders/[fNo]/tb-action-panel.tsx` — add address picker tab
- `actions/admin/forwarders.ts` — `adminUpdateForwarderAddress(fid, addressID)` that reads `tb_address` + unpacks

---

## Section 5 — P1 backlog (~16h)

1. **update_fTransportType + update_fUserID standalone POSTs** (~1.5h) — let admin swap mode/owner without re-saving the whole row.
2. **Credit-mode (`fStatus='c'`) lifecycle** (~2h) — set paydeposit=2 + fCredit=1 + fCreditDate + decrement tb_credit.creditValue; needed for the credit-customers (PCS16, PCS2555, etc.).
3. **Detail-page `fStatusCarDateOn/Off + adminOn/Off`** display (~1h) — who flipped ขึ้น-ลงรถ + when; warehouse staff need this for audits.
4. **Detail-page combine-bill back-link badge** (~0.5h) — show "bill #N" on rows that are part of a combined bill so admin can navigate back.
5. **Combine-bill `?page=detail` (per-bill photo upload + delete bill + driver-assignment)** (~3h) — bill driver photo flow.
6. **`forwarder-search.php` 7-key standalone search page** (~2h) — coID + closedate + refOrder filters not coverable by keyword search.
7. **Combined-tracking-thailand warning** (~1h) — show `tb_forwarder_tran_th_sub` siblings on detail page.
8. **`tb_log_forwarder_status` write on all Pacred mutations** (~2h) — bulk-actions, mark-paid, cost-adjustment all need to log into audit table.
9. **List-page status=5 "ค่าขนส่งจีน + 1%-VAT" summary footer** (~1.5h) — money-tier roles.
10. **Driver-batch auto-expire (endTime past → fdStatus=3)** (~2h) — cron or on-read in /admin/drivers.
11. **`tb_sales_report` INSERT on fStatus=7 with adminIDSale** (~1h) — verify Pacred path writes (probably already covered in adminBulkUpdateForwarderTbStatus).
12. **Combine-bill bulk-select + bulk-print + bulk-delete** (~2h) — DataTables checkboxes equivalent.
13. **fNoteUserRead read-flag for customer-visible notes** (~0.5h) — already mostly in renderLegacyForwarderView; add the editable side.
14. **Photo-end upload on detail page when status=7** (~1h) — fPhotoEnd field display + upload.

---

## Section 6 — ✅ Matching (no action needed)

- 4-source-tab strip (ทั้งหมด/users/system/admin)
- 10-status-tab strip + per-status counts (badge counts behave correctly on prod)
- Date-range default 30d + `?all=1` escape (Wave 18-B faithful to legacy 30d)
- Customer-cell SVIP/Corporate/Comparison/Juristic chips + sale-rep chip
- ETA range calc (+2d road / +4d sea)
- Server-side keyword search across 5 fields + name/phone prefetch (Wave 26)
- Per-row outstanding balance via `calcForwarderOutstanding` (`calPriceForwarderMain` port)
- 4 print-status pills + 2 carOn/Off pills on every row
- Default-queue redirect per role (G6 enhancement)
- Create modal: 9-field cascade (coID → user → tracking + detail + amount + cover + shipBy → addressID → fTransportType)
- Create modal: 46-carrier `fShipBy` dropdown
- Create modal: PCS-shipBy hardcoded pickup address
- Create modal: 2-only fTransportType (1/2 — air only via edit later)
- Check-bill 3 tabs + bulk-bill 4→5 + SMS/LINE/email
- Combine-bill list + add + print delivery slip + delete row action
- Combine-bill 90-day default + date-range filter
- Warehouse-history orphan + matched + relink + delete
- Notes page faithful read on `tb_forwarder.fnote`
- Container-cost-check stub (banner-flagged Phase C)
- Bulk-search 3-table parallel lookup (forwarders tracking_chn + tracking_th + items product_tracking)
- 9 audit-queue dispatchers + 10 QA-redirect URLs
- Per-row product thumbnail with Supabase signed URL
- TbForwarderActionPanel (Wave 23) — status + cabinet + tracking-th + note
- adminEditForwarderDimensions hits tb_forwarder properly (Wave 12-C ภาค 2)
- adminCreateForwarder hits tb_forwarder properly (Wave 12-C v2)
- adminBulkUpdateForwarderTbStatus hits tb_forwarder properly (Wave 18)
- markForwarderPrinted flips printStatus1..4 on tb_forwarder
- adminRestoreForwarderFromSpecial (status=99 → restore)
- /admin/forwarder-action 9 queues fully wired
- /admin/forwarder-import-warehouse legacy URL → /admin/forwarders/warehouse-history redirect (Wave 16 P0-4)
- /admin/cargothai sync foundation (Sprint 7)
- /admin/report-cnt list + /admin/report-cnt/[fNo] container drill-down + cost-update view (Wave 16 P0-1)
- /admin/drivers list + new + [id] + work (Wave 10 + 2026-05-30 #3 driver list rewrite)

---

## Surprises / Notes

1. **Pacred's biggest leverage is `[fNo]/page.tsx` dual-mode.** It already detects rebuilt-UUID vs legacy-row and falls into `renderLegacyForwarderView`. The aside panels (UpdateForm/DriverAssign/CostAdjustments/BillToOverride) only render on the rebuilt path. **Closing P0-1 is mostly wiring the aside panels to use `tb_forwarder.id` when the route landed in legacy-fallback mode** — not a full rewrite.
2. **The legacy `forwarder.php` has TWO copies of the detail PHP** — `include/pages/forwarder/` (active per Glob output) AND `include/pages/forwarder-back-up/` (the back-up name notwithstanding, the 16-file backup folder is also referenced via includes; the detail.php I read was in `forwarder-back-up/`). Both folders end up being SQL-identical based on the queries I sampled; Pacred should treat the back-up folder as the canonical detail source since the path is what legacy actually `require_once`'s in the running app.
3. **`forwarder-quotation.php` is 70 LOC of stubs** — legacy itself never built the quotation builder. Pacred's "missing" quotation is the legacy state; nothing to port.
4. **`forwarder-driver-w.php` (1812 LOC) is almost entirely UI shell** — the actual DB writes are 3 small POSTs (`update_fStatus`, `update_fPhotoEnd`, `updateLocation`). The standalone version exists because legacy admins had a separate "warehouse-staff" left-menu — Pacred merged this into `/admin/drivers/work` (good call).
5. **Two `forwarder-import-warehouse.php` files exist (v1 = 607 LOC, v2 = 525 LOC).** Legacy diverged the orphan flow ~1 year ago; the active one is v1 per how `header.php` includes it. Pacred warehouse-history page ports v1.
6. **`forwarder-search-muti.php` calls MOMO Sack API live** — partner endpoint. Pacred bulk-search does parallel-3-table local lookup but skips the MOMO call. That's listed P2 in `cargo-flow-deep-audit-2026-05-25.md`, and it's still correct here.
7. **The `adminID` legacy varchar(10)** column on tb_forwarder mutations — Pacred `resolveLegacyAdminId()` helper appears in **3 separate action files** (`forwarders-edit.ts` L45, `forwarders-new.ts` L55, `combine-bill.ts` L70) with identical bodies. There's `lib/auth/safe-legacy-admin-id.ts` available; the per-action duplication is mild tech-debt (~10 minutes refactor) but works correctly today.
8. **The bulk-actions toolbar (`bulk-actions-toolbar.tsx`) uses the rebuilt 7-value status enum** (`pending_payment`/`shipped_china`/etc.), not the legacy 10-value numeric strings. This is the **single biggest divergence**: any operator using the list-page bulk bar against `tb_forwarder` rows triggers writes to the rebuilt `forwarders` table — which on prod is empty — so the apparent "ok" toast leaves `tb_forwarder` untouched. The action is in **dead-write mode silently** for any row that came from `tb_forwarder`. Mark this P0 even though the user doesn't see a 500.
