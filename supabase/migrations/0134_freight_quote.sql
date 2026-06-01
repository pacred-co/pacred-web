-- ════════════════════════════════════════════════════════════
-- 0134 · freight_quote — public freight RFQ lead capture (AX BOOKING funnel)
-- ════════════════════════════════════════════════════════════
-- Opens the FREIGHT revenue line. A PUBLIC freight quote-request wizard at
-- `/freight-quote` (ported from the AXELRA "AX BOOKING" 5-step prototype)
-- captures a structured RFQ from any visitor → one `freight_quote` row →
-- notifies the sales group. The sales rep then turns a hot lead into the
-- by-the-book B2B quotation (the SEPARATE, plural `freight_quotes` admin
-- entity in 0048 with line-items + approval) and a `freight_shipments` job.
--
-- ⚠️ NAMING — DO NOT CONFUSE (two distinct tables):
--   • `freight_quote`   (THIS · singular) = the PUBLIC inbound RFQ / lead.
--                         anon-insertable. The top of the freight funnel.
--   • `freight_quotes`  (0048 · plural)   = the admin-issued, line-itemed,
--                         approval-gated B2B QUOTATION (Pricing team mints it).
--   A `freight_quote` lead, once a rep engages, may result in a `freight_quotes`
--   quotation — but they are different lifecycle stages, not the same row.
--
-- ISOLATION RULES (per owner safety constraints):
--   ✅ Creates ONE new table only. NO FK to legacy tb_* (profile_id → profiles
--      is the one soft link, ON DELETE SET NULL, matching contact_messages).
--   ✅ RLS = public INSERT (anon RFQ submit) + admin/service_role read+triage
--      (mirrors public.contact_messages exactly).
--   ❌ No ALTER/DROP/RENAME/TRUNCATE of any existing table or enum.
--
-- Idempotent (safe to re-run): create … if not exists · policies drop-then-create.
-- ════════════════════════════════════════════════════════════

create table if not exists public.freight_quote (
  id              uuid primary key default gen_random_uuid(),
  ref             text not null unique,                         -- AX-YYYY-NNNNN public ref shown to the customer

  -- ── who / what service (Step 1) ──
  customer_type   text not null default 'person'
                    check (customer_type in ('person','company')),
  service         text not null default 'import'
                    check (service in ('import','export','customs','nondoc','clearance')),

  -- ── transport + terms (Step 2) ──
  transport       text                                          -- 'sea' | 'air' | 'truck'
                    check (transport is null or transport in ('sea','air','truck')),
  incoterm        text                                          -- EXW | FOB | CIF | DDP | CFR
                    check (incoterm is null or incoterm in ('EXW','FOB','CIF','DDP','CFR')),
  load_type       text                                          -- FCL | LCL
                    check (load_type is null or load_type in ('FCL','LCL')),
  container_size  text,                                         -- '20GP' | '40GP' | '40HC' | '45HC' | null
  carrier         text,                                         -- preferred carrier (AXELRA/COSCO/…) — free-form

  -- ── routing + goods (Step 3) ──
  origin          text,                                         -- CN city / origin
  destination     text,                                         -- POD / delivery place
  product         text,                                         -- commodity description
  goods_value_usd numeric(14,2),                                -- approx invoice value
  cbm             numeric(12,3),                                -- LCL volume
  weight_kg       numeric(12,2),                                -- gross weight (or AIR actual weight)

  -- ── add-ons + permit flags + docs (Step 4, jsonb so the wizard can grow) ──
  addons          jsonb not null default '[]'::jsonb,           -- ['หัวลาก','แรงงาน','ประกัน','ล่าม',…]

  -- ── estimate snapshot (client-side rough estimate, for sales context only) ──
  est_total_thb   numeric(14,2),                                -- the "ประมาณการ" total shown to the customer

  -- ── contact (Step 5) ──
  contact_name    text not null,
  contact_phone   text not null,
  contact_line    text,
  contact_email   text,
  contact_pref    text not null default 'form'                  -- how they want the follow-up
                    check (contact_pref in ('form','call','line')),
  note            text,

  -- ── lifecycle + provenance ──
  status          text not null default 'new'
                    check (status in ('new','contacted','quoted','won','lost','spam')),
  profile_id      uuid references public.profiles(id) on delete set null,  -- soft link if logged in
  source_url      text,
  user_agent      text,
  ip              text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.freight_quote is
  'Public freight RFQ / lead (AX BOOKING funnel). Singular = the inbound lead; NOT the same as plural freight_quotes (admin B2B quotation, 0048). Anon-insertable; admin reads + triages. Created 2026-06-01.';

create index if not exists freight_quote_status_idx
  on public.freight_quote(status, created_at desc);
create index if not exists freight_quote_profile_idx
  on public.freight_quote(profile_id);
create index if not exists freight_quote_created_idx
  on public.freight_quote(created_at desc);

drop trigger if exists freight_quote_updated_at_trigger on public.freight_quote;
create trigger freight_quote_updated_at_trigger
  before update on public.freight_quote
  for each row execute function public.set_updated_at();

-- ── RLS (mirrors public.contact_messages) ──
alter table public.freight_quote enable row level security;

-- Anyone (anon + authenticated) may submit an RFQ
drop policy if exists freight_quote_insert_anyone on public.freight_quote;
create policy freight_quote_insert_anyone
  on public.freight_quote for insert
  with check (true);

-- Authenticated users see their own past submissions
drop policy if exists freight_quote_select_own on public.freight_quote;
create policy freight_quote_select_own
  on public.freight_quote for select
  using (profile_id is not null and auth.uid() = profile_id);

-- Admins read + update everything (status triage)
drop policy if exists freight_quote_admin_all on public.freight_quote;
create policy freight_quote_admin_all
  on public.freight_quote for all
  using (public.is_admin())
  with check (public.is_admin());
