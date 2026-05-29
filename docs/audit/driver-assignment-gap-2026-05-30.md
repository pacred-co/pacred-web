# Driver-assignment fidelity gap audit — 2026-05-30

> **ภูม flag (verbatim):** "หัวข้อมอบหมายงานคนขับรถอะ มันยังผิดอะมันไม่เหมือน pcs เลย มันขาดไปเยอะมาก"
>
> Agent D earlier did a schema swap (rebuilt `forwarder_driver` → legacy `tb_forwarder_driver`) but the **fidelity port** of the workflow was NOT done. This audit walks every legacy file under `pcs-admin/forwarder-driver*` and `pcs-admin/include/pages/forwarder-driver/*`, lists every mode + button + data field, and maps it to what Pacred has today.
>
> **Method per AGENTS.md §0b** — open the PHP source on disk, walk every `switch ($_GET['page'])` mode, document fields/buttons/destinations. Do NOT trust the previous parity audit (`docs/audit/parity-forwarder-driver.md` 2026-05-16) — it described the REBUILT table only.

---

## Legacy file inventory (11 PHP files)

| File | LOC | What it does |
|---|---|---|
| `pcs-admin/forwarder-driver.php` | ~2104 | Main dispatcher: list batches (default) · `?page=add` create batch · `?page=detail&id=X` show batch + per-stop "ถ่ายส่งสินค้า" upload + Google Maps + บังคับ status flip · `?page=add&q=pcs` alt-tab "รายการรับเองหน้าโกดัง" (warehouse self-pickup) |
| `pcs-admin/forwarder-driver-w.php` | ~1813 | Older variant of the dispatcher (kept for driver-side history view) |
| `include/pages/forwarder-driver/addFrom.php` | 227 | AJAX modal — pick driver + show grouped destinations + create batch |
| `include/pages/forwarder-driver/addFromBill.php` | 240 | Same modal but for "รับเองหน้าโกดัง" path with `endTime` selector (17/24/30 hr) |
| `include/pages/forwarder-driver/call.php` | 41 | AJAX truck-size recommender — given N forwarder ids returns "รถกระบะ / 6 ล้อเล็ก / 6 ล้อใหญ่" based on weight + volume sums |
| `include/pages/forwarder-driver/saveLo.php` | 144 | Google Maps modal — pin destination lat/lng + write to `tb_forwarder.fAddressLatitude/Longitude` + `tb_address.latitude/longitude` |
| `include/pages/forwarder-driver/takePhoto.php` | 64 | Driver "ส่งสำเร็จ" — photo upload modal (writes `tb_forwarder.fPhotoEnd` + flips `tb_forwarder_driver_item.fdiStatus='2'` + `tb_forwarder.fStatus='7'`) |
| `include/pages/forwarder-driver/takePhotoINwarehouse.php` | 61 | Warehouse self-pickup variant of takePhoto |
| `include/pages/forwarder-driver/deleteFD.php` | 28 | DELETE one batch (`tb_forwarder_driver` + cascade items) — AJAX |
| `include/pages/forwarder-driver/deleteForwarder.php` | 22 | DELETE one item from a batch (`tb_forwarder_driver_item`) |
| `include/pages/home/driver.php` | 277 | Dashboard widget — 4 KPI cards (history / pending / commission / failed) + active batches table |

---

## Legacy workflow (the actual user journey)

```
                  ┌─ tab 1 "มอบงานให้คนขับรถ" ──────────────┐
                  │  Reads tb_forwarder WHERE fStatus=6     │
                  │  (เตรียมส่ง) + fShipBy IN PCSF/PCSE/etc│
                  │  GROUPED BY (carrier, recipient_address)│
                  │  Each row = "1 จุดส่ง" with sub-table   │
                  │  of every tracking# at that address     │
   /forwarder-    │  ────────────────────────────────       │
   driver/add  ──►│  Operator selects N rows (DataTable     │
                  │  checkboxes) → clicks                   │
                  │  "เลือกคนขับรถและสร้างรายการ"           │
                  └────────────────┬────────────────────────┘
                                   │
                                   ▼  AJAX → addFrom.php (modal)
                  ┌────────────────────────────────────────┐
                  │ Modal:                                  │
                  │  - <select> driver list (tb_admin       │
                  │    WHERE adminStatus=7 AND active=1)    │
                  │  - <select> endTime 17/24/30 hr         │
                  │  - Table of selected stops (1 row per   │
                  │    unique address) with sub-table of    │
                  │    every tracking# + "พิมพ์บิลรวม" link  │
                  │  - [สร้างรายการ] submits POST           │
                  └────────────────┬────────────────────────┘
                                   │
                                   ▼  POST add → INSERT tb_forwarder_driver
                                                + tb_forwarder_driver_item rows
                                                + LINE notify to driver token
                                                + LINE notify to ops token

   /forwarder-driver  (list view)                           ◄── list batches
     ▼
   /forwarder-driver/detail/{fdID}    (per-batch detail)
     ▼
     ▶ Google Maps nav link (waypoint chain through every stop)
     ▶ Per-row "ถ่ายส่งสินค้า" button (camera/photo modal)
        → uploads to /images/shops/ + flips fdiStatus=2 (per-row)
        → AT LAST row: auto-flips fdStatus=2 (batch done)
        → LINE notify per-delivery
     ▶ Per-row "ยกเลิกรายการ" (deleteForwarder.php) for failed stops
     ▶ Per-row "ปักหมุด/แก้ไขหมุด" (saveLo.php modal) for PCSF/PCSE
        addresses missing lat/lng
     ▶ Per-row "แผนที่/แผนที่ขนส่ง" Google Maps link
     ▶ Countdown timer (endTime - now) at top
     ▶ "พิมพ์ใบค้นหาสินค้า" → printDriver.php

   CRON-LIKE (top of forwarder-driver.php, every page load):
     SELECT fdStatus=1 WHERE endTime < NOW()
     → flip fdStatus=3 (หมดเวลา) + fdiStatus='3' for unfinished rows
```

---

## Pacred current state (as of `Poom-pacred` head)

| Surface | File | What it does |
|---|---|---|
| `/admin/drivers` (list) | `app/[locale]/(admin)/admin/drivers/page.tsx` | 🔴 Reads REBUILT `forwarder_driver` UUID table · empty on prod · Agent D did NOT touch this · 1-row-per-assignment, no batches |
| `/admin/drivers/work` (mobile) | `.../drivers/work/page.tsx` | 🟢 Reads legacy `tb_forwarder_driver_item` correctly · mobile-first cards · "ขึ้นรถ"/"ส่งสำเร็จ"/"ส่งไม่ได้" actions with photo upload (Wave 12-B) |
| `/admin/drivers/[id]` (detail) | (none) | 🔴 MISSING — legacy `forwarder-driver/detail/{fdID}` is the heart of the workflow |
| Batch creation page | (none) | 🔴 MISSING — legacy `forwarder-driver/add` (the "มอบงานให้คนขับรถ" tab) doesn't exist at all |
| `/admin/forwarders/[fNo]/driver-assign-form.tsx` | (exists) | 🟠 Per-forwarder driver assignment · writes rebuilt `forwarder_driver` UUID table · NOT how legacy works (legacy groups N forwarders by address into one batch) |
| Sidebar badge `driverItems` | `actions/admin/sidebar-counts.ts:110-112` | 🟢 Counts `tb_forwarder` WHERE fstatus=6 (เตรียมส่ง — forwarders ready for assignment) — CORRECT |
| Server actions | `actions/admin/driver-work.ts` | 🟢 status flip + photo upload on legacy `tb_forwarder_driver_item` (Agent D's work) |
| Server actions (admin) | `actions/admin/forwarder-drivers.ts` | 🔴 Operates on REBUILT `forwarder_driver` UUID table · NOT useful for legacy workflow |
| Driver dashboard widget | (none) | 🟠 No equivalent of legacy `home/driver.php` 4-card KPI overview for drivers |
| Cron auto-expiry (17h timeout) | `app/api/cron/expire-driver-assignments/route.ts` | 🟠 Targets REBUILT table · would need to retarget `tb_forwarder_driver` |

---

## Element-by-element gap table

| # | Legacy feature | Pacred state | Priority | Effort |
|---|---|---|---|---|
| 1 | List view of batches (`tb_forwarder_driver`) at `/admin/drivers` | 🔴 page reads REBUILT `forwarder_driver` (empty) | **P0** | M (90min) |
| 2 | Batch detail page (`forwarder-driver/detail/{fdID}`) at `/admin/drivers/[id]` | 🔴 missing entirely | **P0** | L (180min) |
| 3 | "มอบงานให้คนขับรถ" — group forwarders by address, select N, pick driver, create batch | 🔴 missing entirely | **P0** | L (240min) |
| 4 | Per-batch countdown timer (endTime - now) | 🔴 missing | **P0** | S (15min, part of #2) |
| 5 | Status badges: 1=กำลังดำเนินการ · 2=สำเร็จ · 3=ไม่สำเร็จ on batch | 🟠 rebuilt mapping wrong | **P0** | S (10min, part of #1) |
| 6 | Photo upload column lives on `tb_forwarder.fPhotoEnd` (not just item table) + flips `fStatus=7` | 🟠 driver-work writes only to fdipictureon/off, doesn't touch fStatus | P1 | M (60min) |
| 7 | "ยกเลิกรายการ" per-item from batch detail (deleteForwarder.php) | 🔴 missing | P1 | S (30min) |
| 8 | Auto-expiry cron at top-of-page (every load) for batches with endTime past | 🟠 cron exists for rebuilt table | P1 | M (45min) |
| 9 | Google Maps waypoint-chain "นำทาง" link (concatenates every stop's address) | 🔴 missing | P1 | S (20min, part of #2) |
| 10 | "ปักหมุดด้วย / แก้ไขหมุด" Google Maps lat/lng pinner modal (saveLo.php) | 🔴 missing | P1 | L (120min) — needs Google Maps API key |
| 11 | Truck-size recommender (call.php) — given N forwarder ids return "รถกระบะ / 6 ล้อเล็ก / 6 ล้อใหญ่" by sum of weight+volume | 🔴 missing | P1 | S (30min) |
| 12 | `endTime` selectable: 17/24/30 hr from create-batch modal | 🟠 schema has endtime column · UI doesn't expose | **P0** | S (10min, part of #3) |
| 13 | LINE notify to assigned driver + ops at batch creation | 🟠 not wired (action doesn't call sendLine2-equivalent) | P1 | M (45min) |
| 14 | LINE notify on per-stop delivery completion | 🟠 not wired | P1 | M (45min) |
| 15 | Driver dashboard widget — 4 KPI cards (history count / pending count / commission฿ / failed count) on `/admin` | 🔴 missing | P2 | M (60min) |
| 16 | "พิมพ์ใบค้นหาสินค้า" link from list + detail (printDriver.php) | 🔴 missing | P2 | L (90min) — separate print route |
| 17 | "พิมพ์และบันทึกบิลรวม" link from create-batch modal (printBill.php) | 🔴 missing | P2 | L (90min) |
| 18 | "รายการรับเองหน้าโกดัง" alt-tab — warehouse self-pickup (different fShipBy filter) | 🔴 missing | P2 | M (90min) |
| 19 | Department-gated action visibility (CEO/Manager/QA/Accounting/ITDT/Warehouse see "ตัวเลือก" column · Driver doesn't) | 🟠 partial (RBAC via `requireAdmin([...])` but no fine column gating) | P2 | S (20min) |
| 20 | "ดูบิลใบเสร็จในรายการนี้" — bulk receipt viewer button per batch | 🔴 missing | P2 | M (60min) |
| 21 | Auto-create `tb_user_sales` row for VIP-corporate addresses on photo-upload (THADA.VIP→PCS888 etc) | 🔴 missing — legacy hardcodes 4 corp IDs | P3 | S (30min) — defer, low value |
| 22 | "บังคับ สำเร็จ" / "บังคับ ไม่สำเร็จ" admin override buttons | 🟠 partial (Agent D's `markDriverItemFailed` works · NO bulk batch-level override) | P2 | S (20min) |
| 23 | Driver self-history page filtering to own `fdAdminID` | 🟠 `/admin/drivers/work` self-filters by member_code · history view (status=2,3) covered | covered | — |

**Totals:** 23 gap items · 5 P0 (550 min) · 9 P1 (530 min) · 7 P2 (430 min) · 2 covered/N/A.

---

## P0 surgical scope — what Agent J ships THIS round

The 5 P0 items are mutually dependent (you can't list batches without rewriting the list page · you can't drill into a batch detail without a detail page · you can't create a batch without the create page) so they ship together. The 4 P1+ items below them defer to a follow-up wave.

### P0 #1 — Rewrite `/admin/drivers` list page (legacy `tb_forwarder_driver`)
- Read `tb_forwarder_driver` (batches), not the REBUILT `forwarder_driver` UUID table
- Each row = one batch (`fdname` · `fddate` · `fdadminid` driver · `fdstatus` 1/2/3 · `fdamount` stop count + item count + box sum)
- Filter chips: ทั้งหมด · กำลังดำเนินการ · สำเร็จ · ไม่สำเร็จ
- Date-range filter (default 90 days · "ค้นหาทั้งหมด" override)
- "สร้างรายการขนส่ง" CTA → `/admin/drivers/new`
- Each row click → `/admin/drivers/[id]` (detail)
- Pacred Tailwind design — NOT Bootstrap 4 verbatim
- All Supabase queries destructure `error` per AGENTS.md §0c

### P0 #2 — New `/admin/drivers/[id]` batch detail page
- Show `fdname` · `fddate` · `fdadminid` driver (join `tb_users`) · `fdamount` · endtime countdown · status
- List all items in the batch (join `tb_forwarder_driver_item` + `tb_forwarder`) grouped by recipient address
- Per-row status badge (`fdistatus` '' / '1' / '2' / '3' — using existing driver-work mapping)
- Per-row "ดูออเดอร์" → `/admin/forwarders/[fNo]`
- Google Maps waypoint-chain "นำทาง" link
- Show photos if `fdipictureon`/`fdipictureoff` present (signed URLs)

### P0 #3 — New `/admin/drivers/new` batch creation page
- Read `tb_forwarder` WHERE `fstatus='6'` (เตรียมส่ง) AND `paydeposit IS NULL/<>'1'` AND id NOT IN already-assigned items (sub-select against `tb_forwarder_driver_item`)
- GROUP BY (fshipby, recipient address tuple) — one row per (carrier · address) combo
- Inside each row: sub-table of every tracking# at that combo
- Multi-select checkboxes
- Below table: <select> driver (admins role=driver) + <select> endTime (17/24/30hr) + [สร้างรายการ] submit
- Server action `createDriverBatch` inserts `tb_forwarder_driver` + N×`tb_forwarder_driver_item` rows

### P0 #4 — Countdown timer on batch detail (part of #2)
- Compute `endtime - now` server-side · render `Hh Mm Ss` · show "หมดเวลา" once negative
- Status badge auto-flips visually when expired (driver sees red border)

### P0 #5 — Correct status mapping (part of #1)
- Use legacy `fdstatus` enum: '1'=กำลังดำเนินการ · '2'=สำเร็จ · '3'=ไม่สำเร็จ
- NOT the rebuilt 1=มอบหมาย / 2=รับงาน / 3=หมดเวลา / 4=เสร็จ scheme

---

## What's deferred to P1+ (with rationale)

- **#6 Photo cascade to `fStatus=7`** — driver-work.ts only writes to item table today. Legacy ALSO flips `tb_forwarder.fStatus=7` (ส่งแล้ว) + `fDateStatus7=NOW()`. This is a real workflow bug but it's safe-to-defer — admins can manually mark fStatus=7 from `/admin/forwarders/[fNo]`. Wave-2 fix.
- **#7 ยกเลิกรายการ per-item** — useful but rare · 30min S
- **#8 Cron auto-expiry** — currently no expired batches accumulate (system is new) · ภูม decision needed: re-target existing cron or write new
- **#10 Google Maps lat/lng pinner** — needs `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` env · ภูม owner-decide if Pacred uses Google Maps or alternative
- **#11 Truck-size recommender** — nice-to-have · drivers learn truck-fit by gut · defer
- **#13/14 LINE notify** — needs the legacy `sendLine2` ported (token-based push) · ภูม decision on tokens
- **#15 Driver dashboard widget** — needs sidebar / dashboard expansion · defer
- **#16/17 Print routes** — needs mPDF→Next print equivalent · Wave-29 has receipt print, can reuse pattern · defer

---

## ภูม decisions needed for deferred items

1. **Google Maps API key** — provision `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for the lat/lng pinner (#10)? Or skip and rely on `https://www.google.com/maps/search/{address}` plain links?
2. **LINE Notify migration** — legacy uses hardcoded tokens (`lpWZ...`); ADR-0001 said push migrated to LINE Messaging API. Which path for driver batch notifications (#13/#14) — Messaging API push or hold for Phase C?
3. **Cron retarget** — `app/api/cron/expire-driver-assignments/route.ts` still hits REBUILT table. Retarget to `tb_forwarder_driver` (legacy 17/24/30 hr expiry) or retire and use the auto-expiry-at-page-load model legacy uses?
4. **Receipt brand on print** — same as Wave 29 receipt issue: PCS Cargo or Pacred branding on the print routes (#16/#17)?

---

**End of audit.** P0 (5 items) ships in this commit. P1+P2 deferred to follow-up waves with ภูม decisions above.
