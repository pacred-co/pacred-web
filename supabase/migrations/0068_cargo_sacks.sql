-- ════════════════════════════════════════════════════════════
-- U2-5 · cargo_sacks — "กระสอบรวม" consolidation entity
-- ════════════════════════════════════════════════════════════
-- Per UPGRADE_PLAN §2 U2-5 + datanew L-4:
--
--   "A 'sack' / consolidation object (กระสอบรวม) is missing from
--    the Pacred data model. The drop introduces a data entity no
--    Pacred doc models: the sack / consolidated bag, with its own
--    code namespace CBX<YYMMDD>-EK<NN> (e.g. CBX251111-EK04) and
--    its own MOMO endpoint (/api/sack/get/info/{code}). A sack
--    bundles many small customer parcels; MOMO measures the
--    OUTSIDE of the bag, PCS measures the GOODS INSIDE — this is
--    reconciliation-gap root cause #1."
--
-- ── The hole ────────────────────────────────────────────────
-- Today cargo_shipments link directly to cargo_containers. There's
-- no intermediate "sack" — so when MOMO returns sack-level
-- measurements (the outside-of-bag CBM/weight), we have nowhere
-- to store them. The CBM gap that U1-3 (billing gate) keys on
-- can be explained by: container's total CBM = sum of sack outside-
-- measurements ≠ sum of shipment goods-inside-measurements. The
-- sack is the missing layer that lets staff reconcile.
--
-- ── The fix (V1) ────────────────────────────────────────────
-- 1. cargo_sacks table — code (CBX-YYMMDD-NN unique), parent
--    cargo_container_id, outside weight + cbm, source (momo/pacred/self)
-- 2. cargo_shipments.cargo_sack_id (optional FK) — a shipment can
--    be in a sack inside a container, OR directly in the container
--    without a sack (e.g. larger goods)
-- 3. Daily code-generation helper next_sack_code() mirroring the
--    cargo_containers pattern (sequence + trigger)
-- 4. RLS: customer sees a sack only if they own ≥1 shipment in it
--    (mirrors cargo_containers_customer_read); admin via
--    ['super','ops','warehouse']
--
-- V1 scope ships READ-only sync surface — i.e. the MOMO sync (post
-- U1-7) populates this table from the partner; staff don't manually
-- create sacks. A future migration adds staff-side create/edit if
-- needed.
--
-- Idempotent + additive. Zero data migration.
-- ════════════════════════════════════════════════════════════

-- ── 1) Daily serial counter for sack codes ──────────────────────────

create table if not exists public.cargo_sack_seq (
  period_yymmdd text primary key,
  next_seq      int  not null default 1,
  updated_at    timestamptz not null default now()
);

-- ── 2) Code-generation helper ──────────────────────────────────────
-- Returns codes like CBX260518-EK01, CBX260518-EK02, ... resetting
-- daily. SECURITY DEFINER so service_role + the trigger below both
-- bypass RLS on the seq table.

create or replace function public.next_sack_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yymmdd text := to_char(timezone('Asia/Bangkok', now()), 'YYMMDD');
  v_seq    int;
begin
  insert into public.cargo_sack_seq (period_yymmdd, next_seq)
       values (v_yymmdd, 2)
  on conflict (period_yymmdd) do update
     set next_seq = cargo_sack_seq.next_seq + 1
   returning next_seq - 1 into v_seq;

  return 'CBX' || v_yymmdd || '-EK' || lpad(v_seq::text, 2, '0');
end;
$$;

comment on function public.next_sack_code() is
  'U2-5: returns the next sack code in CBX<YYMMDD>-EK<NN> format (e.g. CBX260518-EK01). Resets daily per Bangkok TZ. Mirrors the MOMO native code namespace per datanew L-4.';

-- ── 3) cargo_sacks table ────────────────────────────────────────────

create table if not exists public.cargo_sacks (
  id                  uuid primary key default gen_random_uuid(),

  -- CBX<YYMMDD>-EK<NN> — partner-issued by MOMO OR Pacred-issued
  -- via next_sack_code() when source='pacred'/'self'.
  code                text unique not null,

  -- Which container is this sack inside? Nullable for the brief
  -- window between sack creation + container assignment.
  cargo_container_id  uuid references public.cargo_containers(id) on delete set null,

  -- MOMO outside-of-bag measurements (the reconciliation reference).
  -- Distinct from cargo_shipments.received_cbm (per-shipment goods-
  -- inside measurement at the TH warehouse).
  weight_kg           numeric(12,2),
  cbm                 numeric(10,3),

  origin              text,                              -- e.g. CN-GZ, CN-YW (mirror cargo_containers)
  destination         text,                              -- e.g. TH-BKK

  -- Where did this row come from?
  source              text not null check (source in ('momo','pacred','self')) default 'momo',

  -- Optional timeline markers (lightweight — full lifecycle is on the parent container).
  packed_at           timestamptz,                       -- when staff/MOMO marked the sack closed
  arrived_at          timestamptz,                       -- when sack reached destination

  -- Free-text staff note (e.g. "ของกระจัดกระจาย — แยกตามสี")
  note                text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists cargo_sacks_container_idx
  on public.cargo_sacks(cargo_container_id) where cargo_container_id is not null;
create index if not exists cargo_sacks_source_updated_idx
  on public.cargo_sacks(source, updated_at desc);

drop trigger if exists cargo_sacks_updated_at_trigger on public.cargo_sacks;
create trigger cargo_sacks_updated_at_trigger
  before update on public.cargo_sacks
  for each row execute function public.set_updated_at();

comment on table  public.cargo_sacks is
  'U2-5: consolidation bag ("กระสอบรวม"). One sack bundles many cargo_shipments inside one cargo_container. Code namespace CBX<YYMMDD>-EK<NN>. MOMO measures the outside (weight_kg + cbm here); cargo_shipments.received_cbm is the per-shipment goods-inside measurement at TH warehouse. The gap between the two explains the U1-3 billing reconciliation lane (datanew L-3 / L-4).';
comment on column public.cargo_sacks.code is
  'CBX<YYMMDD>-EK<NN> sack code. Generated by next_sack_code() for self-issued; mirror of partner code for source=momo.';
comment on column public.cargo_sacks.weight_kg is
  'MOMO outside-of-bag weight in kg. Distinct from per-shipment weight inside the sack.';
comment on column public.cargo_sacks.cbm is
  'MOMO outside-of-bag CBM. Used as the billing-reconciliation reference; sum of inside-shipment CBMs may differ (the L-3 gap).';

-- ── 4) cargo_shipments.cargo_sack_id ────────────────────────────────

alter table public.cargo_shipments
  add column if not exists cargo_sack_id uuid
  references public.cargo_sacks(id) on delete set null;

create index if not exists cargo_shipments_sack_idx
  on public.cargo_shipments(cargo_sack_id) where cargo_sack_id is not null;

comment on column public.cargo_shipments.cargo_sack_id is
  'U2-5: optional sack this shipment is bundled inside. NULL = shipment is directly in the container without a sack (larger goods).';

-- ── 5) RLS ──────────────────────────────────────────────────────────

alter table public.cargo_sacks enable row level security;

-- Customer reads a sack only if they own ≥1 shipment in it OR ≥1
-- shipment in the parent container.
drop policy if exists cargo_sacks_customer_read on public.cargo_sacks;
create policy cargo_sacks_customer_read
  on public.cargo_sacks for select
  using (
    exists (
      select 1 from public.cargo_shipments s
       where s.cargo_sack_id = cargo_sacks.id
         and s.profile_id    = auth.uid()
    )
    or exists (
      select 1 from public.cargo_shipments s
       where s.cargo_container_id = cargo_sacks.cargo_container_id
         and s.profile_id         = auth.uid()
    )
  );

-- Admin write: super + ops + warehouse (mirror cargo_containers).
drop policy if exists cargo_sacks_admin_all on public.cargo_sacks;
create policy cargo_sacks_admin_all
  on public.cargo_sacks for all
  using      (public.is_admin(array['super','ops','warehouse']))
  with check (public.is_admin(array['super','ops','warehouse']));

-- ── 6) Verify (counts) ─────────────────────────────────────────────

do $$
declare
  rls_count int;
begin
  select count(*) into rls_count
    from pg_policies
   where schemaname = 'public' and tablename = 'cargo_sacks';
  if rls_count < 2 then
    raise warning 'cargo_sacks RLS expected ≥ 2 policies, found %', rls_count;
  else
    raise notice 'U2-5 cargo_sacks ready — % RLS policies installed', rls_count;
  end if;
end$$;
