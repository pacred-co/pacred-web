-- ════════════════════════════════════════════════════════════
-- IC-1 (T1) · work_item_messages + waiting_for block on work_items
-- ════════════════════════════════════════════════════════════
-- Per design [docs/research/internal-chat-system-2026-05-18.md] §2.
--
-- This is the **internal per-job chat + status-visibility layer** that
-- pairs with `0080_work_items` (the cross-department work-board spine).
-- Three things land here:
--
--   1. work_item_messages           — per-job chat thread (comment /
--                                     system / status_note)
--   2. work_item_message_mentions   — @mention fan-out (one row per
--                                     mention; powers the inbox)
--   3. work_items.waiting_for block — 3 new columns (blocked_on_role,
--                                     blocked_on_admin, waiting_reason)
--                                     + a CHECK on the reason vocab +
--                                     a partial index for the board
--                                     filter
--
-- Also extends two CHECK constraints (idempotent):
--   - notifications.category       += 'work_chat'
--   - notifications.reference_type += 'work_item'
--
-- Per design §3.2 the waiting_reason vocab is intentionally small +
-- fixed (8 values).  A free-text "why" defeats the at-a-glance scan +
-- the per-reason filter.  Nuance goes in the status_note message body;
-- the category stays an enum.
--
-- Idempotent.  Safe to re-run.
-- ════════════════════════════════════════════════════════════

-- ── 1) work_item_messages ─────────────────────────────────────────────
-- One row = one staff message OR one machine-generated system event
-- on one job.  NULL author + kind='system' = automatic event line so
-- the chat + the event log are one timeline (§3.4).
create table if not exists public.work_item_messages (
  id              uuid primary key default gen_random_uuid(),
  work_item_id    uuid not null references public.work_items(id) on delete cascade,

  -- Author.  NULL when kind='system' (machine-generated).  FK to profiles
  -- (not admins — admins has composite PK) — author MUST be an admin at
  -- post time (enforced by the Server Action + the RLS policy below).
  author_admin_id uuid references public.profiles(id) on delete set null,

  kind            text not null default 'comment'
                    check (kind in ('comment','system','status_note')),
  --   comment      — a human message
  --   system       — auto event (stage change, assignment, waiting set/cleared)
  --   status_note  — a human message that ALSO sets/clears the waiting_for
  --                  block in the same action (§3.3); rendered with emphasis

  body            text not null check (char_length(body) between 1 and 5000),

  -- When kind='status_note', the waiting fields this message set
  -- (denormalised copy for the timeline; live values live on work_items).
  set_waiting_reason text,
  set_blocked_role   text,

  deleted_at      timestamptz,                  -- soft-delete only
  created_at      timestamptz not null default now(),

  -- A system-generated row has no author + must be a 'system' kind.
  constraint work_item_messages_system_kind_consistent check (
    (author_admin_id is not null and kind in ('comment','status_note'))
    or (author_admin_id is null and kind = 'system')
  ),
  -- status_note must carry the waiting fields it mirrors.
  constraint work_item_messages_status_note_has_waiting check (
    kind <> 'status_note'
    or (set_waiting_reason is not null or set_blocked_role is not null)
  )
);

-- Thread scan (one job's messages in order).
create index if not exists work_item_messages_thread_idx
  on public.work_item_messages(work_item_id, created_at)
  where deleted_at is null;
-- Author profile pull (for "messages I posted recently").
create index if not exists work_item_messages_author_idx
  on public.work_item_messages(author_admin_id, created_at desc)
  where deleted_at is null and author_admin_id is not null;

-- ── 2) work_item_message_mentions ─────────────────────────────────────
-- @mention fan-out.  One row per (message, mentioned staff).  Written
-- at post time by the action after it parses @handles.  Denormalised
-- work_item_id so the "mentioned me" inbox needs no join to messages.
create table if not exists public.work_item_message_mentions (
  message_id         uuid not null references public.work_item_messages(id) on delete cascade,
  mentioned_admin_id uuid not null references public.profiles(id) on delete cascade,
  work_item_id       uuid not null references public.work_items(id) on delete cascade,
  notified_at        timestamptz,                -- set when the notification fired
  seen_at            timestamptz,                -- set when the mentioned staff opened the thread
  created_at         timestamptz not null default now(),
  primary key (message_id, mentioned_admin_id)
);

-- Inbox: unseen mentions for a staffer (the "@me" pull).
create index if not exists work_item_message_mentions_inbox_idx
  on public.work_item_message_mentions(mentioned_admin_id, created_at desc)
  where seen_at is null;
-- Per-job mention list (for the thread panel's "people @ed in this thread" pill).
create index if not exists work_item_message_mentions_job_idx
  on public.work_item_message_mentions(work_item_id, created_at);

-- ── 3) work_items.waiting_for block ───────────────────────────────────
-- Three columns added to the existing work_items table — additive only,
-- cannot conflict with anything in 0080.
alter table public.work_items
  add column if not exists blocked_on_role  text,
  add column if not exists blocked_on_admin uuid references public.profiles(id) on delete set null,
  add column if not exists waiting_reason   text;

-- waiting_reason vocabulary (per design §3.2 — 8 values + null = not blocked).
-- Each maps to a real legacy pain (A2/A4 rate-fix · A6 document · ...).
alter table public.work_items
  drop constraint if exists work_items_waiting_reason_chk;

alter table public.work_items
  add constraint work_items_waiting_reason_chk
  check (waiting_reason is null or waiting_reason in (
    'confirm',       -- รอเฟิม / รออนุมัติ — the generic "รอใครเฟิม"
    'disbursement',  -- รอเบิกจ่าย — container cost / vendor payout
    'billing',       -- รอวางบิล / รอออกใบแจ้งหนี้
    'follow_up',     -- รอตามลูกค้า / ตามคู่ค้า
    'document',      -- A6 — WHT cert / Form E / D/O / slip
    'payment',       -- รอลูกค้าชำระ
    'rate_fix',      -- A2/A4 — wrong rate must be corrected
    'external'       -- รอหน่วยงานภายนอก (customs / carrier)
  ));

-- "All jobs currently blocked on dept X for reason Y" — one scan.
create index if not exists work_items_blocked_idx
  on public.work_items(blocked_on_role, waiting_reason)
  where waiting_reason is not null;

-- "Jobs blocked on me personally" — for the inbox tab (§5.3).
create index if not exists work_items_blocked_on_admin_idx
  on public.work_items(blocked_on_admin)
  where blocked_on_admin is not null and waiting_reason is not null;

-- ── 4) Extend notifications enums ─────────────────────────────────────
-- Per §4.2 — staff chat notifications ride the shipped sendNotification()
-- pipeline.  Just add the category + reference type to the existing
-- CHECK constraints (drop+add idempotent pattern from 0024 / 0026).
alter table public.notifications
  drop constraint if exists notifications_category_check;

alter table public.notifications
  add constraint notifications_category_check
  check (category in (
    'order',
    'payment',
    'forwarder',
    'yuan_payment',
    'wallet',
    'sales',
    'system',
    'promo',
    'sales_digest',
    'booking',
    'observability',
    'work_chat'        -- IC-1: @mention + waiting-for notifications
  ));

alter table public.notifications
  drop constraint if exists notifications_reference_type_check;

alter table public.notifications
  add constraint notifications_reference_type_check
  check (reference_type in (
    'service_order',
    'forwarder',
    'yuan_payment',
    'wallet_transaction',
    'sales_commission',
    'sales_payout',
    'contact_message',
    'booking',
    'platform_incident',
    'work_item'        -- IC-1: deep-link from work_chat notifications
  ));

-- ── 5) RLS ────────────────────────────────────────────────────────────
alter table public.work_item_messages         enable row level security;
alter table public.work_item_message_mentions enable row level security;

-- READ: every active admin sees every thread — the org-wide promise.
drop policy if exists work_item_messages_admin_read on public.work_item_messages;
create policy work_item_messages_admin_read
  on public.work_item_messages for select
  using (public.is_admin());

-- WRITE: any active admin may post.  Author MUST equal auth.uid()
-- (defence in depth — the Server Action enforces it too).
drop policy if exists work_item_messages_admin_write on public.work_item_messages;
create policy work_item_messages_admin_write
  on public.work_item_messages for insert
  with check (public.is_admin() and author_admin_id = auth.uid());

-- UPDATE: soft-delete only.  Author may flip deleted_at; super-admin
-- may flip any row's deleted_at.  The Server Action is the real gate;
-- this policy is the floor.
drop policy if exists work_item_messages_soft_delete on public.work_item_messages;
create policy work_item_messages_soft_delete
  on public.work_item_messages for update
  using (
    (author_admin_id = auth.uid() and public.is_admin())
    or public.is_admin(array['super'])
  )
  with check (
    (author_admin_id = auth.uid() and public.is_admin())
    or public.is_admin(array['super'])
  );

-- Mentions: any admin reads (the thread itself is org-wide).
drop policy if exists work_item_message_mentions_admin_read on public.work_item_message_mentions;
create policy work_item_message_mentions_admin_read
  on public.work_item_message_mentions for select
  using (public.is_admin());

-- INSERT: any admin (the Server Action writes these alongside the message).
drop policy if exists work_item_message_mentions_insert on public.work_item_message_mentions;
create policy work_item_message_mentions_insert
  on public.work_item_message_mentions for insert
  with check (public.is_admin());

-- UPDATE: only the mentioned staffer may flip seen_at on their own rows.
drop policy if exists work_item_message_mentions_mark_seen on public.work_item_message_mentions;
create policy work_item_message_mentions_mark_seen
  on public.work_item_message_mentions for update
  using (mentioned_admin_id = auth.uid())
  with check (mentioned_admin_id = auth.uid());

-- ── 6) Comments ───────────────────────────────────────────────────────
comment on table public.work_item_messages is
  'IC-1 — per-job internal chat thread.  One row = one staff message or one machine-generated system event on one work_item.  Append-only (soft-delete via deleted_at).  Design: docs/research/internal-chat-system-2026-05-18.md §2.';

comment on column public.work_item_messages.kind is
  'comment = human message · system = auto event (stage change, assignment, waiting set/cleared) · status_note = human message that ALSO mutates the work_items waiting_for block in the same transaction.';

comment on table public.work_item_message_mentions is
  'IC-1 — @mention fan-out for work_item_messages.  One row per (message, mentioned staff).  Powers the per-staffer "@me" inbox (work_item_message_mentions_inbox_idx) + the per-thread "people mentioned" pill.';

comment on column public.work_items.blocked_on_role is
  'IC-1 — when this job is stuck (waiting_reason IS NOT NULL), which DEPARTMENT must act.  Draws from admins.role vocabulary.  NULL = either not blocked OR blocked on a non-Pacred actor (waiting_reason=external).';
comment on column public.work_items.blocked_on_admin is
  'IC-1 — optional: pin the wait to a specific PERSON (a profiles.id of an admins row).  NULL = the whole blocked_on_role dept owns the unblock.';
comment on column public.work_items.waiting_reason is
  'IC-1 — WHY the job is blocked (8-value vocab per design §3.2).  NULL = not blocked, just moving normally.  A stage change is NOT a wait — only "stuck on a named party for a named thing" sets this.';
