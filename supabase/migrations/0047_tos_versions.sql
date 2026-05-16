-- ════════════════════════════════════════════════════════════
-- V-G4 · tos_versions + tos_acceptances (TOS version management)
-- ════════════════════════════════════════════════════════════
-- Per port-spec `admin-polish-bundle.md` §V-G4.
--
-- Today: TOS body is hardcoded in `lib/tos.ts::CURRENT_TOS_VERSION` +
-- some template fixture. Owner can't change the T&C wording or version
-- number without a code deploy.
--
-- V-G4 adds DB-backed version tracking. V1 = backend management surface
-- ONLY — admin can create versions + view acceptance counts. The
-- customer-side gate (`actions/tos.ts::acceptCurrentTos` + the layout
-- modal) keeps reading `CURRENT_TOS_VERSION` from code. V-G4.1
-- migrates the gate to read DB once the owner verifies the table
-- workflow on staging.
--
-- This migration introduces:
--   1. tos_versions table — versioned TOS bodies (admin-write-only)
--   2. tos_acceptances table — per-profile acceptance log (already
--      partially tracked via profiles.tos_accepted_version; this adds
--      per-version detail for audit + future "force re-accept" flow)
--   3. RLS — admin manage versions; public read active versions;
--      customer reads own acceptances
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) tos_versions ------------------------------------------------------
create table if not exists public.tos_versions (
  id                   uuid primary key default gen_random_uuid(),
  version_no           text unique not null,        -- "v2.0", "2026-05-16"
  title                text not null,
  body_md              text not null,                -- markdown source
  effective_from       date not null,
  is_active            boolean not null default false,
  -- Cargo-only or both (some customers use cargo without freight = different scope of TOS)
  applies_to           text not null default 'all'
                         check (applies_to in ('all','cargo_only','freight_only')),

  created_by_admin_id  uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists tos_versions_active_idx
  on public.tos_versions(is_active, effective_from desc) where is_active = true;

drop trigger if exists tos_versions_updated_at_trigger on public.tos_versions;
create trigger tos_versions_updated_at_trigger
  before update on public.tos_versions
  for each row execute function public.set_updated_at();

-- 2) tos_acceptances ---------------------------------------------------
-- One row per (profile, version) — captures the explicit accept click.
-- profiles.tos_accepted_version (existing) denormalises the LATEST
-- acceptance for fast-gate queries; this table is the audit trail.
create table if not exists public.tos_acceptances (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  tos_version_id  uuid not null references public.tos_versions(id) on delete restrict,
  accepted_at     timestamptz not null default now(),
  ip_address      inet,
  user_agent      text
);

create unique index if not exists tos_acceptances_profile_version_uidx
  on public.tos_acceptances(profile_id, tos_version_id);
create index if not exists tos_acceptances_version_idx
  on public.tos_acceptances(tos_version_id);
create index if not exists tos_acceptances_profile_idx
  on public.tos_acceptances(profile_id);

-- 3) RLS ---------------------------------------------------------------
alter table public.tos_versions    enable row level security;
alter table public.tos_acceptances enable row level security;

-- tos_versions: public reads ACTIVE versions only (for V-G4.1 customer
-- gate that will replace CURRENT_TOS_VERSION). Admin (super only) full.
drop policy if exists tos_versions_public_read on public.tos_versions;
create policy tos_versions_public_read
  on public.tos_versions for select
  using (is_active = true);

drop policy if exists tos_versions_admin_all on public.tos_versions;
create policy tos_versions_admin_all
  on public.tos_versions for all
  using      (public.is_admin(array['super']))
  with check (public.is_admin(array['super']));

-- tos_acceptances: customer reads own; admin (super + accounting) reads all.
drop policy if exists tos_acceptances_self_read on public.tos_acceptances;
create policy tos_acceptances_self_read
  on public.tos_acceptances for select
  using (profile_id = auth.uid());

drop policy if exists tos_acceptances_admin_read on public.tos_acceptances;
create policy tos_acceptances_admin_read
  on public.tos_acceptances for select
  using (public.is_admin(array['super','accounting']));

-- Customer can INSERT own acceptance (V-G4.1 customer-side gate);
-- admin INSERT also allowed (admin-initiated bulk-reset workflow).
drop policy if exists tos_acceptances_self_insert on public.tos_acceptances;
create policy tos_acceptances_self_insert
  on public.tos_acceptances for insert
  with check (profile_id = auth.uid());

drop policy if exists tos_acceptances_admin_insert on public.tos_acceptances;
create policy tos_acceptances_admin_insert
  on public.tos_acceptances for insert
  with check (public.is_admin(array['super','accounting']));

-- No UPDATE/DELETE — acceptances are append-only.

-- 4) Comments ----------------------------------------------------------
comment on table  public.tos_versions is
  'V-G4 — versioned TOS bodies. V1 = backend management only; customer-side gate still reads CURRENT_TOS_VERSION from lib/tos.ts until V-G4.1 wires the read.';
comment on column public.tos_versions.version_no is
  'Unique version label (e.g. "v2.0", "2026-05-16"). Customer-facing.';
comment on column public.tos_versions.is_active is
  'Only one version should be active per applies_to scope at a time (app-layer enforced). Inactive versions kept for audit + acceptance history.';
comment on column public.tos_versions.applies_to is
  'all | cargo_only | freight_only — V1 expected to use "all" for everyone; cargo/freight split is for future T&C divergence.';

comment on table  public.tos_acceptances is
  'V-G4 — per-acceptance log (audit + per-version count). profiles.tos_accepted_version is the denormalised "latest" for fast gate queries.';
