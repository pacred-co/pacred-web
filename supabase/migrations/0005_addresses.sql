-- ════════════════════════════════════════════════════════════
-- Phase B3 — Shipping addresses + default-flag + soft delete
-- ════════════════════════════════════════════════════════════
-- Legacy mapping (tb_address + tb_address_main → addresses):
--   addressID           → id (uuid, replaces bigint pk)
--   userID              → profile_id (FK uuid)
--   addressName         → first_name
--   addressLastname     → last_name
--   addressTel          → phone
--   addressTel2         → phone2
--   addressNo           → address_line       (บ้านเลขที่ + ถนน รวมในบรรทัดเดียว)
--   addressSubDistrict  → sub_district
--   addressDistrict     → district
--   addressProvince     → province
--   addressZIPCode      → postal_code
--   addressNote         → note
--   addressStatus 1/0   → deleted_at (soft-delete via timestamp NULL=active)
--   latitude/longitude  → latitude/longitude (kept)
--   adminID             → created_by_admin   (nullable — null when self-served)
--
-- tb_address_main (separate 1:1) collapsed into is_default boolean
-- + partial unique index → exactly one active default per profile.
--
-- tb_address_maomao_free (free-shipping pricing buckets) NOT ported —
-- handled at rate-calc time in Phase D via rates tables (10_rates.sql).
-- ════════════════════════════════════════════════════════════

create table if not exists public.addresses (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,

  -- contact
  first_name      text not null,
  last_name       text not null,
  phone           text not null,
  phone2          text,

  -- thai postal address
  address_line    text not null,
  sub_district    text not null,
  district        text not null,
  province        text not null,
  postal_code     text not null,
  note            text,

  -- map pin (optional — used by forwarder pickup in Phase D)
  latitude        numeric(10,8),
  longitude       numeric(11,8),

  -- default flag (replaces tb_address_main)
  is_default      boolean not null default false,

  -- audit
  created_by_admin text,                                  -- admin_id if created on behalf of user
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz                              -- soft delete (NULL = active)
);

-- ── Indexes ──
create index if not exists addresses_profile_id_idx
  on public.addresses(profile_id) where deleted_at is null;

-- Exactly one default per profile (only among active addresses)
create unique index if not exists addresses_one_default_per_profile_idx
  on public.addresses(profile_id) where is_default = true and deleted_at is null;

create index if not exists addresses_province_idx
  on public.addresses(province) where deleted_at is null;

-- ── updated_at trigger ──
drop trigger if exists addresses_updated_at_trigger on public.addresses;
create trigger addresses_updated_at_trigger
  before update on public.addresses
  for each row execute function public.set_updated_at();

-- ── Auto-promote first address to default ──
-- If a profile has no default address yet, the next insert/un-delete
-- becomes the default automatically (parity with legacy UX where
-- the first address registered was implicitly the main one).
create or replace function public.addresses_auto_default()
returns trigger as $$
begin
  if new.deleted_at is null and new.is_default = false then
    if not exists (
      select 1 from public.addresses
       where profile_id = new.profile_id
         and is_default = true
         and deleted_at is null
         and id <> new.id
    ) then
      new.is_default := true;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists addresses_auto_default_trigger on public.addresses;
create trigger addresses_auto_default_trigger
  before insert or update of deleted_at, is_default on public.addresses
  for each row execute function public.addresses_auto_default();

-- ── Prevent setting default on a soft-deleted address ──
-- (Belt-and-braces: legacy bug allowed 'main' to point at addressStatus=0
-- entries. We enforce at DB level so the front-end can't trigger it.)
alter table public.addresses
  drop constraint if exists addresses_default_requires_active;
alter table public.addresses
  add constraint addresses_default_requires_active
  check (not (is_default = true and deleted_at is not null));

-- ── RLS — owner-only ──
alter table public.addresses enable row level security;

drop policy if exists "addresses_select_own" on public.addresses;
create policy "addresses_select_own" on public.addresses
  for select using (auth.uid() = profile_id);

drop policy if exists "addresses_insert_own" on public.addresses;
create policy "addresses_insert_own" on public.addresses
  for insert with check (auth.uid() = profile_id);

drop policy if exists "addresses_update_own" on public.addresses;
create policy "addresses_update_own" on public.addresses
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- No DELETE policy — UI must soft-delete via update deleted_at = now()
