-- ════════════════════════════════════════════════════════════
-- 0288 · เฟส 2 — ผูกพนักงาน (tb_admin) เข้าตำแหน่งในผัง (hr_org_units)
-- ════════════════════════════════════════════════════════════
-- owner 2026-08-03: "จัด row ย้ายคนเข้า row · ข้อมูลพนักงานถูกดึงไปใช้ครบทุกตำแหน่ง"
--
-- tb_admin = ทะเบียนพนักงานจริง (32 active · โครง PCS 44 คอลัมน์ครบอยู่แล้ว) = SOT
-- ของ "ตัวคน". เพิ่ม link เดียว `org_unit_id` → ตำแหน่งในผัง (hr_org_units kind=position)
-- ⇒ ผังนับคนสดจาก tb_admin ได้ · ไม่ต้องสร้างตารางพนักงานใหม่ (ห้ามงานหาย/ซ้ำซ้อน).
--
-- ⚠️ ข้อมูล legacy department/section ของ tb_admin แมปกับผังใหม่ไม่ได้ (26/32 คน
-- ถูกกองใน bucket c1/d0/s0 "CEO" = ไม่เคยจัดตำแหน่งจริง) → org_unit_id เริ่มเป็น null
-- ทุกคน แล้ว owner จัดเข้าตำแหน่งเองผ่านหน้า /admin/hr/staff (จัดคนเข้าตำแหน่ง).
--
-- on delete set null = ลบตำแหน่งในผัง ไม่ทำให้ row พนักงานหาย (แค่หลุดตำแหน่ง).
-- Additive · idempotent · apply prod (dev unreachable → คิว reconcile).
-- ════════════════════════════════════════════════════════════

alter table public.tb_admin
  add column if not exists org_unit_id uuid references public.hr_org_units(id) on delete set null;

create index if not exists tb_admin_org_unit_idx on public.tb_admin (org_unit_id) where org_unit_id is not null;

comment on column public.tb_admin.org_unit_id is
  'ตำแหน่งในผังองค์กร (hr_org_units kind=position · mig 0287/0288) — owner จัดผ่าน /admin/hr/staff · ผังนับคนสดจากคอลัมน์นี้ (bucket ตาม adminType: 1,2=พนักงาน · 3,4=ฝึกงาน · 5=partner)';
