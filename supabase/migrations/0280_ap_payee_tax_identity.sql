-- 0280_ap_payee_tax_identity.sql
-- owner 2026-07-24: ฟอร์ม 50 ทวิ ฝั่ง Pacred เป็นผู้หัก (จ่าย supplier/AP).
-- ฟอร์มจริงต้องมี เลขภาษี + ที่อยู่ ของผู้ถูกหัก (vendor) — ap_disbursement มีแค่
-- payee_name → เพิ่ม 2 คอลัมน์ additive. ตาราง 0 แถว (AP write-side รอ go-live)
-- = ไม่มี backfill · ไม่แตะเงิน.
alter table ap_disbursement
  add column if not exists payee_tax_id  text,
  add column if not exists payee_address text;
