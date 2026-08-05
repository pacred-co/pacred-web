-- ════════════════════════════════════════════════════════════
-- 0290 · HR unify — profiles = แกนพนักงาน (SPINE) · ย้าย org_unit_id มาที่นี่
-- ════════════════════════════════════════════════════════════
-- owner 2026-08-03 (จอ /admin/admins): "DB นายเข้าไม่ถึงทั้งหมดหรอ · ดึงจาก
--   ที่เดียวกันได้จริงหรอ" — ถูก. เฟส 2 ผูก org_unit_id ไว้บน tb_admin ที่ขาด
--   3 คน (moo/sunta/tiger มีใน profiles ไม่มี tb_admin) → หน้า staff เลยพวกนี้.
--
-- 🔴 profiles = SPINE (แกนพนักงาน) เพราะ:
--   • เป็น login source (admin_login_id → auth.users) + role source (admins)
--   • ครบกว่า (staff active 21 vs tb_admin 20 · มี moo/sunta/tiger)
--   • ถือ AD### (member_code) + ตัวตน (sex/birthday)
--   tb_admin = ดาวเทียม HR detail (salary/address/education/44 field) · join
--   `tb_admin.adminID == profiles.admin_login_id`.
--
-- ⇒ ย้าย org_unit_id (ตำแหน่งในผัง) มาที่ profiles → roster/ผัง/จัดคน/นับสด
--   ดึงจาก profiles ที่เดียว. tb_admin.org_unit_id (mig 0288) เลิกอ่าน (คงคอลัมน์
--   ไว้กัน rollback · ไม่ drop). migrate ค่าที่จัดไว้แล้ว (pop/nat/ben/keetar/win)
--   จาก tb_admin → profiles ด้วย join.
--
-- Additive · idempotent · apply prod (dev unreachable → คิว reconcile).
-- ════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists org_unit_id uuid references public.hr_org_units(id) on delete set null;

create index if not exists profiles_org_unit_idx on public.profiles (org_unit_id) where org_unit_id is not null;

-- migrate: ค่าที่จัดไว้บน tb_admin (เฟส 2) → profiles (join adminID = admin_login_id)
update public.profiles p
set org_unit_id = a.org_unit_id
from public.tb_admin a
where a."adminID" = p.admin_login_id
  and a.org_unit_id is not null
  and p.org_unit_id is null;

comment on column public.profiles.org_unit_id is
  'ตำแหน่งในผังองค์กร (hr_org_units position · owner 2026-08-03) — profiles = SPINE ของพนักงาน (login+role+identity+ครบกว่า tb_admin). ผัง/ทะเบียน/นับคน ดึงจากที่นี่ · tb_admin = ดาวเทียม HR detail (join adminID=admin_login_id · เลิกอ่าน tb_admin.org_unit_id).';
