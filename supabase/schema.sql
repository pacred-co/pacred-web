-- ════════════════════════════════════════════════════════════
-- Pacred — Initial database schema
-- Run this once in Supabase Dashboard → SQL Editor → New query
-- ════════════════════════════════════════════════════════════

-- ══ EXTENSIONS ══
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ════════════════════════════════════════════════════════════
-- 1. PROFILES (extends auth.users)
-- ════════════════════════════════════════════════════════════
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  account_type  text not null default 'personal' check (account_type in ('personal','juristic')),
  member_code   text unique,
  first_name    text,
  last_name     text,
  phone         text,
  email         text,
  services      text[],
  how_know      text,

  -- juristic-only
  tax_id        text,
  company_name  text,
  address       jsonb,

  status        text not null default 'incomplete' check (status in ('incomplete','active','suspended')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists profiles_member_code_idx on public.profiles(member_code);
create index if not exists profiles_phone_idx       on public.profiles(phone);

-- ── Auto-generate member_code: PR + min-3-digit running number (PR001) ──
-- Pattern: PR001, PR002, … PR999, then PR1000, PR12345, … — `lpad` to 3 is a
-- MINIMUM, never a cap (lpad never truncates), so the counter runs forever
-- past 999 with no error. Changed from 5-digit (PR00001) per ลูกพี่ 2026-05-17.
create sequence if not exists public.member_code_seq start with 1;

create or replace function public.generate_member_code() returns trigger as $$
begin
  if new.member_code is null then
    new.member_code := 'PR' || lpad(nextval('public.member_code_seq')::text, 3, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_member_code_trigger on public.profiles;
create trigger profiles_member_code_trigger
  before insert on public.profiles
  for each row execute function public.generate_member_code();

-- ── Auto-update updated_at ──
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_updated_at_trigger on public.profiles;
create trigger profiles_updated_at_trigger
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ════════════════════════════════════════════════════════════
-- 2. DOCUMENTS (juristic — uploaded to Storage)
-- ════════════════════════════════════════════════════════════
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  doc_type      text not null check (doc_type in ('company_affidavit','vat','national_id')),
  storage_path  text not null,
  mime_type     text,
  size_bytes    bigint,
  uploaded_at   timestamptz not null default now()
);

create index if not exists documents_profile_id_idx on public.documents(profile_id);

-- ════════════════════════════════════════════════════════════
-- 3. OTP_CODES (server-only — accessed via service-role)
-- ════════════════════════════════════════════════════════════
create table if not exists public.otp_codes (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code_hash   text not null,
  purpose     text not null check (purpose in ('register','login','reset')),
  expires_at  timestamptz not null,
  used        boolean not null default false,
  attempts    int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists otp_codes_lookup_idx on public.otp_codes(phone, purpose, used);

-- ════════════════════════════════════════════════════════════
-- 4. ROW-LEVEL SECURITY
-- ════════════════════════════════════════════════════════════
alter table public.profiles  enable row level security;
alter table public.documents enable row level security;
alter table public.otp_codes enable row level security;

-- ── profiles: user can read/insert/update own row ──
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ── documents: user can manage docs that belong to own profile ──
drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own" on public.documents
  for select using (auth.uid() = profile_id);

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own" on public.documents
  for insert with check (auth.uid() = profile_id);

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own" on public.documents
  for delete using (auth.uid() = profile_id);

-- ── otp_codes: NO public access (RLS enabled, no policies = deny all) ──
-- Only server-role client (lib/supabase/admin.ts) can read/write.

-- ════════════════════════════════════════════════════════════
-- 5. STORAGE — member-docs (private bucket)
-- ════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('member-docs', 'member-docs', false)
on conflict (id) do nothing;

-- ── Storage policies: user can manage files in folder = own user_id ──
-- Path pattern: member-docs/{user_id}/{doc_type}/{filename}

drop policy if exists "member_docs_user_select" on storage.objects;
create policy "member_docs_user_select" on storage.objects
  for select using (
    bucket_id = 'member-docs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "member_docs_user_insert" on storage.objects;
create policy "member_docs_user_insert" on storage.objects
  for insert with check (
    bucket_id = 'member-docs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "member_docs_user_update" on storage.objects;
create policy "member_docs_user_update" on storage.objects
  for update using (
    bucket_id = 'member-docs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "member_docs_user_delete" on storage.objects;
create policy "member_docs_user_delete" on storage.objects
  for delete using (
    bucket_id = 'member-docs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
