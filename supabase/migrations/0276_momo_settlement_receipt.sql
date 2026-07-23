-- ════════════════════════════════════════════════════════════
-- 0276 · momo_invoice_settlement.receipt_paths — แนบใบเสร็จ MOMO (REC) แยกจากสลิป
-- ════════════════════════════════════════════════════════════
-- Owner (2026-07-23): *"เปิด tag ประวัติ … เอาไว้ใส่ แนบใบเสร็จ และ สลิป ได้ทีหลังได้ด้วยครับ"*
-- + แนบตัวอย่าง REC-20260718-0002 (ใบเสร็จ/ใบกำกับภาษี ที่ MOMO ออกกลับมาหลังเราจ่าย ·
--   อ้างอิง INV เดิม · มี VAT 7% + WHT 1% + Grand Total).
--
-- ต่อ 1 การตัดจ่าย (MCS) มีหลักฐาน 2 ชนิดที่ต่างกัน:
--   • สลิปการโอน (bank slip)      → slip_paths (0273/0275) — หลักฐานว่าเรา "จ่ายเงินไปแล้ว"
--   • ใบเสร็จ MOMO (REC-…)         → receipt_paths (นี่) — เอกสารภาษีที่ MOMO ออก "รับเงินแล้ว"
-- แยกคอลัมน์กันเพื่อไม่ให้ปนกัน (บัญชีต้องดูออกว่าอันไหนสลิป อันไหนใบเสร็จภาษี) และเพราะ
-- reader เดิมของ slip_paths (นับ slipCount · โชว์ในกรอบสลิป) ไม่ควรนับใบเสร็จปนเข้าไป.
--
-- Money-safety: หลักฐาน/แสดงผล ล้วน — ไม่ใช่ยอดเงิน ไม่ใช่สถานะ · ไม่มี consumer ไหนคิดเงิน
-- จากคอลัมน์นี้. append-only array ของ storage path (บัคเก็ต slips เดียวกับ slip_paths).
--
-- Additive + idempotent. Safe to re-run. Next free = 0277.
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.momo_invoice_settlement
  ADD COLUMN IF NOT EXISTS receipt_paths jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.momo_invoice_settlement.receipt_paths IS
  'array ของ path ใบเสร็จ/ใบกำกับภาษี MOMO (REC-…) ที่ MOMO ออกกลับมาหลังจ่าย · แยกจาก slip_paths (สลิปการโอน). owner 2026-07-23. หลักฐานล้วน ไม่ใช่ยอดเงิน.';
