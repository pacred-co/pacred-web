-- ════════════════════════════════════════════════════════════
-- Phase H · HR / Org-chart — Pacred organization structure
-- ════════════════════════════════════════════════════════════
-- 4-level hierarchy: branch → section → position → assignment
--
-- Following the user-provided Pacred org chart (NOT the legacy PCS Cargo
-- structure). 3 directors under CEO, each with their own branch:
--   • Business Development & Tech (cyan)  — TECH STAFF, SOURCING
--   • Operations (yellow)                 — SALES, CS-DOCS, WAREHOUSE,
--                                            LOGISTICS, QA & QC
--   • Finance & Admin (purple)            — ACCOUNTING, HR
--
-- M:N assignments — one person can hold multiple positions, one position
-- can have multiple people, separated by kind (employee/internship/partner).
-- ════════════════════════════════════════════════════════════

-- ── org_branches ──
create table if not exists public.org_branches (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,
  name                text not null,
  director_profile_id uuid references public.profiles(id) on delete set null,
  color_tone          text not null check (color_tone in ('red','cyan','yellow','purple','grey','blue','green')),
  sort_order          int  not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists org_branches_updated_at_trigger on public.org_branches;
create trigger org_branches_updated_at_trigger before update on public.org_branches
  for each row execute function public.set_updated_at();

-- ── org_sections (departments under each branch) ──
create table if not exists public.org_sections (
  id                 uuid primary key default gen_random_uuid(),
  branch_id          uuid not null references public.org_branches(id) on delete cascade,
  slug               text not null,
  name               text not null,
  manager_profile_id uuid references public.profiles(id) on delete set null,
  sort_order         int  not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (branch_id, slug)
);

drop trigger if exists org_sections_updated_at_trigger on public.org_sections;
create trigger org_sections_updated_at_trigger before update on public.org_sections
  for each row execute function public.set_updated_at();

create index if not exists org_sections_branch_idx on public.org_sections(branch_id, sort_order);

-- ── org_positions (roles within each section) ──
create table if not exists public.org_positions (
  id                uuid primary key default gen_random_uuid(),
  section_id        uuid not null references public.org_sections(id) on delete cascade,
  slug              text not null,
  name              text not null,
  quota_employee    int  not null default 0,
  quota_internship  int  not null default 0,
  quota_partner     int  not null default 0,
  sort_order        int  not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (section_id, slug)
);

drop trigger if exists org_positions_updated_at_trigger on public.org_positions;
create trigger org_positions_updated_at_trigger before update on public.org_positions
  for each row execute function public.set_updated_at();

create index if not exists org_positions_section_idx on public.org_positions(section_id, sort_order);

-- ── org_assignments (person ↔ position, M:N, active when ended_at is null) ──
create table if not exists public.org_assignments (
  id          uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.org_positions(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('employee','internship','partner')),
  started_at  date not null default current_date,
  ended_at    date,
  notes       text,
  created_at  timestamptz not null default now(),
  -- Prevent same (person, position, kind) being assigned twice while active
  unique (position_id, profile_id, kind)
);

create index if not exists org_assignments_position_idx on public.org_assignments(position_id) where ended_at is null;
create index if not exists org_assignments_profile_idx  on public.org_assignments(profile_id)  where ended_at is null;

-- ════════════════════════════════════════════════════════════
-- RLS — read for any signed-in user, write for super-admin only
-- ════════════════════════════════════════════════════════════
alter table public.org_branches    enable row level security;
alter table public.org_sections    enable row level security;
alter table public.org_positions   enable row level security;
alter table public.org_assignments enable row level security;

drop policy if exists "org_branches_read"  on public.org_branches;
create policy "org_branches_read"  on public.org_branches  for select using (auth.uid() is not null);
drop policy if exists "org_branches_write" on public.org_branches;
create policy "org_branches_write" on public.org_branches  for all    using (public.is_admin(array['super'])) with check (public.is_admin(array['super']));

drop policy if exists "org_sections_read"  on public.org_sections;
create policy "org_sections_read"  on public.org_sections  for select using (auth.uid() is not null);
drop policy if exists "org_sections_write" on public.org_sections;
create policy "org_sections_write" on public.org_sections  for all    using (public.is_admin(array['super'])) with check (public.is_admin(array['super']));

drop policy if exists "org_positions_read"  on public.org_positions;
create policy "org_positions_read"  on public.org_positions for select using (auth.uid() is not null);
drop policy if exists "org_positions_write" on public.org_positions;
create policy "org_positions_write" on public.org_positions for all    using (public.is_admin(array['super'])) with check (public.is_admin(array['super']));

drop policy if exists "org_assignments_read"  on public.org_assignments;
create policy "org_assignments_read"  on public.org_assignments for select using (auth.uid() is not null);
drop policy if exists "org_assignments_write" on public.org_assignments;
create policy "org_assignments_write" on public.org_assignments for all    using (public.is_admin(array['super'])) with check (public.is_admin(array['super']));

-- ════════════════════════════════════════════════════════════
-- SEED — Pacred's actual structure from the org chart image
--   (employee/internship/partner quotas read off the chart cells)
-- ════════════════════════════════════════════════════════════

-- 3 branches
insert into public.org_branches (slug, name, color_tone, sort_order) values
  ('bd-tech',       'Business Development & Tech', 'cyan',   1),
  ('operations',    'Operations',                  'yellow', 2),
  ('finance-admin', 'Finance & Admin',             'purple', 3)
on conflict (slug) do nothing;

-- Sections + positions (via DO block so we can resolve branch_id / section_id by slug)
do $$
declare
  b_bdtech uuid := (select id from public.org_branches where slug='bd-tech');
  b_ops    uuid := (select id from public.org_branches where slug='operations');
  b_fin    uuid := (select id from public.org_branches where slug='finance-admin');
  s_id     uuid;
begin
  -- ════ BD & Tech ════
  insert into public.org_sections (branch_id, slug, name, sort_order) values
    (b_bdtech, 'tech-staff', 'Tech Staff',  1),
    (b_bdtech, 'sourcing',   'Sourcing',    2)
  on conflict (branch_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_bdtech and slug='tech-staff');
  insert into public.org_positions (section_id, slug, name, quota_employee, sort_order) values
    (s_id, 'developer', 'Developer', 2, 1),
    (s_id, 'marketing', 'Marketing', 2, 2)
  on conflict (section_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_bdtech and slug='sourcing');
  insert into public.org_positions (section_id, slug, name, quota_employee, sort_order) values
    (s_id, 'pricing',      'Pricing',      1, 1),
    (s_id, 'merchandiser', 'Merchandiser', 1, 2),
    (s_id, 'planning',     'Planning',     1, 3)
  on conflict (section_id, slug) do nothing;

  -- ════ Operations ════
  insert into public.org_sections (branch_id, slug, name, sort_order) values
    (b_ops, 'sales',           'Sales',           1),
    (b_ops, 'cs-docs',          'CS · DOCS',       2),
    (b_ops, 'warehouse-staff',  'Warehouse Staff', 3),
    (b_ops, 'logistics',        'Logistics',       4),
    (b_ops, 'qa-qc',            'QA & QC',         5)
  on conflict (branch_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_ops and slug='sales');
  insert into public.org_positions (section_id, slug, name, quota_employee, sort_order) values
    (s_id, 'sales-team-a', 'Sales Team A', 2, 1),
    (s_id, 'sales-team-b', 'Sales Team B', 2, 2)
  on conflict (section_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_ops and slug='cs-docs');
  insert into public.org_positions (section_id, slug, name, quota_employee, sort_order) values
    (s_id, 'customer-service', 'Customer Service', 2, 1),
    (s_id, 'docs',             'Docs',             3, 2)
  on conflict (section_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_ops and slug='warehouse-staff');
  insert into public.org_positions (section_id, slug, name, quota_employee, sort_order) values
    (s_id, 'warehouse', 'Warehouse', 2, 1)
  on conflict (section_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_ops and slug='logistics');
  insert into public.org_positions (section_id, slug, name, quota_employee, quota_partner, sort_order) values
    (s_id, 'sup-express',     'Sup-Express',         2, 0, 1),
    (s_id, 'express',          'Express',             2, 0, 2),
    (s_id, 'driver',           'Driver',              1, 0, 3),
    (s_id, 'messenger',        'Messenger',           1, 0, 4),
    (s_id, 'partner-tractor',  'Partner Tractor หัวลาก', 0, 2, 5)
  on conflict (section_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_ops and slug='qa-qc');
  insert into public.org_positions (section_id, slug, name, quota_employee, sort_order) values
    (s_id, 'qa',    'QA',     1, 1),
    (s_id, 'qc',    'QC',     1, 2),
    (s_id, 'audit', 'Audit',  1, 3)
  on conflict (section_id, slug) do nothing;

  -- ════ Finance & Admin ════
  insert into public.org_sections (branch_id, slug, name, sort_order) values
    (b_fin, 'accounting',      'Accounting',      1),
    (b_fin, 'human-resources', 'Human Resources', 2)
  on conflict (branch_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_fin and slug='accounting');
  insert into public.org_positions (section_id, slug, name, quota_employee, sort_order) values
    (s_id, 'acc-ar', 'ACC AR (รายรับ)', 1, 1),
    (s_id, 'acc-ap', 'ACC AP (รายจ่าย)', 1, 2)
  on conflict (section_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_fin and slug='human-resources');
  insert into public.org_positions (section_id, slug, name, quota_employee, sort_order) values
    (s_id, 'hr',   'HR',   1, 1),
    (s_id, 'maid', 'Maid', 2, 2)
  on conflict (section_id, slug) do nothing;
end$$;
