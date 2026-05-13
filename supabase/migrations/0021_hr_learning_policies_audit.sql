-- ════════════════════════════════════════════════════════════
-- Phase H · HR — Learning + Policies + Employee Audit
-- ════════════════════════════════════════════════════════════
-- 3 related people-ops tables to close out the HR module:
--   1. training_courses + training_enrollments
--        — internal courses ("LINE OA workflow", "Customs basics") +
--          per-employee enrollment + completion tracking.
--   2. policies + policy_acknowledgments
--        — company policy library (HR manual, IT acceptable use, data
--          protection) with optional "must acknowledge" workflow.
--   3. employee_audit_entries
--        — disciplinary actions / praises / warnings / notes recorded
--          against an employee profile. Source of truth for HR
--          performance reviews.
-- ════════════════════════════════════════════════════════════

-- ── training_courses ──
create table if not exists public.training_courses (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  title            text not null,
  category         text not null default 'general'
                     check (category in ('general','operations','compliance','technical','soft_skills','safety')),
  description      text,
  duration_hours   numeric(5,2) not null default 1.0 check (duration_hours > 0),
  instructor       text,                                       -- free text — could be external or "เซลล์ มิว"
  materials_url    text,                                       -- link to slide deck / video / Notion
  is_mandatory     boolean not null default false,             -- if true, every employee should enroll
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists training_courses_updated_at_trigger on public.training_courses;
create trigger training_courses_updated_at_trigger before update on public.training_courses
  for each row execute function public.set_updated_at();

create index if not exists training_courses_active_idx on public.training_courses(is_active, category);

-- ── training_enrollments ──
create table if not exists public.training_enrollments (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.training_courses(id) on delete cascade,
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  status           text not null default 'enrolled'
                     check (status in ('enrolled','in_progress','completed','failed','exempted')),
  enrolled_at      timestamptz not null default now(),
  started_at       timestamptz,
  completed_at     timestamptz,
  score            numeric(5,2),                               -- 0-100 if scored
  certificate_url  text,
  notes            text,
  recorded_by      uuid references public.profiles(id) on delete set null,
  updated_at       timestamptz not null default now(),
  unique (course_id, profile_id)
);

drop trigger if exists training_enrollments_updated_at_trigger on public.training_enrollments;
create trigger training_enrollments_updated_at_trigger before update on public.training_enrollments
  for each row execute function public.set_updated_at();

create index if not exists training_enrollments_course_idx  on public.training_enrollments(course_id, status);
create index if not exists training_enrollments_profile_idx on public.training_enrollments(profile_id, status);

-- ── policies ──
create table if not exists public.policies (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  title            text not null,
  category         text not null default 'general'
                     check (category in ('general','hr','it','finance','operations','compliance','safety','data_privacy')),
  version          text not null default '1.0',
  body             text,                                       -- markdown
  external_url     text,                                       -- if hosted elsewhere (Notion, Confluence)
  requires_ack     boolean not null default false,             -- if true, employees must acknowledge
  is_published     boolean not null default false,
  published_at     timestamptz,
  effective_at     date,
  expires_at       date,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists policies_updated_at_trigger on public.policies;
create trigger policies_updated_at_trigger before update on public.policies
  for each row execute function public.set_updated_at();

create index if not exists policies_published_idx on public.policies(is_published, category);

-- ── policy_acknowledgments ──
create table if not exists public.policy_acknowledgments (
  id              uuid primary key default gen_random_uuid(),
  policy_id       uuid not null references public.policies(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  ip_address      inet,
  user_agent      text,
  unique (policy_id, profile_id)
);

create index if not exists policy_acks_policy_idx  on public.policy_acknowledgments(policy_id);
create index if not exists policy_acks_profile_idx on public.policy_acknowledgments(profile_id);

-- ── employee_audit_entries ──
-- Performance/disciplinary notes — different from admin_audit_log which
-- tracks system mutations. This is "person-centric HR file".
create table if not exists public.employee_audit_entries (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  entry_type      text not null
                    check (entry_type in ('praise','note','warning','disciplinary','training','review','other')),
  severity        text not null default 'info'
                    check (severity in ('info','low','medium','high','critical')),
  title           text not null,
  description     text,
  related_at      date,                                         -- when the event occurred
  attachments_urls text[],                                      -- optional links to docs / photos
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists employee_audit_entries_updated_at_trigger on public.employee_audit_entries;
create trigger employee_audit_entries_updated_at_trigger before update on public.employee_audit_entries
  for each row execute function public.set_updated_at();

create index if not exists employee_audit_entries_profile_idx on public.employee_audit_entries(profile_id, created_at desc);
create index if not exists employee_audit_entries_type_idx    on public.employee_audit_entries(entry_type, severity, created_at desc);

-- ════════════════════════════════════════════════════════════
-- RLS — admin all-access; employees can read own enrollments + ack own
-- policies + see own audit entries (future /me/profile reveals these).
-- ════════════════════════════════════════════════════════════
alter table public.training_courses           enable row level security;
alter table public.training_enrollments       enable row level security;
alter table public.policies                   enable row level security;
alter table public.policy_acknowledgments     enable row level security;
alter table public.employee_audit_entries     enable row level security;

-- training_courses: published-and-active courses visible to all admins (for now we just gate by is_admin)
drop policy if exists "training_courses_admin_all" on public.training_courses;
create policy "training_courses_admin_all" on public.training_courses
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "training_enrollments_admin_all" on public.training_enrollments;
create policy "training_enrollments_admin_all" on public.training_enrollments
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "training_enrollments_self_read" on public.training_enrollments;
create policy "training_enrollments_self_read" on public.training_enrollments
  for select using (profile_id = auth.uid());

drop policy if exists "policies_admin_all" on public.policies;
create policy "policies_admin_all" on public.policies
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "policies_published_read" on public.policies;
create policy "policies_published_read" on public.policies
  for select using (auth.role() = 'authenticated' and is_published = true);

drop policy if exists "policy_acks_admin_all" on public.policy_acknowledgments;
create policy "policy_acks_admin_all" on public.policy_acknowledgments
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "policy_acks_self_all" on public.policy_acknowledgments;
create policy "policy_acks_self_all" on public.policy_acknowledgments
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists "employee_audit_entries_admin_all" on public.employee_audit_entries;
create policy "employee_audit_entries_admin_all" on public.employee_audit_entries
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "employee_audit_entries_self_read" on public.employee_audit_entries;
create policy "employee_audit_entries_self_read" on public.employee_audit_entries
  for select using (profile_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- Seed — sample courses + policies (skip if any rows exist already)
-- ════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from public.training_courses limit 1) then
    insert into public.training_courses (slug, title, category, description, duration_hours, instructor, is_mandatory) values
      ('cs-line-oa',       'การใช้งาน LINE OA สำหรับ CS', 'operations', 'ตอบลูกค้า · จัดการกรุ๊ปสนทนา · escalation workflow', 2.0, 'ทีม CS Lead', true),
      ('customs-basics',   'พื้นฐานพิธีการศุลกากร',       'compliance', 'HS code · ใบขนสินค้า · ภาษี import · ฟอร์มหลัก', 4.0, 'ทีม Operations', false),
      ('data-privacy-101', 'การคุ้มครองข้อมูลส่วนบุคคล (PDPA)', 'compliance', 'หลักการ PDPA · ข้อมูลที่อ่อนไหว · การจัดการคำขอจากเจ้าของข้อมูล', 1.5, 'ทีม Compliance', true);
  end if;

  if not exists (select 1 from public.policies limit 1) then
    insert into public.policies (slug, title, category, version, body, requires_ack, is_published, published_at, effective_at) values
      ('hr-manual-2026',     'ระเบียบพนักงาน Pacred 2026',    'hr',          '1.0',
       'ระเบียบการลา · เครื่องแบบ · เวลาทำงาน · การประเมินผล · ค่าตอบแทน · บทลงโทษ', true, true, now(), current_date),
      ('it-acceptable-use',  'การใช้งานอุปกรณ์และระบบ IT',     'it',          '1.0',
       'ห้ามใช้อุปกรณ์บริษัทเพื่อจุดประสงค์ส่วนตัวที่ผิดกฎหมาย · นโยบายรหัสผ่าน · BYOD · backup', true, true, now(), current_date),
      ('data-privacy-policy','นโยบายคุ้มครองข้อมูลส่วนบุคคล',  'data_privacy','1.0',
       'การเก็บ ใช้ และเปิดเผยข้อมูลส่วนบุคคลของลูกค้า · สิทธิของเจ้าของข้อมูล · กระบวนการ data breach', true, true, now(), current_date),
      ('safety-warehouse',   'ความปลอดภัยในโกดัง',            'safety',      '1.0',
       'การยกของหนัก · การใช้รถยก · ทางหนีไฟ · เหตุฉุกเฉิน', false, true, now(), current_date);
  end if;
end$$;
