-- ════════════════════════════════════════════════════════════
-- BK-1 · bookings + booking_options + booking_rates + booking_no serial
--        + work_items.entity_type 'booking' + notifications.category 'booking'
-- ════════════════════════════════════════════════════════════
-- Per design doc [docs/research/booking-flow-system-2026-05-18.md] §6.
--
-- The booking flow is a THIN INTAKE LAYER — three new tables that feed the
-- shipped work-board (`0080_work_items`) + the shipped freight_quotes
-- (`0048`) + the shipped notification rails (`0014` / `0024` / `0026`).
-- It does NOT replace any domain table; it adds:
--
--   1. booking_seq         — daily serial counter (mirrors freight_quote_seq)
--   2. bookings            — customer booking submissions (draft → submitted
--                            → contacted → quoted → won/lost/cancelled)
--   3. booking_options     — picked option line-items (labor / tractor /
--                            upgrades) — reconstructs the quotation receipt
--   4. booking_rates       — admin-editable option rate table (kills the
--                            stale-hardcoded-rate pattern; R-5-aligned —
--                            §6.6 + §9-1)
--   5. next_booking_no()   — atomic BKYYMMDD-NNNN serial generator
--   6. RLS                 — guest INSERT-draft only · customer reads own ·
--                            admin full
--
-- Also extends three existing CHECK constraints (idempotent):
--   • work_items.entity_type            ← add 'booking'  (§6.5)
--   • notifications.category            ← add 'booking'  (§6.5)
--   • notifications.reference_type      ← add 'booking'  (§6.5)
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════

-- ── 1) Daily serial counter ───────────────────────────────────────────
create table if not exists public.booking_seq (
  period_yymmdd text primary key,
  next_seq      int  not null default 1,
  updated_at    timestamptz not null default now()
);

-- ── 2) bookings — header ──────────────────────────────────────────────
create table if not exists public.bookings (
  id              uuid primary key default gen_random_uuid(),
  booking_no      text unique,                              -- BKYYMMDD-NNNN

  status          text not null default 'draft'
                    check (status in (
                      'draft',       -- created pre-auth-gate, not yet submitted
                      'submitted',   -- customer confirmed → now a job
                      'contacted',   -- rep reached the customer
                      'quoted',      -- Pricing formalised a freight_quote
                      'won',         -- converted to an order/shipment
                      'lost',        -- customer declined / went cold
                      'cancelled'    -- customer cancelled
                    )),

  -- ── Service + route ──
  service_slug    text not null check (char_length(service_slug) between 1 and 64),
  route_slug      text check (route_slug is null or char_length(route_slug) between 1 and 64),
  transport_mode  text check (transport_mode is null or transport_mode in (
                    'sea_lcl','sea_fcl','truck','air','sourcing','customs','remit'
                  )),

  -- ── Customer pointer ──
  -- NULL only while status='draft' (a guest's pre-gate draft).  A submit
  -- MUST bind profile_id (enforced by bookings_submitted_has_profile below).
  profile_id      uuid references public.profiles(id) on delete restrict,
  contact_name    text,                                     -- snapshot — editable on review
  contact_phone   text,
  contact_line    text,
  customer_note   text,

  -- ── Document-handling posture (§4.3 selector #5) ──
  doc_mode        text not null default 'none'
                    check (doc_mode in ('none','tax_invoice','customs_declaration')),

  -- ── Pin pickup / drop-off (§4.3 selector #3) ──
  pickup_lat      numeric(9,6),
  pickup_lng      numeric(9,6),
  pickup_address  text,
  dropoff_lat     numeric(9,6),
  dropoff_lng     numeric(9,6),
  dropoff_address text,

  -- ── Estimate SNAPSHOT — frozen on submit (audit trail) ──
  -- estimate_breakdown is the QuoteLine[] as JSONB — the itemised receipt
  -- the customer saw. estimate_total = Σ rows.amount.  is_estimate stays
  -- true because the real price is rep-confirmed (§4.7 estimate-honesty
  -- rule).  Pricing's later freight_quote carries the real number.
  estimate_total      numeric(12,2) not null default 0
                        check (estimate_total >= 0 and estimate_total <= 9999999.99),
  estimate_breakdown  jsonb        not null default '[]'::jsonb,
  is_estimate         boolean      not null default true,

  -- ── Lead provenance (feeds R-3 lead-inbox) ──
  source_channel  text,            -- 'home_calculator'|'customs_landing'|'services'|…
  source_url      text,

  -- ── R-5 hand-off — once Pricing formalises a quote ──
  freight_quote_id uuid references public.freight_quotes(id) on delete set null,

  -- ── Lifecycle stamps ──
  submitted_at    timestamptz,
  contacted_at    timestamptz,
  closed_at       timestamptz,                              -- set on won/lost/cancelled
  closed_reason   text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- ── Integrity constraints ──
  -- A submitted (or later) booking MUST carry a profile_id + submitted_at.
  constraint bookings_submitted_has_profile check (
    status = 'draft'
    or (profile_id is not null and submitted_at is not null)
  ),
  -- A closed (won/lost/cancelled) booking MUST stamp closed_at.
  constraint bookings_closed_has_stamp check (
    status not in ('won','lost','cancelled')
    or closed_at is not null
  ),
  -- A quoted booking MUST link to the freight_quote it became.
  constraint bookings_quoted_has_quote check (
    status <> 'quoted'
    or freight_quote_id is not null
  )
);

-- Indexes -------------------------------------------------------------
-- Sales-desk list: open work, newest first.
create index if not exists bookings_status_created_idx
  on public.bookings(status, created_at desc);
-- Customer portal /bookings.
create index if not exists bookings_profile_status_idx
  on public.bookings(profile_id, status) where profile_id is not null;
-- Per-service filtering for the desk.
create index if not exists bookings_service_status_idx
  on public.bookings(service_slug, status, created_at desc);
-- Reverse lookup by booking_no.
create index if not exists bookings_booking_no_idx
  on public.bookings(booking_no) where booking_no is not null;

-- updated_at auto-touch -----------------------------------------------
drop trigger if exists bookings_updated_at_trigger on public.bookings;
create trigger bookings_updated_at_trigger
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- ── 3) booking_options — picked option line-items ─────────────────────
-- Mirrors freight_quote_items: a line-item child of a header.  Lets the
-- quotation receipt be reconstructed + the rep see exactly what the
-- customer chose.
create table if not exists public.booking_options (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  position     smallint not null default 1,
  option_key   text not null check (char_length(option_key) between 1 and 64),
  option_label text not null check (char_length(option_label) between 1 and 200),
  detail       text,                                         -- '×2 คน' | 'หัวลาก 10 ล้อ'
  quantity     numeric(8,2) not null default 1
                  check (quantity > 0 and quantity <= 999.99),
  unit_amount  numeric(12,2) not null default 0
                  check (unit_amount >= 0 and unit_amount <= 999999.99),
  line_amount  numeric(12,2) not null default 0
                  check (line_amount >= 0 and line_amount <= 9999999.99),
  created_at   timestamptz not null default now()
);

create index if not exists booking_options_booking_idx
  on public.booking_options(booking_id);
create unique index if not exists booking_options_booking_position_uidx
  on public.booking_options(booking_id, position);

-- ── 4) booking_rates — admin-editable option rate table ───────────────
-- Kills the stale-hardcoded-rate pattern (§6.6 / R-5 alignment).  The
-- booking detail page reads this table for option pricing; the base
-- service price still comes from the shipped calc* functions in BK-1.
create table if not exists public.booking_rates (
  id           uuid primary key default gen_random_uuid(),
  scope        text not null check (scope in ('labor','tractor','doc','upgrade')),
  rate_key     text not null check (char_length(rate_key) between 1 and 64),
  service_slug text,                                         -- NULL = applies to all services
  label_th     text not null check (char_length(label_th) between 1 and 120),
  label_en     text not null check (char_length(label_en) between 1 and 120),
  unit_amount  numeric(12,2) not null check (unit_amount >= 0 and unit_amount <= 999999.99),
  active       boolean not null default true,
  valid_from   date,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One active rate per (scope, rate_key, service_slug) at a time.  service_slug
-- NULL = the catch-all default; a service-specific row overrides it in app code.
create unique index if not exists booking_rates_unique_active_idx
  on public.booking_rates(scope, rate_key, coalesce(service_slug, ''))
  where active;

create index if not exists booking_rates_scope_active_idx
  on public.booking_rates(scope, active) where active;

drop trigger if exists booking_rates_updated_at_trigger on public.booking_rates;
create trigger booking_rates_updated_at_trigger
  before update on public.booking_rates
  for each row execute function public.set_updated_at();

-- ── 5) next_booking_no() — atomic serial ──────────────────────────────
-- BKYYMMDD-NNNN with daily reset (Bangkok TZ).  Mirrors next_freight_quote_no.
create or replace function public.next_booking_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yymmdd text := to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD');
  seq    int;
begin
  insert into public.booking_seq (period_yymmdd, next_seq)
    values (yymmdd, 2)
    on conflict (period_yymmdd) do update
      set next_seq   = booking_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'BK' || yymmdd || '-' || lpad(seq::text, 4, '0');
end;
$$;

revoke all     on function public.next_booking_no() from public, authenticated, anon;
grant  execute on function public.next_booking_no() to service_role;

-- ── 6) RLS ────────────────────────────────────────────────────────────
alter table public.bookings        enable row level security;
alter table public.booking_options enable row level security;
alter table public.booking_rates   enable row level security;
alter table public.booking_seq     enable row level security;

-- ── 6.1) bookings policies ──
-- Anon (guest) — INSERT-draft only.  No select.  The selection survives the
-- auth-gate round-trip via an opaque ?draft=<id> token the app hands back.
-- A draft carries no PII (the guest has not registered yet).  The app-layer
-- action (actions/bookings.ts:createDraftBooking) is the real guard; RLS
-- here is the floor — anon cannot escalate status, cannot select, cannot
-- update.  Scoped hard.
drop policy if exists bookings_anon_insert_draft on public.bookings;
create policy bookings_anon_insert_draft
  on public.bookings for insert
  to anon
  with check (status = 'draft' and profile_id is null);

-- Customer — read own (any status).
drop policy if exists bookings_customer_read on public.bookings;
create policy bookings_customer_read
  on public.bookings for select
  to authenticated
  using (profile_id = auth.uid());

-- Customer — INSERT a draft (logged-in path).  profile_id pinned to self.
drop policy if exists bookings_customer_insert_draft on public.bookings;
create policy bookings_customer_insert_draft
  on public.bookings for insert
  to authenticated
  with check (
    status = 'draft'
    and (profile_id is null or profile_id = auth.uid())
  );

-- Customer — UPDATE own draft (review-step edits) + own draft → submitted.
-- Cannot mutate status away from draft/submitted, cannot reassign profile_id.
-- App layer enforces the draft → submitted transition via submitBooking()
-- (which also spawns the work_item — the RLS floor only allows the move).
drop policy if exists bookings_customer_update_own on public.bookings;
create policy bookings_customer_update_own
  on public.bookings for update
  to authenticated
  using (profile_id = auth.uid() and status in ('draft','submitted'))
  with check (
    profile_id = auth.uid()
    and status in ('draft','submitted')
  );

-- Admin — full read.
drop policy if exists bookings_admin_read on public.bookings;
create policy bookings_admin_read
  on public.bookings for select
  using (public.is_admin(array['super','ops','sales_admin','accounting']));

-- Admin — full write (app layer enforces per-status workflow).
drop policy if exists bookings_admin_write on public.bookings;
create policy bookings_admin_write
  on public.bookings for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- ── 6.2) booking_options policies — inherit visibility from parent ──
-- Anon — INSERT children of own draft (carries the option selections).
drop policy if exists booking_options_anon_insert on public.booking_options;
create policy booking_options_anon_insert
  on public.booking_options for insert
  to anon
  with check (
    exists (
      select 1 from public.bookings b
       where b.id = booking_options.booking_id
         and b.status = 'draft'
         and b.profile_id is null
    )
  );

-- Customer — read children of own booking.
drop policy if exists booking_options_customer_read on public.booking_options;
create policy booking_options_customer_read
  on public.booking_options for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
       where b.id = booking_options.booking_id
         and b.profile_id = auth.uid()
    )
  );

-- Customer — INSERT children of own draft.
drop policy if exists booking_options_customer_insert on public.booking_options;
create policy booking_options_customer_insert
  on public.booking_options for insert
  to authenticated
  with check (
    exists (
      select 1 from public.bookings b
       where b.id = booking_options.booking_id
         and b.profile_id = auth.uid()
         and b.status = 'draft'
    )
  );

-- Customer — DELETE children of own draft (re-pick options on review step).
drop policy if exists booking_options_customer_delete on public.booking_options;
create policy booking_options_customer_delete
  on public.booking_options for delete
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
       where b.id = booking_options.booking_id
         and b.profile_id = auth.uid()
         and b.status = 'draft'
    )
  );

-- Admin — full.
drop policy if exists booking_options_admin_all on public.booking_options;
create policy booking_options_admin_all
  on public.booking_options for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- ── 6.3) booking_rates policies — public READ (the page reads it), admin write ──
-- The booking detail page is public + needs to read option rates to render the
-- quotation panel.  Rates are non-sensitive (Pacred publishes them on landing
-- pages already).  Admin-only writes.
drop policy if exists booking_rates_public_read on public.booking_rates;
create policy booking_rates_public_read
  on public.booking_rates for select
  using (active = true);

drop policy if exists booking_rates_admin_all on public.booking_rates;
create policy booking_rates_admin_all
  on public.booking_rates for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- ── 6.4) booking_seq — admin-only (generator fn bypasses via security definer) ──
drop policy if exists booking_seq_admin_all on public.booking_seq;
create policy booking_seq_admin_all
  on public.booking_seq for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- ── 7) Extend work_items.entity_type CHECK to add 'booking' ───────────
-- The submitted booking spawns a work_item via ensure_work_item() with
-- entity_type='booking', entity_ref=booking_no.  See §6.5 step 2.
alter table public.work_items
  drop constraint if exists work_items_entity_type_check;

alter table public.work_items
  add constraint work_items_entity_type_check
  check (entity_type in (
    'forwarder',
    'service_order',
    'cargo_container',
    'cargo_shipment',
    'freight_shipment',
    'customs_declaration',
    'freight_invoice',
    'contact_message',
    'refund_request',
    'qa_inspection',
    'booking'
  ));

-- ── 8) Extend notifications.category + reference_type CHECK to add 'booking' ──
-- §6.5 step 4 — sendNotification('booking', …) on submit (admin + customer).
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
    'booking'
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
    'booking'
  ));

-- ── 9) Seed booking_rates — today's hardcoded numbers, in DB ──────────
-- Per §6.6 the booking flow ships seeded with the existing operation's
-- rate sheet so the page renders the same price the legacy operation
-- charges.  Admin can edit these via /admin/booking-rates later.  The
-- on conflict DO NOTHING keeps the seed idempotent — re-running the
-- migration does not overwrite admin edits.
insert into public.booking_rates (scope, rate_key, service_slug, label_th, label_en, unit_amount, active)
values
  -- labor (per worker, per job)
  ('labor', 'worker', null, 'ค่าแรงงาน',                'Labor (per worker)',     600, true),
  ('labor', 'heavy_lift', null, 'ค่ายกของหนัก (เพิ่ม)',  'Heavy-lift surcharge',   400, true),

  -- tractor classes (per job)
  ('tractor', 'truck_4w', null, 'หัวลาก 4 ล้อ',         'Tractor — 4-wheel',    1500, true),
  ('tractor', 'truck_6w', null, 'หัวลาก 6 ล้อ',         'Tractor — 6-wheel',    2500, true),
  ('tractor', 'truck_10w', null, 'หัวลาก 10 ล้อ',       'Tractor — 10-wheel',   3500, true),
  ('tractor', 'trailer', null, 'เทรลเลอร์',             'Trailer',               5500, true),

  -- document handling
  ('doc', 'tax_invoice', null, 'ออกใบกำกับภาษี',         'Issue tax invoice',     600, true),
  ('doc', 'customs_declaration', null, 'ออกใบขนสินค้า',  'Customs declaration',  1800, true),

  -- upgrade plans
  ('upgrade', 'insurance', null, 'ประกันสินค้า',         'Cargo insurance',       500, true),
  ('upgrade', 'door_to_door', null, 'Door-to-door',      'Door-to-door upgrade', 1200, true),
  ('upgrade', 'fumigation', null, 'ฟูมิเกชัน',           'Fumigation',           1500, true),
  ('upgrade', 'priority', null, 'Priority handling',     'Priority handling',     800, true)
on conflict do nothing;

-- ── 10) Comments ──────────────────────────────────────────────────────
comment on table public.bookings is
  'BK-1 — customer booking submissions (a thin intake layer that feeds the work-board + Sales/Pricing desks; design: docs/research/booking-flow-system-2026-05-18.md). Status: draft → submitted → contacted → quoted → won/lost/cancelled. A booking ≠ a quote; a booking SEEDS a quote (freight_quote_id links once Pricing formalises one — §6.4).';
comment on column public.bookings.booking_no is
  'Format BKYYMMDD-NNNN. Reserved at submit time via next_booking_no() (drafts have null booking_no — never shown to the customer).';
comment on column public.bookings.status is
  'draft (pre-gate, anon-insertable) | submitted (job spawned, customer-visible) | contacted (rep reached) | quoted (Pricing made a freight_quote) | won (converted) | lost (declined) | cancelled (customer cancelled). App-layer enforces the legal transitions.';
comment on column public.bookings.estimate_breakdown is
  'QuoteLine[] as JSONB — the itemised receipt the customer saw at submit time. Frozen audit snapshot; the real number lives on the linked freight_quote later.';
comment on column public.bookings.is_estimate is
  'Always true — Pacred booking prices are estimates rep-confirmed later (§4.7 estimate-honesty rule). Kept as a column so a future "binding-price" booking variant can be modelled by flipping it false on that subset.';
comment on column public.bookings.profile_id is
  'NULL only while status=draft (guest pre-gate). The submit transition (submitBooking server action) binds it. Enforced by bookings_submitted_has_profile constraint.';

comment on table public.booking_options is
  'BK-1 — per-booking option line-items (labor / tractor / upgrades / doc-handling). Mirrors freight_quote_items shape. Quote receipt = SELECT … FROM booking_options WHERE booking_id = $1 ORDER BY position.';

comment on table public.booking_rates is
  'BK-1 — admin-editable option rate table (R-5 quote_rates pattern; §6.6). Public READ (the booking page consumes it), admin WRITE. When R-5 lands its quote_rates table they will be unified per §9-1.';

comment on function public.next_booking_no is
  'BK-1 — atomic BKYYMMDD-NNNN serial generator with daily counter reset (Bangkok TZ). Concurrent calls serialise on the upsert lock. service_role only.';

comment on constraint bookings_submitted_has_profile on public.bookings is
  'A submitted (or later) booking MUST carry a profile_id + submitted_at. Drafts may be anon (profile_id null) — the carry mechanism (§5.4).';
comment on constraint bookings_closed_has_stamp on public.bookings is
  'A won/lost/cancelled booking MUST stamp closed_at (audit completeness — ADR-0014 pattern).';
comment on constraint bookings_quoted_has_quote on public.bookings is
  'A quoted booking MUST link freight_quote_id — the R-5 seam materialised.';
