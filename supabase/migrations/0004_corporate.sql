-- ════════════════════════════════════════════════════════════
-- Phase B2 — Juristic company details (1:1 with profiles)
-- ════════════════════════════════════════════════════════════
-- Only present for profiles where account_type='juristic'. Stores
-- the company-affidavit / VAT-doc references and DBD lookup data.
--
-- Legacy mapping (tb_corporate → corporate):
--   userID                          → profile_id (FK uuid)
--   corporateNumber                 → tax_id          (also kept on profiles for quick lookup)
--   corporateName                   → company_name
--   corporateAddress                → company_address
--   corporateFile (หนังสือรับรอง)    → document refs (see documents table — doc_type='company_affidavit')
--   corporateFile20 (ภพ20)          → document refs (doc_type='vat')
--   cpDateCreate                    → created_at
--   corporateStatus 0/1             → status enum
--
-- Documents are stored via the existing public.documents table
-- (member-docs bucket) — this table just holds the metadata + DBD
-- verification state.
-- ════════════════════════════════════════════════════════════

create table if not exists public.corporate (
  profile_id        uuid primary key references public.profiles(id) on delete cascade,

  -- DBD juristic-person fields (mirrors legacy tb_corporate)
  tax_id            text not null,
  company_name      text not null,
  company_address   text,

  -- Verification state — DBD lookup or admin manual approve
  status            text not null default 'pending'
                    check (status in ('pending','verified','rejected')),
  verified_at       timestamptz,
  verified_by       text,                                 -- admin_id, manual approve
  rejection_reason  text,

  -- DBD response cache (for re-display, audit, anti-tampering)
  dbd_payload       jsonb,
  dbd_fetched_at    timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Tax-id uniqueness for verified rows only (legacy allowed duplicates
-- because some records were drafts; we mirror that flexibility)
create unique index if not exists corporate_tax_id_verified_idx
  on public.corporate(tax_id) where status = 'verified';

create index if not exists corporate_status_idx on public.corporate(status);

-- updated_at trigger
drop trigger if exists corporate_updated_at_trigger on public.corporate;
create trigger corporate_updated_at_trigger
  before update on public.corporate
  for each row execute function public.set_updated_at();

-- ── RLS — owner-only ──
alter table public.corporate enable row level security;

drop policy if exists "corporate_select_own" on public.corporate;
create policy "corporate_select_own" on public.corporate
  for select using (auth.uid() = profile_id);

drop policy if exists "corporate_insert_own" on public.corporate;
create policy "corporate_insert_own" on public.corporate
  for insert with check (auth.uid() = profile_id);

drop policy if exists "corporate_update_own" on public.corporate;
create policy "corporate_update_own" on public.corporate
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- delete is admin-only (no policy = denied for users)

-- ── Guard: corporate row requires account_type='juristic' ──
-- Enforced via trigger because account_type lives on profiles.
create or replace function public.guard_corporate_account_type()
returns trigger as $$
declare
  acct_type text;
begin
  select account_type into acct_type
    from public.profiles
   where id = new.profile_id;

  if acct_type is null then
    raise exception 'corporate.profile_id % not found in profiles', new.profile_id;
  end if;

  if acct_type <> 'juristic' then
    raise exception 'corporate row requires profiles.account_type = juristic (got %)', acct_type;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists corporate_guard_account_type on public.corporate;
create trigger corporate_guard_account_type
  before insert or update on public.corporate
  for each row execute function public.guard_corporate_account_type();
