-- ════════════════════════════════════════════════════════════
-- V-G5 · org_contacts (owner-self-serve org contact management)
-- ════════════════════════════════════════════════════════════
-- Per port-spec `admin-polish-bundle.md` §V-G5.
--
-- Pacred currently has contact constants hardcoded in
-- `components/seo/site.ts` (CONTACT.email*, SOCIAL.*, ADDRESSES.*, LINE_OA.*,
-- BANK.*). Owner can't self-serve update — every change requires a code
-- deploy. V-G5 adds a DB-backed `org_contacts` table that the owner can
-- manage via `/admin/settings/contacts`.
--
-- V1 = backend management surface only. Customer-side reads (footer,
-- contact-us page) keep using site.ts; integration deferred to V-G5.1
-- (when owner actually populates the table + tests on staging).
--
-- This migration introduces:
--   1. org_contacts table — single row per contact value, kind discriminator
--   2. RLS — admin write, public read (active rows)
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) org_contacts ------------------------------------------------------
create table if not exists public.org_contacts (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null check (kind in (
                         'domain',     -- pacred.co · pcscargo.com (legacy)
                         'email',      -- sales@pacred.co etc.
                         'line_oa',    -- LINE OA basic/premium IDs + add-friend URLs
                         'phone',      -- 02-421-3325 · 066-125-3007
                         'wechat',     -- WeChat IDs
                         'social',     -- Facebook · Instagram · TikTok · YouTube
                         'address'     -- HQ · warehouse
                       )),
  label                text not null,            -- "ฝ่ายขาย", "Cargo line", "Bangkok HQ"
  value                text not null,            -- the actual value (email / URL / phone / etc.)
  department           text,                     -- optional grouping for emails (ขาย / บัญชี / HR)
  is_active            boolean not null default true,
  display_order        smallint not null default 0,
  notes                text,                     -- internal-only — not customer-facing

  created_by_admin_id  uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Indexes ---------------------------------------------------------------
create index if not exists org_contacts_kind_active_idx
  on public.org_contacts(kind, is_active);
create index if not exists org_contacts_display_order_idx
  on public.org_contacts(kind, display_order);

-- updated_at auto-touch.
drop trigger if exists org_contacts_updated_at_trigger on public.org_contacts;
create trigger org_contacts_updated_at_trigger
  before update on public.org_contacts
  for each row execute function public.set_updated_at();

-- 2) RLS ---------------------------------------------------------------
alter table public.org_contacts enable row level security;

-- Public can read ACTIVE rows (no auth required — for landing footer +
-- contact-us page). Inactive rows hidden from public.
drop policy if exists org_contacts_public_read on public.org_contacts;
create policy org_contacts_public_read
  on public.org_contacts for select
  using (is_active = true);

-- Admin (super + accounting + sales_admin) full access — super for
-- ownership, accounting for invoice/receipt contact info, sales_admin
-- for sales-rep phone/LINE updates.
drop policy if exists org_contacts_admin_all on public.org_contacts;
create policy org_contacts_admin_all
  on public.org_contacts for all
  using      (public.is_admin(array['super','accounting','sales_admin']))
  with check (public.is_admin(array['super','accounting','sales_admin']));

-- 3) Comments ----------------------------------------------------------
comment on table  public.org_contacts is
  'V-G5 — owner-self-serve org contact info. Replaces hardcoded constants in components/seo/site.ts. V1 = backend management only; customer-side read integration deferred to V-G5.1.';
comment on column public.org_contacts.kind is
  'Contact type discriminator. domain | email | line_oa | phone | wechat | social | address.';
comment on column public.org_contacts.value is
  'The actual value (email address, URL, phone number, address line, etc.).';
comment on column public.org_contacts.department is
  'Optional grouping for emails (ขาย / บัญชี / HR) or phones (CS / sales / company main).';
comment on column public.org_contacts.is_active is
  'Inactive rows hidden from public read but kept for history. Toggle via admin UI without deleting.';
comment on column public.org_contacts.display_order is
  'Per-kind ordering (lower = first). Admin UI uses drag-to-reorder.';
