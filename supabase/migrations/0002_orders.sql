-- ════════════════════════════════════════════════════════════
-- Demo: Orders feature (Phase 5 reference)
-- This file shows the pattern for adding new tables to the system.
-- Run after schema.sql in Supabase SQL Editor.
-- ════════════════════════════════════════════════════════════

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  service_type  text not null check (service_type in ('import','export','clear','customs','order','payment')),
  origin        text,
  destination   text,
  description   text,
  status        text not null default 'pending' check (status in ('pending','processing','shipped','delivered','cancelled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists orders_status_idx on public.orders(status);

-- updated_at trigger reuses the function defined in schema.sql
drop trigger if exists orders_updated_at_trigger on public.orders;
create trigger orders_updated_at_trigger
  before update on public.orders
  for each row execute function public.set_updated_at();

-- RLS — own-rows policies
alter table public.orders enable row level security;

drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own" on public.orders
  for select using (auth.uid() = user_id);

drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders
  for insert with check (auth.uid() = user_id);

drop policy if exists "orders_update_own" on public.orders;
create policy "orders_update_own" on public.orders
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "orders_delete_own" on public.orders;
create policy "orders_delete_own" on public.orders
  for delete using (auth.uid() = user_id);
