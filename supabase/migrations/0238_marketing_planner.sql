-- 0238_marketing_planner.sql — Content Marketing Planner store (ปอน 2026-07-01)
--
-- Backs the /admin/marketing/plan app (settings · contents · production targets ·
-- jobs · keywords). Additive only — new mkt_* tables, no change to existing schema.
-- One row per entity: id (text PK) + data (jsonb, the whole object). Filtering/
-- sorting is done client-side, so a plain id+jsonb shape keeps it swap-simple.
-- RLS: admin-only via public.is_admin() (ADR-0002 / migration 0015).

create table if not exists mkt_settings (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists mkt_contents (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists mkt_targets (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists mkt_jobs (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists mkt_keywords (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table mkt_settings enable row level security;
alter table mkt_contents enable row level security;
alter table mkt_targets  enable row level security;
alter table mkt_jobs     enable row level security;
alter table mkt_keywords enable row level security;

-- Admin-only full access (drop+create = idempotent). Server actions use the
-- service-role client (bypasses RLS); these policies fail-close for anon/other.
do $$
declare t text;
begin
  foreach t in array array['mkt_settings','mkt_contents','mkt_targets','mkt_jobs','mkt_keywords'] loop
    execute format('drop policy if exists %I on %I', t || '_admin_all', t);
    execute format('create policy %I on %I for all using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
  end loop;
end $$;
