-- ════════════════════════════════════════════════════════════
-- 0289 · HR ค่าตำแหน่ง — เตรียม DB สำหรับเงินเดือน/คอม/โบนัส (owner 2026-08-03)
-- ════════════════════════════════════════════════════════════
-- owner: "คนที่ขึ้นหัวหน้าเชื่อมกับ DB ยังว่าฝ่ายไหน แผนกอะไร เพราะต้องเอาไป
--   ออกเงินเดือน/ค่าคอม/โบนัสในอนาคต · มีค่าตำแหน่งอีกนะครับ · ผูก DB ดีๆ ·
--   เอาให้อยู่ที่เดียว ใช้ทีเดียว ดึงจากที่เดียวกัน"
--
-- 🔴 SINGLE-SOURCE ที่ยืนยันแล้ว (จ่ายเงินในอนาคตดึงจากที่เดียว):
--   พนักงาน 1 คน = tb_admin.org_unit_id → hr_org_units(position)
--     → เงินเดือน/ประเภทจ้าง = tb_admin (salary, salaryType, adminType)
--     → ตำแหน่ง + ค่าตำแหน่ง = hr_org_units(position).position_allowance  ← คอลัมน์นี้
--     → แผนก/ฝ่าย = parent ของ position (hr_org_units.parent_id) → ไม่ต้องเก็บซ้ำ
--   ⇒ ฝ่าย/แผนก ของทุกคน (รวมหัวหน้า) derive จาก link เดียว ไม่มีเก็บซ้ำที่ไหน.
--   (ค่าคอมเซล = tb_user_sales เดิม · แยกเลนตามธรรมชาติของงาน · โบนัส = เฟสถัดไป)
--
-- position_allowance = ค่าตำแหน่ง/เดือน (บาท) ต่อ "ตำแหน่ง" (ไม่ใช่ต่อคน) —
-- หัวหน้า/Supervisor มักมีค่าตำแหน่ง. null = ไม่มี. เฟสถัดไปหน้า HR แก้ค่าได้.
-- Additive · idempotent · apply prod (dev unreachable → คิว reconcile).
-- ════════════════════════════════════════════════════════════

alter table public.hr_org_units
  add column if not exists position_allowance numeric(12,2);

comment on column public.hr_org_units.position_allowance is
  'ค่าตำแหน่ง/เดือน (บาท) ต่อตำแหน่ง (owner 2026-08-03) — สำหรับคิดเงินเดือน/โบนัสอนาคต. null = ไม่มี. เงินเดือน/ประเภทจ้าง อยู่ tb_admin · แผนก derive จาก parent_id · ทั้งหมดดึงจาก tb_admin.org_unit_id link เดียว.';
