-- ════════════════════════════════════════════════════════════
-- V-E1 (part 2/2) · freight_invoices + freight_invoice_lines
-- ════════════════════════════════════════════════════════════
-- Per [docs/port-specs/freight-document-suite.md] + ADR-0016.
--
-- The Commercial Invoice + Packing List for a freight shipment. One
-- invoice per shipment (V1 — multi-invoice per shipment deferred to
-- V-E1.1 if partial shipments need split CI).
--
-- Status workflow (mirror tax_invoices, migration 0034):
--   draft → issued → cancelled
--   - draft  : header + lines mutable
--   - issued : financial frozen (commercial_value_usd, exchange_rate,
--              all duty/VAT figures, lines snapshotted). Customer can
--              download the CI / PL / Form E PDFs.
--   - cancelled: PDF re-rendered with watermark; new invoice can be
--                issued for the same shipment.
--
-- Pre-billing gate (V-A6 WHT + V-E10 QA):
--   - WHT cert gate: if a withholding_tax_entries row exists for
--     this freight job, cert_status must be 'received' or 'waived'
--     before issuance (analogous to tax_invoices issuance gate).
--   - QA gate: if a cargo_shipment is linked via freight_shipments
--     (V1 has no cargo linkage on freight_shipments — separate V-E1.1)
--     then isCargoShipmentQaPassed must be true. V1 stub returns
--     true for now since freight_shipments don't carry cargo FK.
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Daily invoice_no serial counter -----------------------------------
-- FI{YYMMDD}-{NNNN}. Daily reset (Bangkok TZ). Distinct from:
--   tax_invoices.serial_no = INV-YYYYMM-NNNN (monthly)
--   freight_quotes.quote_no = FQ{YYMMDD}-{NNNN} (daily)
create table if not exists public.freight_invoice_seq (
  period_yymmdd  text primary key,
  next_seq       int  not null default 1,
  updated_at     timestamptz not null default now()
);

-- 2) freight_invoices ---------------------------------------------------
create table if not exists public.freight_invoices (
  id                          uuid primary key default gen_random_uuid(),
  invoice_no                  text unique,                          -- FI{YYMMDD}-{NNNN} (null while draft)

  freight_shipment_id         uuid not null references public.freight_shipments(id) on delete restrict,
  profile_id                  uuid not null references public.profiles(id)         on delete restrict,

  status                      text not null default 'draft'
                                check (status in ('draft', 'issued', 'cancelled')),

  -- Snapshot of parties at issuance (frozen). Mirror tax_invoices buyer
  -- snapshot — never live-join after issue.
  shipper_name_snapshot       text,
  shipper_address_snapshot    text,
  consignee_name_snapshot     text,
  consignee_address_snapshot  text,
  consignee_tax_id_snapshot   text,
  consignee_branch_snapshot   text,

  -- Logistics snapshot
  transport_mode_snapshot     text,
  container_code_snapshot     text,
  bl_no_snapshot              text,
  vessel_voyage_snapshot      text,
  port_loading_snapshot       text,
  port_discharge_snapshot     text,
  incoterm_snapshot           text,
  payment_term_snapshot       text,
  origin_country_snapshot     text,

  -- ADR-0016 value block — FROZEN at issuance.
  commercial_value_usd        numeric(14,2) check (commercial_value_usd >= 0 and commercial_value_usd <= 99999999.99),
  exchange_rate               numeric(8,4)  check (exchange_rate > 0     and exchange_rate <= 9999.9999),
  rate_source                 text default 'staff_entered' check (rate_source in ('staff_entered')),
  rate_date                   date,
  commercial_value_thb        numeric(14,2) check (commercial_value_thb >= 0 and commercial_value_thb <= 999999999.99),
  declared_customs_value_thb  numeric(14,2) check (declared_customs_value_thb >= 0 and declared_customs_value_thb <= 999999999.99),
  declared_value_basis        text,
  hs_code                     text references public.hs_codes(code) on delete restrict,
  duty_rate_pct               numeric(6,3) check (duty_rate_pct >= 0 and duty_rate_pct <= 100),
  duty_thb                    numeric(14,2) check (duty_thb >= 0 and duty_thb <= 999999999.99),
  vat_base_thb                numeric(14,2) check (vat_base_thb >= 0 and vat_base_thb <= 999999999.99),
  vat_thb                     numeric(14,2) check (vat_thb >= 0 and vat_thb <= 999999999.99),
  vat_plan_label              text,
  form_e_applied              boolean not null default false,

  notes                       text,

  -- Issuance metadata
  issued_at                   timestamptz,
  issued_by_admin_id          uuid references public.profiles(id),
  pdf_storage_path            text,

  -- Cancellation metadata
  cancelled_at                timestamptz,
  cancelled_by_admin_id       uuid references public.profiles(id),
  cancellation_reason         text,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- ADR-0016 rule #1 mirror: paired commercial_value pieces.
  constraint freight_invoices_commercial_rate_pair check (
    (commercial_value_usd is null) = (exchange_rate is null)
  ),
  -- Issued requires serial + issuance metadata + financial snapshot non-null.
  constraint freight_invoices_issued_consistent check (
    status <> 'issued' or (
      invoice_no               is not null
      and issued_at            is not null
      and issued_by_admin_id   is not null
      and commercial_value_usd is not null
      and exchange_rate        is not null
    )
  ),
  -- Cancelled requires reason.
  constraint freight_invoices_cancelled_has_reason check (
    status <> 'cancelled' or (cancellation_reason is not null and cancelled_at is not null)
  )
);

-- Indexes ---------------------------------------------------------------
create index if not exists freight_invoices_profile_status_idx
  on public.freight_invoices(profile_id, status);
create index if not exists freight_invoices_shipment_idx
  on public.freight_invoices(freight_shipment_id);
create index if not exists freight_invoices_status_created_idx
  on public.freight_invoices(status, created_at desc);
create index if not exists freight_invoices_invoice_no_idx
  on public.freight_invoices(invoice_no) where invoice_no is not null;

-- One issued (non-cancelled) invoice per shipment at any time. Drafts
-- can pile up; cancelled rows preserved for audit. Re-issuance allowed
-- after cancel.
create unique index if not exists freight_invoices_one_issued_per_shipment
  on public.freight_invoices(freight_shipment_id)
  where status = 'issued';

drop trigger if exists freight_invoices_updated_at_trigger on public.freight_invoices;
create trigger freight_invoices_updated_at_trigger
  before update on public.freight_invoices
  for each row execute function public.set_updated_at();

-- 3) freight_invoice_lines ---------------------------------------------
create table if not exists public.freight_invoice_lines (
  id                  uuid primary key default gen_random_uuid(),
  freight_invoice_id  uuid not null references public.freight_invoices(id) on delete cascade,
  position            smallint not null default 1,

  -- The goods (per spec)
  marks               text,                                       -- "Marks & No."
  description         text not null,
  qty                 numeric(14,3) not null check (qty > 0),
  unit                text not null default 'PCS' check (unit in (
                        'PCS', 'LO', 'MTK', 'KGM', 'CTN', 'PAL', 'SET'
                      )),
  unit_price_usd      numeric(14,2) not null check (unit_price_usd >= 0 and unit_price_usd <= 99999999.99),
  amount_usd          numeric(14,2) not null,                     -- = qty × unit_price_usd
  cartons             int           check (cartons >= 0 and cartons <= 999999),
  gross_weight_kg     numeric(14,3) check (gross_weight_kg >= 0 and gross_weight_kg <= 9999999.999),
  hs_code             text references public.hs_codes(code) on delete restrict,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists freight_invoice_lines_invoice_pos_uidx
  on public.freight_invoice_lines(freight_invoice_id, position);
create index if not exists freight_invoice_lines_hs_code_idx
  on public.freight_invoice_lines(hs_code) where hs_code is not null;

drop trigger if exists freight_invoice_lines_updated_at_trigger on public.freight_invoice_lines;
create trigger freight_invoice_lines_updated_at_trigger
  before update on public.freight_invoice_lines
  for each row execute function public.set_updated_at();

-- 4) Atomic invoice_no generator ---------------------------------------
create or replace function public.next_freight_invoice_serial()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yymmdd text := to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD');
  seq    int;
begin
  insert into public.freight_invoice_seq (period_yymmdd, next_seq)
    values (yymmdd, 2)
    on conflict (period_yymmdd) do update
      set next_seq   = freight_invoice_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'FI' || yymmdd || '-' || lpad(seq::text, 4, '0');
end;
$$;

revoke all     on function public.next_freight_invoice_serial() from public, authenticated, anon;
grant  execute on function public.next_freight_invoice_serial() to service_role;

-- 5) RLS ----------------------------------------------------------------
alter table public.freight_invoices      enable row level security;
alter table public.freight_invoice_lines enable row level security;
alter table public.freight_invoice_seq   enable row level security;

-- Customer reads OWN invoice (any status — V1 keeps it simple).
drop policy if exists freight_invoices_customer_read on public.freight_invoices;
create policy freight_invoices_customer_read
  on public.freight_invoices for select
  using (profile_id = auth.uid());

-- Admin (super + ops + accounting): full read+write.
drop policy if exists freight_invoices_admin_all on public.freight_invoices;
create policy freight_invoices_admin_all
  on public.freight_invoices for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

-- Lines: inherit from parent invoice.
drop policy if exists freight_invoice_lines_customer_read on public.freight_invoice_lines;
create policy freight_invoice_lines_customer_read
  on public.freight_invoice_lines for select
  using (
    exists (
      select 1 from public.freight_invoices fi
       where fi.id = freight_invoice_lines.freight_invoice_id
         and fi.profile_id = auth.uid()
    )
  );

drop policy if exists freight_invoice_lines_admin_all on public.freight_invoice_lines;
create policy freight_invoice_lines_admin_all
  on public.freight_invoice_lines for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists freight_invoice_seq_admin_all on public.freight_invoice_seq;
create policy freight_invoice_seq_admin_all
  on public.freight_invoice_seq for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

-- 6) Comments -----------------------------------------------------------
comment on table  public.freight_invoices is
  'V-E1 — Commercial Invoice for a freight shipment. ADR-0016 value block frozen at issuance.';
comment on column public.freight_invoices.invoice_no is
  'Format FI{YYMMDD}-{NNNN}. Daily counter reset (Bangkok TZ). Reserved at issuance.';
comment on column public.freight_invoices.status is
  'draft (mutable) → issued (financial frozen, PDF available) → cancelled (re-render with watermark; new invoice can be issued for same shipment).';
comment on column public.freight_invoices.commercial_value_thb is
  'commercial_value_usd × exchange_rate, frozen at issuance. NEVER live-recomputed.';
comment on column public.freight_invoices.declared_customs_value_thb is
  'CIF declared value — NEVER silently equal to commercial_value_thb per ADR-0016 rule #1. Edit gated to super+accounting per ADR-0016 Q3.';

comment on index public.freight_invoices_one_issued_per_shipment is
  'ADR-0016 rule #5: one committed invoice per shipment. Re-issuance requires cancel first.';

comment on table  public.freight_invoice_lines is
  'Per-line items snapshotted into the invoice. Editable only when parent status=draft.';

comment on function public.next_freight_invoice_serial is
  'Atomic FI{YYMMDD}-{NNNN} generator. Daily counter reset (Bangkok TZ). Concurrent calls serialise on upsert lock.';
