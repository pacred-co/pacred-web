-- ════════════════════════════════════════════════════════════
-- P-6 · Contact form submissions
-- ════════════════════════════════════════════════════════════
-- Public contact form on /contact stores submissions here. Logged-in
-- users get profile_id linkage; guests submit anonymously. Admins read
-- + triage via the existing admin notifications fan-out.
-- ════════════════════════════════════════════════════════════

create table if not exists public.contact_messages (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid references public.profiles(id) on delete set null,
  name         text not null,
  contact      text not null,                                       -- email or phone (free-form for now)
  subject      text,
  message      text not null,
  status       text not null default 'new'
                 check (status in ('new','read','replied','closed')),
  source_url   text,                                                -- referrer if available
  user_agent   text,
  ip           text,                                                -- abuse / rate-limit signal
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists contact_messages_status_idx
  on public.contact_messages(status, created_at desc);
create index if not exists contact_messages_profile_idx
  on public.contact_messages(profile_id);

drop trigger if exists contact_messages_updated_at_trigger on public.contact_messages;
create trigger contact_messages_updated_at_trigger
  before update on public.contact_messages
  for each row execute function public.set_updated_at();

-- ── RLS ──
alter table public.contact_messages enable row level security;

-- Anyone (anon + authenticated) may submit
drop policy if exists contact_messages_insert_anyone on public.contact_messages;
create policy contact_messages_insert_anyone
  on public.contact_messages for insert
  with check (true);

-- Authenticated users see their own past submissions
drop policy if exists contact_messages_select_own on public.contact_messages;
create policy contact_messages_select_own
  on public.contact_messages for select
  using (profile_id is not null and auth.uid() = profile_id);

-- Admins read + update everything (status triage)
drop policy if exists contact_messages_admin_all on public.contact_messages;
create policy contact_messages_admin_all
  on public.contact_messages for all
  using (public.is_admin())
  with check (public.is_admin());
