-- ════════════════════════════════════════════════════════════
-- Migration 0003 — Admin role support
-- Run in Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════

-- Add role column to profiles (null = regular member, 'admin' = staff)
alter table public.profiles
  add column if not exists role text check (role in ('admin', 'staff')) default null;

create index if not exists profiles_role_idx on public.profiles(role);

-- ── SECURITY DEFINER helper so RLS policies can call it cheaply ──
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ── Admin can read ALL profiles ──
drop policy if exists "profiles_admin_select" on public.profiles;
create policy "profiles_admin_select" on public.profiles
  for select using (public.is_admin());

-- ── Admin can update ANY profile (e.g. change status, role) ──
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update using (public.is_admin());

-- ── Admin can read ALL documents ──
drop policy if exists "documents_admin_select" on public.documents;
create policy "documents_admin_select" on public.documents
  for select using (public.is_admin());
