-- ════════════════════════════════════════════════════════════
-- U2-3 · carriers (last-mile + international shipping providers)
-- ════════════════════════════════════════════════════════════
-- Per Part U U2-3 + chat audit L-8: SPX/J&T/Flash/EMS/Lalamove are
-- hardcoded in PHP today. Staff has asked to add new carriers ~4 times
-- in 6 weeks (DOC SHIPPING + AIR IMPORT chats). This migration adds an
-- admin-managed `carriers` table so adding a new carrier becomes an
-- admin action, not a dev escalation.
--
-- Scope (V1):
--   - Table + indexes + RLS (super/ops can write; everyone reads)
--   - No FK from existing forwarders/cargo_shipments yet (bigger change;
--     deferred to a follow-up). For now `forwarders.partner_warehouse`
--     stays as enum (china-side warehouse — different concept).
--   - Future: add `carrier_id` to cargo_shipments for THAILAND-side
--     last-mile carrier tracking.
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

create table if not exists public.carriers (
  id                    uuid primary key default gen_random_uuid(),
  -- Stable code for programmatic refs ("spx", "jnt", "flash"). Lowercase,
  -- alphanumeric + underscore. Used in URLs / API keys / future shipment
  -- FK lookups.
  code                  text not null unique,
  name_th               text not null,
  name_en               text not null,

  -- Tracking-URL template — `{tracking}` placeholder substituted by app.
  -- E.g. "https://www.spx.co.th/track?no={tracking}"
  tracking_url_template text,

  -- Admin can mark a carrier inactive without deleting (preserves
  -- historical references in audit logs / future shipment FKs).
  is_active             boolean not null default true,

  -- Manual sort order for admin UI + customer-facing dropdowns.
  sort_order            int not null default 100,

  -- Free-form notes (e.g., contact person, contract terms, rate sheet
  -- link). Admin-only.
  note                  text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists carriers_active_sort_idx
  on public.carriers(is_active, sort_order, name_th);

-- Code format guard: lowercase letters/digits/underscore only.
alter table public.carriers
  drop constraint if exists carriers_code_format_chk;
alter table public.carriers
  add constraint carriers_code_format_chk
  check (code ~ '^[a-z0-9_]+$' and char_length(code) between 2 and 32);

-- updated_at trigger (set_updated_at() exists from earlier migrations)
drop trigger if exists carriers_updated_at_trigger on public.carriers;
create trigger carriers_updated_at_trigger
  before update on public.carriers
  for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────
-- Read: anyone authenticated (customer-facing dropdown will need this
-- when shipment-level carrier FK is wired). Write: super or ops.
alter table public.carriers enable row level security;

drop policy if exists carriers_authenticated_read on public.carriers;
create policy carriers_authenticated_read
  on public.carriers for select
  to authenticated
  using (true);

drop policy if exists carriers_admin_write on public.carriers;
create policy carriers_admin_write
  on public.carriers for all
  using      (public.is_admin(array['super','ops']))
  with check (public.is_admin(array['super','ops']));

-- ── Seed: the 5 carriers staff explicitly mentioned in chat ──────────
-- ON CONFLICT (code) DO NOTHING so re-running the migration doesn't
-- overwrite admin edits to name/url/note made after first apply.
insert into public.carriers (code, name_th, name_en, tracking_url_template, sort_order) values
  ('spx',      'Shopee Express',  'Shopee Express',  'https://spx.co.th/track?no={tracking}',                10),
  ('jnt',      'J&T Express',     'J&T Express',     'https://www.jtexpress.co.th/index/query/gzquery.html?bills={tracking}', 20),
  ('flash',    'Flash Express',   'Flash Express',   'https://www.flashexpress.com/fle/tracking?se={tracking}',              30),
  ('ems',      'ไปรษณีย์ไทย EMS', 'Thailand Post EMS','https://track.thailandpost.co.th/?trackNumber={tracking}',           40),
  ('lalamove', 'Lalamove',        'Lalamove',        null,                                                                  50)
on conflict (code) do nothing;

-- Comments
comment on table  public.carriers is
  'Last-mile + international shipping carriers (SPX, J&T, Flash, EMS, Lalamove, etc.). U2-3 — admin can CRUD without dev escalation.';
comment on column public.carriers.tracking_url_template is
  'Template with {tracking} placeholder; app substitutes the tracking number for a clickable customer link.';
comment on column public.carriers.code is
  'Stable lowercase identifier — used in URLs, API keys, future cargo_shipments.carrier_id lookups. Cannot edit after first reference (do soft-delete via is_active=false instead).';
