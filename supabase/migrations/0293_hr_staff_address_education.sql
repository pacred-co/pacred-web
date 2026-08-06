-- ════════════════════════════════════════════════════════════
-- 0293 · HR พนักงาน — ที่อยู่ + การศึกษา (child records · owner 4a)
-- ════════════════════════════════════════════════════════════
-- faithful PCS HR: ฟอร์มพนักงานเก่ามีบล็อก "ที่อยู่" + "การศึกษา" แบบ
-- หลาย row ต่อคน. เก็บเป็นตารางลูก keyed ด้วย admin_login_id
-- (= tb_admin.adminID = profiles.admin_login_id · แกนเดียวกับ mig 0292).
--
-- Additive · idempotent · isolated (ไม่มี FK ผูกเงิน/ตัวตน · §0e) ·
-- RLS อ่านได้ authenticated · เขียนผ่าน service-role (createAdminClient) เท่านั้น
-- — mirror pattern mig 0287 (hr_org_units). NOT applied ที่นี่ (lead apply เอง).
-- ════════════════════════════════════════════════════════════

-- ── ที่อยู่พนักงาน ──────────────────────────────────────────
create table if not exists public.hr_staff_address (
  id             uuid primary key default gen_random_uuid(),
  admin_login_id text not null,            -- = tb_admin.adminID / profiles.admin_login_id
  label          text,                      -- ป้ายกำกับ (บ้าน · ที่ทำงาน · ตามทะเบียนบ้าน …)
  address        text,                      -- บ้านเลขที่ / หมู่ / ซอย / ถนน
  subdistrict    text,                      -- ตำบล/แขวง
  district       text,                      -- อำเภอ/เขต
  province       text,                      -- จังหวัด
  zipcode        text,                      -- รหัสไปรษณีย์
  created_at     timestamptz not null default now()
);
create index if not exists hr_staff_address_login_idx on public.hr_staff_address (admin_login_id);

alter table public.hr_staff_address enable row level security;
drop policy if exists hr_staff_address_read on public.hr_staff_address;
create policy hr_staff_address_read on public.hr_staff_address for select to authenticated using (true);
-- ไม่มี write policy = แก้ผ่านแอดมิน API (service-role) เท่านั้น

comment on table public.hr_staff_address is 'ที่อยู่พนักงาน (owner 4a · faithful PCS HR) — หลาย row ต่อคน · keyed admin_login_id';

-- ── การศึกษาพนักงาน ─────────────────────────────────────────
create table if not exists public.hr_staff_education (
  id              uuid primary key default gen_random_uuid(),
  admin_login_id  text not null,           -- = tb_admin.adminID / profiles.admin_login_id
  level           text,                     -- ประถม/มัธยม/ปวช/ปวส/ปริญญาตรี/โท/เอก
  institution     text,                     -- สถาบัน
  major           text,                     -- สาขา/วิชาเอก
  graduation_year text,                     -- ปีที่จบ (พ.ศ. หรือ ค.ศ. · เก็บเป็น text)
  created_at      timestamptz not null default now()
);
create index if not exists hr_staff_education_login_idx on public.hr_staff_education (admin_login_id);

alter table public.hr_staff_education enable row level security;
drop policy if exists hr_staff_education_read on public.hr_staff_education;
create policy hr_staff_education_read on public.hr_staff_education for select to authenticated using (true);
-- ไม่มี write policy = แก้ผ่านแอดมิน API (service-role) เท่านั้น

comment on table public.hr_staff_education is 'การศึกษาพนักงาน (owner 4a · faithful PCS HR) — หลาย row ต่อคน · keyed admin_login_id';
