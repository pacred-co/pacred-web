# MOMO Cargo model reference (owner screenshots, 2026-06-16)

> Captured from the owner's MOMO Cargo (momocargo.com) screenshots — the target UX to match for "ของถึง→รอจ่าย→เก็บเงิน" + "ราคาทั้งตู้ vs แยกชิปเม้น". The momocargo.com HTML the owner pasted is only the Angular SPA shell (client-rendered, no data) — the SCREENSHOTS are the source of truth here. We are Partner PR041987 (บริษัท แพคเรด) in MOMO's system; MOMO's API feeds OUR system.

## The "ซอยตู้ / แยกชิปเม้น" model (the headline)
- A customer order (e.g. PO.041987-39, 60 boxes, base tracking `60527103087`) is **split into sub-trackings** `60527103087-2`, `-3`, `-4`, `-5` (+ the bare base) when packed into containers ("ซอยตู้").
- **Each sub-tracking carries its OWN status + weight + cbm + price** and advances INDEPENDENTLY. Observed: `60527103087-2` (12 ชิ้น) at "ถึงโกดังจีน" while the base `60527103087` (48 ชิ้น) at "รอชำระค่าขนส่ง" — same order, two different stages at once.
- A search for the base tracking returns BOTH the "เข้าโกดังจีน" sub-row AND the "ชำระเงินค่าขนส่ง" sub-row (sectioned by status).

## Two customer views (the "ราคาทั้งตู้ vs แยกชิปเม้น" toggle)
On the import-order list, tabbed by status (รอเข้าโกดังจีน · ถึงโกดังจีน N · กำลังส่งมาไทย N · **รอชำระค่าขนส่ง N** · กำลังนำส่ง · จัดส่งให้แล้ว), a **`ตู้สินค้า | แทร็กกิ้ง` toggle**:
- **ตู้สินค้า (container)** — one row per container: วัน/เวลาบันทึก · วันที่ส่งออก · ถึงโกดังไทย · **KG รวม · CBM รวม** · การขนส่ง (เรือ SEA) · **จำนวนแทร็กกิ้ง** · จำนวนชิ้น · ตู้สินค้า · drill-in. Drill shows the N sub-trackings inside, each selectable; selecting sums **Total KG / Total CBM / ฿total** at the bottom + a "ถัดไป" pay step. = **ราคาทั้งตู้**.
- **แทร็กกิ้ง (tracking)** — one row per sub-tracking. = **แยกชิปเม้น**.

## Customer order-detail (the pay surface)
- Header: PO no. + สั่งซื้อวันที่ + รายละเอียด (N ชิ้น) + รูปแบบการขนส่ง จีน-ไทย (เรือ 8-14 วัน · note "ชำระค่าขนส่งเมื่อถึงประเทศไทยแล้ว").
- **Timeline with a DATE per completed step**: รอเข้าโกดังจีน → ถึงโกดังจีน → กำลังส่งมาไทย → **รอชำระค่าขนส่ง (active)** → กำลังนำส่ง → จัดส่งให้แล้ว. (Future steps show "รออัปเดต".)
- **สรุปยอดรวมทั้งสิ้น panel**: จำนวนรวม (ชิ้น) · ค่าขนส่งในจีน (¥) · **ค่าขนส่งจีน-ไทย (฿)** · ค่าขนส่งไทย (รอคำนวณ) · ราคารวมสุทธิ (หยวน) · **ราคารวมสุทธิ (บาท)** big-red.
- A **ชำระค่าขนส่ง** button at the รอชำระ stage. Per-tracking expandable card shows ประเภท (A ทั่วไป / อย.) · ขนส่งจีน-ไทย · ภาพสินค้า · ขนาด.

## How this maps to OUR schema
- **ตู้ (container)** = `tb_cnt` / the `fcabinetnumber` group. **ชิปเม้น/sub-tracking** = `tb_forwarder` rows (the `-N` suffix already exists; `momo-bill-header.ts countableGroupMembers` already distinguishes a bare zero-weight bill-header from `-N` box rows). Per-sub-tracking status = each tb_forwarder.fstatus (independent — already supported).
- **Gap vs MOMO:** (1) no customer ตู้/แทร็กกิ้ง dual-view; (2) no per-container grouped total ("ราคาทั้งตู้" = SUM of the cabinet's per-shipment calcForwarderOutstanding); (3) the timeline-with-dates exists (date-driven from the 2026-06-14 juristic-credit fix) but the total-summary panel + container grouping for the customer are not surfaced like MOMO.

## Build mapping
- **P0 (building now, agent ae83e7449567b1027):** make MOMO arrival REACH our status (fstatus→4 admin-review) + fix ฿0 + add shop-order "ถึงโกดังจีน" status. Unblocks collection.
- **P1 (next):** the customer **ตู้/แทร็กกิ้ง dual-view** + per-container grouped total (ราคาทั้งตู้ = Σ calcForwarderOutstanding over the cabinet) + the **สรุปยอดรวมทั้งสิ้น** panel on the order detail — faithfully matching MOMO. Per-sub-tracking independent status display (already per-row fstatus; surface it grouped).
