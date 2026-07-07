# Import-flow (ฝากนำเข้า) — PCS look-fidelity punch-list (2026-07-07 · เดฟ resume)

> Owner: "flow นำเข้าให้จบ · หน้าตา+logic เหมือน pcs อันดับแรก · ทุกปุ่ม/ทางเข้า/คอลัมน์/
> หัวตาราง/แถว." Compared **the live PCS PHP** (`https://localhost/pcscargo/member/pcs-admin/`,
> admin_tam) screen-by-screen against Pacred code. This records what's VERIFIED-faithful vs
> the concrete gaps to close next (with counts/labels captured from the running PCS).

## ✅ Verified faithful (column/header/label level — checked vs running PCS)
- **รายการฝากนำเข้า** (`/admin/forwarders` vs `forwarder.php`): source tabs (ทั้งหมด/ลูกค้า/
  ระบบ/แอดมิน) · status tabs (รอเข้าโกดังจีน→ส่งแล้ว + 6.1 กำลังจัดส่ง + สถานะพิเศษ) ·
  date-range filter (30-day default + ค้นหาข้อมูลทั้งหมด + กลับ 30 วัน) · bulk bar
  (พิมพ์จากหน้ากล่อง · ย้ายกลับสถานะปกติ) · + เพิ่มรายการให้ลูกค้า · columns all present. ✓
- **คนขับ** (`/admin/drivers` vs `forwarder-driver.php` list mode): columns วันที่สร้าง ·
  ชื่อรายการ · ผู้รับผิดชอบ · ผู้สร้างรายการ · สถานะ · ตัวเลือก ✓ (Pacred adds ID + ส่งแล้ว).
- **รายงานตู้** (`/admin/report-cnt` vs `report-cnt.php`): 14 columns match — หมายเลขตู้ ·
  โกดัง · วันที่ปิดตู้ · ขนส่ง · รอเข้าโกดัง · วันที่รอเข้าโกดัง · จำนวนแทรคกิ้ง · ปริมาตร ·
  น้ำหนัก · ต้นทุนตู้ · ราคาขาย · กำไร · สถานะตู้ · สถานะจ่ายค่าตู้ + orange totals row ✓
  (Pacred adds ETD/ETA/T-T from แต้ม).
- **การเลือกบริษัทขนส่ง** (`domestic-shipping.ts` + admin dropdown): Flash="2", J&T="24",
  เหมาๆ=PRF, รับเอง — match legacy `nameShipBy`; admin dropdown = full 47 carriers. ✓
  Zone logic (in-zone เหมาๆ ต้นทาง · ต่างจังหวัด Flash+J&T+ไปรษณีย์ COD) faithful.

## 🔴 CONCRETE GAP #1 — report-cnt QA/exception tabs (0 of 11 present)
PCS `report-cnt.php` header shows 11 filter/entry tabs (counts from live prod-ish dev DB):
`ประวัติเข้าโกดังไทย · รายงานตู้(20) · หมายเหตุสั่งซื้อ(108) · หมายเหตุนำเข้า(204) ·
ไม่ได้ถ่ายสินค้า(672) · ไม่ใส่ค่าขนส่ง(11) · ไม่ใส่เบอร์ตู้(12) · ไม่ใส่วันที่ปิดตู้(9) ·
ไม่เลือกขนส่งฟรี(1796) · เลือกขนส่งผิด(2526) · เครดิตเกินกำหนด(125)`.
Pacred `/admin/report-cnt` has **none** of these exception queues. They are the staff's
"หาตู้ที่ข้อมูลขาด" entry points → a real faithful-port + reachability (§0d) gap. Each is a
filtered view over `tb_forwarder`/`tb_cnt` (e.g. ไม่ใส่เบอร์ตู้ = fcabinetnumber='' ·
ไม่ใส่วันที่ปิดตู้ = fdatecontainerclose='' · เลือกขนส่งผิด = ship-by ≠ container transport).
**Est: ~half-day** (11 queries + a tab strip). NOT a 15-min job → do with fresh context.

## 🟡 Flags (owner to decide — not auto-changed)
- Customer picker label still reads **"รับเองที่โกดัง (PCS)"** (`domestic-shipping.ts:71`).
  Legacy = "รับเองโกดัง PCS". Keep "PCS" (match legacy) or rebrand → Pacred? (customer-facing).
- Pacred **extra columns** (report-cnt ETD/ETA · drivers ID/ส่งแล้ว) = enhancements NOT in
  PCS. Owner directive "เหมือน pcs อันดับแรก" → hide for pure-match, or keep (useful)?

## ⛔ Blocker for pixel-level look-matching
Can't render **Pacred /admin** side-by-side with PCS — no test admin login on the Pacred dev
server (verified faithfulness via code+PCS, not rendered Pacred). To do the real pixel sweep
(spacing/pills/fonts), need a dev admin session (set an admin pw on the dev Supabase + log in).

## Next (owner pick)
1. Build the 11 report-cnt exception tabs (the clearest concrete gap · ~half-day).
2. Set up Pacred dev admin render → true side-by-side pixel look-matching sweep.
3. Decide the 2 flags above.
