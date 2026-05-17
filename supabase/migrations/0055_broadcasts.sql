-- ════════════════════════════════════════════════════════════
-- V-G3 · admin broadcasts (push popup to customers)
-- ════════════════════════════════════════════════════════════
-- Per port-spec [docs/port-specs/admin-polish-bundle.md] §V-G3.
--
-- Pacred has inbound `/admin/contact-messages` (customer → admin). PHP
-- `popup.php` + `pages/popup/` let admin send OUTBOUND push notifications
-- to customers (e.g. "ปิดทำการสงกรานต์ 13-15 เม.ย." / promo announcements).
-- No equivalent in Pacred V1. This migration adds the spine.
--
-- Two delivery channels (V1 = in-app only via notifications rows; LINE
-- push deferred to V-G3.1 — needs LINE Messaging API quota + rate-limit
-- queue, separate task).
--
-- V1 ships:
-- 1. broadcasts table
-- 2. notifications.broadcast_id FK (so admin can read sent-count + drill
--    down to read-rate via existing notification_reads table)
-- 3. RLS: super + sales_admin write; customer never reads (broadcasts
--    table itself — but DOES see resulting notifications rows naturally)
--
-- Idempotent. Numbered 0055 (after V-E8 commission claims 0054).
-- ════════════════════════════════════════════════════════════

-- 1) broadcasts table -------------------------------------------------
create table if not exists public.broadcasts (
  id                  uuid primary key default gen_random_uuid(),

  -- Content
  title               text not null,
  body                text not null,                  -- short body (markdown light)
  link_href           text,                            -- relative deep-link

  -- Audience — V1 supports 4 filter modes
  audience            text not null check (audience in (
                        'all',                         -- every active customer
                        'juristic_only',
                        'personal_only',
                        'specific_ids'                 -- audience_ids[] list
                      )),
  audience_ids        uuid[],                          -- when audience='specific_ids'

  -- Scheduling
  scheduled_for       timestamptz,                     -- nullable; null = send now
  status              text not null default 'draft'
                        check (status in (
                          'draft',
                          'scheduled',
                          'sending',
                          'sent',
                          'cancelled'
                        )),

  -- Result counters (filled by send action)
  sent_count          int not null default 0,
  failed_count        int not null default 0,

  -- Audit
  created_by_admin_id uuid not null references public.profiles(id),
  scheduled_at        timestamptz,                     -- when admin clicked "schedule"
  sent_at             timestamptz,                     -- when actual send fired
  cancelled_at        timestamptz,
  cancelled_reason    text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- specific_ids audience MUST carry an id list.
  constraint broadcasts_specific_ids_has_list check (
    audience <> 'specific_ids' or (audience_ids is not null and array_length(audience_ids, 1) > 0)
  ),
  -- scheduled status MUST have scheduled_for set + future-ish (allow past
  -- so reschedule works; the cron picks up anything past + status=scheduled).
  constraint broadcasts_scheduled_has_time check (
    status <> 'scheduled' or scheduled_for is not null
  ),
  -- sent status MUST have sent_at populated.
  constraint broadcasts_sent_has_timestamp check (
    status <> 'sent' or sent_at is not null
  ),
  -- cancelled status MUST have reason.
  constraint broadcasts_cancelled_has_reason check (
    status <> 'cancelled' or (cancelled_reason is not null and cancelled_at is not null)
  )
);

-- Lookup indexes -----------------------------------------------------
create index if not exists broadcasts_status_created_idx
  on public.broadcasts(status, created_at desc);
create index if not exists broadcasts_scheduled_for_idx
  on public.broadcasts(scheduled_for) where status = 'scheduled';

drop trigger if exists broadcasts_updated_at_trigger on public.broadcasts;
create trigger broadcasts_updated_at_trigger
  before update on public.broadcasts
  for each row execute function public.set_updated_at();

-- 2) notifications.broadcast_id FK -----------------------------------
alter table public.notifications
  add column if not exists broadcast_id uuid references public.broadcasts(id) on delete set null;

create index if not exists notifications_broadcast_idx
  on public.notifications(broadcast_id) where broadcast_id is not null;

-- 3) RLS --------------------------------------------------------------
alter table public.broadcasts enable row level security;

-- Customer reads NOTHING from broadcasts — they only see the resulting
-- notification rows (which are already RLS-scoped per profile).
-- Admin (super + sales_admin) full read + write.
drop policy if exists broadcasts_admin_all on public.broadcasts;
create policy broadcasts_admin_all
  on public.broadcasts for all
  using      (public.is_admin(array['super','sales_admin']))
  with check (public.is_admin(array['super','sales_admin']));

-- 4) Comments ---------------------------------------------------------
comment on table  public.broadcasts is
  'V-G3 — admin push broadcasts (outbound). One row per campaign. V1 in-app only via notifications rows; V-G3.1 adds LINE push.';
comment on column public.broadcasts.audience is
  'all | juristic_only | personal_only | specific_ids. Future V-G3.2: specific_segment via JSONB filter.';
comment on column public.broadcasts.audience_ids is
  'profile_id[] when audience=specific_ids. MUST be non-empty per CHECK.';
comment on column public.broadcasts.scheduled_for is
  'Null = send now (V1 only). Future V-G3.1 cron picks up past-due scheduled rows.';
comment on column public.broadcasts.sent_count is
  'Count of notifications rows successfully inserted at send time.';
comment on column public.broadcasts.failed_count is
  'Count of failures during fan-out (rare — RLS or duplicate primary key).';
comment on column public.notifications.broadcast_id is
  'V-G3 — links a notifications row back to its source broadcast for per-campaign read-rate analytics.';
