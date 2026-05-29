# adm-09-forwarder-ops — Admin ฝากนำเข้า ops fidelity gap (2026-05-30)

> **Lane:** Admin — forwarder · driver · barcode · container(cnt) · warehouse
> **Legacy SOT:** `…/pcsc/public_html/member/pcs-admin/{forwarder*,barcode-*,cnt*,report-cnt,import-excel}.php`
> **Pacred HEAD audited:** `dave-pacred` @ `844a0b5a` (post Tier-A merge `0e13f56a`)
> **Method:** TRUST-BUT-VERIFY — opened the actual Pacred action files + routes and confirmed table targets / flow order against the legacy PHP. **This is a DELTA pass** over `docs/audit/master-fidelity-2026-05-30-evening.md` + its 3 source agent docs (forwarders / drivers-barcode / cnt-warehouse). Several P0s those docs raised have since been **fixed** (Tier-A merge); this doc records the *current* verified state, not the audit's snapshot.

---

## Overview

**Legacy scope (this lane):** ~30 PHP entry files, ~31,000 LOC. The daily cargo revenue spine:
`forwarder.php` (2,661 — list/detail/create + 20+ update sub-actions) · `forwarder-check.php` (728 — bulk-bill 4→5) · `forwarder-bill.php` (1,277 — combine-bill) · `forwarder-driver.php` (2,103 — driver-batch model + auto-expire + photo cascade) · `forwarder-driver-w.php` (1,812 — warehouse driver scan) · `forwarder-action.php` (1,192 — 9 audit queues) · `forwarder-import-warehouse.php` (607 — warehouse intake history) · `report-cnt.php` (2,502 — container payment list + drill-down + cost-update Sheets) · `cnt-hs.php` (1,861 — cnt payment ledger) · 13 `barcode-{c,d}-*.php` + `gateway.php` + `barcode-import/index.php` (warehouse scan writers) · `printAll.php` (969) · `printDriver.php` (248) · `forwarder-search*.php` · `forwarder-sale.php`.

**Pacred scope:** `(admin)/admin/{forwarders/**, forwarder-check, forwarder-action, forwarder-import-warehouse, forwarder-sales, drivers/**, driver-runs, barcode/**, report-cnt/**, cnt-hs, cargothai}` + `actions/admin/{forwarders, forwarders-bulk, forwarders-new, forwarders-edit, forwarder-check, forwarder-cost, forwarder-cost-adjustments, forwarder-drivers, forwarder-invoice, combine-bill, cnt-payment, cnt-hs, report-cnt-detail, report-cnt-cost-update, driver-batches, driver-work, barcode, barcode-import, api-forwarder-manual}.ts`.

**% complete (verified):** **~82%**. This is the most-complete admin lane. The single-row "happy path" works end-to-end on the real `tb_*` schema: create (tb_forwarder) → warehouse scan (barcode-import → tb_forwarder_import2 + auto-flip fstatus=4) → bulk-bill (forwarder-check → fstatus=5 + LINE/SMS/email) → driver batch (tb_forwarder_driver) → deliver photo (auto-flip fstatus=7) → container payment (tb_cnt / tb_cnt_item / tb_cost_container). Custom-rate, reset-rate, slip-approval, combine-bill, 9 audit queues, status-log trail all hit the real tables.

**The remaining gaps are concentrated in three places:**
1. **List-page bulk bar** — 2 of its 3 buttons still silent-dead-write to the empty rebuilt `forwarders` / `forwarder_driver` tables (only `bulkCancel` was pivoted in Tier-A A3).
2. **Detail editor on legacy rows** — the full-fat edit/driver/cost/bill panels render ONLY on the rebuilt-UUID path; on the ~52k real `tb_forwarder` rows the page falls into a near-read-only legacy view (`TbForwarderActionPanel` covers status/cabinet/tracking-th/note only).
3. **Driver-expiry cron + handoff prints + agent-commission + per-row container bill** — operational leaves not yet ported.

**Migrated-data reality:** `tb_forwarder` holds the real rows (audit docs cite ~52k–280k depending on window). The rebuilt `forwarders` (UUID) table is **empty on prod**. Any action targeting `forwarders` is a no-op against real data → "success" toast, zero rows changed. This is the dominant failure mode below.

---

## Workflow-by-workflow gap table

Status: ✅ faithful · 🟡 partial / divergent · ❌ missing · 💀 present-but-dead-write (P0)

| # | Legacy flow | Pacred equiv | Status | Flow-order correct? | Owner |
|---|---|---|---|---|---|
| **LIST / forwarder.php default** |
| 1 | List + 4 source-tabs + 10 status-tabs + per-status counts | `/admin/forwarders` `page.tsx` | ✅ | yes | — |
| 2 | Per-row outstanding (`calPriceForwarderMain`) | `calcForwarderOutstanding` lib | ✅ | yes | — |
| 3 | Bulk bar — **เปลี่ยน status** (status-flip) | `bulk-actions-toolbar.tsx` → `bulkUpdateStatus` → `adminUpdateForwarder` | 💀 | wrong-target | ภูม |
| 4 | Bulk bar — **มอบหมายคนขับ** (assign driver) | `bulk-actions-toolbar.tsx` → `bulkAssignDriver` | 💀 | wrong-target | ภูม |
| 5 | Bulk bar — **ยกเลิก / ย้ายไปสถานะพิเศษ** (→fstatus=99) | `bulkCancel` (Tier-A A3 fix) | ✅ | yes — writes tb_forwarder + tb_log_forwarder_status | — |
| 6 | "ย้ายกลับสถานะปกติ" (restore from 99) | `adminRestoreForwarderFromSpecial` | ✅ | yes | — |
| 7 | Bottom-bar "พิมพ์จากหน้ากล่อง / พิมพ์ที่ส่งอยู่" (GET → printAll) | `/admin/forwarders/print` exists but **list bottom-bar buttons not wired to it w/ selected IDs** | 🟡 | partial | ภูม |
| 8 | Per-row `printStatus1..4` flip on print | `markForwarderPrinted` (tb_forwarder) | ✅ | yes | — |
| **DETAIL / forwarder.php?page=detail + detail.php** |
| 9 | Detail by numeric `tb_forwarder.id` | `renderLegacyForwarderView` fallback | ✅ | yes | — |
| 10 | Full edit form (all cost fields + rate recalc "บันทึก") | `AdminForwarderUpdateForm` — **renders only on rebuilt-UUID path** (`page.tsx` L235); legacy rows early-return L70 | 💀 | dead on legacy rows | เดฟ |
| 11 | Per-row driver assign (`forwarder-driver.php?page=add` variant) | `DriverAssignForm` — **rebuilt-UUID path only** | 💀 | dead on legacy rows | ภูม |
| 12 | Cost adjustments | `CostAdjustmentsPanel` (Pacred-native) — **rebuilt-UUID path only** | 💀 | dead on legacy rows | ภูม |
| 13 | Bill-to override | `BillToOverridePanel` — **rebuilt-UUID path only** | 💀 | dead on legacy rows | ภูม |
| 14 | status / cabinet / tracking-th / note quick-edit | `TbForwarderActionPanel` → `adminBulkUpdateForwarderTbStatus` | ✅ | yes — tb_forwarder + status-log + notify | — |
| 15 | `saveNote` → push note text via LINE OA + bot + read flag | note saved via `TbForwarderActionPanel`; status-change fires `forwarderStatusChanged` push but **note-only save fires NO push, and the note TEXT is never pushed** | 🟡 | partial (silent on note-only) | ภูม |
| 16 | `update_fAddress` re-pick from customer's saved tb_address | address shown **read-only** in legacy view | ❌ | — | ภูม |
| 17 | `update_fCover` replace cover image | not in form | ❌ | — | ภูม |
| 18 | `update_fTransportType` standalone | not in form | ❌ | — | ภูม |
| 19 | `update_fUserID` reassign owner | not in form | ❌ | — | ภูม |
| 20 | `update_fDateToThai` + `fDateContainerClose` standalone | partially via cabinet back-fill in `adminBulkUpdateForwarderTbStatus`; no standalone ETA edit | 🟡 | partial | ภูม |
| 21 | 7-button quick-action ribbon (ใบเสร็จ · พิมพ์จากกล่อง · พิมพ์ที่อยู่ + 4 pills) | only "ดูตู้คอนเทนเนอร์" + "แก้ไขขนาด" | ❌ | — | ภูม |
| 22 | `fCredit='c'` credit-out lifecycle (paydeposit=2 + fCredit=1 + fCreditDate + decrement tb_credit.creditValue) | not in TbForwarderActionPanel | ❌ | — | ภูม |
| 23 | `tb_log_forwarder_status` INSERT on every fstatus flip | done in `adminBulkUpdateForwarderTbStatus` + `bulkCancel`; **NOT in dead-write bulkUpdateStatus path** | 🟡 | partial | ภูม |
| 24 | `updateLock` toggle tb_forwarder.fLock (concurrency) | not ported | ❌ | — | เดฟ |
| **CREATE / forwarder.php?page=add** |
| 25 | 9-field cascade create (coID→user→tracking→…→addressID→transport) | `/admin/forwarders/new` `form.tsx` → `forwarders-new.ts` (tb_forwarder) | ✅ | yes | — |
| 26 | 46-carrier fShipBy + PCS-hardcoded address + 2-only transport | matches legacy values | ✅ | yes | — |
| 27 | `scriptfTrackingCHN` AJAX dupe-check on tracking input | not in form | 🟡 | minor | ภูม |
| **CHECK-BILL / forwarder-check.php** |
| 28 | `callPriceUser` per-userID bulk-bill 4→5 + 1% company discount | `adminCallPriceUser` (tb_forwarder + 1% via fusercompany + status-log) | ✅ | yes | — |
| 29 | SMS + LINE + email on bill | `sendNotification` (LINE OA + email fallback) + SMS | ✅ | **exceeds legacy** (legacy LINE/email commented out) | — |
| 30 | `addCheck` drop-into-queue | `adminReportCntAddCheck` (tb_check_forwarder) from report-cnt | ✅ | yes (legacy also exposes addCheck on both pages) | — |
| 31 | Orphan check-queue cleanup | done in action | ✅ | yes | — |
| 32 | Orange totals row (t5/t9/t10/t18/t20/t23 aggregates) | not rendered | 🟡 | minor | ภูม |
| **COMBINE-BILL / forwarder-bill.php** |
| 33 | List + add (comma-list) + print delivery slip + delete row | `/admin/forwarders/combine-bill/{,add,print}` → `combine-bill.ts` | ✅ | yes | — |
| 34 | `?page=detail` per-bill (photo upload + delete bill + driver-assign) | only print, no editable detail | ❌ | — | ภูม |
| 35 | `update_fPhotoEnd` from bill detail → fstatus=7 cascade | not on bill path (driver-work path has it) | 🟡 | partial | ภูม |
| **DRIVER / forwarder-driver.php** |
| 36 | List (90d default · fdstatus tally) | `/admin/drivers` (tb_forwarder_driver) | ✅ | yes | — |
| 37 | Create batch (multi-select fstatus=6 + driver pick + 17/24/30h) | `/admin/drivers/new` → `driver-batches.ts` (tb_forwarder_driver + items) | ✅ | yes | — |
| 38 | Detail (stops + countdown + maps + per-stop photo) | `/admin/drivers/[id]` → `driver-work.ts` | ✅ | yes | — |
| 39 | Deliver-photo cascade `tb_forwarder.fstatus='7' + fdatestatus7` | `driver-work.ts` deliver step (Wave 26) | ✅ | yes — **was P0, now FIXED** | — |
| 40 | Auto-expire endTime past → fdStatus=3 + cascade fdistatus=3 | cron `expire-driver-assignments` targets **rebuilt `forwarder_driver`** not `tb_forwarder_driver` | 💀 | wrong-target — never runs on real data | ภูม |
| 41 | LINE notify driver token + ops token on batch create | not wired (ADR-0001 token decision pending) | 🟡 | partial | ภูม |
| 42 | Truck-size recommender (`call.php`) | not ported | ❌ | — | ภูม |
| 43 | Google Maps lat/lng pinner (`saveLo.php`) | not ported (needs MAPS key) | ❌ | — | ภูม |
| 44 | Per-item cancel from batch detail | batch-level cancel only | 🟡 | partial | ภูม |
| 45 | `tb_user_sales` agent-commission INSERT on fstatus=7 (THADA→PCS888 etc, 4 maps) | not ported (auth-signup affiliate exists, delivery-commission does NOT) | ❌ | — | ภูม |
| 46 | `printDriver.php` A4 picking slip | not ported | ❌ | — | ภูม |
| 47 | Driver home 4-card KPI (`home/driver.php`) | not ported | ❌ | — | ปอน |
| 48 | Per-forwarder driver assign island (`driver-assign-form.tsx`) | writes rebuilt `forwarder_driver` UUID | 💀 | wrong-target | ภูม |
| 49 | `/admin/driver-runs` (CT-7 "งานของฉัน") | Pacred-native; reads rebuilt `forwarders`/`forwarder_driver` | 🟡 | rebuilt-era surface (not legacy parity) | เดฟ |
| **BARCODE / barcode-*.php + gateway.php + barcode-import** |
| 50 | 8 scanner bounce pages (camera + USB × all/from/prepare/import) | `/admin/barcode/{cargo,driver}/{all,from,prepare,import}` | ✅ | yes | — |
| 51 | Warehouse-arrival writer (`barcode-import/index.php`) — multi-tier lookup + upsert tb_forwarder_import2 + auto-flip fstatus=4 | `adminBarcodeImportScan` (faithful: primary + dash + 2-char LIKE + threshold) | ✅ | yes | — |
| 52 | `gateway.php` routing brain (4 types + ambiguity + not-found) | `/admin/barcode/gateway` | ✅ | yes | — |
| 53 | `gateway type=6` SweetAlert showing assigned driver (`fdAdminID`) + "ขั้นตอนผิด" guard | deferred (Wave-3 TODO L74/L203) — redirects silently | 🟡 | divergent (silent) | ภูม |
| 54 | `gateway type=from` → `printAll/?print=1&id[]=` | `/admin/printAll` NOT ported; falls back to detail page | ❌ | — | ภูม |
| 55 | Orphan-linking screen (link/del unmatched tb_forwarder_import2) | `/admin/forwarders/warehouse-history` (relink + delete) | ✅ | yes | — |
| 56 | Numeric pallet codes 1-40 (`barcode-d-importKey.php`) | only letter A1-Z6 | 🟡 | owner-decision | ภูม |
| **CONTAINER / report-cnt.php + cnt-hs.php** |
| 57 | List + 2 status tabs + 3 transport tabs + actionPay filter | `/admin/report-cnt` (tb_forwarder/tb_cnt) | ✅ | yes | — |
| 58 | BULK cnt-payment from list checkboxes (`addPay`) | `adminCreateCntPayment` (tb_cnt + tb_cnt_item + pay-fanout) | ✅ | yes | — |
| 59 | Drill-down `?id=<cabinet>` 25-col + 6 quick-filters | `/admin/report-cnt/[fNo]` | ✅ | yes | — |
| 60 | `customRate` UPSERT tb_cost_container + recalc all fcosttotalprice | `adminReportCntCustomRate` | ✅ | yes | — |
| 61 | `resetCustomRate` DELETE + reset to tb_settings defaults | `adminReportCntResetRate` | ✅ | yes | — |
| 62 | **SINGLE-container manual cnt-payment** with `cntImagesSlip` upload (`?id=` POST `add` L741) | only BULK path (writes `cntImagesSlip:""`); no single + slip entry | ❌ | — | ภูม |
| 63 | `update_forwarder_to5` per-row bill-to-customer 4→5 from drill-down + SMS/LINE | not ported (billing only via forwarder-check bulk queue) | ❌ | — | ภูม |
| 64 | Cost-update tab — Google Sheets reconciliation + diff coloring | `cost-update-view.tsx` + `report-cnt-cost-update.ts` (Pacred-native CSV `upCostSheet`; live Sheets API dropped per Wave 16-B) | 🟡 | intentional divergence (acceptable) | ภูม |
| 65 | `วันที่รอเข้าโกดัง` average (เฉลี่ย N วัน) header counter | formula stub, average not rendered | 🟡 | minor | ภูม |
| **cnt-hs LEDGER** |
| 66 | Ledger list + 3 status tabs | `/admin/cnt-hs` (tb_cnt) | ✅ | yes | — |
| 67 | `update_slip` upload cntImagesSlip + auto-flip cntStatus=2 (approve) | `adminUploadCntSlip` (tb_cnt) | ✅ | yes | — |
| 68 | `update` replace cntFile PDF | `adminApproveCntHs` / file edit | 🟡 | partial (verify PDF replace) | ภูม |
| 69 | 9-row sales card (ยอดขาย…กำไรสุทธิ) | partial | 🟡 | minor | ภูม |
| **MISC** |
| 70 | `forwarder-action.php` 9 audit queues + 10 QA redirects | `/admin/forwarder-action` | ✅ | yes | — |
| 71 | `forwarder-import-warehouse.php` intake history | `/admin/forwarders/warehouse-history` (default 7d vs legacy 30d) | 🟡 | minor (date default) | ภูม |
| 72 | `forwarder-search.php` 7-key standalone (coID · closedate · refOrder · …) | keyword `search-bar.tsx` + `bulk-search` cover ~5/7 | 🟡 | partial | ภูม |
| 73 | `forwarder-search-muti.php` live MOMO Sack API multi-track | `bulk-search` local 3-table lookup, no MOMO call | 🟡 | partial | ก๊อต |
| 74 | `forwarder-sale.php` sales-rep dashboard | `/admin/forwarder-sales` | ✅ | yes | — |
| 75 | `forwarder-quotation.php` (70-LOC stub) | not ported | ✅ | **legacy itself never finished — parity** | — |

**Counts:** ✅ ~38 · 🟡 ~22 · ❌ ~9 · 💀 ~6 (out of 75 flows audited).

---

## Death-flows (P0/P1 detailed)

### 💀 P0-1 — List-bar `bulkUpdateStatus` (status-flip) silent dead-write
**File:** `actions/admin/forwarders-bulk.ts` L101-134 → delegates to `adminUpdateForwarder` (`actions/admin/forwarders.ts` L59, writes `.from("forwarders")` L71/L115).
**Wired by:** `app/[locale]/(admin)/admin/forwarders/bulk-actions-toolbar.tsx` "เปลี่ยน status" path (`targetStatus: ForwarderStatus` rebuilt enum L34-40).
**Why dead:** The bulk bar passes the rebuilt 7-value enum (`pending_payment`/`shipped_china`/…) into `adminUpdateForwarder`, which UPDATEs the **empty rebuilt `forwarders` table**. Zero rows match → green toast, `tb_forwarder.fstatus` unchanged. Operators doing list-page batch status changes get a silent no-op on every real row.
**Legacy truth:** `forwarder.php` admin-dropdown bulk path writes `tb_forwarder.fStatus` + INSERT `tb_log_forwarder_status`. The faithful action **already exists** — `adminBulkUpdateForwarderTbStatus` (`forwarders.ts` L566+) writes tb_forwarder + status-log + notify. The fix is to repoint the toolbar status-flip to it (and replace the rebuilt enum with numeric `1..7,99`). Matches existing **task #41**.
**Owner:** ภูม. ETA ~2h.

### 💀 P0-2 — List-bar `bulkAssignDriver` silent dead-write
**File:** `actions/admin/forwarders-bulk.ts` L154-290 — `.from("forwarders")` L203 + INSERT `.from("forwarder_driver")` L243 (both rebuilt UUID).
**Why dead:** Looks up the forwarder in empty rebuilt `forwarders` (every row → "ไม่พบรายการ" per-row failure on real data) and would insert into rebuilt `forwarder_driver`, not the legacy batch tables `tb_forwarder_driver` + `tb_forwarder_driver_item`. The legacy driver model is **batch-based** (one `tb_forwarder_driver` run + N `tb_forwarder_driver_item`), not per-forwarder rows — so even the data model is wrong.
**Legacy truth:** `forwarder-driver.php?page=add` creates a batch run. The faithful path exists at `/admin/drivers/new` (`driver-batches.ts`). The list-bar shortcut should either spawn a batch via that action or be removed to avoid the dead surface.
**Owner:** ภูม. ETA ~3h. (Part of task #41.)

### 💀 P0-3 — Detail editor dead on the ~52k real `tb_forwarder` rows
**File:** `app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx` — early-returns `renderLegacyForwarderView(fNo, admin)` at L70 when the rebuilt-UUID lookup misses (i.e. for EVERY legacy row). The full panels — `AdminForwarderUpdateForm` (L235), `DriverAssignForm` (L245), `CostAdjustmentsPanel` (L249), `BillToOverridePanel` (L254) — render only in the UUID branch.
**Why dead:** A staffer opening any real forwarder lands in the legacy view, which is near-read-only — only `TbForwarderActionPanel` (status/cabinet/tracking-th/note) works. They cannot do the full "บันทึก" edit (cost fields + rate recalc), re-pick address, swap transport, reassign owner, or adjust cost from the detail page — exactly the legacy `forwarder.php?page=update` mega-form. They get bounced to `/edit` (dimensions only).
**Legacy truth:** `forwarder.php?page=detail` + `include/pages/forwarder/detail.php` exposes the full editor on the same numeric-id row. Fix = wire the aside panels to use `tb_forwarder.id` when the route resolved in legacy-fallback mode (most of the data is already loaded by `renderLegacyForwarderView`).
**Owner:** เดฟ (architecture — this is the dual-mode UUID-vs-legacy spine decision that recurs across admin). ETA ~4–6h.

### 💀 P0-4 — Driver-expiry cron never runs on real batches
**File:** `app/api/cron/expire-driver-assignments/route.ts` L25 — `.from("forwarder_driver").update({ status: 3 }).eq("status", 1)` (rebuilt UUID + rebuilt enum).
**Why dead:** Real driver batches live in `tb_forwarder_driver` (`fdstatus` 1→3) with cascade to `tb_forwarder_driver_item.fdistatus`. The rebuilt table is empty, so the cron flips nothing. Legacy auto-expiry (the page-load sweep at `forwarder-driver.php` L4-17, 17/24/30h `endTime`) effectively **does not exist in Pacred** — stale batches accumulate past SLA, unfinished items never flip to fdistatus=3.
**Legacy truth:** `UPDATE tb_forwarder_driver SET fdStatus='3' WHERE endTime < NOW() AND fdStatus=1` + cascade items. Fix = swap table + columns (`endtime`, `fdstatus`).
**Owner:** ภูม. ETA ~20min (smallest, highest-leverage).

### 💀 P0-5 (also flagged C5 in master) — `tb_user_sales` agent-commission not inserted on fstatus=7
**Where it should live:** the fstatus=7 cascade (`driver-work.ts` deliver step + `adminBulkUpdateForwarderTbStatus`).
**Why dead/missing:** Legacy `forwarder.php?page=update` + `forwarder-driver.php?page=detail` + `forwarder-driver-w.php` all INSERT a `tb_user_sales` row when the forwarder's `coID` matches one of 4 hardcoded agent codes (THADA.VIP→PCS888, SIN.VIP→PCS352, OOAEOM.VIP→PCS2678, SWAN→PCS4155). Grep confirms Pacred has the affiliate logic only at **signup** (`actions/auth.ts`), NOT on delivery. 4 partner agents lose commission visibility on every delivery.
**Owner:** ภูม. ETA ~1h. (Owner-decision flag: confirm PR-rebranded codes PR888/PR352/PR2678/PR4155.)

### ❌ P1-6 — Single-container manual cnt-payment with slip image
**File gap:** `report-cnt/[fNo]` has `container-detail-client.tsx` / `cost-rate-modal.tsx` but **no single-container `addPay` + `cntImagesSlip` upload**. `adminCreateCntPayment` is BULK-only and explicitly writes `cntImagesSlip:""` (`cnt-payment.ts` L248).
**Legacy truth:** `report-cnt.php?id=` POST `add` (L741-810) records payment for ONE container with an exif-validated slip image. Admins paying a single carrier invoice with a bank slip have no entry point.
**Owner:** ภูม. ETA ~2h.

### ❌ P1-7 — Per-row bill-to-customer (4→5) from the container drill-down
**File gap:** `update_forwarder_to5` (report-cnt.php L835-911) — bill ONE row to customer from the container page (status 4→5 + SMS + LINE + email). Pacred only bills via the `forwarder-check` bulk queue.
**Owner:** ภูม. ETA ~1.5h.

### ❌ P1-8 — `printAll` warehouse scan-to-print + `gateway type=6` driver preview
`/admin/printAll` not ported (`gateway/page.tsx` L78-81 falls back to detail); `gateway type=6` SweetAlert (assigned-driver name + "ขั้นตอนผิด" guard) deferred (L74/L203). Warehouse scan-print handoff degraded.
**Owner:** ภูม (print routes brand pending owner decision: PCS vs Pacred). ETA printAll ~3h, gateway preview ~30min.

### 🟡 P1-9 — saveNote pushes nothing on note-only save
`adminBulkUpdateForwarderTbStatus` fires `forwarderStatusChanged` only when `changed.length>0` (status moved). A note-only save (fnote set, fstatus same) sends NO push, and even on a status change the **note text** is never pushed. Legacy `saveNote` pushed the note content via LINE OA. Customer/admin notes are invisible.
**Owner:** ภูม. ETA ~2h.

---

## Flow-order divergences

1. **Detail editor entry order (P0-3):** Legacy = open detail by id → full editor in place. Pacred = open detail → UUID miss → legacy read-only view → bounce to `/edit` for dimensions only. The step sequence diverges: the single-screen "edit everything + Save" becomes a multi-screen read-then-bounce, and most fields have no edit surface at all on real rows.
2. **Driver model granularity (P0-2):** Legacy assigns drivers as a **batch run** (1 tb_forwarder_driver + N items, with a 17/24/30h accept window + auto-expire). The list-bar `bulkAssignDriver` would create per-forwarder rebuilt `forwarder_driver` rows — a flat per-row model with no batch, no expiry window. Even if repointed, the shape must become a batch to match.
3. **Billing entry path (P1-7):** Legacy lets an admin bill a single row 4→5 directly from the container drill-down (`update_forwarder_to5`) OR via the bulk check-queue. Pacred only has the bulk queue (`forwarder-check`), so the "I'm looking at this container, bill this one customer now" path requires leaving the screen.
4. **Warehouse scan→print (P1-8):** Legacy `gateway type=from` immediately routes to `printAll` (scan → print label in one motion). Pacred routes to the forwarder detail page instead — staff must then find a print action, breaking the single-motion scan-print loop.
5. **Cnt cost-update source (item 64):** Legacy pulls live from Google Sheets (service-account JSON) and red-cell-diffs against DB. Pacred replaced this with a native CSV `upCostSheet` (Wave 16-B). **Intentional divergence — acceptable** (drops a fragile partner dependency), noted so it isn't re-flagged.

---

## Modals / AJAX / cron / print inventory

**Legacy AJAX/sub-handlers (under `include/pages/`):**
- forwarder: `getListForwarder` · `calPrice`/`calPriceNew` · `update`/`update copy` · `deleteForwarder` · `deleteForwarderImport` · `scriptFullname` · `scriptfTrackingCHN`/`checkFTrackingCHN` (dupe-check) · `getUserID{,All,All2,All3}` · `getDataAddress` · `updateLock` (fLock toggle) · `api-flash-express` (live tracking proxy)
- forwarder-driver: `addFrom` · `addFromBill` · `call` (truck-size recommender) · `saveLo` (Maps lat/lng) · `takePhoto` (deliver → fstatus=7 cascade) · `takePhotoINwarehouse` · `deleteFD` · `deleteForwarder`
- report-cnt: `editForm` (inline cost edit) · `getListCNTPay` · `getListForwarder-to-check` · `getListForwarder`
- cnt-hs: `formEditFile` (replace cntFile PDF)
- forwarder-check / forwarder-action: `getListForwarder` + `menu`

**Pacred coverage of those:** dupe-check (`scriptfTrackingCHN`) ❌ · `updateLock` ❌ · `call` truck-size ❌ · `saveLo` Maps ❌ · `api-flash-express` ❌ · `editForm` ✅ (`report-cnt-detail`/`cost-rate-modal`) · `getUserID`/`getDataAddress` ✅ (`forwarders-new` cascades) · deliver cascade ✅ (`driver-work`).

**Cron:**
- Legacy: page-load sweep in `forwarder-driver.php` L4-17 (auto-expire) — no real cron, runs on every list view.
- Pacred: `app/api/cron/expire-driver-assignments/route.ts` 💀 wrong-target (P0-4) · plus lane-adjacent `momo-sync`, `cargothai-sync`, `sheets-sync-ctt` (Pacred-native carrier pulls — these set fcabinetnumber/fdatecontainerclose on fstatus=3, the legacy partner-API parity).

**Print/PDF:**
- `printAll.php` (969 LOC, scan-to-print bill) → ❌ `/admin/printAll` not ported (P1-8).
- `printDriver.php` (248 LOC picking slip) → ❌ not ported.
- combine-bill delivery slip → ✅ `/admin/forwarders/combine-bill/print` (HTML window.print, not mPDF — Phase C react-pdf).
- `gatway-receipt-forwarder.php` (ใบเสร็จ) → ✅ via `forwarder-invoice.ts` (tb_receipt mint, Wave 20/29).

**Status enums (legacy SOT — verified against PHP, do not paraphrase):**
- `tb_forwarder.fstatus`: `1`..`7` + `99` (special-hold / "ย้ายไปสถานะพิเศษ" — the soft-cancel bucket; NOT '6', NOT '7'). Bulk-cancel target = `99`.
- `tb_forwarder_driver.fdstatus`: `1` กำลังดำเนินการ · `2` สำเร็จ · `3` ไม่สำเร็จ.
- `tb_forwarder_driver_item.fdistatus`: `''` ยังไม่ขึ้นรถ · `1` กำลังส่ง · `2` ส่งสำเร็จ · `3` ส่งไม่ได้.
- `tb_cnt.cntstatus`: `1` รอตรวจ · `2` สำเร็จ (slip approval).
- barcode auto-flip threshold: `fi2amount >= famount` → `tb_forwarder.fstatus='4'`.

---

## Recommended fixes (ranked, with owner)

| Rank | Fix | Owner | ETA | Type |
|---|---|---|---|---|
| 1 | **P0-4 cron retarget** `expire-driver-assignments` → `tb_forwarder_driver` (fdstatus 1→3 + cascade items) | ภูม | 20min | dead-write |
| 2 | **P0-1 repoint `bulkUpdateStatus`** → `adminBulkUpdateForwarderTbStatus` + swap toolbar enum to numeric 1..7/99 (task #41) | ภูม | 2h | dead-write |
| 3 | **P0-2 fix/remove `bulkAssignDriver`** — route to `driver-batches` batch model or remove the dead list-bar shortcut (task #41) | ภูม | 3h | dead-write |
| 4 | **P0-5 `tb_user_sales` commission INSERT** on fstatus=7 (4 agent maps; confirm PR-codes) | ภูม | 1h | missing-revenue |
| 5 | **P0-3 wire detail-page aside panels on legacy-row path** (UpdateForm/DriverAssign/Cost/BillTo bind to tb_forwarder.id) | เดฟ | 4–6h | dead-on-real-rows |
| 6 | **P1-9 saveNote LINE push** (push note text + fire on note-only save) | ภูม | 2h | notification gap |
| 7 | **P1-6 single-container manual cnt-payment** + cntImagesSlip upload on `report-cnt/[fNo]` | ภูม | 2h | missing |
| 8 | **P1-7 per-row bill-to-customer (4→5)** from container drill-down | ภูม | 1.5h | missing |
| 9 | **P1-8a `/admin/printAll`** scan-to-print port (brand decision first) | ภูม | 3h | missing-handoff |
| 10 | **P1-8b gateway type=6** driver preview + "ขั้นตอนผิด" guard | ภูม | 30min | divergence |
| 11 | **P1 detail leaves** — update_fAddress re-pick · update_fCover · update_fTransportType · update_fUserID · credit-mode flip · 7-button ribbon | ภูม | ~8h | missing |
| 12 | **P2 `/admin/driver-runs` reconcile** — decide whether CT-7 rebuilt surface stays or merges into legacy driver model | เดฟ | decision | rebuilt-era |

**P0 total: ~10–12h. P1 total: ~17h.**

---

## Notes / surprises

- **Tier-A A3 (`bulkCancel`) is the model fix** — it pivoted from rebuilt → `tb_forwarder` + `tb_log_forwarder_status` + per-row `canAnyRoleFlipFstatus` guard + idempotent skip of already-99 + refuse delivered-7. The other two bulk buttons (status-flip, assign-driver) need the same treatment; the faithful actions already exist (`adminBulkUpdateForwarderTbStatus`, `driver-batches`).
- **The dual-mode `[fNo]/page.tsx` is the single highest-leverage architectural item** — it's why P0-3 (detail editor) is dead on real rows AND why `/admin/driver-runs` + the rebuilt aside-panel islands exist. A clean decision (legacy-id is the canonical key; retire the rebuilt UUID path) would close P0-3, P0-2's data-model mismatch, and item-49 in one move. This is why P0-3/item-49 are assigned to **เดฟ** (architecture/integration spine) not ภูม.
- **driver-work fstatus=7 cascade (P0-B1 in the master doc) is now FIXED** (Wave 26, `driver-work.ts` L246-279) — verified, not a current gap.
- **forwarder-check exceeds legacy** — LINE + SMS + email all fire on bulk-bill (legacy had LINE + email commented out). Do not "fix" this back.
- **cnt cost-update Google-Sheets → CSV** is an intentional, correct divergence (drops fragile service-account JSON dependency) — record for Phase C, don't re-flag.
- `resolveLegacyAdminId()` duplicated across `forwarders-edit.ts` / `forwarders-new.ts` / `combine-bill.ts` (10-min refactor to `lib/auth/safe-legacy-admin-id.ts`); mild tech-debt, works.
