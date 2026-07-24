-- 0278_customer_esign_stamp.sql
-- owner 2026-07-24: "ทำช่องแนบลายเซ็น และตรายาง อิเล็คทรอนิกส์ ให้ใน profile ลูกค้า
-- เก็บเป็น data ให้ลูกค้า ตอนออกเอกสารได้เลย"
--
-- ลายเซ็นผู้มีอำนาจ + ตรายางบริษัท (ไฟล์รูปใน bucket `member-docs` · private ·
-- อ่านผ่าน signed URL เท่านั้น). ผู้บริโภคตัวแรก = ฟอร์ม 50 ทวิ (/r/[token]/wht-form)
-- render ลงช่อง "ลงชื่อผู้จ่ายเงิน" + "ประทับตรานิติบุคคล" ให้เลย — ลูกค้าไม่ต้อง
-- พิมพ์แล้วเซ็นมือถ้าตั้งค่าไว้.
--
-- additive บน tb_users (แนวเดียวกับ 0217 adminIDInterpreter ฯลฯ) · ไม่มี backfill
-- (ค่าเริ่มต้น = ยังไม่ตั้ง) · ไม่แตะเงิน/สถานะใดๆ.

alter table tb_users
  add column if not exists signature_path text,
  add column if not exists stamp_path     text;

comment on column tb_users.signature_path is
  'ลายเซ็นอิเล็กทรอนิกส์ (path ใน bucket member-docs) — ใช้แปะบนเอกสาร เช่น ฟอร์ม 50 ทวิ';
comment on column tb_users.stamp_path is
  'ตรายางบริษัทอิเล็กทรอนิกส์ (path ใน bucket member-docs) — ใช้แปะบนเอกสารนามนิติ';
