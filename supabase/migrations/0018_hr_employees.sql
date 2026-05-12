-- ════════════════════════════════════════════════════════════
-- Phase H · HR — Employee directory extras
-- ════════════════════════════════════════════════════════════
-- Adds the columns admin_contact_extras was missing for the
-- /admin/hr/employees data-table view:
--   • nickname       — ชื่อเล่น (เซลล์ มิว, ปอน, ฯลฯ)
--   • company        — Pacred Cargo / Pacred Freight (multi-brand future-proof)
--   • employee_type  — พนักงานประจำ / ทดลองงาน / รายเดือน / รายวัน
--   • work_email     — อีเมลบริษัท (แยกจาก profiles.email = อีเมลส่วนตัว)
--   • work_phone     — เบอร์บริษัท (แยกจาก profiles.phone = เบอร์ส่วนตัว)
--   • suspended_at   — null = ยังทำงานอยู่, otherwise ลาออก/พักงาน
--   • hired_at       — วันเริ่มทำงานจริง (admins.granted_at = วันให้สิทธิ์ในระบบ)
-- ════════════════════════════════════════════════════════════

alter table public.admin_contact_extras
  add column if not exists nickname       text,
  add column if not exists company        text check (company in ('pacred','pacred-cargo','pacred-freight')) default 'pacred',
  add column if not exists employee_type  text check (employee_type in ('full_time','probation','contract','daily','intern','partner')) default 'full_time',
  add column if not exists work_email     text,
  add column if not exists work_phone     text,
  add column if not exists hired_at       date,
  add column if not exists suspended_at   timestamptz;

create index if not exists admin_contact_extras_active_idx
  on public.admin_contact_extras(suspended_at)
  where suspended_at is null;
