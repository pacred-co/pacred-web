-- ════════════════════════════════════════════════════════════
-- V-E9 · accounting_periods + period_close_event + freeze trigger
-- ════════════════════════════════════════════════════════════
-- Per [docs/port-specs/freight-monthly-closing.md] (V-E9 spec).
--
-- When the accounting team closes a month ("ปิดงวด") on Monday morning,
-- this migration provides the spine + DB-level safety net to ensure no
-- admin can accidentally edit issued invoices / payments / commission
-- accruals / wallet transactions belonging to a closed month.
--
-- ── V1 scope ──────────────────────────────────────────────────────
-- 1. `accounting_periods` — one row per `yyyymm` (e.g. "202605").
--    Status lifecycle:
--      open    → period is mutable; new tx land here
--      closing → admin signaled "preparing to close" (UI may warn but
--                trigger still allows writes; soft barrier)
--      closed  → trigger BLOCKS UPDATE/DELETE on financial tables for
--                rows whose effective date falls in this period
--
-- 2. `period_close_event` — append-only ledger of what was frozen at
--    close (row counts + sums per table). One row PER table per close,
--    so the close action writes ~5 rows per yyyymm.
--
-- 3. `accounting_period_freeze_check()` — BEFORE UPDATE/DELETE trigger
--    function attached to:
--      tax_invoices           (effective date = issued_at)
--      freight_invoices       (effective date = issued_at)
--      freight_invoice_payments (effective date = paid_at)
--      wallet_transactions    (effective date = created_at)
--    If the row's period is `closed`, RAISE EXCEPTION 'period_closed'.
--
-- ── Period-effective-date logic (decision call) ──────────────────
-- The spec is ambiguous on which timestamp marks a row as "belonging
-- to" a period. We pick the most semantically correct field per table
-- (the field accounting cares about for ภ.พ.30 reconciliation):
--   tax_invoices.issued_at         — RD Code 86 issuance date
--   freight_invoices.issued_at     — when the freight CI was committed
--   freight_invoice_payments.paid_at — when the money moved (bank-print
--                                       time, not record time)
--   wallet_transactions.created_at — append-only ledger; no other ts
-- If a row's effective field is NULL (e.g. draft invoice), the trigger
-- falls back to created_at (defensive — drafts are mutable anyway since
-- draft invoices have no issued_at, but the fallback prevents NULL
-- from silently bypassing the freeze).
--
-- ── RLS ──────────────────────────────────────────────────────────
-- Customer reads NOTHING from accounting_periods / period_close_event.
-- Admin (super + accounting) full read + write. ops can read for context
-- (so the UI can warn "งวดนี้ปิดแล้ว" mid-flow) but cannot mutate.
--
-- ── V1 DEFERRED ──────────────────────────────────────────────────
-- - Cron auto-seed each month-1 (V1 admin clicks "open period" manually)
-- - PEAK accounting export (U2-4 separate item)
-- - Per-channel revenue breakdown beyond basic counts (V-E12 dashboards)
-- - Closing checklist UI (V1 = just the close button; V1.1 enforces)
-- - cargo_shipments financial-field freeze (V1 scope = the 4 tables
--   above; cargo_shipments status flips are allowed since they're
--   tracking, not money — the money side lives in wallet_transactions
--   which IS frozen)
--
-- Idempotent (if-not-exists + drop-trigger-if-exists + create-or-replace).
-- Number 0056 per docs/runbook/poom-phase-i2-prep.md (V-G3 broadcasts
-- claimed 0055, leaving 0056 free for V-E9).
-- ════════════════════════════════════════════════════════════

-- 1) accounting_periods --------------------------------------------------
create table if not exists public.accounting_periods (
  -- yyyymm format e.g. "202605". Text so we can sort lexicographically
  -- + index range-scan "last 24 months" cheaply.
  period_yyyymm        text primary key
                         check (period_yyyymm ~ '^[0-9]{4}(0[1-9]|1[0-2])$'),

  status               text not null default 'open'
                         check (status in ('open', 'closing', 'closed')),

  opened_at            timestamptz not null default now(),
  -- FK references profiles(id), NOT admins(profile_id) — admins has
  -- composite PK (profile_id, role) so profile_id alone isn't unique.
  -- Mirrors the tax_invoices issued_by_admin pattern (migration 0034).
  opened_by_admin_id   uuid references public.profiles(id),

  closing_marked_at    timestamptz,
  closed_at            timestamptz,
  closed_by_admin_id   uuid references public.profiles(id),
  closing_notes        text,

  reopened_at          timestamptz,
  reopened_by_admin_id uuid references public.profiles(id),
  reopened_reason      text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- When status='closed', the close metadata MUST be set (audit
  -- completeness — ADR-0014 pattern, mirror tax_invoices_issued_has_serial).
  constraint accounting_periods_closed_has_metadata check (
    status <> 'closed' or (
      closed_at            is not null and
      closed_by_admin_id   is not null
    )
  ),
  -- A reopen MUST carry a reason + reopener (the rare-but-serious case
  -- the spec explicitly calls out — super-only emergency rollback).
  constraint accounting_periods_reopen_has_reason check (
    reopened_at is null or (
      reopened_reason      is not null and
      char_length(reopened_reason) >= 10 and
      reopened_by_admin_id is not null
    )
  )
);

create index if not exists accounting_periods_status_idx
  on public.accounting_periods(status);
create index if not exists accounting_periods_closed_at_idx
  on public.accounting_periods(closed_at desc) where status = 'closed';

drop trigger if exists accounting_periods_updated_at_trigger on public.accounting_periods;
create trigger accounting_periods_updated_at_trigger
  before update on public.accounting_periods
  for each row execute function public.set_updated_at();

-- 2) period_close_event — per-table snapshot at close --------------------
-- Append-only ledger. One row PER table PER close, so the close action
-- writes ~5 rows per yyyymm. A reopen DOES NOT delete these — they're
-- the historical record of what was frozen.
create table if not exists public.period_close_event (
  id                   uuid primary key default gen_random_uuid(),

  period_yyyymm        text not null references public.accounting_periods(period_yyyymm) on delete restrict,
  table_name           text not null,                  -- e.g. 'tax_invoices'

  -- Snapshot at close time. Row counts + sums of the headline THB
  -- column (varies per table — see column-comment below). NULL when
  -- the table has no THB-summable column (e.g. row-count-only).
  row_count            int           not null default 0,
  sum_thb              numeric(14,2),
  sum_label            text,                            -- "total_thb" / "amount_thb" / etc — what sum_thb sums

  -- Audit
  closed_at            timestamptz not null default now(),
  closed_by_admin_id   uuid references public.profiles(id),

  created_at           timestamptz not null default now()
);

-- One snapshot per (period, table) per close event — but a reopen +
-- re-close should append a NEW row, not overwrite (audit-trail
-- completeness). So no unique constraint — order by closed_at desc to
-- get the latest.
create index if not exists period_close_event_period_idx
  on public.period_close_event(period_yyyymm, closed_at desc);
create index if not exists period_close_event_table_idx
  on public.period_close_event(table_name);

-- 3) Freeze-check trigger function ---------------------------------------
-- Defensive helper: derive the yyyymm string of a timestamptz in Bangkok
-- timezone (the period boundary is BKK-local, not UTC — accounting works
-- in BKK calendar months).
create or replace function public.accounting_period_yyyymm_of(ts timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(ts at time zone 'Asia/Bangkok', 'YYYYMM');
$$;

comment on function public.accounting_period_yyyymm_of(timestamptz) is
  'V-E9 — BKK-local yyyymm string for a timestamptz. Used by accounting_period_freeze_check to bucket rows into periods.';

-- The trigger function — fires BEFORE UPDATE or DELETE on the protected
-- tables. Picks the table-appropriate "effective date" off OLD (the row
-- being mutated), maps it to a yyyymm, and checks accounting_periods
-- for a `closed` row. If closed → block.
create or replace function public.accounting_period_freeze_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eff_ts      timestamptz;
  v_yyyymm      text;
  v_is_closed   boolean;
begin
  -- Pick the table-appropriate effective timestamp. NULL fallback to
  -- created_at so a draft (issued_at IS NULL) doesn't silently bypass
  -- the freeze. Draft rows have no issued_at by definition, so they
  -- bucket by created_at — which for a brand-new draft is "today",
  -- so it won't fall in a closed past period anyway.
  if tg_table_name = 'tax_invoices' then
    v_eff_ts := coalesce(old.issued_at, old.created_at);
  elsif tg_table_name = 'freight_invoices' then
    v_eff_ts := coalesce(old.issued_at, old.created_at);
  elsif tg_table_name = 'freight_invoice_payments' then
    v_eff_ts := coalesce(old.paid_at, old.created_at);
  elsif tg_table_name = 'wallet_transactions' then
    v_eff_ts := old.created_at;
  else
    -- Shouldn't happen — we only attach to the 4 tables above. If a
    -- future migration attaches to another table, this default keeps
    -- the trigger safe rather than throwing on a missing branch.
    v_eff_ts := old.created_at;
  end if;

  if v_eff_ts is null then
    -- No effective date at all (shouldn't happen — created_at has a
    -- default). Allow the mutation rather than blocking arbitrarily.
    return coalesce(new, old);
  end if;

  v_yyyymm := public.accounting_period_yyyymm_of(v_eff_ts);

  select status = 'closed'
    into v_is_closed
    from public.accounting_periods
   where period_yyyymm = v_yyyymm;

  -- No accounting_periods row for this yyyymm → period was never opened
  -- → never closed → allow. (Pre-V-E9 history rows stay editable.)
  if v_is_closed is null or v_is_closed = false then
    return coalesce(new, old);
  end if;

  -- Period is closed. Block the mutation. Use a stable errcode so the
  -- app layer can detect it precisely without string-matching.
  raise exception
    'period_closed: % (% / %) belongs to closed accounting period %',
    tg_table_name, tg_op, old.id, v_yyyymm
    using errcode = 'P0001';
end;
$$;

comment on function public.accounting_period_freeze_check() is
  'V-E9 — BEFORE UPDATE/DELETE guard. Blocks mutations on financial-table rows whose effective date falls in a CLOSED accounting period. Attached to tax_invoices / freight_invoices / freight_invoice_payments / wallet_transactions.';

-- 4) Attach the trigger to each protected table -------------------------
-- BEFORE UPDATE OR DELETE — the trigger fires BEFORE the mutation lands,
-- so RAISE EXCEPTION rolls the whole statement back cleanly.

drop trigger if exists tax_invoices_period_freeze on public.tax_invoices;
create trigger tax_invoices_period_freeze
  before update or delete on public.tax_invoices
  for each row execute function public.accounting_period_freeze_check();

drop trigger if exists freight_invoices_period_freeze on public.freight_invoices;
create trigger freight_invoices_period_freeze
  before update or delete on public.freight_invoices
  for each row execute function public.accounting_period_freeze_check();

drop trigger if exists freight_invoice_payments_period_freeze on public.freight_invoice_payments;
create trigger freight_invoice_payments_period_freeze
  before update or delete on public.freight_invoice_payments
  for each row execute function public.accounting_period_freeze_check();

drop trigger if exists wallet_transactions_period_freeze on public.wallet_transactions;
create trigger wallet_transactions_period_freeze
  before update or delete on public.wallet_transactions
  for each row execute function public.accounting_period_freeze_check();

-- 5) RLS ----------------------------------------------------------------
alter table public.accounting_periods  enable row level security;
alter table public.period_close_event  enable row level security;

-- Customer reads NOTHING (these are admin-only financial control surfaces).
-- No SELECT policy for the public/anon role = default-deny.

-- Admin reads: super + accounting + ops (ops gets read-only context so
-- the UI can warn "งวดนี้ปิดแล้ว" mid-flow when an op is operating).
drop policy if exists accounting_periods_admin_read on public.accounting_periods;
create policy accounting_periods_admin_read
  on public.accounting_periods for select
  using (public.is_admin(array['super','accounting','ops']));

-- Admin writes: super + accounting only (ops cannot mutate the close
-- spine; that's a financial-control responsibility).
drop policy if exists accounting_periods_admin_write on public.accounting_periods;
create policy accounting_periods_admin_write
  on public.accounting_periods for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- period_close_event: mirror — admin read, super+accounting write.
drop policy if exists period_close_event_admin_read on public.period_close_event;
create policy period_close_event_admin_read
  on public.period_close_event for select
  using (public.is_admin(array['super','accounting','ops']));

drop policy if exists period_close_event_admin_write on public.period_close_event;
create policy period_close_event_admin_write
  on public.period_close_event for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- 6) Comments -----------------------------------------------------------
comment on table  public.accounting_periods is
  'V-E9 — one row per yyyymm (BKK calendar month). Status open → closing → closed. Once closed, the freeze trigger blocks UPDATE/DELETE on financial-table rows in that period.';
comment on column public.accounting_periods.period_yyyymm is
  'yyyymm string e.g. "202605" — sortable lex order, BKK calendar month boundary.';
comment on column public.accounting_periods.status is
  'open (mutable) → closing (admin signaled "preparing"; UI may warn but trigger still allows writes) → closed (trigger BLOCKS UPDATE/DELETE on tax_invoices / freight_invoices / freight_invoice_payments / wallet_transactions rows in this period).';
comment on column public.accounting_periods.reopened_reason is
  'Super-only emergency rollback reason (≥10 chars per CHECK). Audit-logged via admin_audit_log. The handoff brief: "rare + serious" — discourage with friction.';
comment on constraint accounting_periods_closed_has_metadata on public.accounting_periods is
  'A closed period MUST carry closed_at + closed_by_admin_id (audit-trail completeness — ADR-0014 pattern).';
comment on constraint accounting_periods_reopen_has_reason on public.accounting_periods is
  'A reopen MUST carry reason ≥10 chars + reopener (rare-but-serious emergency rollback per the spec).';

comment on table  public.period_close_event is
  'V-E9 — append-only ledger of per-table snapshots at close. One row per (period, table) per close event. Reopen + re-close appends NEW rows (never deletes — historical audit trail).';
comment on column public.period_close_event.sum_thb is
  'Headline THB sum at close. NULL when the table has no THB-summable column. See sum_label for what column was summed.';
comment on column public.period_close_event.sum_label is
  'Column name that sum_thb summed — varies per table (e.g. "total_thb" for tax_invoices, "amount_thb" for freight_invoice_payments).';

comment on trigger tax_invoices_period_freeze on public.tax_invoices is
  'V-E9 — blocks UPDATE/DELETE on tax invoices whose issued_at falls in a closed accounting period.';
comment on trigger freight_invoices_period_freeze on public.freight_invoices is
  'V-E9 — blocks UPDATE/DELETE on freight invoices whose issued_at falls in a closed accounting period.';
comment on trigger freight_invoice_payments_period_freeze on public.freight_invoice_payments is
  'V-E9 — blocks UPDATE/DELETE on freight invoice payments whose paid_at falls in a closed accounting period.';
comment on trigger wallet_transactions_period_freeze on public.wallet_transactions is
  'V-E9 — blocks UPDATE/DELETE on wallet transactions whose created_at falls in a closed accounting period.';
