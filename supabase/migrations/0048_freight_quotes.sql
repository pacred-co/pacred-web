-- ════════════════════════════════════════════════════════════
-- V-E6 · freight_quotes + freight_quote_items (quotation workflow)
-- ════════════════════════════════════════════════════════════
-- Per port-spec [docs/port-specs/freight-quotation.md].
--
-- Adds Pacred's first formal freight-quotation flow:
--   draft → pending_approval → approved → sent → accepted/rejected/expired
--
-- V1 RBAC (per ภูม brief 2026-05-17 + ลูกพี่/เดฟ ack):
--   - create / edit (draft only): super, ops, sales_admin, accounting
--   - submit for approval        : super, ops, sales_admin, accounting
--   - approve / reject           : SUPER ONLY (no separate `manager` role)
--   - send / mark_accepted / expire / convert : super, sales_admin, accounting
--
-- `convert_to_shipment` requires `freight_shipments` table — that ships
-- in V-E1 (migration 0049). V1 of V-E6 leaves `converted_to_shipment_id`
-- nullable; the convert action lives in code but returns error until
-- 0049 lands.
--
-- This migration introduces:
--   1. freight_quote_seq          — daily serial counter
--   2. freight_quotes             — quote header
--   3. freight_quote_items        — quote line items
--   4. next_freight_quote_no()    — atomic serial generator
--   5. RLS                        — customer reads own (sent+), admin full
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Daily serial counter ---------------------------------------------
create table if not exists public.freight_quote_seq (
  period_yymmdd text primary key,
  next_seq      int  not null default 1,
  updated_at    timestamptz not null default now()
);

-- 2) freight_quotes ----------------------------------------------------
create table if not exists public.freight_quotes (
  id                       uuid primary key default gen_random_uuid(),
  quote_no                 text unique,                                -- FQYYMMDD-NNNN

  status                   text not null default 'draft'
                             check (status in (
                               'draft', 'pending_approval', 'approved',
                               'sent', 'accepted', 'rejected', 'expired'
                             )),

  -- Customer pointer (NULL = cold quote to unregistered prospect)
  profile_id               uuid references public.profiles(id) on delete restrict,
  buyer_name_snapshot      text not null,
  buyer_tax_id_snapshot    text,                                      -- 13-digit, optional
  buyer_contact_snapshot   text,                                      -- multi-line name + tel + email

  -- Logistics terms
  transport_mode           text not null check (transport_mode in (
                             'sea_fcl', 'sea_lcl', 'truck', 'air'
                           )),
  port_loading             text,
  port_discharge           text,
  place_delivery           text,
  incoterm                 text check (incoterm in (
                             'EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP',
                             'FAS', 'FOB', 'CFR', 'CIF'
                           )),
  currency                 text not null default 'THB' check (currency in ('THB','USD')),

  -- Financial snapshot — frozen on approval (header total = Σ items)
  subtotal                 numeric(12,2) not null default 0,
  vat_pct                  numeric(4,2)  not null default 7.00 check (vat_pct >= 0 and vat_pct <= 30),
  vat_amount               numeric(12,2) not null default 0,
  total                    numeric(12,2) not null default 0,

  valid_until              date,
  notes                    text,

  -- Audit fields
  created_by_admin_id      uuid not null references public.profiles(id),
  approved_by_admin_id     uuid references public.profiles(id),
  approved_at              timestamptz,
  rejected_reason          text,
  rejected_by_admin_id     uuid references public.profiles(id),
  rejected_at              timestamptz,
  sent_at                  timestamptz,
  accepted_at              timestamptz,
  expired_at               timestamptz,

  -- V-E1 conversion (nullable until V-E1 freight_shipments table exists).
  -- UNIQUE prevents double-conversion. FK added in V-E1 follow-up migration.
  converted_to_shipment_id uuid,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint freight_quotes_rejected_has_reason check (
    status <> 'rejected' or (rejected_reason is not null and char_length(rejected_reason) >= 3)
  ),
  constraint freight_quotes_approved_consistent check (
    status not in ('approved','sent','accepted')
    or (approved_by_admin_id is not null and approved_at is not null)
  )
);

-- Indexes -------------------------------------------------------------
create index if not exists freight_quotes_status_created_idx
  on public.freight_quotes(status, created_at desc);
create index if not exists freight_quotes_profile_status_idx
  on public.freight_quotes(profile_id, status) where profile_id is not null;
create unique index if not exists freight_quotes_converted_uidx
  on public.freight_quotes(converted_to_shipment_id) where converted_to_shipment_id is not null;
create index if not exists freight_quotes_quote_no_idx
  on public.freight_quotes(quote_no) where quote_no is not null;

-- updated_at auto-touch.
drop trigger if exists freight_quotes_updated_at_trigger on public.freight_quotes;
create trigger freight_quotes_updated_at_trigger
  before update on public.freight_quotes
  for each row execute function public.set_updated_at();

-- 3) freight_quote_items ----------------------------------------------
create table if not exists public.freight_quote_items (
  id               uuid primary key default gen_random_uuid(),
  freight_quote_id uuid not null references public.freight_quotes(id) on delete cascade,
  position         smallint not null default 1,
  description      text not null,
  quantity         numeric(12,3) not null check (quantity > 0),
  unit             text not null default 'JOB' check (unit in (
                     'CBM', 'KGM', 'JOB', 'PCS', 'LO', 'CTN', 'PAL', 'TEU', 'FEU'
                   )),
  unit_price_thb   numeric(12,2) not null check (unit_price_thb >= 0 and unit_price_thb <= 999999.99),
  line_total_thb   numeric(12,2) not null,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists freight_quote_items_quote_pos_uidx
  on public.freight_quote_items(freight_quote_id, position);

drop trigger if exists freight_quote_items_updated_at_trigger on public.freight_quote_items;
create trigger freight_quote_items_updated_at_trigger
  before update on public.freight_quote_items
  for each row execute function public.set_updated_at();

-- 4) Atomic serial generator -------------------------------------------
-- FQYYMMDD-NNNN with daily reset (Bangkok TZ). Mirror next_qa_inspection_no.
create or replace function public.next_freight_quote_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yymmdd text := to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD');
  seq    int;
begin
  insert into public.freight_quote_seq (period_yymmdd, next_seq)
    values (yymmdd, 2)
    on conflict (period_yymmdd) do update
      set next_seq   = freight_quote_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'FQ' || yymmdd || '-' || lpad(seq::text, 4, '0');
end;
$$;

revoke all     on function public.next_freight_quote_no() from public, authenticated, anon;
grant  execute on function public.next_freight_quote_no() to service_role;

-- 5) RLS ---------------------------------------------------------------
alter table public.freight_quotes      enable row level security;
alter table public.freight_quote_items enable row level security;
alter table public.freight_quote_seq   enable row level security;

-- Customer reads own (only when status >= sent — drafts/pending hidden).
drop policy if exists freight_quotes_customer_read on public.freight_quotes;
create policy freight_quotes_customer_read
  on public.freight_quotes for select
  using (
    profile_id = auth.uid()
    and status in ('sent', 'accepted', 'rejected', 'expired')
  );

-- Admin (super + ops + sales_admin + accounting): full read.
drop policy if exists freight_quotes_admin_read on public.freight_quotes;
create policy freight_quotes_admin_read
  on public.freight_quotes for select
  using (public.is_admin(array['super','ops','sales_admin','accounting']));

-- Admin (same set): write — app-layer enforces per-status role split.
drop policy if exists freight_quotes_admin_write on public.freight_quotes;
create policy freight_quotes_admin_write
  on public.freight_quotes for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- Items: inherit visibility from parent quote.
drop policy if exists freight_quote_items_customer_read on public.freight_quote_items;
create policy freight_quote_items_customer_read
  on public.freight_quote_items for select
  using (
    exists (
      select 1 from public.freight_quotes q
       where q.id = freight_quote_items.freight_quote_id
         and q.profile_id = auth.uid()
         and q.status in ('sent', 'accepted', 'rejected', 'expired')
    )
  );

drop policy if exists freight_quote_items_admin_all on public.freight_quote_items;
create policy freight_quote_items_admin_all
  on public.freight_quote_items for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- Seq table admin-only (generator fn bypasses via security definer).
drop policy if exists freight_quote_seq_admin_all on public.freight_quote_seq;
create policy freight_quote_seq_admin_all
  on public.freight_quote_seq for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- 6) Comments ----------------------------------------------------------
comment on table  public.freight_quotes is
  'V-E6 — freight quotation workflow. Status: draft → pending_approval → approved → sent → accepted/rejected/expired. Convert-to-shipment is V-E1 dependency.';
comment on column public.freight_quotes.quote_no is
  'Format FQYYMMDD-NNNN. Reserved at insert time via next_freight_quote_no().';
comment on column public.freight_quotes.status is
  'draft (editable by creator) | pending_approval (locked, awaits super) | approved (locked, financial frozen) | sent (visible to customer) | accepted / rejected / expired (terminal).';
comment on column public.freight_quotes.converted_to_shipment_id is
  'V-E1 dependency — points to freight_shipments(id) after convert action runs. UNIQUE prevents double-conversion.';
comment on constraint freight_quotes_rejected_has_reason on public.freight_quotes is
  'rejected status MUST carry a reason ≥3 chars (audit completeness — ADR-0014 pattern).';
comment on constraint freight_quotes_approved_consistent on public.freight_quotes is
  'approved/sent/accepted status MUST have approver + timestamp populated.';

comment on table  public.freight_quote_items is
  'Per-line quote items. Editable only when parent status=draft.';

comment on function public.next_freight_quote_no is
  'Atomic FQYYMMDD-NNNN serial generator with daily counter reset (Bangkok TZ). Concurrent calls serialise on upsert lock.';
