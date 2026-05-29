# Driver-assignment + Barcode-scan fidelity audit — 2026-05-30 evening

> **Scope:** TWO related sub-systems audited together against legacy
> `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\`:
> **(A)** มอบหมายคนขับ (driver assignment / batch model) and **(B)** สแกนบาร์โค้ด
> (warehouse intake + driver-pickup + ฯลฯ). They share a common spine —
> `tb_forwarder` rows flip through fstatus 1→7 as scans fire and drivers
> deliver — so an audit of one without the other misses the cross-edges.
>
> **Method per AGENTS.md §0b:** every legacy `.php` opened on disk, every
> dispatcher mode + every `include/pages/<dir>/*.php` sub-handler walked.
> Pacred state surveyed against `app/[locale]/(admin)/admin/{drivers,barcode}/**`
> + `actions/admin/{driver-work,driver-batches,forwarder-drivers,barcode,
> barcode-import}.ts`.
>
> **Prior art:**
> - `docs/audit/driver-assignment-gap-2026-05-30.md` (morning · Agent J P0 batch ✅ #229 closed) — kept as **driver-only** SOT but this re-audit covers barcode + the union P0 ranking the morning doc missed
> - `docs/audit/admin-pages-audit-2026-05-25-night.md` — broader

---

## Section 1A — Legacy driver-assignment inventory

11 PHP files · 4,548 LOC total · single workflow.

| File | LOC | Modes |
|---|---|---|
| `forwarder-driver.php` | 2103 | 4 modes: `default` (list batches + 90-day filter) · `?page=add` (the "มอบงานให้คนขับรถ" tab + "รายการรับเองหน้าโกดัง" alt-tab via `?page=add&q=pcs`) · `?page=detail&id={fdID}` (per-batch detail · Google Maps · per-stop "ถ่ายส่งสินค้า" upload · countdown timer) · POST `add` (insert batch + items + LINE notify driver token + ops token) · POST `update7` (cascade fStatus=7 on photo upload) |
| `forwarder-driver-w.php` | 1812 | History-flavored variant (older clone — keep as ref) |
| `include/pages/forwarder-driver/addFrom.php` | 227 | AJAX modal — driver `<select>` (tb_admin role=7 + active=1) + endTime 17/24/30 hr `<select>` + grouped stops sub-table + "พิมพ์บิลรวม" link + submit POST creates batch |
| `include/pages/forwarder-driver/addFromBill.php` | 240 | Variant for "รับเองหน้าโกดัง" path |
| `include/pages/forwarder-driver/call.php` | 41 | AJAX truck-size recommender (returns "รถกระบะ / 6 ล้อเล็ก / 6 ล้อใหญ่" given N forwarder ids by weight+volume sums) |
| `include/pages/forwarder-driver/saveLo.php` | 144 | Google Maps modal — pin lat/lng → write `tb_forwarder.fAddressLatitude/Longitude` AND `tb_address.latitude/longitude` |
| `include/pages/forwarder-driver/takePhoto.php` | 64 | Driver "ส่งสำเร็จ" photo upload — writes `tb_forwarder.fPhotoEnd` + `tb_forwarder_driver_item.fdiStatus='2'` + **cascades `tb_forwarder.fStatus='7' + fDateStatus7=NOW()`** + LINE notify |
| `include/pages/forwarder-driver/takePhotoINwarehouse.php` | 61 | Warehouse self-pickup variant |
| `include/pages/forwarder-driver/deleteFD.php` | 28 | AJAX delete one batch + cascade items |
| `include/pages/forwarder-driver/deleteForwarder.php` | 22 | AJAX delete one item |
| `include/pages/home/driver.php` | 277 | Home dashboard 4-card KPI widget — history / pending / commission฿ / failed |
| `printDriver.php` | 248 | "พิมพ์ใบค้นหาสินค้า" — A4 thermal-print routing slip |
| `printAll.php` | 969 | "พิมพ์และบันทึกบิลรวม" — A4 print + bill creation (consumed from the addFrom modal AND the list page) |

**Auto-expiry cron-like (top of `forwarder-driver.php` L4-17):** every page load runs
`UPDATE tb_forwarder_driver SET fdStatus='3' WHERE endTime < NOW() AND fdStatus=1`
+ cascade `UPDATE tb_forwarder_driver_item SET fdiStatus='3' WHERE fdiStatus='' AND fdID IN (...)`.

**Status enums (legacy SOT):**
- `tb_forwarder_driver.fdStatus`: `'1'` กำลังดำเนินการ · `'2'` สำเร็จ · `'3'` ไม่สำเร็จ
- `tb_forwarder_driver_item.fdiStatus`: `''` ยังไม่ขึ้นรถ · `'1'` กำลังส่ง · `'2'` ส่งสำเร็จ · `'3'` ส่งไม่ได้

---

## Section 1B — Legacy barcode-scan inventory

13 PHP files · 4,148 LOC total. **The legacy axis is CAMERA vs USB SCANNER**, not "cargo vs driver" — Pacred's URL naming is misleading (`cargo` actually = mobile camera mode, `driver` = USB scanner workstation).

| File | LOC | Purpose | Backend |
|---|---|---|---|
| `barcode-c-all.php` | 409 | 📷 Camera scan → gateway `type=all&device=mobile` | gateway.php |
| `barcode-c-from.php` | 409 | 📷 Camera scan → gateway `type=from&device=mobile` (print) | gateway.php |
| `barcode-c-import.php` | 408 | 📷 Camera scan **HAS its own writer** → posts to `barcode-import/index.php` (warehouse arrival, writes `tb_forwarder_import2`, auto-flips fstatus=4). Mode = USE LOCATION input `fPallet` (A1..Z6 codes) + camera tracking input. UI mostly identical to `barcode-d-import.php` — different scanning input source. | barcode-import/index.php |
| `barcode-c-import2.php` | 514 | 📷 Camera variant 2 (kept as ref — barcode-c-import.php is current) | barcode-import/index.php |
| `barcode-c-prepare.php` | 409 | 📷 Camera scan → gateway `type=6&device=mobile` (เตรียมส่ง) | gateway.php |
| `barcode-d-all.php` | 91 | 🔫 USB-scanner input → gateway `type=all&device=scanner` (form auto-submits on input) | gateway.php |
| `barcode-d-from.php` | 91 | 🔫 USB-scanner → gateway `type=from&device=scanner` (print) | gateway.php |
| `barcode-d-import.php` | 258 | 🔫 USB-scanner workstation **HAS its own writer** → posts to `barcode-import/index.php`. **Two inputs:** location `fPallet` (cookie-sticky) + tracking. Hardcoded 46 location codes (A1-A3, B1-B3, ... Z6). | barcode-import/index.php |
| `barcode-d-import2.php` | 244 | 🔫 USB variant 2 (kept as ref) | barcode-import/index.php |
| `barcode-d-importKey.php` | 237 | 🔫 USB variant: numeric pallet codes 1-40 instead of A1-Z6 codes | barcode-import/index.php |
| `barcode-d-prepare.php` | 94 | 🔫 USB-scanner → gateway `type=6&device=scanner` (เตรียมส่ง) | gateway.php |
| `gateway.php` | 213 | 🎯 **The routing brain.** Receives `?type=&device=&tracking=` → switch over 4 types (`all`, `4`, `6`, `from`) → redirect to `/forwarder/update/{ID}` with proper anchor/action. On 0 matches → 2-sec auto-redirect to fallback scanner. On `>1` → ambiguity list. **`type=6` extra:** also LEFT JOINs `tb_forwarder_driver_item + tb_forwarder_driver` to surface `fdAdminID` (assigned driver) in a SweetAlert prompt. | (direct queries) |
| `include/pages/barcode-import/index.php` | 236 | 🎯 **The warehouse-arrival WRITER.** Multi-tier lookup: (1) `fTrackingCHN OR fIDorCO` matching + dash-trim fallback + `LIKE '__digits'` 2-char-prefix LIKE fallback. UPSERTs `tb_forwarder_import2` (keyed by fid OR keysearch+today for orphans). **Auto-flips `tb_forwarder.fStatus='4' + fDateStatus4=NOW()`** when `fi2amount ≥ famount`. | (direct queries) |
| `include/pages/barcode-import/forwarder-import-warehouse.php` | unknown | The orphan-linking screen — staff manually links orphan tb_forwarder_import2 rows to tb_forwarder | (direct queries) |

**Critical subtle rules in `index.php` (the writer):**
- L23-76 (primary): `WHERE (fTrackingCHN='$keysearch' OR fIDorCO='$keysearch') AND fStatus<5` → 1-hit wins
- **Multi-hit tiebreaker** L41-75: ① rows with `refOrder<>''` (sub-order) ② rows with `adminIDCreator<>''` (admin-entered) ③ otherwise treat as not-found
- L78-102 (dash fallback): if keysearch has `-`, search head before dash as `fidorco`
- L104-131 (LIKE fallback): strip non-digits, search `ftrackingchn LIKE '__$digits'` (any-2-char prefix + digits — matches SF/YT/JT prefixes)
- **Auto-flip threshold** (L167-175): `fi2amount >= famount` → cascade fStatus=4
- **Sub-action on non-flip** (L171-175): touch `adminidupdate + fpallet` even without flip

**`gateway.php` `type` enum (L42-47):** `all` = generic search · `4` = เข้าโกดัง · `6` = เตรียมส่ง · `from` = พิมพ์

---

## Section 2A — Pacred driver-assignment state (Poom-pacred head)

**Routes:**
| URL | File | Status | Backed by |
|---|---|---|---|
| `/admin/drivers` (list) | `app/[locale]/(admin)/admin/drivers/page.tsx` | 🟢 **Wave morning P0 #229 shipped** · reads legacy `tb_forwarder_driver` correctly · filter chips by `fdstatus` 1/2/3 · 90-day default range with "all" override · status tally · driver name directory · item agg via batched parallel queries | Direct Supabase admin client |
| `/admin/drivers/[id]` (detail) | `app/[locale]/(admin)/admin/drivers/[id]/page.tsx` | 🟢 **Wave morning P0 #229 shipped** · groups items by recipient address into "stops" · countdown timer client island (`batch-countdown.tsx`) · Google Maps waypoint link (concat all stops) · signed photo URLs · BatchActions (ops/super "ยกเลิกรอบ") · per-stop tracking sub-table | `driver-batches.ts` + signed URLs |
| `/admin/drivers/new` (create) | `app/[locale]/(admin)/admin/drivers/new/page.tsx` + `create-batch-form.tsx` | 🟢 **Wave morning P0 #229 shipped** · reads `tb_forwarder WHERE fstatus='6'` excluding open-batch fids · groups by (fshipby · recipient address tuple) · multi-select checkboxes · driver picker (from admins role=driver) · endTime 17/24/30 hr select | `driver-batches.ts::createDriverBatch` |
| `/admin/drivers/work` (mobile) | `app/[locale]/(admin)/admin/drivers/work/page.tsx` | 🟢 Wave 10 + 12-B · mobile-first cards · `driver` role auto-filters to own batches · "ขึ้นรถ" + "ส่งสำเร็จ" + "ส่งไม่ได้" buttons (with photo upload Wave 12-B) | `driver-work.ts` |
| `/admin/forwarders/[fNo]/driver-assign-form.tsx` | (sibling form) | 🟠 Per-forwarder driver assignment · writes REBUILT `forwarder_driver` UUID table · NOT how legacy works | `forwarder-drivers.ts` |

**Actions:**
- `actions/admin/driver-batches.ts` — 294 LOC · `createDriverBatch` (insert tb_forwarder_driver + items)
- `actions/admin/driver-work.ts` — 464 LOC · status flips + photo upload on `tb_forwarder_driver_item`
- `actions/admin/forwarder-drivers.ts` — 417 LOC · operates on REBUILT (orphan)

**Cron:**
- `app/api/cron/expire-driver-assignments/route.ts` — still targets REBUILT table · #229 audit flagged as P1 retarget needed

---

## Section 2B — Pacred barcode-scan state

**Routes:**
| URL | File | Status | Mode |
|---|---|---|---|
| `/admin/barcode` | `barcode/page.tsx` | 🔴 **STUB → redirects** to `/admin/barcode/driver/import` (Wave 29 #5 tombstoned) | tombstone |
| `/admin/barcode/driver` (hub) | `barcode/driver/page.tsx` | 🔴 **STUB → redirects** to `/admin/barcode/driver/import` (Wave 29 #5 tombstoned) | tombstone |
| `/admin/barcode/cargo/all` | `barcode/cargo/all/page.tsx` | 🟢 1:1 transcription · 📷 camera (Quagga2) → gateway `type=all&device=mobile` | bounce |
| `/admin/barcode/cargo/from` | `barcode/cargo/from/page.tsx` | 🟢 1:1 transcription · 📷 camera → gateway `type=from&device=mobile` (print) | bounce |
| `/admin/barcode/cargo/prepare` | `barcode/cargo/prepare/page.tsx` | 🟢 1:1 transcription · 📷 camera → gateway `type=6&device=mobile` | bounce |
| `/admin/barcode/cargo/import` | `barcode/cargo/import/page.tsx` + `cargo-import-scanner.tsx` | 🟢 📷 camera writer · UI ports `pcs-legacy` Bootstrap chrome · calls `adminBarcodeImportScan` action | **WRITER** |
| `/admin/barcode/driver/all` | `barcode/driver/all/page.tsx` | 🟢 1:1 transcription · 🔫 USB scanner → gateway `type=all&device=scanner` | bounce |
| `/admin/barcode/driver/from` | `barcode/driver/from/page.tsx` | 🟢 1:1 transcription · 🔫 USB → gateway `type=from&device=scanner` (print) | bounce |
| `/admin/barcode/driver/prepare` | `barcode/driver/prepare/page.tsx` | 🟢 1:1 transcription · 🔫 USB → gateway `type=6&device=scanner` | bounce |
| `/admin/barcode/driver/import` | `barcode/driver/import/page.tsx` + `import-scanner-panel.tsx` | 🟢 **Wave 29 #213 mobile-first rewrite** · 🔫 USB workstation writer · Pacred Tailwind chrome (NOT Bootstrap pcs-legacy) · cookie-sticky `fPallet` · 46 location codes A1-Z6 hardcoded | **WRITER** |
| `/admin/barcode/gateway` | `barcode/gateway/page.tsx` | 🟢 Routing brain port · 4 types · NotFoundPanel + AmbiguityList + ParamsErrorPanel · redirect to `/admin/forwarders/{id}` | **ROUTER** |

**Actions:**
- `actions/admin/barcode-import.ts` — 526 LOC · `adminBarcodeImportScan` — faithful port of `include/pages/barcode-import/index.php` · primaryLookup + fallbackLookup (dash-cut + 2-char-prefix LIKE) + upsertScanRow + auto-flip fstatus 4 + Wave 26 G5 role gate
- `actions/admin/barcode.ts` — 226 LOC · revalidatePath helpers

---

## Section 3A — Driver-assignment gap matrix

(P0 batch #229 already shipped — these are **what remains** AFTER #229.)

| # | Legacy feature | Pacred state | Priority | Effort |
|---|---|---|---|---|
| 1 | **Photo upload cascades `tb_forwarder.fStatus='7' + fDateStatus7=NOW()`** when batch's last stop is delivered (legacy lines 166, 580, 1328) | 🔴 `driver-work.ts` only writes to `fdipictureoff` · DOES NOT cascade fStatus=7 · staff see ตู้ stuck at fstatus=6 forever | **P0** | M (60min) |
| 2 | Auto-create `tb_user_sales` row for 4 hardcoded VIP corps (THADA.VIP→PCS888, SIN.VIP→PCS352, OOAEOM.VIP→PCS2678, SWAN→PCS4155) on photo-upload | 🔴 missing | P3 | S (30min) — defer until ภูม decides if VIP affiliates port |
| 3 | LINE notify driver token + ops token on batch creation (`forwarder-driver.php` L93-105) | 🟠 not wired · ภูม decision: legacy uses hardcoded LINE Notify tokens; ADR-0001 migrated to Messaging API push | P1 | M (45min) — owner decision on tokens |
| 4 | LINE notify per-stop delivery (L1414, L1433) | 🟠 not wired · same dependency | P1 | M (45min) |
| 5 | Truck-size recommender (`call.php`) — POST N forwarder ids → return "รถกระบะ / 6 ล้อเล็ก / 6 ล้อใหญ่" by weight+volume sums · live AJAX on the create-batch form | 🔴 missing | P1 | S (30min) |
| 6 | Google Maps lat/lng pinner modal (`saveLo.php`) — operator sets `fAddressLatitude/Longitude` + `tb_address.latitude/longitude` for PCSF/PCSE addresses lacking GPS | 🔴 missing | P1 | L (120min) — needs `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` |
| 7 | "ยกเลิกรายการ" per-item from batch detail (`deleteForwarder.php` 22 LOC AJAX) | 🟠 batch-level cancel exists (BatchActions) · per-item missing | P1 | S (30min) |
| 8 | Auto-expiry cron-like at top of `forwarder-driver.php` page-load (legacy L4-17 · every page load runs the sweep) | 🟠 Pacred has dedicated cron `app/api/cron/expire-driver-assignments/route.ts` BUT targets REBUILT table · MUST retarget to `tb_forwarder_driver` (legacy 17/24/30 hr expiry) | **P0** | S (20min) |
| 9 | "พิมพ์ใบค้นหาสินค้า" (`printDriver.php` 248 LOC) — A4 picking slip per batch | 🔴 missing | P2 | L (90min) — owner decision on receipt brand (PCS vs Pacred) |
| 10 | "พิมพ์และบันทึกบิลรวม" (`printAll.php` 969 LOC) — A4 bill print + bulk receipt creation from the create-batch modal | 🔴 missing | P2 | L (180min) — depends on Wave 29 receipt flow |
| 11 | Driver home dashboard 4-card KPI widget (`include/pages/home/driver.php` 277 LOC — history / pending / commission฿ / failed) | 🔴 missing | P2 | M (60min) |
| 12 | "รายการรับเองหน้าโกดัง" alt-tab on create page (`?page=add&q=pcs`) — different fShipBy filter for warehouse self-pickup | 🔴 missing | P2 | M (90min) |
| 13 | Bulk batch-level admin override ("บังคับ สำเร็จ" / "บังคับ ไม่สำเร็จ") at detail page | 🟠 BatchActions has cancel-only · no force-success | P2 | S (20min) |
| 14 | "พิมพ์บิลรวม" link inside the create-batch modal sub-table | 🔴 missing (depends on #10) | P2 | dep |
| 15 | Department-gated action visibility (CEO/Manager/QA/Accounting/ITDT/Warehouse see "ตัวเลือก" column · Driver doesn't) | 🟠 partial via `requireAdmin([...])` · no fine column gating | P2 | S (20min) |
| 16 | Per-batch "ดูบิลใบเสร็จในรายการนี้" bulk receipt viewer button | 🔴 missing | P2 | M (60min) |
| 17 | LINE notify token lookup helper (`getTokenLineDriver($adminID)`) | 🔴 missing | P1 | dep on #3 |
| 18 | Per-row photo OFF cascade fix — when ALL items in batch reach fdistatus='2', cascade batch `fdstatus='2'` (legacy L1381 sub-query) | 🟠 Wave 12-B may have partial · needs verify | P1 | S (30min) — verify-only first |

**Subtotal:** 18 remaining items · 2 P0 (80 min) · 7 P1 (320 min) · 9 P2 (640 min).

---

## Section 3B — Barcode-scan gap matrix

| # | Legacy feature | Pacred state | Priority | Effort |
|---|---|---|---|---|
| 1 | **`forwarder-import-warehouse.php`** — the orphan-linking screen (staff manually links unmatched `tb_forwarder_import2` rows to a forwarder, OR deletes the scan event) | 🟠 `/admin/forwarders/warehouse-history` exists but **need verify it covers orphan relink** — without it, "บันทึกสำเร็จ ไม่พบข้อมูลเชื่อมภายหลัง" rows accumulate uncleared | **P0** | M (60min) — VERIFY first, then maybe just label |
| 2 | `barcode-c-import2.php` (514 LOC variant) — legacy kept this as ref · drop-in different scanner library? | 🟡 N/A — Wave 17 picked `barcode-c-import.php` as canonical, ignore variant | covered | — |
| 3 | `barcode-d-import2.php` + `barcode-d-importKey.php` (numeric pallet codes 1-40 instead of letter codes A1-Z6) | 🔴 missing — some staff use numeric pallet IDs (legacy supported via -importKey.php) | P2 | M (45min) — owner decision: keep letter-only or add numeric variant? |
| 4 | `printAll.php` 969 LOC — invoked from `gateway.php?type=from` (line 169 of gateway: `/printAll/?print=1&id[]={ID}`) | 🔴 missing · gateway P routes mark it as "Wave-3 TODO" in code comment (line 78-82 of `gateway/page.tsx`) | **P0** | L (180min) — direct revenue impact when staff scan-print labels |
| 5 | `gateway.php` `type=6` SweetAlert showing assigned driver name (`fdAdminID`) before redirect — legacy L120-122 | 🟠 Pacred gateway/page.tsx comment says "deferred" · falls through to `#form6` anchor on detail page · staff lose the inline preview | P1 | S (30min) |
| 6 | `gateway.php` `type=6` SweetAlert with "ดูข้อมูล / กลับไปสแกน" choice when already at fstatus=6 (legacy L120) | 🔴 missing · current redirects straight to detail page | P1 | S (20min) — same fix as #5 |
| 7 | `gateway.php` fstatus<6 swal error "ขั้นตอนผิด" with auto-redirect 2s (legacy L127) | 🔴 missing — current redirects regardless of fstatus | P1 | S (20min) |
| 8 | Numeric pallet codes (1-40) on `barcode-d-importKey.php` — **alternative location-encoding scheme** | 🔴 missing | P2 | M (45min) — depends on owner decision |
| 9 | Audio feedback `sSave.mp4` + `notFoundSave.mp4` — used by both writer pages on each scan | 🟢 Wave 29 #213 import-scanner-panel.tsx has these · cargo-import-scanner.tsx **verify-only** | covered? | verify |
| 10 | `tb_forwarder_import2` scan-event RLS — service_role only? customer never reads? | 🟡 verify — needs RLS audit | P1 | S (20min) verify |
| 11 | LINE Notify on warehouse arrival (`fstatus=4` auto-flip would trigger customer "ของถึงไทยแล้ว" push) | 🟠 Wave 28 `appendStatusLog` writes audit but **no customer push** on 3→4 transition (legacy comment confirms) | P2 | M (60min) — owner decision |
| 12 | `barcode-c-import.php` icon (`la-barcode font-30`) + breadcrumbs match legacy | 🟢 cargo-import + driver-import both render | covered | — |
| 13 | `Quagga2` (`@ericblade/quagga2` npm pkg) camera scanner for `barcode-c-*` pages | 🟢 Pacred already installed (`docs/research/poom-save-point-2026-05-20-night.md`) | covered | — |
| 14 | `gateway.php` `?action=save#form4` URL suffix passes through to forwarder detail (signaling auto-fill scan-saved animation) | 🟢 Pacred gateway preserves the anchor + query | covered | — |
| 15 | **Wave 30.5 — auto-commit MOMO** depending on barcode arrival flips? (already in carry-over backlog from CLAUDE.md head) | 🟡 not strictly barcode-scope · cross-edge | tracked | — |

**Subtotal:** 15 items · 2 P0 (240 min) · 5 P1 (90 min) · 4 P2 (210 min) · 4 covered/N/A.

---

## Section 4 — Top P0 mixed (driver + barcode union · prioritized · this round)

The mutually-blocking + revenue-path items across both subsystems:

### Mixed-P0 #1 — Cascade `tb_forwarder.fstatus='7'` on driver photo-upload (Driver #1)
**Why P0:** Legacy lines 166, 580, 1328 explicitly cascade this. Staff using Pacred today see ตู้ stuck at fstatus=6 even after every stop is delivered (because we wrote only to `fdipictureoff` and never touched the parent forwarder row). Customers see "เตรียมส่ง" forever in their order portal. **Direct revenue + customer-trust impact.**
**Effort:** M ~60min · extends `driver-work.ts::markDriverItemDelivered` to also UPDATE `tb_forwarder` SET fstatus='7' + fdatestatus7=now() + adminidupdate · gated through `canAnyRoleFlipFstatus(roles, 6, 7)`.

### Mixed-P0 #2 — `forwarder-import-warehouse` orphan-linking flow (Barcode #1)
**Why P0:** When the warehouse scanner fires on an unknown tracking, Pacred writes an orphan `tb_forwarder_import2` row (`fid=null, keysearch=…`). Legacy had a screen for staff to manually link these orphan rows to a forwarder OR delete them — without it, orphans accumulate and the warehouse-arrival audit drifts from reality. **Verify-first** — `/admin/forwarders/warehouse-history` may cover it (was added Wave 18+); if it doesn't, ship the relink UI now.
**Effort:** M ~60min · audit-only if covered, ~90min if needs new UI.

### Mixed-P0 #3 — Retarget driver-expiry cron to `tb_forwarder_driver` (Driver #8)
**Why P0:** `expire-driver-assignments` cron currently targets the REBUILT table which has 0 batches. **Legacy auto-expiry never runs in Pacred**. Stale batches accumulate beyond their 17/24/30 hr SLA, no fdstatus='3' flip, no cascade to fdistatus='3' for unfinished items. **Operations + driver SLA breach.**
**Effort:** S ~20min · swap table name + column names in cron route.

### Mixed-P0 #4 — `printAll.php` 969 LOC ported as `/admin/printAll` (Barcode #4)
**Why P0:** `gateway.php?type=from&device=…` is the print-from-scan workflow — warehouse staff scan a barcode then thermal-print the routing label. Pacred's gateway has a TODO comment ("legacy went to /printAll/?print=1&id[]=<ID>. /admin/printAll isn't ported yet"). **Daily warehouse workflow.** Without this, staff fall back to manual write or skip the print.
**Effort:** L ~180min · port the 969-LOC PHP + mPDF; reuse Wave 29 receipt-print pattern.

### Mixed-P0 #5 — Gateway `type=6` SweetAlert with driver + status preview (Barcode #5 + #6 + #7)
**Why P0:** When warehouse scans a parcel that's already assigned to a driver, legacy showed an inline "สถานะ: เตรียมส่ง | คนขับรถ: PR####" SweetAlert before redirecting. Pacred currently redirects silently to `#form6` anchor — staff lose the cue they're double-scanning an already-assigned parcel and re-scan it onto a new batch. **Operational error rate.**
**Effort:** S ~30min · `gateway/page.tsx` adds the LEFT JOIN + renders a confirmation panel (already structured as `ParamsErrorPanel` pattern).

---

## Section 5 — P1 backlog summary (12 items · ~700 min)

**Driver:** #3 LINE notify batch · #4 LINE notify delivery · #5 truck-size recommender · #6 lat/lng pinner · #7 per-item cancel · #17 LINE token lookup · #18 batch fdstatus cascade verify

**Barcode:** #5/6/7 (covered as P0 above) · #10 RLS audit · #11 customer push on arrival

---

## Section 6 — ✅ Matching / covered

- 🟢 Driver list/detail/create/work + countdown/maps/photo upload (Wave morning #229)
- 🟢 Driver-work mobile UI + photo upload (Wave 12-B)
- 🟢 Driver batch creation insert + items (driver-batches.ts)
- 🟢 Barcode 4 USB scanner bounce pages (driver/all/from/prepare/import) + 4 camera bounce pages (cargo/all/from/prepare/import)
- 🟢 Gateway routing brain (4 types + ambiguity + not-found + params-error)
- 🟢 `adminBarcodeImportScan` server action — primaryLookup + fallbackLookup + upsertScanRow + auto-flip + Wave 26 G5 role gate + Wave 28 status-log
- 🟢 Quagga2 camera scanner installed
- 🟢 Wave 29 #213 mobile-first import scanner UI (Pacred Tailwind)
- 🟢 Cookie-sticky `fPallet` location code + 46 location-code recognition

---

## ภูม decisions needed (carryover from #229 + new)

1. **Google Maps API key** — provision `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for saveLo lat/lng pinner (Driver #6)?
2. **LINE Notify migration** — Driver #3/#4/#17 need driver-side tokens · ADR-0001 said Messaging API push · hold or wire?
3. **Cron retarget** — Mixed-P0 #3 · do it now or hold for Wave 31?
4. **Print routes brand** — `printDriver.php` / `printAll.php` use PCS Cargo branding · same Wave 29 receipt issue
5. **Numeric pallet codes** — Barcode #8 — keep letter-only or add numeric variant (`barcode-d-importKey.php`)?
6. **Customer push on fstatus 3→4** — Barcode #11 — silent log (current) or send "ของถึงไทย" line/sms?

---

**End of audit.** Recommended next-round = Mixed-P0 #1 (60min) + #3 (20min) + #5 (30min) = 110 min of high-leverage fidelity fixes. Mixed-P0 #2 + #4 are bigger and need ภูม decision on receipt brand. Update `docs/audit/driver-assignment-gap-2026-05-30.md` status banner pointing here as latest.
