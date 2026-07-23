-- ════════════════════════════════════════════════════════════
-- 0277 · momo_invoice_settlement — สรุปยอดของใบ (กล่อง · คิว · กิโล · ขาย) แช่ไว้ตอนตัดจ่าย
-- ════════════════════════════════════════════════════════════
-- Owner (2026-07-23): *"มีเพิ่มคอลลัม กำไร จำนวนแทรคกิ้ง จำนวนกล่อง จำนวนคิว จำนวนกิโล
--   ผลรวมสรุปของใบๆนั้นหนะครับ"* — ประวัติต้องอ่านออกทันทีว่าใบนั้น "ทั้งใบ" มีเท่าไร
--   ไม่ใช่แค่ยอดเงิน.
--
-- 🔑 ทำไม "แช่ไว้" (snapshot) ไม่ใช่คิดสดตอนเปิดดู:
--   ประวัติการตัดจ่าย = เอกสาร. ถ้าคิดสดจาก tb_forwarder ทุกครั้งที่เปิด ตัวเลขในประวัติจะ
--   "เปลี่ยนย้อนหลัง" เมื่อมีคนแก้ราคาขาย/น้ำหนักทีหลัง — เอกสารที่เลขขยับเองเชื่อไม่ได้
--   และตรวจย้อนกลับไม่ได้ว่าตอนกดจ่ายเห็นอะไร. แนวเดียวกับใบเสร็จที่ PIN ยอด frozen ไว้
--   (G1 2026-07-08 "ยึดยอดบิลที่จ่าย · reconcile-not-recompute").
--   prod ยังมี 0 แถว → ไม่มีของเก่าต้อง backfill.
--
-- ที่มาของแต่ละค่า (ตอน createMomoInvoiceSettlement · เฉพาะบรรทัดที่ตัดจ่ายจริง):
--   box_count  = Σ จำนวนกล่องบนใบ MOMO       ┐ ฝั่ง "ใบ" — คู่กับ total_thb ที่เป็นยอดใบ
--   cbm_total  = Σ คิวบนใบ (ปรับฐาน per_box แล้ว) │ จึงเทียบกันได้ตรงชุด
--   weight_kg  = Σ กิโลบนใบ                    ┘
--   sell_thb   = Σ ftotalprice ของแถวเรา (ค่านำเข้าที่ขายลูกค้า)
--   กำไร       = sell_thb − total_thb → **ไม่เก็บ** (derive ตอนอ่าน) เพื่อให้มีที่มาที่เดียว
--                ป้องกันเลข 2 ตัวขัดกันเองแบบที่เคยเจอ
--
-- Money-safety: สรุป/แสดงผลล้วน — ไม่มี consumer ไหนเอาไปคิดเงินหรือเปลี่ยนสถานะ ·
-- ไม่แตะ total_thb (ยอดที่จ่ายจริง) ที่มีอยู่แล้ว.
--
-- Additive + idempotent. Safe to re-run. Next free = 0278.
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.momo_invoice_settlement
  ADD COLUMN IF NOT EXISTS box_count int            NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cbm_total numeric(14,6)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weight_kg numeric(14,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sell_thb  numeric(14,2)  NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.momo_invoice_settlement.box_count IS 'Σ จำนวนกล่องบนใบ MOMO ของบรรทัดที่ตัดจ่าย (snapshot ตอนตัดจ่าย). owner 2026-07-23.';
COMMENT ON COLUMN public.momo_invoice_settlement.cbm_total IS 'Σ คิวบนใบ MOMO (ปรับฐาน per_box แล้ว) ของบรรทัดที่ตัดจ่าย (snapshot).';
COMMENT ON COLUMN public.momo_invoice_settlement.weight_kg IS 'Σ น้ำหนัก (กก.) บนใบ MOMO ของบรรทัดที่ตัดจ่าย (snapshot).';
COMMENT ON COLUMN public.momo_invoice_settlement.sell_thb IS 'Σ ftotalprice (ค่านำเข้าที่ขายลูกค้า) ของแถวที่ตัดจ่าย ณ เวลานั้น (snapshot). กำไร = sell_thb − total_thb คิดตอนอ่าน ไม่เก็บซ้ำ.';
