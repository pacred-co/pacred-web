-- ════════════════════════════════════════════════════════════
-- P-20 · HS code rates + container HS line items
-- ════════════════════════════════════════════════════════════
-- Per Part O2 Sprint 6 P-20 (เดฟ assigned 2026-05-14): port legacy
-- admin tools cnt-hs.php + hs-customrate.php + report-cnt.php into:
--
--   1. hs_codes — Customs HS code dictionary with default duty %
--   2. container_hs_lines — line items per container, qty/weight/value
--      sliced by HS code, joined to containers + hs_codes
--
-- Used by /admin/containers/[id]/hs (line items entry) and
-- /admin/reports/containers-hs (aggregate by hs_code report).
--
-- DECISION (ภูม, per §6): migration number 0030 (spec wrote 0029 —
-- claimed by P-19 csv_imports earlier today).
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- ── hs_codes — customs code dictionary ──
create table if not exists public.hs_codes (
  code              text primary key,                                -- e.g. "8517.12.00"
  description       text not null,
  description_en    text,
  default_duty_pct  numeric(6,3) not null default 0
                      check (default_duty_pct >= 0 and default_duty_pct <= 100),
  unit              text default 'piece',                            -- 'piece', 'kg', 'set', etc.
  note              text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists hs_codes_active_idx
  on public.hs_codes(is_active) where is_active = true;

drop trigger if exists hs_codes_updated_at_trigger on public.hs_codes;
create trigger hs_codes_updated_at_trigger
  before update on public.hs_codes
  for each row execute function public.set_updated_at();

-- ── container_hs_lines — qty/weight/value broken down by HS code ──
create table if not exists public.container_hs_lines (
  id              uuid primary key default gen_random_uuid(),
  container_id    uuid not null references public.containers(id) on delete cascade,
  hs_code         text not null references public.hs_codes(code)   on delete restrict,
  qty             numeric(14,3) not null default 0 check (qty >= 0),
  weight_kg       numeric(14,3) not null default 0 check (weight_kg >= 0),
  value_thb       numeric(14,2) not null default 0 check (value_thb >= 0),
  duty_pct_used   numeric(6,3),                                      -- snapshot of rate at line entry time (overridable)
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists container_hs_lines_container_idx
  on public.container_hs_lines(container_id);
create index if not exists container_hs_lines_hs_idx
  on public.container_hs_lines(hs_code);

drop trigger if exists container_hs_lines_updated_at_trigger on public.container_hs_lines;
create trigger container_hs_lines_updated_at_trigger
  before update on public.container_hs_lines
  for each row execute function public.set_updated_at();

-- ── RLS ──
alter table public.hs_codes            enable row level security;
alter table public.container_hs_lines  enable row level security;

-- hs_codes: admin write; everyone authenticated may read (rate
-- transparency for future customer-facing display).
drop policy if exists hs_codes_select_all on public.hs_codes;
create policy hs_codes_select_all on public.hs_codes
  for select using (true);

drop policy if exists hs_codes_admin_write on public.hs_codes;
create policy hs_codes_admin_write on public.hs_codes
  for all using (public.is_admin()) with check (public.is_admin());

-- container_hs_lines: admin-only (operational table).
drop policy if exists container_hs_lines_admin_all on public.container_hs_lines;
create policy container_hs_lines_admin_all on public.container_hs_lines
  for all using (public.is_admin()) with check (public.is_admin());

-- ── seed a few common HS codes so the picker isn't empty ──
insert into public.hs_codes (code, description, default_duty_pct, unit) values
  ('8517.12.00', 'โทรศัพท์มือถือ smartphone',                  0.000, 'piece'),
  ('8504.40.90', 'อะแดปเตอร์/ที่ชาร์จ',                            5.000, 'piece'),
  ('6109.10.00', 'เสื้อยืด cotton',                              30.000, 'piece'),
  ('6204.62.00', 'กางเกงผู้หญิง cotton',                          30.000, 'piece'),
  ('9503.00.99', 'ของเล่นทั่วไป',                                  0.000, 'piece'),
  ('3924.10.00', 'ภาชนะพลาสติก',                                  20.000, 'piece'),
  ('6403.99.00', 'รองเท้า',                                       30.000, 'piece'),
  ('8473.30.20', 'เคสคอม / accessories',                          5.000, 'piece'),
  ('9999.99.99', 'อื่นๆ (general — ใช้ตอนยังไม่จัดประเภท)',         10.000, 'piece')
on conflict (code) do nothing;

comment on table public.hs_codes is
  'Customs HS code dictionary with default duty %. Mirror of legacy hs-customrate.php.';
comment on table public.container_hs_lines is
  'Per-container HS code breakdown — qty/weight/value sliced by code. Mirror of legacy cnt-hs.php.';
