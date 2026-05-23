# Cargo Forwarder Flow — Deep Audit (Wave 16 prep)

**Date:** 2026-05-25 evening
**Triggered by:** ภูม catching me missing 2 huge pages (`report-cnt.php?id=` + `forwarder-check.php`) in a previous fidelity pass. Ordered a full deep audit: *"อยากส่งงานแล้วโดน Owner ไล่กลับบ้านหรือไง"*.
**Method:** 4 parallel agents — 2 enumerated legacy PHP source files, 2 enumerated Pacred Next.js routes. Diff below.

## Summary

| Domain | Legacy PHP files | Pacred routes | Coverage |
|---|---|---|---|
| Forwarder list + edit + new + audit-queue | 6 main + 16 includes | 22 files (forwarders/*, forwarder-action) | ✅ ~85% (1 stub) |
| Container payment (report-cnt + cnt-hs + forwarder-check) | 3 main + 6 includes | 5 files | ⚠️ ~50% — **2 P0 pages missing** |
| Driver assignment + combine bill + warehouse history | 3 main + 9 includes | 4 files | ⚠️ ~60% (standalone driver missing) |
| API integrations (MOMO / CN / JMF / GOGO / Sheets) | 10 pages + 8 sub-pages | 0 files | ❌ **0%** |
| Barcode scan | 11 main + 1 include | 16 files + 3 components | ✅ ~95% (1 AJAX-wiring stub) |
| Cron jobs (auto-sync MOMO/CN/JMF) | (handled outside) | 0 of 4 | ❌ **0%** |

## 🔴 P0 — Owner-blocking gaps (must finish before next demo)

| # | Pacred path (TO CREATE) | Legacy source | Legacy LOC | Why P0 |
|---|---|---|---|---|
| **P0-1** | `/admin/report-cnt/[fNo]/page.tsx` | `report-cnt.php?id=<container>` | 2502 (mode-b) | The container-drill-down ภูม flagged — เปิดเข้าตู้แล้วเห็น ต้นทุน · กำไร · รายการสินค้า · status quick-filters · inline cost edit. ตอนนี้ Pacred 🔧 fallback ไปที่ `/admin/forwarders?focus=search` (Wave 7.2 hack) |
| **P0-2** | `/admin/forwarder-check/page.tsx` | `forwarder-check.php` | 728 | "รายการตรวจสอบแล้ว" — 3 tabs (ทั้งหมด/เครดิต/ปกติ) + bulk-select + **"แจ้งชำระเงินลูกค้า"** button (status 4→5 + SMS + Line + email). คือปุ่ม BILL ลูกค้า → revenue flow ขาดทั้ง pipeline |
| **P0-3** | `/admin/forwarders/[fNo]/cost-edit-modal` (inline action) | `include/pages/report-cnt/editForm.php` | 69 | Inline edit cost จากแถว (3 variants: editCost / editCost2 from S / editCostSheet). ตอนนี้แก้ cost ต้อง click ดู → กดปุ่ม `แก้ไข` → ไป edit page เต็ม |
| **P0-4** | DELETE `/admin/forwarder-import-warehouse/page.tsx` (89 LOC stub) → redirect to `/admin/forwarders/warehouse-history/` | — | — | Stub Wave-1 ที่ duplicate กับ warehouse-history (1140 LOC faithful). ตอนนี้ top-menu-report ลิงก์ผิดที่ |

**P0 total effort:** ~7-9 ชม (1 day)

## 🟠 P1 — Workflow / revenue-path gaps

| # | Pacred path | Legacy source | LOC | Notes |
|---|---|---|---|---|
| **P1-1** | `/admin/api-forwarder-momo/page.tsx` + sub: `?page=manualUpdate` | `api-forwarder-momo.php` + `pageManualUpdate.php` | ~600 | **Manual entry form** หลัก — admin กรอกรายการ MOMO ที่ API miss. ที่เหลือ (updateAPI / APICheckSM / hisAutomation / dashboard) defer |
| **P1-2** | `/admin/api-forwarder-cn/page.tsx` + manual entry | `api-forwarder-cn.php` (byte-identical to MOMO except token) | ~470 | Same shape เป็น CargoCenter — แค่ token + base URL ต่าง |
| **P1-3** | `/admin/api-sheets-ctt/page.tsx` | `api-sheets-ctt.php` | 1352 | **WARNING:** ชื่อหลอก — ไม่ใช่ Sheets API · เป็น **manual forwarder entry form** สำหรับ CTT carrier (`fWarehouseName=?`). ลิงก์ Sheets แค่ปุ่ม decorate |
| **P1-4** | `/admin/api-sheets-sang/page.tsx` | `api-sheets-sang-2023.php` | 1265 | Same pattern — Sang carrier (PCSE→`fTransportPrice=fVolume*120 min 50`, PCSF→0) |
| **P1-5** | `/admin/api-sheets-mk/page.tsx` | `api-sheets-mk.php` | 1315 | MK carrier (`fWarehouseName=3`) |
| **P1-6** | `/admin/api-sheets-mx/page.tsx` | `api-sheets-mx.php` | 1299 | MX carrier |
| **P1-7** | Finish `/admin/barcode/driver/import/` AJAX wiring (Wave 3 TODO marker) | `barcode-d-import.php` + `include/pages/barcode-import/index.php` | 258 + 236 | UI shell done — แต่ AJAX scan-handler ยัง GET-redirect ไม่ POST JSON payload + ไม่ flip fStatus=4 auto |

**P1 total effort:** ~12-15 ชม (1.5 days)

## 🟡 P2 — Defer-to-Phase-C candidates

| # | Pacred path | Legacy LOC | Reason for defer |
|---|---|---|---|
| **P2-1** | `/admin/api-forwarder-jmf/*` (5 sub-pages) | ~500 | External API call to `jmfcargo.com` — needs token + ENV var setup |
| **P2-2** | `/admin/api-forwarder-gogo/*` | 768 | Self-hosted JSON cache — partner-specific |
| **P2-3** | `/admin/check-sang-cost/page.tsx` | 177 | Real Google Sheets API · service-account key + `googleapis` dep |
| **P2-4** | Cron jobs: MOMO/CN/JMF auto-sync | (in vercel.json) | Needs API keys + retry/backoff design |
| **P2-5** | `/admin/forwarder-driver/page.tsx` (standalone) | 2103 | Per-row driver-assign form already exists in `[fNo]/driver-assign-form.tsx` (Wave 10) — standalone bulk-assign UI is secondary |
| **P2-6** | MOMO Sack API call in `forwarder-search-muti.php` | 668 | Bulk-tracking search via partner — ใช้น้อย |
| **P2-7** | CargoCenter `containerReport` sub-page | (small) | Legacy itself marks "ยังทำไม่ได้" — never finished even in PHP |

## ⚠️ Schema-split risks (action: clarify before P0)

1. **`/admin/barcode/scan-form.tsx`** reads `forwarders.status` (REBUILT enum `arrived_thailand`/`out_for_delivery`/...). 8 faithful-port `barcode/cargo/*` + `driver/*` pages route through `/gateway` which queries `forwarders` table. **But the legacy `gateway.php` queries `tb_forwarder.fStatus 1..7`** — Wave 3 needs to reconcile this split or Pacred barcode flow breaks on legacy-imported rows.
2. **`/admin/forwarders/[fNo]/page.tsx`** (416 LOC) tries REBUILT `forwarders` first, falls back to `tb_forwarder` view (line 47-53 comment). The full editable detail on `tb_forwarder` was marked Wave 5 (never finished).
3. **`/admin/forwarders/notes/page.tsx`** (229 LOC) reads REBUILT `forwarders` (likely returns 0 rows on prod). Same bug Wave 3 P0 #1 already fixed for the list page.

## 🔐 Security flags (carry over to port)

1. **All API tokens hardcoded plaintext** in legacy: TTP `a807f4fe...`, CN `aea07c4d...`, JMF `dZWm4pQI...3JFu`. ต้องย้ายไป env vars เมื่อพอร์ต (P1-1/P1-2 ยังไม่ต้อง — เรา port manual form ก่อน · API call ค่อย Phase C)
2. **Weak role gates** — legacy api-forwarder + barcode pages ใช้ cookie check เท่านั้น (`$_COOKIE["pcs_admin_adminID"]`) ไม่ได้ check `departmentKey`. Pacred port ต้องใส่ `requireAdmin(["super","ops","warehouse"])` per page

## What was already done well (don't break these)

✅ Wave 11 forwarders list (775 LOC) — faithful 10-status tab + multi-search + bulk-bar
✅ Wave 12 combine-bill + warehouse-history — full 1:1 BS4 port under `.pcs-legacy` scope
✅ Wave 12-C v2 forwarders/new — 9-field cascading modal
✅ Wave 12-C ภาค 2 forwarders/[fNo]/edit — dimensions edit (Tailwind UI, our design philosophy)
✅ Wave 10 cnt-hs/[id] + approve/reject — full payment lifecycle
✅ Wave 2 barcode 8 routes + gateway + camera/scanner — entire scanner subsystem ported

## Next-step recommendation

**Wave 16 = P0 sprint** (1 day) → finish 4 P0 items above. Then demo to owner before touching P1.

**Wave 17 = P1 sprint** (1.5 day) → 4 manual-entry forms (api-sheets quartet) + 2 manual MOMO/CN forms + barcode AJAX-wire.

**Wave 18+ = P2 defer to Phase C** per ADR-0017.
