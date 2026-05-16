-- ════════════════════════════════════════════════════════════
-- V-E1 (part 1/2) · freight_shipments + freight_parties
-- ════════════════════════════════════════════════════════════
-- Per [docs/port-specs/freight-document-suite.md] + ADR-0016
-- (locked 2026-05-16 night, 5 Qs resolved).
--
-- The freight spine. Distinct from `cargo_*` (consolidated cargo;
-- weight/CBM grain) — freight = one job, one consignee, full
-- commercial documents (CI, PL, Form E, D/O).
--
-- Status workflow (V1 simplified):
--   draft → confirmed → in_progress → cleared → delivered
--                                    ↘ cancelled (terminal)
--
-- Companion migration 0051 adds freight_invoices + lines (the value
-- block per ADR-0016 §"Field model").
--
-- V-E6 convert hook: after this migration ships,
-- `adminConvertQuoteToShipment` (in actions/admin/freight-quotes.ts)
-- can replace its stub body to actually INSERT a freight_shipments
-- row from an accepted freight_quote (V-E6).
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Yearly job_no serial counter ---------------------------------------
-- A{YY}{NNNNN} pattern from legacy PHP (e.g. A2600200036). 5-digit running
-- per year — yearly reset (Bangkok TZ). High cap so we don't roll over.
create table if not exists public.freight_job_seq (
  period_yy   text primary key,           -- 'YY' (e.g. '26')
  next_seq    int  not null default 1,
  updated_at  timestamptz not null default now()
);

-- 2) freight_shipments --------------------------------------------------
create table if not exists public.freight_shipments (
  id                  uuid primary key default gen_random_uuid(),
  job_no              text unique,            -- A{YY}{NNNNN} — reserved at insert

  -- Customer pointer
  profile_id          uuid not null references public.profiles(id) on delete restrict,

  -- Workflow status
  status              text not null default 'draft'
                        check (status in (
                          'draft',
                          'confirmed',
                          'in_progress',
                          'cleared',
                          'delivered',
                          'cancelled'
                        )),

  -- Logistics terms (per ADR-0016 + freight-document-suite spec)
  transport_mode      text not null check (transport_mode in (
                        'sea_fcl', 'sea_lcl', 'truck', 'air'
                      )),
  container_code      text,                                    -- GZE####/GZS#### internal code
  carrier_container_no text,                                   -- physical B/L container no (SLVU4871649)
  bl_no               text,                                    -- B/L number
  vessel_voyage       text,                                    -- M. MARINER 2614S
  port_loading        text,
  port_discharge      text,
  place_delivery      text,
  incoterm            text check (incoterm in (
                        'EXW','FCA','CPT','CIP','DAP','DPU','DDP',
                        'FAS','FOB','CFR','CIF'
                      )),
  payment_term        text,                                    -- 'T/T', 'L/C at sight', ...
  origin_country      text not null default 'CHINA',

  -- ADR-0016 value block (per shipment — invoice carries its own block
  -- frozen at issuance, but the shipment-level fields drive defaults).
  commercial_value_usd        numeric(14,2) check (commercial_value_usd >= 0 and commercial_value_usd <= 99999999.99),
  exchange_rate               numeric(8,4)  check (exchange_rate > 0     and exchange_rate <= 9999.9999),
  rate_source                 text default 'staff_entered' check (rate_source in ('staff_entered')),
  rate_date                   date,
  commercial_value_thb        numeric(14,2) check (commercial_value_thb >= 0 and commercial_value_thb <= 999999999.99),
  declared_customs_value_thb  numeric(14,2) check (declared_customs_value_thb >= 0 and declared_customs_value_thb <= 999999999.99),
  declared_value_basis        text,                            -- required when declared != commercial; audit-trail string
  hs_code                     text references public.hs_codes(code) on delete restrict,
  duty_rate_pct               numeric(6,3) check (duty_rate_pct >= 0 and duty_rate_pct <= 100),
  duty_thb                    numeric(14,2) check (duty_thb >= 0 and duty_thb <= 999999999.99),
  vat_base_thb                numeric(14,2) check (vat_base_thb >= 0 and vat_base_thb <= 999999999.99),
  vat_thb                     numeric(14,2) check (vat_thb >= 0 and vat_thb <= 999999999.99),
  vat_plan_label              text,                            -- "แผน 1" / "แผน 2" — documentation, not logic
  form_e_applied              boolean not null default false,

  -- Quote linkage (V-E6 → V-E1 conversion)
  source_quote_id     uuid references public.freight_quotes(id) on delete restrict,

  -- Customer notes
  notes               text,

  -- Audit
  created_by_admin_id uuid references public.profiles(id),
  confirmed_at        timestamptz,
  delivered_at        timestamptz,
  cancelled_at        timestamptz,
  cancelled_reason    text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- ADR-0016 rule #1: commercial_value_* and declared_customs_value_thb
  -- are NEVER silently the same field. If commercial_value_usd is set,
  -- exchange_rate must accompany it (so commercial_value_thb is derivable).
  constraint freight_shipments_commercial_rate_pair check (
    (commercial_value_usd is null) = (exchange_rate is null)
  ),
  constraint freight_shipments_cancelled_has_reason check (
    status <> 'cancelled' or (cancelled_reason is not null and cancelled_at is not null)
  )
);

-- Lookup indexes -------------------------------------------------------
create index if not exists freight_shipments_profile_status_idx
  on public.freight_shipments(profile_id, status);
create index if not exists freight_shipments_status_created_idx
  on public.freight_shipments(status, created_at desc);
create index if not exists freight_shipments_job_no_idx
  on public.freight_shipments(job_no) where job_no is not null;
create index if not exists freight_shipments_carrier_container_idx
  on public.freight_shipments(carrier_container_no) where carrier_container_no is not null;
create index if not exists freight_shipments_source_quote_idx
  on public.freight_shipments(source_quote_id) where source_quote_id is not null;
create unique index if not exists freight_shipments_source_quote_uidx
  on public.freight_shipments(source_quote_id) where source_quote_id is not null;

drop trigger if exists freight_shipments_updated_at_trigger on public.freight_shipments;
create trigger freight_shipments_updated_at_trigger
  before update on public.freight_shipments
  for each row execute function public.set_updated_at();

-- 3) freight_parties — shipper + consignee snapshots --------------------
-- Per spec §"freight_parties". Snapshot at document issuance — mirror
-- tax_invoices buyer-snapshot rule. Two roles per shipment.
create table if not exists public.freight_parties (
  id                  uuid primary key default gen_random_uuid(),
  freight_shipment_id uuid not null references public.freight_shipments(id) on delete cascade,
  role                text not null check (role in ('shipper', 'consignee')),

  -- Common fields
  name                text not null,
  address             text not null,

  -- Consignee-specific (Thai importer): tax_id + branch
  tax_id              text,
  branch              text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One shipper + one consignee per shipment (no duplicates per role).
create unique index if not exists freight_parties_shipment_role_uidx
  on public.freight_parties(freight_shipment_id, role);

drop trigger if exists freight_parties_updated_at_trigger on public.freight_parties;
create trigger freight_parties_updated_at_trigger
  before update on public.freight_parties
  for each row execute function public.set_updated_at();

-- 4) Atomic job_no generator -------------------------------------------
-- A{YY}{NNNNN} with yearly reset (Bangkok TZ).
create or replace function public.next_freight_job_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yy  text := to_char(now() at time zone 'Asia/Bangkok', 'YY');
  seq int;
begin
  insert into public.freight_job_seq (period_yy, next_seq)
    values (yy, 2)
    on conflict (period_yy) do update
      set next_seq   = freight_job_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'A' || yy || lpad(seq::text, 5, '0');
end;
$$;

revoke all     on function public.next_freight_job_no() from public, authenticated, anon;
grant  execute on function public.next_freight_job_no() to service_role;

-- 5) RLS ----------------------------------------------------------------
alter table public.freight_shipments enable row level security;
alter table public.freight_parties   enable row level security;
alter table public.freight_job_seq   enable row level security;

-- Customer reads own shipment (any status). Differs from V-E6 quotes
-- which hide draft/pending — for freight_shipments the customer needs
-- to see status throughout the journey, not just at delivery.
drop policy if exists freight_shipments_customer_read on public.freight_shipments;
create policy freight_shipments_customer_read
  on public.freight_shipments for select
  using (profile_id = auth.uid());

-- Admin (super + ops + sales_admin + accounting): full read+write.
drop policy if exists freight_shipments_admin_all on public.freight_shipments;
create policy freight_shipments_admin_all
  on public.freight_shipments for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- Parties: inherit visibility from parent shipment.
drop policy if exists freight_parties_customer_read on public.freight_parties;
create policy freight_parties_customer_read
  on public.freight_parties for select
  using (
    exists (
      select 1 from public.freight_shipments s
       where s.id = freight_parties.freight_shipment_id
         and s.profile_id = auth.uid()
    )
  );

drop policy if exists freight_parties_admin_all on public.freight_parties;
create policy freight_parties_admin_all
  on public.freight_parties for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

drop policy if exists freight_job_seq_admin_all on public.freight_job_seq;
create policy freight_job_seq_admin_all
  on public.freight_job_seq for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- 6) V-E10 QA FK backfill ----------------------------------------------
-- freight_qa_inspections.freight_shipment_id was reserved nullable in
-- migration 0045. Now that freight_shipments exists, add the FK so
-- inspections can key to either side (cargo OR freight). The existing
-- XOR constraint already allows freight_shipment_id non-null.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
     where table_schema = 'public'
       and table_name   = 'freight_qa_inspections'
       and constraint_name = 'freight_qa_inspections_freight_shipment_id_fkey'
  ) then
    alter table public.freight_qa_inspections
      add constraint freight_qa_inspections_freight_shipment_id_fkey
      foreign key (freight_shipment_id)
      references public.freight_shipments(id)
      on delete restrict;
  end if;
end$$;

-- 7) Comments -----------------------------------------------------------
comment on table  public.freight_shipments is
  'V-E1 — freight spine (distinct from cargo_* consolidated cargo). One job per consignee with full commercial documents. ADR-0016 value block per ADR.';
comment on column public.freight_shipments.job_no is
  'Format A{YY}{NNNNN}. Reserved at insert via next_freight_job_no(). Yearly reset (Bangkok TZ).';
comment on column public.freight_shipments.declared_customs_value_thb is
  'CIF declared value on ใบขนสินค้า — NEVER silently equal to commercial_value_thb. Edit gated to super+accounting per ADR-0016 Q3.';
comment on column public.freight_shipments.declared_value_basis is
  'Free-text justification, required when declared_customs_value_thb is set (audit per ADR-0014).';
comment on column public.freight_shipments.exchange_rate is
  'USD→THB rate frozen with the shipment commitment. rate_source enum locked to staff_entered V1 per ADR-0016 Q1.';
comment on column public.freight_shipments.source_quote_id is
  'V-E6 → V-E1 conversion link. UNIQUE — one quote becomes at-most-one shipment.';

comment on table  public.freight_parties is
  'Shipper + consignee snapshots per freight shipment. Snapshotted at issuance — mirror tax_invoices buyer-snapshot immutability (0034).';

comment on function public.next_freight_job_no is
  'Atomic A{YY}{NNNNN} job_no generator. Yearly counter reset (Bangkok TZ). Concurrent calls serialise on upsert lock.';
