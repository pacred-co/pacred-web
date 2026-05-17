-- ════════════════════════════════════════════════════════════
-- V-E8 + V-H1 + V-H2 · commission_tiers + commission_accruals
--                     + commission_withdrawals
--                     + commission_withdrawal_items
--                     + admins.role enum extension ('interpreter')
-- ════════════════════════════════════════════════════════════
-- Per port-spec docs/port-specs/commission-withdrawal.md (locked
-- 2026-05-16 night) + ADR-0015 Q3 + Phase I2 RBAC ack 2026-05-17.
--
-- ONE unified commission ledger serves both legacy PHP commission flows:
--   1. Interpreter (ล่ามจีน)  — per-job, per-order commission
--      Legacy PHP: pcs-admin/include/pages/withdraw-commission-interpreter/
--   2. Sales rep              — direct sales margin per closed order
--      Legacy PHP: pcs-admin/include/pages/withdraw-commission-sale/
--
-- This is DISTINCT from the team-leader referral commission flow in
-- 0013_sales_referral.sql (team_leaders + sales_commissions + sales_payouts).
-- That ledger pays GROUP leaders a % of their team's orders. THIS ledger
-- pays the individual staff member who closed/handled the order. Both
-- coexist long-term (different business policies, different RLS, different
-- legacy PHP pages).
--
-- Common workflow (mirrors legacy PHP withdraw-commission-* flow):
--   accrual  (system mints per closed order)
--     → request (staff bundles N accruals into a withdrawal, picks payee bank)
--     → approve (super/accounting reviews; pending → approved)
--     → paid    (super/accounting transfers + uploads slip; approved → paid)
--   rejected branch: pending → rejected (with reason)
--
-- Thai law WHT 15% on payouts > 5,000 THB (Revenue Code §50(1)) — column
-- exists + constraint enforces consistency, but UI wiring is deferred to
-- V1.1 per the V1 scope.
--
-- This migration introduces:
--   1. admins.role enum extended: + 'interpreter'   (3-line drop+add check)
--   2. commission_tiers             — per-role/per-service rate lookup
--   3. commission_accruals          — earned-but-unpaid per closed order
--   4. commission_withdrawal_seq    — daily serial for CW-{YYMM}-{seq}
--   5. commission_withdrawals       — withdrawal request header
--   6. commission_withdrawal_items  — accruals ← withdrawal join
--   7. next_commission_withdrawal_no() — atomic serial generator
--   8. RLS: customer reads NOTHING (commission is staff-only); staff
--           reads own; super/accounting full r/w.
--   9. Storage bucket 'commission-slips' (private, super+accounting only V1)
--  10. Comments
--
-- Idempotent throughout (`if not exists`, `drop ... if exists` first).
-- ════════════════════════════════════════════════════════════

-- 1) Extend admins.role with 'interpreter' --------------------------
-- Existing values (per 0033): super, ops, accounting, sales_admin,
-- warehouse, driver. ADR-0015 Q3 + Phase I2 RBAC ack 2026-05-17 add
-- 'interpreter' — legacy ล่ามจีน staff get own commission portal +
-- own accrual visibility (RLS-scoped to earner_admin_id = auth.uid()).
alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins add  constraint admins_role_check
  check (role in (
    'super','ops','accounting','sales_admin','warehouse','driver','interpreter'
  ));

-- 2) commission_tiers ----------------------------------------------
-- Per-role/per-service rate lookup. Snapshot at accrual time
-- (commission_accruals.tier_id) freezes the historical rate so past
-- accruals don't get re-rated when tiers change.
create table if not exists public.commission_tiers (
  id                uuid primary key default gen_random_uuid(),
  role_kind         text not null
                      check (role_kind in ('interpreter','sales_rep')),
  service_kind      text not null
                      check (service_kind in (
                        'service_order',   -- China shop (orders)
                        'forwarder',       -- cargo import
                        'freight_quote'    -- international freight conversion
                      )),
  tier_name         text not null,                                  -- e.g. "interpreter standard rate"
  rate_pct          numeric(6,3),                                   -- e.g. 1.500 = 1.5%
  flat_thb          numeric(12,2),                                  -- OR a flat per-job amount
  min_base_thb      numeric(12,2),                                  -- min order value to qualify
  effective_from    date not null default current_date,
  effective_to      date,
  is_active         boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint commission_tiers_rate_xor_flat check (
    (rate_pct is not null and flat_thb is null)
    or (rate_pct is null and flat_thb is not null)
  )
);

create index if not exists commission_tiers_lookup_idx
  on public.commission_tiers(role_kind, service_kind, is_active);

drop trigger if exists commission_tiers_updated_at_trigger on public.commission_tiers;
create trigger commission_tiers_updated_at_trigger
  before update on public.commission_tiers
  for each row execute function public.set_updated_at();

-- 3) commission_accruals -------------------------------------------
-- One row per (earner × source order). Idempotent: partial-unique on
-- (source_kind, source_ref, earner_admin_id) prevents double-mint per
-- source × earner. Background job (cron) is V1.1; V1 = admin triggers
-- adminAccrueCommissionForOrder() manually per closed order.
create table if not exists public.commission_accruals (
  id                       uuid primary key default gen_random_uuid(),
  earner_admin_id          uuid not null references public.profiles(id) on delete restrict,
  role_kind                text not null
                             check (role_kind in ('interpreter','sales_rep')),
  tier_id                  uuid not null references public.commission_tiers(id) on delete restrict,
  source_kind              text not null
                             check (source_kind in (
                               'service_order','forwarder','freight_quote'
                             )),
  source_ref               text not null,                            -- h_no | f_no | quote_no
  base_thb                 numeric(12,2) not null,                   -- the base the rate applied to
  accrued_amount_thb       numeric(12,2) not null,                   -- frozen at accrual
  accrued_at               timestamptz not null default now(),       -- when source closed + mint occurred
  withdrawal_item_id       uuid,                                     -- nullable; set when included in a paid withdrawal
                                                                     -- FK added after withdrawal_items table exists (see below)
  notes                    text,
  created_at               timestamptz not null default now()
);

-- Indexes -----------------------------------------------------------
-- Fast "my unpaid balance" query — partial index on unpaid rows only.
create index if not exists commission_accruals_earner_unpaid_idx
  on public.commission_accruals(earner_admin_id, accrued_at desc)
  where withdrawal_item_id is null;

create index if not exists commission_accruals_earner_idx
  on public.commission_accruals(earner_admin_id, accrued_at desc);

-- Source lookup (for re-accrual audit + cron idempotency).
create unique index if not exists commission_accruals_source_uidx
  on public.commission_accruals(source_kind, source_ref, earner_admin_id);

-- 4) commission_withdrawal_seq -------------------------------------
-- Monthly serial counter — CW-{YYMM}-{seq}. Reset per (YY,MM).
create table if not exists public.commission_withdrawal_seq (
  period_yymm   text primary key,                                    -- e.g. "2605"
  next_seq      int not null default 1,
  updated_at    timestamptz not null default now()
);

-- 5) commission_withdrawals ----------------------------------------
-- Withdrawal request header. Status machine:
--   pending → approved → paid          (happy path)
--   pending → rejected (with reason)   (super/accounting reject)
create table if not exists public.commission_withdrawals (
  id                       uuid primary key default gen_random_uuid(),
  withdrawal_no            text unique,                              -- CW-{YYMM}-{seq}, reserved at insert

  earner_admin_id          uuid not null references public.profiles(id) on delete restrict,
  role_kind                text not null
                             check (role_kind in ('interpreter','sales_rep')),
  title                    text not null,                            -- e.g. "ค่าคอมเดือนพ.ค. 2026"

  -- Financial snapshot (frozen at request time)
  gross_thb                numeric(12,2) not null check (gross_thb > 0),
  wht_rate_pct             numeric(4,2) not null default 15.00,      -- Thai WHT default; override audited
  wht_amount_thb           numeric(12,2) not null default 0,
  net_thb                  numeric(12,2) not null,

  -- Payee bank account snapshot (frozen at request time)
  payee_bank_name          text not null,
  payee_account_name       text not null,
  payee_account_no         text not null,

  -- Status machine
  status                   text not null default 'pending'
                             check (status in (
                               'pending','approved','rejected','paid'
                             )),

  requested_at             timestamptz not null default now(),
  approved_at              timestamptz,
  approved_by_admin_id     uuid references public.profiles(id),

  rejected_at              timestamptz,
  rejected_by_admin_id     uuid references public.profiles(id),
  rejected_reason          text,

  paid_at                  timestamptz,
  paid_by_admin_id         uuid references public.profiles(id),
  slip_storage_path        text,                                     -- bucket: commission-slips

  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- ── Consistency constraints ──
  constraint commission_withdrawals_rejected_has_reason check (
    status <> 'rejected'
    or (rejected_at is not null
        and rejected_by_admin_id is not null
        and rejected_reason is not null
        and char_length(rejected_reason) >= 3)
  ),
  constraint commission_withdrawals_paid_consistency check (
    status <> 'paid'
    or (paid_at is not null
        and paid_by_admin_id is not null
        and slip_storage_path is not null)
  ),
  constraint commission_withdrawals_approved_consistency check (
    status not in ('approved','paid')
    or (approved_at is not null and approved_by_admin_id is not null)
  ),
  -- WHT consistency per Thai Revenue Code §50(1):
  -- wht_amount must be 0 OR (gross > 5000 AND wht_rate > 0). The "OR"
  -- branch allows wht_amount=0 even on >5k payouts when staff
  -- overrides rate to 0 (taxable elsewhere — audited via wht_rate_pct).
  constraint commission_withdrawals_wht_consistency check (
    wht_amount_thb = 0
    or (gross_thb > 5000 and wht_rate_pct > 0)
  )
);

-- Indexes -----------------------------------------------------------
create index if not exists commission_withdrawals_earner_idx
  on public.commission_withdrawals(earner_admin_id, requested_at desc);
create index if not exists commission_withdrawals_status_idx
  on public.commission_withdrawals(status, requested_at desc);
create index if not exists commission_withdrawals_pending_queue_idx
  on public.commission_withdrawals(requested_at desc)
  where status in ('pending','approved');

drop trigger if exists commission_withdrawals_updated_at_trigger on public.commission_withdrawals;
create trigger commission_withdrawals_updated_at_trigger
  before update on public.commission_withdrawals
  for each row execute function public.set_updated_at();

-- 6) commission_withdrawal_items -----------------------------------
-- Many-to-one join: a withdrawal aggregates N accruals.
-- UNIQUE on commission_accrual_id prevents double-include.
create table if not exists public.commission_withdrawal_items (
  id                          uuid primary key default gen_random_uuid(),
  commission_withdrawal_id    uuid not null references public.commission_withdrawals(id) on delete restrict,
  commission_accrual_id       uuid not null references public.commission_accruals(id) on delete restrict,
  included_amount_thb         numeric(12,2) not null,                -- snapshot of accrual amount at request time
  created_at                  timestamptz not null default now(),
  unique (commission_accrual_id)                                     -- one accrual → at most one withdrawal
);

create index if not exists commission_withdrawal_items_withdrawal_idx
  on public.commission_withdrawal_items(commission_withdrawal_id);

-- Backfill the deferred FK on commission_accruals.withdrawal_item_id.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'commission_accruals_withdrawal_item_fkey'
  ) then
    alter table public.commission_accruals
      add constraint commission_accruals_withdrawal_item_fkey
      foreign key (withdrawal_item_id)
      references public.commission_withdrawal_items(id)
      on delete set null;
  end if;
end $$;

-- 7) next_commission_withdrawal_no() --------------------------------
-- CW-{YYMM}-{seq} with monthly reset (Bangkok TZ). Mirror pattern of
-- next_freight_quote_no (0048) + next_freight_invoice_serial (0051).
create or replace function public.next_commission_withdrawal_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yymm text := to_char(now() at time zone 'Asia/Bangkok', 'YYMM');
  seq  int;
begin
  insert into public.commission_withdrawal_seq (period_yymm, next_seq)
    values (yymm, 2)
    on conflict (period_yymm) do update
      set next_seq   = commission_withdrawal_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'CW-' || yymm || '-' || lpad(seq::text, 4, '0');
end;
$$;

revoke all     on function public.next_commission_withdrawal_no() from public, authenticated, anon;
grant  execute on function public.next_commission_withdrawal_no() to service_role;

-- 8) RLS ------------------------------------------------------------
-- Customer reads NOTHING (commission is admin/staff only). No customer
-- policies created — default-deny applies.
--
-- Staff (interpreter + sales_admin + sales_rep) reads OWN accruals +
-- own withdrawals via earner_admin_id = auth.uid().
--
-- Super + accounting: full r/w on all four tables.
alter table public.commission_tiers              enable row level security;
alter table public.commission_accruals           enable row level security;
alter table public.commission_withdrawals        enable row level security;
alter table public.commission_withdrawal_items   enable row level security;
alter table public.commission_withdrawal_seq     enable row level security;

-- ── commission_tiers ──
-- Staff reads tiers matching their role (so portal can show "you earn at
-- this rate"). Super + accounting full r/w.
drop policy if exists commission_tiers_staff_read on public.commission_tiers;
create policy commission_tiers_staff_read
  on public.commission_tiers for select
  using (
    public.is_admin(array['interpreter','sales_admin'])
    and is_active = true
  );

drop policy if exists commission_tiers_admin_all on public.commission_tiers;
create policy commission_tiers_admin_all
  on public.commission_tiers for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- ── commission_accruals ──
-- Earner reads OWN accruals.
drop policy if exists commission_accruals_earner_read on public.commission_accruals;
create policy commission_accruals_earner_read
  on public.commission_accruals for select
  using (earner_admin_id = auth.uid());

drop policy if exists commission_accruals_admin_all on public.commission_accruals;
create policy commission_accruals_admin_all
  on public.commission_accruals for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- ── commission_withdrawals ──
-- Earner reads OWN withdrawals.
drop policy if exists commission_withdrawals_earner_read on public.commission_withdrawals;
create policy commission_withdrawals_earner_read
  on public.commission_withdrawals for select
  using (earner_admin_id = auth.uid());

-- Earner creates own pending withdrawal request. App-layer also enforces
-- the items must belong to the earner + sum > minimum threshold.
drop policy if exists commission_withdrawals_earner_request on public.commission_withdrawals;
create policy commission_withdrawals_earner_request
  on public.commission_withdrawals for insert
  with check (
    earner_admin_id = auth.uid()
    and status = 'pending'
  );

drop policy if exists commission_withdrawals_admin_all on public.commission_withdrawals;
create policy commission_withdrawals_admin_all
  on public.commission_withdrawals for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- ── commission_withdrawal_items ──
-- Earner reads items belonging to own withdrawals.
drop policy if exists commission_withdrawal_items_earner_read on public.commission_withdrawal_items;
create policy commission_withdrawal_items_earner_read
  on public.commission_withdrawal_items for select
  using (
    exists (
      select 1 from public.commission_withdrawals w
       where w.id = commission_withdrawal_items.commission_withdrawal_id
         and w.earner_admin_id = auth.uid()
    )
  );

drop policy if exists commission_withdrawal_items_admin_all on public.commission_withdrawal_items;
create policy commission_withdrawal_items_admin_all
  on public.commission_withdrawal_items for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- ── commission_withdrawal_seq ──
-- Admin-only access; the generator fn bypasses via SECURITY DEFINER.
drop policy if exists commission_withdrawal_seq_admin_all on public.commission_withdrawal_seq;
create policy commission_withdrawal_seq_admin_all
  on public.commission_withdrawal_seq for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- 9) Storage bucket 'commission-slips' ------------------------------
-- Private bucket — super + accounting write/read; earner reads own
-- (via the path prefix {earner_admin_id}/). Pattern mirrors wht-certs
-- (0044) + slips (existing).
insert into storage.buckets (id, name, public)
values ('commission-slips', 'commission-slips', false)
on conflict (id) do nothing;

-- Earner-side read: authenticated user can read slips filed under their
-- own {earner_admin_id}/ folder (so they can see proof of payment).
drop policy if exists "commission_slips_user_read" on storage.objects;
create policy "commission_slips_user_read"
  on storage.objects for select
  using (
    bucket_id = 'commission-slips'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admin read: super + accounting can read any slip (audit, support).
drop policy if exists "commission_slips_admin_read" on storage.objects;
create policy "commission_slips_admin_read"
  on storage.objects for select
  using (
    bucket_id = 'commission-slips'
    and public.is_admin(array['super','accounting'])
  );

-- No INSERT/UPDATE/DELETE policies — all writes go through service_role
-- inside server actions (actions/admin/commissions.ts). Default-deny otherwise.

-- 10) Comments -----------------------------------------------------
comment on table  public.commission_tiers is
  'V-E8 — per-role/per-service commission rate lookup. exactly one of (rate_pct, flat_thb) is non-null. Snapshotted into commission_accruals.tier_id at accrual to freeze the historical rate.';
comment on table  public.commission_accruals is
  'V-E8 — earned-but-unpaid commission rows. One per (earner × source order). Idempotent via partial-unique (source_kind, source_ref, earner_admin_id). withdrawal_item_id = null while unpaid; set when included in a withdrawal.';
comment on table  public.commission_withdrawals is
  'V-E8 — withdrawal request header. status pending → approved → paid (or pending → rejected). WHT 15% applied per Thai Revenue Code §50(1) when gross > 5,000 THB.';
comment on table  public.commission_withdrawal_items is
  'V-E8 — accruals included in a withdrawal. UNIQUE (commission_accrual_id) prevents double-include.';

comment on column public.commission_tiers.rate_pct is
  'percentage e.g. 1.500 = 1.5%. exactly-one with flat_thb (constraint).';
comment on column public.commission_tiers.flat_thb is
  'OR a flat per-job amount. exactly-one with rate_pct (constraint).';
comment on column public.commission_accruals.tier_id is
  'snapshot at accrual time — frozen. on delete restrict so we cant lose the historical rate.';
comment on column public.commission_accruals.source_kind is
  'service_order | forwarder | freight_quote — which type of source order this accrual was minted from.';
comment on column public.commission_accruals.source_ref is
  'the source order id (h_no / f_no / quote_no depending on source_kind).';
comment on column public.commission_withdrawals.withdrawal_no is
  'Format CW-{YYMM}-{seq}. Reserved at insert via next_commission_withdrawal_no().';
comment on column public.commission_withdrawals.wht_rate_pct is
  'Thai WHT default 15% per Revenue Code §50(1); staff can override to 0 for taxable-elsewhere cases (audited).';
comment on column public.commission_withdrawals.slip_storage_path is
  'bucket: commission-slips. format: {earner_admin_id}/{withdrawal_no}.{ext}';

comment on constraint commission_withdrawals_paid_consistency on public.commission_withdrawals is
  'status=paid MUST have paid_at + paid_by_admin_id + slip_storage_path populated. Cant flip to paid without the slip.';
comment on constraint commission_withdrawals_wht_consistency on public.commission_withdrawals is
  'wht_amount_thb = 0 OR (gross_thb > 5000 AND wht_rate_pct > 0). Mirrors Thai Revenue Code §50(1) threshold; override audited.';

comment on function public.next_commission_withdrawal_no() is
  'Atomic CW-{YYMM}-{seq} serial generator with monthly counter reset (Bangkok TZ). Concurrent calls serialise on upsert lock.';
