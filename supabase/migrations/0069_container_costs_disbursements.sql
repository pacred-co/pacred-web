-- ════════════════════════════════════════════════════════════
-- U2-2 · container_costs + container_disbursements — cost basis + AP ledger
-- ════════════════════════════════════════════════════════════
-- Per UPGRADE_PLAN §2 U2-2 + research G-1/G-2 + R-7:
--
--   "Pacred has zero cost side today → no margin, no 'billed below
--    cost' flag, no commission-on-profit. Legacy tb_cost_container
--    held the carrier-rate-card (the EXPECTED cost per cabinet+type),
--    and tb_bill / tb_bill_item held the disbursement ledger (the
--    ACTUAL outflows). Pacred ports both as two distinct tables:
--      - container_costs        = rate-card (what carrier *charges*)
--      - container_disbursements = AP ledger (what Pacred *paid out*)
--    Both feed R-7 margin reconciliation later."
--
-- ── G-1: container_costs (carrier rate card) ────────────────
-- One row per (carrier, route, container_type) with rate inputs
-- + an effective window. Lookup is most-specific-wins via
-- effective_from / effective_to.
--
-- ── G-2: container_disbursements (AP ledger) ────────────────
-- One row per actual outflow against a specific cargo_container.
-- Kind enumerates the legacy categories (D/O · duty · freight ·
-- handling · fuel · storage · trucking) plus a free 'other' bucket.
-- Receipt scan goes in Storage bucket 'disbursement-receipts'.
--
-- ── RLS ─────────────────────────────────────────────────────
-- container_costs: super + accounting WRITE; ops + sales_admin +
--   warehouse READ (they need rate visibility to quote / plan).
-- container_disbursements: super + accounting WRITE + READ ONLY —
--   no ops / warehouse / sales_admin access. AP ledger is finance-
--   only per ADR-0005 K-7 + W-1 keystone (gap-schema-security S-1).
--
-- ── Storage bucket ──────────────────────────────────────────
-- 'disbursement-receipts' — private. Customer never sees a row.
-- Path pattern: disbursement-receipts/{cargo_container_id}/{file}
--
-- Idempotent + additive. Zero data migration.
-- ════════════════════════════════════════════════════════════

-- ── 1) container_costs (carrier rate card) ──────────────────────────

create table if not exists public.container_costs (
  id                   uuid primary key default gen_random_uuid(),

  -- Identifier of the carrier that quotes this rate (e.g. 'MOMO',
  -- 'COSCO', 'TTP', 'EVERGREEN'). Free-text because the carrier set
  -- is informal during legacy port; later we may FK to a `carriers`
  -- master once that's locked.
  carrier_name         text not null,

  -- Transport mode the rate applies to. Aligned with cargo_containers.
  transport_mode       text not null check (transport_mode in ('truck','sea','air')),

  -- Origin / destination — short codes (e.g. 'CN-GZ', 'CN-YW', 'TH-BKK').
  -- Free-text so admin can add new routes without a migration.
  origin               text not null,
  destination          text not null,

  -- Container / vehicle type — e.g. '40HQ', '20GP', '40RF', 'truck-6w', 'truck-10w'.
  container_type       text not null,

  -- Rate inputs. Both nullable because some carriers price by CBM only
  -- (sea LCL) and some by kg only (air freight). At least one must be
  -- non-null (enforced by CHECK below).
  rate_per_cbm_thb     numeric(12,2),
  rate_per_kg_thb      numeric(12,2),

  -- Optional minimum charge — billed when actual × rate < minimum.
  minimum_charge_thb   numeric(12,2),

  -- Fuel surcharge as a % uplift on the base rate. Stored on the rate
  -- row (vs as a separate disbursement kind) because it's a percentage
  -- of THIS rate — not a fixed amount. Open Q: see migration footer.
  fuel_surcharge_pct   numeric(5,2),

  -- Effective window. effective_to NULL = currently active.
  effective_from       date not null,
  effective_to         date,

  -- Where did this row come from?
  source               text not null
                         check (source in ('manual','momo_api','partner_email'))
                         default 'manual',

  -- Free-text note (e.g. "MOMO quoted via email 2026-04-15 — pending counter-signature")
  note                 text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- At least one rate dimension must be priced.
  constraint container_costs_has_rate check (
    rate_per_cbm_thb is not null or rate_per_kg_thb is not null
  ),
  -- Effective window sanity.
  constraint container_costs_window_ok check (
    effective_to is null or effective_to >= effective_from
  )
);

-- Lookup index for the common "find the rate for this (carrier, mode,
-- origin, destination, container_type) at this date" query.
create index if not exists container_costs_lookup_idx
  on public.container_costs(carrier_name, transport_mode, origin, destination, container_type, effective_from desc);

-- Currently-active rows index (effective_to is null = open-ended).
create index if not exists container_costs_active_idx
  on public.container_costs(carrier_name, transport_mode) where effective_to is null;

drop trigger if exists container_costs_updated_at_trigger on public.container_costs;
create trigger container_costs_updated_at_trigger
  before update on public.container_costs
  for each row execute function public.set_updated_at();

comment on table  public.container_costs is
  'U2-2 / G-1: carrier rate card. Most-specific match by (carrier, mode, origin, destination, container_type) within the effective window = expected cost basis for a container. Feeds R-7 margin reconciliation later. Pure rate input — actual disbursements live in container_disbursements.';
comment on column public.container_costs.carrier_name is
  'Free-text carrier identifier (e.g. MOMO, COSCO, TTP, EVERGREEN). Will FK to a carriers master once locked.';
comment on column public.container_costs.fuel_surcharge_pct is
  'Percentage uplift on top of base rate (rate_per_cbm × (1 + fuel_surcharge_pct/100)). Stored on rate row because it is rate-relative, not a fixed amount.';
comment on column public.container_costs.effective_to is
  'NULL = currently active rate. Setting this to a date archives the row when a new rate replaces it.';
comment on constraint container_costs_has_rate on public.container_costs is
  'At least one of rate_per_cbm_thb or rate_per_kg_thb must be set — a row with no rate is unusable.';

-- ── 2) container_disbursements (AP ledger) ──────────────────────────

create table if not exists public.container_disbursements (
  id                   uuid primary key default gen_random_uuid(),

  -- The container this outflow is against. Cascade on container delete
  -- because a container that gets reset shouldn't leave orphan AP rows
  -- — admin deletes are gated to super only via the table CHECK in
  -- cargo_containers (no policy here).
  cargo_container_id   uuid not null references public.cargo_containers(id) on delete cascade,

  -- Outflow category. Aligned with legacy tb_bill_item kinds + the
  -- common Pacred cost dictionary.
  kind                 text not null check (kind in (
                          'freight',        -- main shipping (the carrier's freight bill)
                          'customs_duty',   -- import duty + VAT at clearance
                          'handling',       -- THC, port handling, warehouse-in/out fees
                          'fuel',           -- standalone fuel surcharge (when not baked into freight)
                          'storage',        -- ค่าเช่า / demurrage / detention
                          'trucking',       -- domestic THB trucking (CN-side OR TH-side)
                          'other'           -- everything else; free-text note required
                       )),

  amount_thb           numeric(12,2) not null check (amount_thb > 0),

  -- Who got paid (free-text vendor name, e.g. 'COSCO', 'Pacred ทีมรถ',
  -- 'กรมศุลกากร'). Same pattern as legacy tb_bill_item.
  vendor_name          text not null,

  -- Vendor's invoice / receipt number for cross-reference.
  invoice_no           text,

  -- When the money actually moved out. NULL = recorded but not yet paid
  -- (V1.1 may add a status enum; for now timestamp-presence = paid).
  paid_at              timestamptz,

  -- Admin who recorded the disbursement. Same FK pattern as
  -- cargo_container_status_history.changed_by_admin — references
  -- profiles(id) because admins has composite PK (profile_id, role).
  paid_by_admin_id     uuid references public.profiles(id),

  -- Receipt scan in storage bucket 'disbursement-receipts'.
  -- Path: {cargo_container_id}/{file}.
  attachment_path      text,

  note                 text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- 'other' kind must carry a note so the entry is auditable.
  constraint container_disbursements_other_has_note check (
    kind <> 'other' or (note is not null and length(trim(note)) > 0)
  )
);

create index if not exists container_disbursements_container_paid_idx
  on public.container_disbursements(cargo_container_id, paid_at desc nulls last);
create index if not exists container_disbursements_kind_idx
  on public.container_disbursements(kind);
create index if not exists container_disbursements_vendor_idx
  on public.container_disbursements(vendor_name);

drop trigger if exists container_disbursements_updated_at_trigger on public.container_disbursements;
create trigger container_disbursements_updated_at_trigger
  before update on public.container_disbursements
  for each row execute function public.set_updated_at();

comment on table  public.container_disbursements is
  'U2-2 / G-2 / R-7: AP ledger — one row per ACTUAL outflow Pacred paid against a cargo_container. Distinct from container_costs (the expected rate-card cost). Sum of amount_thb here = container_costs_thb in the margin helper.';
comment on column public.container_disbursements.kind is
  'Outflow category aligned with legacy tb_bill_item: freight | customs_duty | handling | fuel | storage | trucking | other.';
comment on column public.container_disbursements.paid_at is
  'When the money moved out. NULL = recorded but pending payment (V1.1 may introduce an explicit status enum).';
comment on column public.container_disbursements.attachment_path is
  'Storage path inside bucket "disbursement-receipts". Pattern: {cargo_container_id}/{file}.';
comment on constraint container_disbursements_other_has_note on public.container_disbursements is
  'Disbursements of kind=other must carry a note explaining what they are (auditability — ADR-0014 pattern).';

-- ── 3) RLS ──────────────────────────────────────────────────────────

alter table public.container_costs         enable row level security;
alter table public.container_disbursements enable row level security;

-- container_costs: super + accounting WRITE
drop policy if exists container_costs_admin_write on public.container_costs;
create policy container_costs_admin_write
  on public.container_costs for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- container_costs: ops + sales_admin + warehouse READ (rate visibility for quotes/planning)
drop policy if exists container_costs_admin_read on public.container_costs;
create policy container_costs_admin_read
  on public.container_costs for select
  using (public.is_admin(array['super','accounting','ops','sales_admin','warehouse']));

-- container_disbursements: super + accounting WRITE + READ (finance-only — never customer-facing)
drop policy if exists container_disbursements_admin_all on public.container_disbursements;
create policy container_disbursements_admin_all
  on public.container_disbursements for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- ── 4) Storage bucket 'disbursement-receipts' ───────────────────────
-- Private. Path pattern: {cargo_container_id}/{file}. Admin-only via
-- super + accounting policies; no customer access path.

insert into storage.buckets (id, name, public)
values ('disbursement-receipts', 'disbursement-receipts', false)
on conflict (id) do nothing;

drop policy if exists "disbursement_receipts_admin_read" on storage.objects;
create policy "disbursement_receipts_admin_read"
  on storage.objects for select
  using (
    bucket_id = 'disbursement-receipts'
    and public.is_admin(array['super','accounting'])
  );

drop policy if exists "disbursement_receipts_admin_write" on storage.objects;
create policy "disbursement_receipts_admin_write"
  on storage.objects for insert
  with check (
    bucket_id = 'disbursement-receipts'
    and public.is_admin(array['super','accounting'])
  );

drop policy if exists "disbursement_receipts_admin_update" on storage.objects;
create policy "disbursement_receipts_admin_update"
  on storage.objects for update
  using (
    bucket_id = 'disbursement-receipts'
    and public.is_admin(array['super','accounting'])
  );

drop policy if exists "disbursement_receipts_admin_delete" on storage.objects;
create policy "disbursement_receipts_admin_delete"
  on storage.objects for delete
  using (
    bucket_id = 'disbursement-receipts'
    and public.is_admin(array['super','accounting'])
  );

-- ── 5) Verify (counts) ─────────────────────────────────────────────
do $$
declare
  costs_rls   int;
  disb_rls    int;
begin
  select count(*) into costs_rls
    from pg_policies where schemaname = 'public' and tablename = 'container_costs';
  select count(*) into disb_rls
    from pg_policies where schemaname = 'public' and tablename = 'container_disbursements';
  if costs_rls < 2 then
    raise warning 'container_costs RLS expected >= 2 policies, found %', costs_rls;
  end if;
  if disb_rls < 1 then
    raise warning 'container_disbursements RLS expected >= 1 policy, found %', disb_rls;
  end if;
  raise notice 'U2-2 ready — container_costs % policies, container_disbursements % policies', costs_rls, disb_rls;
end$$;
