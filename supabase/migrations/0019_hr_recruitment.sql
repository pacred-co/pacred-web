-- ════════════════════════════════════════════════════════════
-- Phase H · HR — Recruitment (สรรหา / รับสมัครงาน)
-- ════════════════════════════════════════════════════════════
-- Workflow:
--   1. HR creates a job_posting (linked to org_positions, optional)
--   2. Applicants flow in (walk-in / online / referral)
--   3. Applicants advance through stages:
--        applied → screening → interviewing → offered → hired / rejected
--   4. When hired, hr links the applicant to a profile_id (the new
--      employee's account) so the employee directory + org assignments
--      stay in sync.
--
-- Resumes/CVs go into the private "resumes" Storage bucket, foldered by
-- applicant_id so RLS can scope downloads to admins only.
-- ════════════════════════════════════════════════════════════

-- ── job_postings ──
create table if not exists public.job_postings (
  id                 uuid primary key default gen_random_uuid(),
  slug               text unique not null,
  title              text not null,
  position_id        uuid references public.org_positions(id) on delete set null,
  description        text,
  status             text not null default 'open'
                       check (status in ('draft','open','paused','closed')),
  openings_count     int  not null default 1 check (openings_count >= 1),
  salary_range_text  text,
  location           text,
  employment_type    text not null default 'full_time'
                       check (employment_type in ('full_time','probation','contract','daily','intern','partner')),
  posted_at          timestamptz,
  closed_at          timestamptz,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists job_postings_updated_at_trigger on public.job_postings;
create trigger job_postings_updated_at_trigger before update on public.job_postings
  for each row execute function public.set_updated_at();

create index if not exists job_postings_status_idx on public.job_postings(status, posted_at desc);
create index if not exists job_postings_position_idx on public.job_postings(position_id) where position_id is not null;

-- ── job_applicants ──
create table if not exists public.job_applicants (
  id                      uuid primary key default gen_random_uuid(),
  posting_id              uuid not null references public.job_postings(id) on delete cascade,

  -- identity (free-form; we don't require a profile until hired)
  first_name              text not null,
  last_name               text,
  nickname                text,
  phone                   text,
  email                   text,
  birth_date              date,

  -- resume + intake
  resume_path             text,                               -- path in 'resumes' bucket
  source                  text not null default 'walk_in'
                            check (source in ('walk_in','website','line','facebook','referral','jobsdb','other')),
  source_note             text,                               -- e.g. referrer name
  applied_at              timestamptz not null default now(),

  -- pipeline
  stage                   text not null default 'applied'
                            check (stage in ('applied','screening','interviewing','offered','hired','rejected')),
  notes                   text,                               -- HR private notes
  interview_scheduled_at  timestamptz,                        -- next interview slot
  interview_location      text,
  interviewer_profile_id  uuid references public.profiles(id) on delete set null,

  -- outcome
  hired_profile_id        uuid references public.profiles(id) on delete set null,
  hired_at                timestamptz,
  rejected_reason         text,
  rejected_at             timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

drop trigger if exists job_applicants_updated_at_trigger on public.job_applicants;
create trigger job_applicants_updated_at_trigger before update on public.job_applicants
  for each row execute function public.set_updated_at();

create index if not exists job_applicants_posting_idx  on public.job_applicants(posting_id, stage);
create index if not exists job_applicants_stage_idx    on public.job_applicants(stage, applied_at desc);
create index if not exists job_applicants_interview_idx on public.job_applicants(interview_scheduled_at)
  where interview_scheduled_at is not null and stage in ('screening','interviewing');

-- ════════════════════════════════════════════════════════════
-- RLS — admin-only (any active admin role can read+write)
-- ════════════════════════════════════════════════════════════
alter table public.job_postings   enable row level security;
alter table public.job_applicants enable row level security;

drop policy if exists "job_postings_admin_all" on public.job_postings;
create policy "job_postings_admin_all" on public.job_postings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "job_applicants_admin_all" on public.job_applicants;
create policy "job_applicants_admin_all" on public.job_applicants
  for all using (public.is_admin()) with check (public.is_admin());

-- ════════════════════════════════════════════════════════════
-- Storage bucket: resumes (private, admin-only)
-- ════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

drop policy if exists "resumes_admin_read"   on storage.objects;
create policy "resumes_admin_read"   on storage.objects
  for select using (bucket_id = 'resumes' and public.is_admin());

drop policy if exists "resumes_admin_write"  on storage.objects;
create policy "resumes_admin_write"  on storage.objects
  for insert with check (bucket_id = 'resumes' and public.is_admin());

drop policy if exists "resumes_admin_update" on storage.objects;
create policy "resumes_admin_update" on storage.objects
  for update using (bucket_id = 'resumes' and public.is_admin()) with check (bucket_id = 'resumes' and public.is_admin());

drop policy if exists "resumes_admin_delete" on storage.objects;
create policy "resumes_admin_delete" on storage.objects
  for delete using (bucket_id = 'resumes' and public.is_admin());

-- ════════════════════════════════════════════════════════════
-- Seed — sample postings (drafts of vacant positions from org_positions
-- with empty quotas). Skipped if any postings already exist so re-run
-- doesn't bloat the table.
-- ════════════════════════════════════════════════════════════
do $$
declare
  pos_developer  uuid := (select id from public.org_positions where slug='developer');
  pos_customer_service uuid := (select id from public.org_positions where slug='customer-service');
  pos_acc_ar     uuid := (select id from public.org_positions where slug='acc-ar');
begin
  if not exists (select 1 from public.job_postings limit 1) then
    insert into public.job_postings (slug, title, position_id, description, status, openings_count, salary_range_text, location, employment_type, posted_at)
    values
      ('dev-fullstack-2026', 'Full-stack Developer', pos_developer,
       'รับสมัคร Full-stack Developer (Next.js + Supabase) สำหรับทีม Pacred Tech — ดูแลระบบฝากนำเข้า/ฝากสั่ง/ฝากโอน',
       'open', 2, '35,000 - 60,000 บาท/เดือน', 'สำนักงานใหญ่ กรุงเทพฯ', 'full_time', now()),
      ('cs-pacred-2026', 'Customer Service (CS)', pos_customer_service,
       'ดูแลลูกค้าฝากนำเข้า/ฝากสั่งสินค้า ตอบ LINE OA + โทรศัพท์ + ติดตามสถานะออเดอร์',
       'open', 2, '18,000 - 25,000 บาท/เดือน', 'สำนักงานใหญ่ กรุงเทพฯ', 'full_time', now()),
      ('acc-ar-2026', 'พนักงานบัญชี รายรับ (AR)', pos_acc_ar,
       'จัดทำใบเสร็จ + ตรวจสอบรายรับ + กระทบยอด wallet + ออกใบกำกับภาษี',
       'paused', 1, '22,000 - 30,000 บาท/เดือน', 'สำนักงานใหญ่ กรุงเทพฯ', 'full_time', now() - interval '7 days');
  end if;
end$$;
