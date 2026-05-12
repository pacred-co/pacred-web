-- ════════════════════════════════════════════════════════════
-- Phase F2 — Notifications (per ADR-0001)
-- ════════════════════════════════════════════════════════════
-- LINE Notify EOL'd 2026-04-01; legacy tb_users.userLineNotify tokens
-- are dead. Replacement strategy per docs/decisions/0001-line-notify-
-- replacement.md:
--   1. LINE Messaging API push  (primary, via @pacred OA)
--   2. Email digest             (fallback when LINE not linked)
--   3. console.log              (dev — LINE_PUSH_BYPASS=true)
--
-- This migration adds the persistence layer:
--   notifications        — append-only event log per user
--   notification_reads   — read-state tracker (so we know unread count)
--
-- Outbound delivery (LINE / email) goes through a queue worker called
-- from a Vercel cron — see /api/cron/dispatch-notifications (Phase F2
-- ships the schema + lib stubs; production cron + LINE binding happens
-- when channel access tokens are configured).
-- ════════════════════════════════════════════════════════════

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,

  -- Event classification
  category      text not null check (category in (
                  'order','payment','forwarder','yuan_payment',
                  'wallet','sales','system','promo'
                )),
  severity      text not null default 'info'
                check (severity in ('info','success','warning','error')),

  -- User-visible content
  title         text not null,
  body          text not null,                     -- short body (1-2 sentences)

  -- Deep-link (relative) — e.g. /service-order/O260513-12
  link_href     text,

  -- Reference to the source object — null is fine for system-wide
  reference_type text check (reference_type in (
                   'service_order','forwarder','yuan_payment',
                   'wallet_transaction','sales_commission','sales_payout'
                 )),
  reference_id   text,                              -- text because some refs are slugs

  -- Delivery state (per channel)
  delivered_line_at   timestamptz,                  -- successful push
  delivered_email_at  timestamptz,                  -- successful email
  delivery_attempts   int  not null default 0,
  last_delivery_error text,

  created_at    timestamptz not null default now()
);

create index if not exists notifications_profile_idx
  on public.notifications(profile_id, created_at desc);

create index if not exists notifications_dispatch_idx
  on public.notifications(created_at) where delivered_line_at is null and delivered_email_at is null;

-- ── notification_reads (read state) ──
-- Separate table so we can keep the notifications row append-only and
-- have a single bit per (profile, notification) — simpler than a flag
-- column with a partial unique index.
create table if not exists public.notification_reads (
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (profile_id, notification_id)
);

-- ════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════
alter table public.notifications       enable row level security;
alter table public.notification_reads  enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = profile_id);

-- INSERTs/UPDATEs to notifications happen via service-role from actions
-- (we don't grant customers the ability to forge notifications).

drop policy if exists "notification_reads_all_own" on public.notification_reads;
create policy "notification_reads_all_own" on public.notification_reads
  for all using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);
