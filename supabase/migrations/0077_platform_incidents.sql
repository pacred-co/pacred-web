-- ════════════════════════════════════════════════════════════
-- 0077 · platform_incidents — IO-1 auto-incident capture + triage
-- ════════════════════════════════════════════════════════════
-- Source: docs/research/platform-observability-system-2026-05-18.md
--         §6 — Stage 1 (MVP / IO-1).
--
-- Migration number: 0077 is a เดฟ-RESERVED slot for the observability
-- system — ภูม owns 0073-0076 (delivery-ack / yuan-refund-slip /
-- impersonation / business-config) + 0078+. Do NOT renumber.
--
-- ── THE HOLE (§2.8 of the design doc) ───────────────────────
-- There is no React error boundary anywhere in app/, and no Pacred-
-- owned store that *collects* errors with a visible lifecycle status.
-- A client render error today shows the un-branded default Next.js
-- screen and is captured nowhere Pacred can query. The owner's ask —
-- "เจอบั๊กส่งเลย ไม่มีปุ่มส่ง · เห็นสถานะว่าส่งเรื่องแล้ว / กำลัง
-- ดำเนินการ" — needs an incident row that auto-captures (no button)
-- and carries an open→acknowledged→in_progress→resolved/ignored
-- lifecycle the user can see.
--
-- ── THE FIX (§6.2 — platform_incidents) ─────────────────────
-- ONE table. The capture rails (global-error.tsx boundary, the
-- Server-Action error wrapper, the Sentry webhook) all upsert here,
-- deduped by `fingerprint` — the SAME error fires N times → ONE row,
-- `occurrence_count` increments. Triage advances `status` through a
-- whitelisted lifecycle; the user who hit it sees that status.
--
-- It is a SEPARATE table from work_items (0080) — design doc §2.7:
-- an incident is auto-created (no human / no domain row), needs a
-- fingerprint + occurrence_count, has 'ignored' + 'acknowledged'
-- states work_items lacks, and its status is visible to the customer.
-- A triaged incident MAY spawn a work_item — work_item_id is the
-- optional bridge FK.
--
-- ── RLS (follows the 0062 role-pin keystone + 0080 posture) ──
-- Two audiences, two policy families — EXPLICIT is_admin(array[...])
-- role arrays, never bare is_admin() (the 0062 S-1 fix):
--   admin SELECT → super + every office/operational role can READ
--                  the triage queue (the owner/ก๊อต must see it).
--   customer SELECT → a signed-in user reads ONLY rows whose
--                  actor_ref matches their own redacted id — the
--                  "ปัญหาที่ฉันแจ้ง" panel. RLS is NARROWING: a
--                  customer sees fewer rows, never company data.
--   WRITE → no table-level write policy. Every insert/upsert/triage
--           write goes through the service-role admin client from a
--           requireAdmin-gated Server Action or an API route — the
--           same tight-surface discipline 0080 + 0062 use.
--
-- Idempotent + additive: create-if-not-exists, drop-if-exists on every
-- policy/trigger, the notifications CHECK swap is guarded. Zero data
-- migration. Adds no grants on existing tables. Safe on prod live.
-- ════════════════════════════════════════════════════════════

-- ── 1) platform_incidents ───────────────────────────────────────────
create table if not exists public.platform_incidents (
  id                 uuid primary key default gen_random_uuid(),

  -- ── Dedup key ──
  -- A stable hash of (kind, normalised message, route) computed by the
  -- ingest route (lib/observability/fingerprint.ts). The SAME error
  -- fires N times → ONE incident; occurrence_count increments. The
  -- partial-unique index below keeps exactly one *live* incident per
  -- fingerprint (resolved/ignored rows are excluded so a recurrence
  -- after a fix opens a fresh incident).
  fingerprint        text not null check (char_length(fingerprint) between 1 and 128),

  -- ── Which surface emitted it ──
  -- public  = the marketing site (no auth)
  -- portal  = the customer portal
  -- admin   = the back-office
  -- partner = a partner webhook (e.g. Sentry, MOMO)
  -- server  = a server-side / route-handler / cron error
  source             text not null check (source in (
                       'public','portal','admin','partner','server'
                     )),

  -- ── Error kind ──
  kind               text not null check (kind in (
                       'js_error',      -- client-side render / runtime error
                       'server_error',  -- a thrown server / route-handler error
                       'failed_action', -- a Server Action threw (withObservability)
                       'api_error'      -- a non-2xx from an API / partner call
                     )),

  -- ── Triage severity ──
  -- Set by an ingest-time rule (a money-path route → 'high'; a server
  -- 500 → 'high'; everything else → 'medium' default). 'critical' is
  -- reserved for the alert engine / manual escalation.
  severity           text not null default 'medium' check (severity in (
                       'low','medium','high','critical'
                     )),

  -- ── The lifecycle the owner asked for ──
  -- open         → captured, not yet triaged ("ส่งเรื่องแล้ว")
  -- acknowledged → a dev owns it            ("กำลังดำเนินการ")
  -- in_progress  → a fix is being worked    ("กำลังดำเนินการ")
  -- resolved     → fixed, resolution_note set ("แก้ไขแล้ว")
  -- ignored      → not a real bug — silently closed (not surfaced)
  status             text not null default 'open' check (status in (
                       'open','acknowledged','in_progress','resolved','ignored'
                     )),

  -- ── Human-facing fields ──
  title              text not null check (char_length(title) between 1 and 200),
  message            text not null check (char_length(message) between 1 and 4000),
  stack              text,                       -- PII-stripped; nullable
  route              text,                       -- the path it happened on

  -- ── Context — a small bag. NO cookies, NO auth headers, NO raw PII. ──
  -- browser/OS for js_error · action-name for failed_action · HTTP
  -- status for api_error. The capture rails strip cookies/auth headers
  -- (the sentry.*.config.ts beforeSend pattern).
  surface_meta       jsonb,

  -- ── Actor context — a ROLE + a REDACTED id, never an identity ──
  -- actor_role: 'customer' | an admins.role | 'partner' | 'anon'.
  -- actor_ref:  redactId(uid) — lets triage correlate "same user, 3
  --             incidents" and powers the customer "ปัญหาที่ฉันแจ้ง"
  --             RLS policy, WITHOUT storing who the user is.
  actor_role         text check (actor_role is null or actor_role in (
                       'customer','anon','partner',
                       'super','ops','accounting','sales_admin',
                       'warehouse','driver','interpreter'
                     )),
  actor_ref          text check (actor_ref is null or char_length(actor_ref) between 1 and 64),

  -- ── Dedup counters ──
  occurrence_count   int not null default 1 check (occurrence_count >= 1),
  first_seen         timestamptz not null default now(),
  last_seen          timestamptz not null default now(),

  -- ── Triage assignment + lifecycle stamps ──
  assigned_to        uuid references public.profiles(id) on delete set null,
  acknowledged_at    timestamptz,
  resolved_at        timestamptz,
  resolution_note    text check (resolution_note is null or char_length(resolution_note) between 1 and 2000),

  -- ── Bridge to a fix job (design doc §2.7) ──
  work_item_id       uuid references public.work_items(id) on delete set null,

  -- ── Deep-link to the Sentry issue, when the row came via the webhook ──
  sentry_issue_url   text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- ── Consistency CHECKs (fail-closed — the work_items / refund_requests
  --    posture). A resolved incident MUST carry its resolution. Any
  --    triaged incident (acknowledged and beyond) MUST carry an assignee
  --    + an acknowledged_at. last_seen never precedes first_seen. ──
  constraint platform_incidents_resolved_consistent check (
    status <> 'resolved'
    or (resolved_at is not null and resolution_note is not null)
  ),
  constraint platform_incidents_triaged_consistent check (
    status not in ('acknowledged','in_progress','resolved')
    or (acknowledged_at is not null and assigned_to is not null)
  ),
  constraint platform_incidents_seen_order check (
    last_seen >= first_seen
  )
);

-- ── 2) Indexes ──────────────────────────────────────────────────────
-- The triage queue's primary query — live incidents, newest re-fire first.
create index if not exists platform_incidents_status_seen_idx
  on public.platform_incidents(status, last_seen desc);

-- Dedup — exactly ONE live incident per fingerprint. resolved/ignored
-- rows are excluded so a recurrence after a fix opens a fresh incident.
create unique index if not exists platform_incidents_fingerprint_live_idx
  on public.platform_incidents(fingerprint)
  where status not in ('resolved','ignored');

-- Filtering the queue by surface / kind.
create index if not exists platform_incidents_source_kind_idx
  on public.platform_incidents(source, kind);

-- Per-user correlation + the customer "issues I hit" panel query.
create index if not exists platform_incidents_actor_idx
  on public.platform_incidents(actor_ref, last_seen desc)
  where actor_ref is not null;

-- The seed-alert scan — new open high-severity incidents.
create index if not exists platform_incidents_alert_idx
  on public.platform_incidents(severity, status)
  where status = 'open';

-- ── 3) updated_at auto-touch ────────────────────────────────────────
-- public.set_updated_at() is defined in the early migrations — reuse it
-- (orders / wallet / refund_requests / work_items all do).
drop trigger if exists platform_incidents_updated_at_trigger on public.platform_incidents;
create trigger platform_incidents_updated_at_trigger
  before update on public.platform_incidents
  for each row execute function public.set_updated_at();

-- ── 4) RLS ──────────────────────────────────────────────────────────
alter table public.platform_incidents enable row level security;

-- SELECT (admin) — every office + operational + supervisory admin role
-- can READ the triage queue. Cross-role visibility is intentional: the
-- owner / ก๊อต (super) and every department head must be able to see
-- platform health. WRITES are NOT granted here (service-role only).
-- EXPLICIT role array — never bare is_admin() (the 0062 S-1 fix).
drop policy if exists "platform_incidents_admin_select" on public.platform_incidents;
create policy "platform_incidents_admin_select" on public.platform_incidents
  for select
  using (public.is_admin(array[
    'super','ops','accounting','sales_admin','warehouse','driver','interpreter'
  ]));

-- SELECT (customer) — a signed-in user reads ONLY incidents whose
-- actor_ref equals the redacted form of their own auth uid. This powers
-- the "ปัญหาที่ฉันแจ้ง" panel (design doc §6.6) — the user sees the
-- lifecycle status of issues THEY hit, and nothing else. RLS is
-- NARROWING: a customer sees fewer rows, never company aggregates,
-- never another customer's incidents.
--
-- actor_ref is stored as redactId(uid) = left(uid, 8) || '-***'. The
-- predicate reconstructs that form from auth.uid() so the comparison
-- is exact. A NULL actor_ref row (anonymous capture) never matches.
drop policy if exists "platform_incidents_owner_select" on public.platform_incidents;
create policy "platform_incidents_owner_select" on public.platform_incidents
  for select
  using (
    actor_ref is not null
    and auth.uid() is not null
    and actor_ref = left(auth.uid()::text, 8) || '-***'
  );

-- No INSERT / UPDATE / DELETE policy — every write goes through the
-- service-role admin client from a requireAdmin-gated Server Action
-- (actions/admin/incidents.ts) or an API route (the ingest + the
-- Sentry webhook). Keeping the direct PostgREST write surface empty
-- means a low-trust anon/customer JWT cannot forge or rewrite an
-- incident — the same exploit class 0062 + 0080 close.

-- ── 5) notifications.category — add 'observability' ─────────────────
-- IO-1.2 (design doc §6.7) — the seed alert fires sendNotification()
-- with category='observability'. The 0014 CHECK constraint does not
-- include it. Swap the constraint to the canonical category set
-- (the 0014 base + 'sales_digest' which a later migration added +
-- the new 'observability'). Guarded so it is idempotent.
do $$
begin
  alter table public.notifications
    drop constraint if exists notifications_category_check;
  alter table public.notifications
    add constraint notifications_category_check
    check (category in (
      'order','payment','forwarder','yuan_payment',
      'wallet','sales','system','promo','sales_digest',
      'observability'
    ));
exception
  when others then
    raise warning '0077 — notifications.category CHECK swap skipped: %', sqlerrm;
end$$;

-- notifications.reference_type — add 'platform_incident' so the alert
-- notification can deep-link back to the incident detail page. Same
-- guarded swap; the canonical reference-type set + the new value.
do $$
begin
  alter table public.notifications
    drop constraint if exists notifications_reference_type_check;
  alter table public.notifications
    add constraint notifications_reference_type_check
    check (reference_type is null or reference_type in (
      'service_order','forwarder','yuan_payment',
      'wallet_transaction','sales_commission','sales_payout',
      'contact_message','platform_incident'
    ));
exception
  when others then
    raise warning '0077 — notifications.reference_type CHECK swap skipped: %', sqlerrm;
end$$;

-- ── 6) work_items.entity_type — add 'platform_incident' ─────────────
-- IO-1.7 / design doc §2.7 — a triaged incident MAY spawn a fix
-- work_item, linked via platform_incidents.work_item_id. An incident
-- has no domain row, so the work_item points back at the incident
-- itself: entity_type='platform_incident', entity_ref = the incident
-- id. The 0080 work_items.entity_type CHECK does not yet allow that
-- value — extend it (additive: every existing value is kept). Guarded
-- so it is idempotent + a no-op if 0080 has not been applied yet.
do $$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'work_items'
  ) then
    alter table public.work_items
      drop constraint if exists work_items_entity_type_check;
    alter table public.work_items
      add constraint work_items_entity_type_check
      check (entity_type in (
        'forwarder','service_order','cargo_container','cargo_shipment',
        'freight_shipment','customs_declaration','freight_invoice',
        'contact_message','refund_request','qa_inspection',
        'platform_incident'
      ));
    raise notice '0077 — work_items.entity_type CHECK extended with platform_incident';
  else
    raise notice '0077 — work_items not present yet; entity_type CHECK extend skipped (re-run after 0080)';
  end if;
exception
  when others then
    raise warning '0077 — work_items.entity_type CHECK swap skipped: %', sqlerrm;
end$$;

-- ── 7) Comments ─────────────────────────────────────────────────────
comment on table public.platform_incidents is
  '0077 / IO-1 — auto-captured platform error incidents with a visible triage lifecycle (platform-observability-system-2026-05-18.md §6). Capture rails (global-error.tsx, the Server-Action wrapper, the Sentry webhook) upsert here, deduped by fingerprint. A SEPARATE table from work_items (§2.7): auto-created, fingerprinted, customer-visible status. A triaged incident MAY bridge to a work_item via work_item_id.';
comment on column public.platform_incidents.fingerprint is
  'Stable dedup hash of (kind, normalised message, route). N hits of the same error → ONE row; occurrence_count increments. The platform_incidents_fingerprint_live_idx partial-unique index keeps one live incident per fingerprint.';
comment on column public.platform_incidents.source is
  'Which surface emitted the error — public | portal | admin | partner | server.';
comment on column public.platform_incidents.kind is
  'js_error (client) | server_error (thrown server-side) | failed_action (a Server Action threw) | api_error (a non-2xx partner/API call).';
comment on column public.platform_incidents.status is
  'The owner-asked lifecycle — open → acknowledged → in_progress → resolved | ignored. Transitions whitelisted in actions/admin/incidents.ts with an optimistic .eq(status, expectedFrom) race-guard. The status is visible to the user who hit the error.';
comment on column public.platform_incidents.actor_role is
  'The ROLE of whoever hit it — customer | anon | partner | an admins.role. A role, never an identity (design doc §3.4).';
comment on column public.platform_incidents.actor_ref is
  'A REDACTED user id — redactId(uid) = left(uid,8) || ''-***''. Lets triage correlate same-user incidents + powers the customer owner-select RLS policy, without storing who the user is.';
comment on column public.platform_incidents.surface_meta is
  'Small event-specific bag — browser/OS / action-name / HTTP status. NO cookies, NO auth headers, NO raw PII (the sentry beforeSend posture).';
comment on column public.platform_incidents.work_item_id is
  'Optional bridge to a fix job — set when triage spawns a work_item (design doc §2.7). Incident = "something broke + its triage status"; work_item = "a human must do the fix".';
comment on constraint platform_incidents_resolved_consistent on public.platform_incidents is
  'A resolved incident MUST carry resolved_at + resolution_note — audit completeness (mirrors the refund_requests / work_items *_consistent constraints).';
comment on constraint platform_incidents_triaged_consistent on public.platform_incidents is
  'An acknowledged / in_progress / resolved incident MUST carry acknowledged_at + assigned_to — a triaged incident always has an owner.';

-- ── 8) Verify (counts) ──────────────────────────────────────────────
do $$
declare
  rls_count int;
  idx_count int;
begin
  select count(*) into rls_count
    from pg_policies
   where schemaname = 'public' and tablename = 'platform_incidents';
  if rls_count < 2 then
    raise warning '0077 platform_incidents RLS expected >= 2 policies, found %', rls_count;
  else
    raise notice '0077 platform_incidents ready — % RLS policies installed', rls_count;
  end if;

  select count(*) into idx_count
    from pg_indexes
   where schemaname = 'public' and tablename = 'platform_incidents';
  raise notice '0077 platform_incidents — % indexes installed', idx_count;
end $$;
