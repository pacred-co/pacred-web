-- ════════════════════════════════════════════════════════════
-- V-E11 · customs_declarations + customs_declaration_lines
-- ════════════════════════════════════════════════════════════
-- Per [docs/port-specs/freight-customs-declaration.md].
--
-- Internal-only V2 — admin draws the ใบขนสินค้า (Thai customs
-- declaration form) from a freight shipment, prints PDF + exports
-- structured JSON for later upload to NetBay / Customs Trader Portal
-- (Phase III: U3-1 / U3-2 — DPX ERP integration).
--
-- Status workflow:
--   draft → submitted → accepted → released
--                    ↘ cancelled (terminal — any non-released)
--
--   - draft     : header + lines mutable
--   - submitted : admin walked it into the customs office (locked)
--   - accepted  : customs accepted entry (control no may be set)
--   - released  : goods released from customs
--   - cancelled : with reason; new declaration may be issued
--
-- Re-issuance: partial unique on freight_shipment_id allows a new
-- declaration once the previous one is cancelled (mirror freight_
-- invoices "one issued per shipment" rule).
--
-- Pre-V3 deferrals (per spec):
--   - NetBay / Customs Trader Portal upload (Phase III)
--   - Auto-seed lines from freight_invoice_lines + hs_codes — V1
--     creates lines manually; V2 of THIS feature could add the seed
--   - Multi-currency declared values (V1 = THB only)
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Daily declaration_no serial counter -----------------------------------
-- CD-{YYMMDD}-{NNNN}. Daily reset (Bangkok TZ). Distinct from
--   FI{YYMMDD}-{NNNN} (freight_invoices)
--   A{YY}{NNNNN}      (freight_shipments)
create table if not exists public.customs_declaration_seq (
  period_yymmdd  text primary key,
  next_seq       int  not null default 1,
  updated_at     timestamptz not null default now()
);

-- 2) customs_declarations -------------------------------------------------
create table if not exists public.customs_declarations (
  id                       uuid primary key default gen_random_uuid(),
  declaration_no           text unique,                              -- CD-{YYMMDD}-{NNNN} (null while draft)

  freight_shipment_id      uuid not null references public.freight_shipments(id) on delete restrict,

  status                   text not null default 'draft'
                             check (status in ('draft', 'submitted', 'accepted', 'released', 'cancelled')),

  declaration_type         text not null
                             check (declaration_type in ('import', 'export', 'transit')),

  -- Lifecycle timestamps
  declared_at              timestamptz,                              -- when admin drafted + readied for submission
  submitted_at             timestamptz,                              -- when admin filed at customs office
  accepted_at              timestamptz,                              -- when customs accepted entry
  released_at              timestamptz,                              -- when goods released
  cancelled_at             timestamptz,
  cancelled_reason         text,

  -- Customs / broker info
  customs_office           text,                                     -- e.g. BANGKOK_PORT_CUSTOMS_HOUSE / LAEM_CHABANG_CUSTOMS_HOUSE / MUKDAHAN_CUSTOMS_BORDER
  broker_name              text,                                     -- free-text broker name
  broker_license_no        text,                                     -- broker's customs license
  customs_control_no       text,                                     -- the real Thai Customs control no (broker fills after submission)
  ship_or_truck_arrival_date date,                                   -- arrival of vessel / truck
  port_of_entry            text,                                     -- e.g. "Bangkok Port", "Laem Chabang Terminal B3"

  -- Money totals (THB only V1)
  total_declared_value_thb  numeric(14,2) check (total_declared_value_thb >= 0  and total_declared_value_thb  <= 999999999.99),
  total_duty_thb            numeric(14,2) check (total_duty_thb           >= 0  and total_duty_thb           <= 999999999.99),
  total_vat_thb             numeric(14,2) check (total_vat_thb            >= 0  and total_vat_thb            <= 999999999.99),
  total_other_taxes_thb     numeric(14,2) default 0 check (total_other_taxes_thb >= 0 and total_other_taxes_thb <= 999999999.99),

  -- Payment channel hint (PromptPay for duty/VAT is increasingly common)
  paid_through_promptpay   boolean not null default false,

  notes                    text,

  -- Audit
  created_by_admin_id      uuid references public.profiles(id),
  updated_by_admin_id      uuid references public.profiles(id),
  submitted_by_admin_id    uuid references public.profiles(id),
  accepted_by_admin_id     uuid references public.profiles(id),
  released_by_admin_id     uuid references public.profiles(id),
  cancelled_by_admin_id    uuid references public.profiles(id),

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- Status / metadata consistency constraints
  constraint customs_declarations_submitted_consistent check (
    status not in ('submitted','accepted','released')
    or (declaration_no is not null and submitted_at is not null and submitted_by_admin_id is not null)
  ),
  constraint customs_declarations_accepted_consistent check (
    status not in ('accepted','released')
    or (accepted_at is not null and accepted_by_admin_id is not null)
  ),
  constraint customs_declarations_released_consistent check (
    status <> 'released'
    or (released_at is not null and released_by_admin_id is not null)
  ),
  constraint customs_declarations_cancelled_has_reason check (
    status <> 'cancelled'
    or (cancelled_reason is not null and cancelled_at is not null and cancelled_by_admin_id is not null)
  )
);

-- Indexes -------------------------------------------------------------
create index if not exists customs_declarations_shipment_idx
  on public.customs_declarations(freight_shipment_id);
create index if not exists customs_declarations_status_created_idx
  on public.customs_declarations(status, created_at desc);
create index if not exists customs_declarations_declaration_no_idx
  on public.customs_declarations(declaration_no) where declaration_no is not null;
create index if not exists customs_declarations_control_no_idx
  on public.customs_declarations(customs_control_no) where customs_control_no is not null;

-- ADR-0016 mirror — at most one ACTIVE (non-cancelled) declaration per
-- shipment at any time. Re-issuance allowed after cancel.
create unique index if not exists customs_declarations_one_active_per_shipment
  on public.customs_declarations(freight_shipment_id)
  where status <> 'cancelled';

drop trigger if exists customs_declarations_updated_at_trigger on public.customs_declarations;
create trigger customs_declarations_updated_at_trigger
  before update on public.customs_declarations
  for each row execute function public.set_updated_at();

-- 3) customs_declaration_lines ----------------------------------------
create table if not exists public.customs_declaration_lines (
  id                          uuid primary key default gen_random_uuid(),
  declaration_id              uuid not null references public.customs_declarations(id) on delete cascade,
  position                    smallint not null default 1,

  hs_code                     text references public.hs_codes(code) on delete restrict,
  description                 text not null,
  country_of_origin           text default 'CN',                     -- ISO 2-letter
  qty                         numeric(14,3) not null default 0 check (qty >= 0),
  unit                        text not null default 'PCS',
  gross_weight_kg             numeric(14,3) check (gross_weight_kg >= 0 and gross_weight_kg <= 9999999.999),
  net_weight_kg               numeric(14,3) check (net_weight_kg   >= 0 and net_weight_kg   <= 9999999.999),
  declared_value_thb          numeric(14,2) not null default 0 check (declared_value_thb >= 0 and declared_value_thb <= 999999999.99),
  duty_rate_pct               numeric(6,3)  default 0 check (duty_rate_pct >= 0 and duty_rate_pct <= 100),
  duty_thb                    numeric(14,2) default 0 check (duty_thb      >= 0 and duty_thb      <= 999999999.99),
  vat_thb                     numeric(14,2) default 0 check (vat_thb       >= 0 and vat_thb       <= 999999999.99),
  fta_applied                 boolean not null default false,        -- Form E or other FTA preference used
  notes                       text,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create unique index if not exists customs_declaration_lines_decl_pos_uidx
  on public.customs_declaration_lines(declaration_id, position);
create index if not exists customs_declaration_lines_hs_code_idx
  on public.customs_declaration_lines(hs_code) where hs_code is not null;

drop trigger if exists customs_declaration_lines_updated_at_trigger on public.customs_declaration_lines;
create trigger customs_declaration_lines_updated_at_trigger
  before update on public.customs_declaration_lines
  for each row execute function public.set_updated_at();

-- 4) Atomic declaration_no generator ----------------------------------
-- CD-{YYMMDD}-{NNNN} with daily reset (Bangkok TZ).
create or replace function public.next_customs_declaration_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yymmdd text := to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD');
  seq    int;
begin
  insert into public.customs_declaration_seq (period_yymmdd, next_seq)
    values (yymmdd, 2)
    on conflict (period_yymmdd) do update
      set next_seq   = customs_declaration_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'CD-' || yymmdd || '-' || lpad(seq::text, 4, '0');
end;
$$;

revoke all     on function public.next_customs_declaration_no() from public, authenticated, anon;
grant  execute on function public.next_customs_declaration_no() to service_role;

-- 5) RLS ---------------------------------------------------------------
alter table public.customs_declarations       enable row level security;
alter table public.customs_declaration_lines  enable row level security;
alter table public.customs_declaration_seq    enable row level security;

-- Customer reads OWN declaration once it's at least submitted (matches
-- spec — customer never sees a draft).
drop policy if exists customs_declarations_customer_read on public.customs_declarations;
create policy customs_declarations_customer_read
  on public.customs_declarations for select
  using (
    exists (
      select 1 from public.freight_shipments s
       where s.id = customs_declarations.freight_shipment_id
         and s.profile_id = auth.uid()
    )
    and status in ('submitted','accepted','released')
  );

-- Admin (super + accounting): full read+write.
-- W-1 keystone: array['super','accounting'] explicit per role rule.
drop policy if exists customs_declarations_admin_all on public.customs_declarations;
create policy customs_declarations_admin_all
  on public.customs_declarations for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- Lines: inherit visibility from parent declaration (customer read gated
-- on same submitted+ rule).
drop policy if exists customs_declaration_lines_customer_read on public.customs_declaration_lines;
create policy customs_declaration_lines_customer_read
  on public.customs_declaration_lines for select
  using (
    exists (
      select 1
        from public.customs_declarations cd
        join public.freight_shipments    s on s.id = cd.freight_shipment_id
       where cd.id = customs_declaration_lines.declaration_id
         and s.profile_id = auth.uid()
         and cd.status in ('submitted','accepted','released')
    )
  );

drop policy if exists customs_declaration_lines_admin_all on public.customs_declaration_lines;
create policy customs_declaration_lines_admin_all
  on public.customs_declaration_lines for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

drop policy if exists customs_declaration_seq_admin_all on public.customs_declaration_seq;
create policy customs_declaration_seq_admin_all
  on public.customs_declaration_seq for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- 6) Comments ---------------------------------------------------------
comment on table  public.customs_declarations is
  'V-E11 — Thai customs declaration (ใบขนสินค้า) for a freight shipment. Internal-only V2; admin manually drafts + files at the customs office. NetBay / Customs Trader Portal API integration deferred to Phase III (U3-1 / U3-2).';
comment on column public.customs_declarations.declaration_no is
  'Pacred internal CD-{YYMMDD}-{NNNN}. NOT the real Thai Customs control number — see customs_control_no.';
comment on column public.customs_declarations.customs_control_no is
  'Real Thai Customs control number returned after acceptance (broker fills it in).';
comment on column public.customs_declarations.status is
  'draft → submitted → accepted → released. Cancellation possible at any non-released stage with reason.';
comment on index  public.customs_declarations_one_active_per_shipment is
  'At most one active (non-cancelled) declaration per freight shipment. Re-issuance allowed after cancel.';

comment on table  public.customs_declaration_lines is
  'Per HS-code line. declared_value_thb + duty_rate_pct + duty/VAT snapshot at draft time (V1 — admin can edit until submission).';

comment on function public.next_customs_declaration_no is
  'Atomic CD-{YYMMDD}-{NNNN} declaration_no generator. Daily counter reset (Bangkok TZ). Concurrent calls serialise on upsert lock.';
