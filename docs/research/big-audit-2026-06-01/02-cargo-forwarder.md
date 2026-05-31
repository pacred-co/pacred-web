# Big audit 2026-06-01 — Cluster 02: CARGO / FORWARDER (ฝากนำเข้า)

> **Cluster:** the biggest. Full forwarder lifecycle — fstatus flow · cabinet/ตู้ (cnt) · driver assign + barcode · cost/weight/CBM editing · quotation · TH transport · cnt-payment ledger · cargo-center/warehouse · MOMO/JMF/CargoThai/Sang sync.
> **Method:** queried prod (`yzljakczhwrpbxflnmco`) for row counts + columns; opened the actual Pacred action files + routes and confirmed table targets at **current HEAD `a79faf71`** (post the 2026-06-01 marathon); cross-referenced legacy PHP under `…/pcsc/public_html/member/pcs-admin/`.
> **Builds on:** `legacy-gap-2026-05-30/adm-09-forwarder-ops.md` (admin) + `cust-03-forwarder.md` (customer) + `legacy-resweep-2026-05-31/_MASTER-FRESH.md`.
>
> **🔑 HEADLINE:** The prior audits' forwarder death-flows are **almost entirely CLOSED at HEAD.** The 2026-06-01 marathon shipped the `[fNo]` dual-mode rewrite, tombstoned the last money dead-write, repointed the bulk-bar + crons + rate editors, and built the missing single-row/bill-to/print/commission/cnt-payment paths. What genuinely remains is **(a) one un-ported batch feature (TH-transport grouping), (b) 3 un-built partner adapters (GOGO/JMF/TTP live API), (c) a customer-side rebuilt-table orphan cluster (landmine, not death), and (d) a pile of high-value but un-exploited DATA** (114-col `tb_forwarder` × 47k rows) — the real "ดึงศักยภาพสูงสุด" upside.

---

## 1. DATA INVENTORY (prod row counts · verified 2026-06-01)

### Core lifecycle
| Table | Cols | Rows | Purpose / หัวข้อ stored |
|---|---|---|---|
| **`tb_forwarder`** | **114** | **47,636** | The spine. One import order. Lifecycle (`fstatus` 1-7,99 + `fdatestatus2..7` timestamps + `paydeposit`), routing (`ftransporttype` 1รถ/2เรือ/3แอร์ · `fwarehousechina` · `fwarehousename` 1-8 · `fcabinetnumber` · `ftrackingchn`/`ftrackingth` · `fshipby` 46 carriers · `fdatetothai` · `fdatecontainerclose`), dims (`fweight`/`fwidth`/`flength`/`fheight`/`fvolume`/`famount`/`fpallet`), rate (`frefprice` kg/cbm · `frefrate` · `customrate*` · `fcredit`), money (`ftotalprice`/`fcosttotalprice`/`ftransportprice`/`fpriceupdate`/`fdiscount`/`pricecrate`/`fqcprice`/`priceother`/`fprofit*`), 11 ship-to address cols (`faddress*` + lat/lng), media (`fcover`/`fimg1-4`/`fphotoend`), notes (`fnote`/`fnoteuser`/`fnoteuserread`), source (`reforder` = shop-order link · `adminidcreator`), tax (`tax_doc_pref`/`tax_doc_tax_id`/`tax_doc_address`), `fbilltoname` (NEW · migration 0132), SMS-reminder flags (`fsendsms1day`/`3day`/`3eday`), `subuserid`, `flockdate`. |
| `tb_forwarder_item` | — | **0** | Legacy multi-line items. EMPTY on prod — single-item orders store name/qty inline; multi-item came via shop-order spawn. Dormant. |
| `tb_forwarder_driver` | — | 4,102 | Driver-batch PARENT (one dispatch run). `fdadminid` (driver) · `fddate` · `fdstatus` (1 ดำเนินการ / 2 สำเร็จ / 3 ไม่สำเร็จ) · `endtime` (accept-window deadline 17/24/30h). |
| `tb_forwarder_driver_item` | — | **29,782** | Driver-batch CHILD — N forwarders per run. `fid`→`tb_forwarder.id` · `fdid`→parent · `fdistatus` ('' ยังไม่ขึ้นรถ / 1 กำลังส่ง / 2 สำเร็จ / 3 ส่งไม่ได้). NO declared FK to parent (PGRST200 trap → two reads). |
| `tb_forwarder_import` | — | 3,739 | Warehouse-intake (older format). |
| `tb_forwarder_import2` | — | **44,683** | Warehouse-arrival scan log (current). barcode-import writer upserts here; `fi2amount >= famount` auto-flips `tb_forwarder.fstatus=4`. |
| `tb_forwarder_prepare` | — | **0** | "เตรียมส่ง" staging. EMPTY/dormant. |
| `tb_forwarder_img` | — | **0** | Out-of-band image table. EMPTY (images live on `fcover`/`fimg1-4`). |
| `tb_check_forwarder` | — | 3 | The bill-check queue (drop-into 4→5 staging). Tiny = transient working set. |
| `tb_log_forwarder_status` | — | 45 | Status-flip audit trail. **Only 45 rows** — appended by Pacred actions since launch (legacy didn't always log; real history is in `fdatestatusN`). |

### Container (ตู้) + payment ledger
| Table | Rows | Purpose |
|---|---|---|
| **`tb_cnt`** | 958 | Container-cost payment header. `cntstatus` (1 รอตรวจ / 2 สำเร็จ) · `cntimagesslip` (bank slip) · `cntfile` (PDF) · `cntamount` · cabinet. |
| `tb_cnt_item` | **0** | EMPTY — line items folded into the pay-fanout tables below. |
| **`tb_cnt_pay_idorco`** | **36,486** | cnt-payment → forwarder fanout keyed by `fidorco`. The per-order container-cost allocation ledger. |
| **`tb_cnt_pay_trackingchn`** | **39,064** | Same fanout keyed by CN tracking. Twin-index for lookup by tracking. |
| **`tb_cost_container`** | 2,715 | Custom cost-rate per cabinet (overrides `tb_settings` defaults; recalcs `fcosttotalprice`). |

### Quotation + TH-transport + CSV
| Table | Rows | Purpose |
|---|---|---|
| `tb_farwarder_quotation` / `_item` | **0 / 0** | Quotation engine. EMPTY — legacy `forwarder-quotation.php` is a **70-LOC stub the legacy never finished**. (Pacred freight-quotes is a separate Phase-C feature.) |
| `tb_forwarder_tran_th_h` | **296** | In-Thailand transport BATCH header (`forwarder-action.php` groups fstatus rows). `date` · `adminidcreate`. |
| `tb_forwarder_tran_th_sub` | **643** | TH-transport batch items (`fid` · `ftthhid`). |
| `tb_csvimport` | 49 | CSV import staging buffer (carrier bulk upload). |

### Partner sync staging (temp/raw)
| Table | Rows | Purpose |
|---|---|---|
| `tb_tmp_forwarder_cargothai` / `_item` | 15,320 / 20,471 | CargoThai pull buffer (largest partner feed). |
| `tb_tmp_forwarder_momo` / `_item` | 2,355 / 3,404 | MOMO pull buffer. |
| `tb_forwarder_jmf_tmp` | 1,745 | JMF pull buffer. |
| `momo_import_tracks` | 18 | MOMO isolated sync (current cron). |
| `momo_container_closed` | 2 | MOMO container-close events. |
| `momo_sack_infos` | **0** | MOMO sack lookup (Sack API). EMPTY. |
| `momo_sync_logs` | 719 | MOMO cron run log. |
| `tb_settings` | 1 | Single config row — incl. the 144-cell per-partner car×ship **default forwarder-cost matrix**. |

---

## 2. REBUILT TWINS — all EMPTY · legacy is canonical

Verified every rebuilt/new twin returns **0 rows** on prod (service-role, so it's truly empty not RLS):

| Rebuilt table | Rows | Status |
|---|---|---|
| `forwarders` | 0 | **DEAD** — the UUID twin. `[fNo]` detail page still *selects* it first (then falls through to `tb_forwarder`); some customer fns in `actions/forwarder.ts` still target it (orphan/landmine, §3). |
| `forwarder_items` | 0 | DEAD. |
| `forwarder_driver` | 0 | DEAD — legacy uses batch model `tb_forwarder_driver(+_item)`. |
| `forwarder_images` · `forwarder_status_log` · `forwarder_cost_adjustments` | 0 | DEAD (the last is a Pacred-original Phase-C feature, still wired on the UUID branch of `[fNo]`). |
| `containers` · `container_costs` · `container_hs_lines` · `container_disbursements` | 0 | DEAD — canonical = `tb_cnt` / `tb_cost_container` / pay-fanout. |
| `cargo_containers` · `cargo_container_status_history` · `cargo_shipments` · `cargo_shipment_tracking` · `cargo_sack_seq` | 0 | DEAD — the retired "container-centric spine" (D1 Option A removed it; `/admin/driver-runs` is the last rebuilt-era surface still reading these). |
| `carriers` | 5 | **Pacred-native registry** (NOT a tb_ twin) — feeds the freight booking flow. Legacy carrier list = the 46-value `fshipby` map. |
| `csv_imports` | 0 | DEAD twin of `tb_csvimport`. |

**Canonical rule (confirmed):** for every forwarder/cargo concept the **legacy `tb_*` table is the live one**; the rebuilt twin is empty. The marathon's biggest win was making the LIVE admin surfaces read+write `tb_*` (esp. the `[fNo]` detail editor, see §3).

---

## 3. STATE OF PRIOR-AUDIT GAPS (verified at HEAD — what's now FIXED)

The adm-09 + cust-03 + FRESH-master gaps, re-checked against the actual code at `a79faf71`:

### ✅ FIXED by the 2026-06-01 marathon (was 💀 dead-write / ❌ missing)
| Prior gap | Was | Now (verified file) |
|---|---|---|
| **adm-09 P0-3** `[fNo]` detail editor dead on real rows | full panels only on empty UUID branch | **FIXED** — `[fNo]/page.tsx` `renderLegacyForwarderView` mounts the full panel suite on real `tb_forwarder` rows: `TbForwarderPaymentPanel` + `TbForwarderActionPanel` + `TbForwarderDriverAssignPanel` + `TbForwarderEditPanel` (address re-pick / transport / shipby / amountCount / cost-adjust) + `BillToOverridePanel`. |
| **FRESH A2 #1** `adminMarkForwarderPaid` money dead-write | rebuilt `forwarders`+`wallet_transactions` | **TOMBSTONED** — `forwarders.ts:259` now throws + directs to `/admin/wallet/pay-user` (`adminPayForwardersOnBehalf` → real `tb_wallet`/`tb_wallet_hs`). Payment panel on `[fNo]` routes through that faithful action. |
| **adm-09 P0-1** bulk-bar `bulkUpdateStatus` dead-write | wrote empty `forwarders` | **FIXED** — `forwarders-bulk.ts:220` delegates to `adminBulkUpdateForwarderTbStatus` (tb_forwarder + status-log + notify + numeric enum). |
| **adm-09 P0-2** bulk-bar `bulkAssignDriver` dead-write | wrote empty `forwarder_driver` | **FIXED** — now INSERTs `tb_forwarder_driver` parent batch + `_item` children (with parent-rollback on child failure). Single-row variant reuses it on `[fNo]`. |
| **adm-09 P0-4** driver-expiry cron wrong-target | `forwarder_driver` rebuilt | **FIXED** — `expire-driver-assignments/route.ts:60` flips `tb_forwarder_driver.fdstatus 1→3 WHERE endtime<now()`. |
| **adm-09 P0-5 / FRESH #6** `tb_user_sales` commission on delivery | missing | **FIXED in BOTH paths** — `driver-work.ts:309` (deliver) AND `forwarders.ts:560` (`adminBulkUpdateForwarderTbStatus`) INSERT commission rows. (The "contested" item is resolved — both triggers fire.) |
| **adm-09 P1-6** single-container cnt-payment + slip | bulk-only, `cntimagesslip:""` | **FIXED** — `adminCreateCntPaymentSingle` (cnt-payment.ts:493) writes `tb_cnt` + uploads slip image to `slips` bucket. |
| **adm-09 P1-7** per-row bill-to-customer 4→5 | missing | **FIXED** — `adminReportCntBillToCustomer` (report-cnt-detail.ts:507). |
| **adm-09 P1-9** saveNote LINE push | silent | **FIXED** — `adminSaveForwarderNote` (forwarders.ts:891) fires `sendNotification` (in-app + LINE OA + email). |
| **adm-09 P1-8** `printAll` / `printDriver` | not ported | **BUILT** — `/admin/printAll` + `/admin/drivers/[id]/print` (Pacred brand). |
| **adm-09 P1 detail leaves** (address/cover/transport/owner/fCredit) | missing | **BUILT** — `forwarders-field-edits.ts`: `adminPickForwarderAddress` · `adminUpdateForwarderTransportType` · `adminUpdateForwarderCover` · `adminReassignForwarderOwner` · `adminUpdateForwarderShipBy` · `adminUpdateForwarderCostAdjust` · `adminUpdateForwarderAmountCount` · `adminMarkForwarderCredit` (with `tb_credit` UPSERT — fixes the legacy 98%-silent-drop). |
| **FRESH #3 Theme B** general rate editor wrong-table | wrote `rate_general`, engine reads `tb_rate_g_*` | **FIXED** — `/admin/rates/general` → `adminUpdateGeneralRateCells` → `tb_rate_g_kg`/`tb_rate_g_cbm` (the engine tables). |
| **FRESH #4 Theme B** 144-cell default cost matrix | no editor (raw SQL only) | **BUILT** — `/admin/settings/forwarder-costs` → `adminSetTbSettingsForwarderCosts` → `tb_settings` (144 columns, unit-tested). |
| **cust-03 P1** customer add carrier picker unwired | `#selectShipBy` empty | **FIXED** — `ServiceImportShipBySelect` wired into the live `ServiceImportAddFields`; `createLegacyForwarder` (tb_forwarder) is the live action; `checkFreeArea` ZIP gate handled in `forwarder-legacy.ts`. |
| **cust-03 P1** customer self-delete/cancel | none | **FIXED** — `cancelOwnForwarder` with exact legacy gate (`fStatus='1' AND refOrder=''`), wired in `forwarder-row-view.tsx`. |
| **adm-09 partner adapters** MK/MX/Sang sheet entry | "only CTT" (stale) | **BUILT** — `/admin/api-sheets-{ctt,mk,mx,sang}` manual-entry forms (faithful to legacy `api-sheets-*-2023.php`, which were manual pages not live pullers) + `/admin/api-forwarder-cn` (CargoCenter manual). |

**Net:** of the ~16 forwarder P0/P1 death-flows in the prior audits, **all but the partner-API-live items are closed**. The forwarder lane is now the most-complete admin lane (~**90%+**).

---

## 4. LEGACY GAPS — what genuinely remains (NEW finds at HEAD)

Status: ❌ missing · 🟡 partial/divergent · 🧨 landmine (present-but-dead, not customer-facing)

### ❌ G-1 (NEW · P1) — TH-transport batch grouping (`tb_forwarder_tran_th_h/sub`) not ported
**Legacy:** `forwarder-action.php` L5-44 lets admin **select fstatus rows and group them into an in-Thailand transport batch** — INSERT `tb_forwarder_tran_th_h` (header: date + creator) + N `tb_forwarder_tran_th_sub` (items: `fid`+`ftthhid`), with a dedupe guard. 296 headers / 643 items of real history exist on prod.
**Pacred:** `/admin/forwarder-action` ports the **9 audit queues + 11 QA redirects** but has **no tran_th batch-create**. The two tables have **zero Pacred writer** (grep confirms only the customer detail page *reads* adjacent data).
**Impact:** the "bundle these 12 orders onto one Thai delivery truck/run" grouping is unavailable to ops. Distinct from the driver-batch model (`tb_forwarder_driver`) — this is the upstream consolidation step. **Owner: ภูม. ~2-3h.**

### ❌ G-2 (P1) — Live partner-API pull adapters: GOGO · JMF · TTP not built
**Legacy:** `api-forwarder-gogo.php`, `api-forwarder-jmf.php`, `api-forwarder-ttp.php` — live carrier API pulls that auto-create/update forwarder rows + set cabinet/close-date. Staging tables hold real data (`tb_forwarder_jmf_tmp` 1,745 rows).
**Pacred:** only **MOMO** (isolated sync, cron every 10 min, `momo_*` tables) + **CargoThai** (`cargothai-sync` cron) + **CTT sheets** (`sheets-sync-ctt`) are live. GOGO/JMF/TTP have **no sync route** (the `api-forwarder-cn`/sheets pages are *manual-entry* only, not live pulls).
**Impact:** orders moving through GOGO/JMF/TTP carriers need manual entry; no auto status/cabinet propagation. **Owner: ก๊อต (partner-API lane). Effort L (each is a vendor-auth + mapping job). TTP flagged in FRESH as the priority.**

### 🟡 G-3 (P2) — `forwarder-search-muti` live MOMO Sack API multi-track
**Legacy:** `forwarder-search-muti.php` (668 LOC) does a **live MOMO Sack API call** to track many parcels at once; `momo_sack_infos` is the target (currently **0 rows**).
**Pacred:** `bulk-search` does a local 3-table lookup, no MOMO Sack call. **Owner: ก๊อต. M.** (Depends on G-2's MOMO-API access being broadened to the Sack endpoint.)

### 🟡 G-4 (P2) — operational leaves on the forwarder editor
Still unported (low-frequency): `updateLock` / `fLock` concurrency toggle (13 admins → collision risk) · `call.php` truck-size recommender · `saveLo.php` Google-Maps lat/lng pinner (needs MAPS key) · `api-flash-express` live-tracking proxy · `scriptfTrackingCHN` live onBlur dupe-check (Pacred checks on submit only) · numeric pallet codes 1-40 (Pacred only letter A1-Z6 · owner-decision). **Owner: ภูม. ~6-8h total, individually small.**

### 🧨 G-5 (P1 cleanup · landmine not death) — customer `actions/forwarder.ts` rebuilt-table cluster
**Still present** (cust-03 P1 NOT cleaned up): `payForwarderFromWallet` (L753), `listForwarders` (L492), `getForwarderByNo` (L441), `createForwarder` (L523), `previewPrice` — all target the **empty rebuilt `forwarders`**. Orphan files `add/forwarder-form.tsx` + `pending/page.tsx` (renders the dead `listForwarders`) + `pay-from-wallet-button.tsx` still exist.
**Why it's a landmine not a death:** the *live* customer screens (list/detail/table/invoice/receipts) query `tb_forwarder`/`tb_receipt` inline and the live add uses `createLegacyForwarder` — so these functions are **orphaned/unreached**. But a future wiring change, or a customer reaching `/service-import/pending`, surfaces an empty screen. `payForwarderFromWallet` also implements a method legacy **explicitly disabled** (wallet-pay for forwarder). **Fix = delete the orphans + dead fns, OR repoint. Owner: เดฟ. ~2h.**

### 🟡 G-6 (P2) — minor unported bits
- `tb_csvimport` (49 rows) — CSV bulk-import staging has no Pacred consumer (carrier CSV upload path).
- Orange totals row on forwarder-check + `วันที่รอเข้าโกดัง` average counter on report-cnt — formula stubs, aggregates not rendered.
- `cnt-hs` 9-row sales card — partial.
- `tb_forwarder_item`/`_prepare`/`_img` empty legacy tables — no Pacred reader (acceptable; dormant in legacy too).

---

## 5. MAX-POTENTIAL UPGRADES — "ดึงศักยภาพสูงสุด"

The forwarder cluster holds the richest operational dataset in the company: **47,636 orders × 114 columns**, **29,782 driver-delivery records**, **36k+ container-cost allocations**, **45,840 delivered** with full status-timestamp trails (`fdatestatus2..7`) and profit columns (`fprofittransportchn`/`fprofitpriceupdate`/`fprofittotal`). Almost none of it is exploited beyond list/detail. The upside:

### P0 — leverage the data we already collect
- **U-1 (M · P0) Profit & margin analytics dashboard.** `tb_forwarder` already stores `fcosttotalprice` + `fprofittotal` per order. Build `/admin/analytics/forwarder-margin` — margin by carrier (`fshipby`), by warehouse (`fwarehousename`), by transport mode, by month, by sales-rep — to find loss-making lanes/carriers. The columns exist; nothing reads them in aggregate. **Highest value-per-effort.**
- **U-2 (M · P0) SLA / cycle-time intelligence.** Every order has `fdate`→`fdatestatus2..7`. Compute true dwell time per stage (China-warehouse wait, transit, Thailand-warehouse-to-delivery) → surface bottlenecks + per-carrier transit-time leaderboard + "stuck order" alerts (e.g. fstatus=4 > N days unbilled = revenue waiting; **457 rows currently at fstatus=5 รอชำระเงิน**). Pure read over existing timestamps.
- **U-3 (S · P0) Revenue-waiting board.** 457 at fstatus=5 + 268 at fstatus=6 + 34 at fstatus=4 = money sitting idle. A single ops board ("฿X awaiting payment, oldest N days") + auto-escalation (the `fsendsms{1,3,3e}day` reminder flags already exist but verify they fire) converts directly to cash.

### P1 — connect tools/platforms
- **U-4 (L · P1) Unify partner-API sync (GOGO/JMF/TTP/CargoThai/MOMO/CTT) into one adapter framework + a status-propagation cron** (closes G-2/G-3). Each carrier currently a bespoke page; a `lib/carrier/adapters/*` interface (pull → normalize → upsert tb_forwarder + cabinet/close-date + fstatus auto-flip) makes adding the 6th/7th carrier a config, and gives one monitoring dashboard ("rows pulled, uncommitted backlog, last-sync lag" — `momo_sync_logs` already proves the pattern). Eliminates manual entry.
- **U-5 (M · P1) Customer-facing live tracking + proactive notify.** `ftrackingchn`/`ftrackingth` + the China/TH legs already feed `_tracking`. Wire LINE OA push on each `fdatestatusN` transition ("ของถึงโกดังจีนแล้ว/ถึงไทยแล้ว/กำลังจัดส่ง") — the LINE infra is live (`sendLinePush`), the status flips already happen, just no per-customer push on most transitions. Massive support-deflection + retention.
- **U-6 (M · P1) Cabinet/container cost-reconciliation automation.** `tb_cnt_pay_idorco` (36k) + `tb_cost_container` (2.7k) hold the cost-allocation truth. Build a reconciliation report (cost charged vs cost paid to carrier per cabinet) to catch under-/over-billing — the cost-update CSV path exists but no variance report.
- **U-7 (S · P1) Concurrency lock (G-4 `fLock`).** 13 admins on prod editing the same forwarder = silent overwrite. A lightweight optimistic-lock (compare `flockdate`/`adminidupdate` on save) prevents lost edits — cheap, high-pain-avoidance.

### P2 — longer horizon
- **U-8 (L · P2) Demand & repeat-purchase intelligence.** Join `tb_forwarder.reforder` (shop-order link) + `userid` to surface repeat-import customers, top product categories (`fproductstype`), and reactivation targets (customers with delivered orders but none recent). Feeds marketing + the sales-rep dashboard.
- **U-9 (M · P2) Truck-size + route optimization for the driver-batch model.** `call.php`'s truck recommender (G-4) plus the 29k delivery-item history → suggest batch composition + delivery sequencing (the lat/lng cols `faddresslatitude/longitude` exist but are largely empty — backfill via geocode then optimize).
- **U-10 (S · P2) Anomaly/fraud guardrails.** Cheap rules over existing data: forwarder created→delivered impossibly fast, cost > price (negative margin) auto-flag, slip-image reuse across cnt payments, fstatus regressions. Read-only, runs on cron.

---

## 6. SUMMARY TABLE — forwarder lane health at HEAD

| Area | State | Note |
|---|---|---|
| Customer browse→add→pay→receipt | ✅ faithful (tb_forwarder/tb_receipt) | carrier-picker + self-cancel now wired |
| Admin list + bulk-bar (status/cancel/assign) | ✅ faithful | all 3 bulk buttons repointed to tb_* |
| Admin `[fNo]` detail editor (real rows) | ✅ faithful | full panel suite mounted (the marathon centerpiece) |
| Driver batch + barcode + warehouse scan | ✅ faithful | cron retargeted; deliver→fstatus=7 cascade + commission |
| Container (cnt) payment + ledger fanout | ✅ faithful | single + bulk + slip; tb_cnt_pay_* both written |
| Cost/rate editors (general + 144-cell matrix + per-cabinet) | ✅ faithful | all write engine tables now |
| Print (printAll/printDriver/combine-bill) | ✅ built | Pacred brand |
| TH-transport batch grouping | ❌ G-1 | un-ported (296/643 rows orphaned) |
| Live partner pulls GOGO/JMF/TTP | ❌ G-2 | only MOMO/CargoThai/CTT live |
| MOMO Sack multi-track | 🟡 G-3 | local lookup, no live Sack call |
| Editor op-leaves (lock/maps/truck/onblur-dupe) | 🟡 G-4 | low-freq, individually small |
| Customer rebuilt-table orphans | 🧨 G-5 | landmine cleanup (เดฟ) |
| **Data exploitation (margin/SLA/tracking)** | ❌ huge upside | **U-1..U-10 — the real "max potential"** |

**Bottom line:** the faithful-port debt on forwarder is essentially paid down. The forward-looking work is **(a) the carrier-adapter framework (G-2/G-3/U-4)** and **(b) mining the 47k×114 dataset** (U-1/U-2/U-5) — both high value, neither a launch blocker.
