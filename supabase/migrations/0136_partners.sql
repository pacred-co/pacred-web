-- ════════════════════════════════════════════════════════════
-- 0136 · partners — external logistics/business partner directory (staff-CRUD gap §PM-6)
-- ════════════════════════════════════════════════════════════
-- CLAUDE.md §PM-6 #3 + docs/research/legacy-gap-2026-05-30/_MASTER.md §3.3:
--   "CRUD: partner — no table/role/page exists (build new: a partners table
--    + routes + actions)."
--
-- WHAT THIS IS (the most-likely interpretation — see the morning-review note
-- in the commit summary): an ADMIN-MANAGED DIRECTORY of the external companies
-- Pacred works with in its logistics/customs/cargo supply chain — the
-- GOGO / JMF / TTP / MOMO / CargoThai / ไอแต้ม-style consolidators, the
-- china-side warehouse partners (sang/ctt/mk/mx), customs brokers, last-mile
-- carriers, messenger services, API providers. Today these names live
-- hardcoded across enums (forwarders.partner_warehouse) + integration env +
-- chat — there is no single place to list/edit them. This table is that
-- single source of truth (a CRM-style company card, NOT an API-config wiring
-- and NOT a partner-portal login).
--
-- ⚠️ SCOPE (MVP — deliberately minimal):
--   • Directory CRUD only. NO partner-portal login role/auth (the audit's
--     "+ partner role" hint = a FUTURE partner-portal login — explicitly out
--     of scope this pass; noted for the owner's review).
--   • NO link/FK to the live MOMO/JMF/TTP/CargoThai integration configs yet
--     (those stay in lib/integrations/* + env). A future `code` ↔ integration
--     map can be layered on without a schema change.
--
-- ISOLATION RULES (per owner safety constraints · mirrors freight_quote 0134):
--   ✅ Creates ONE new table only. NO FK to legacy tb_* (fully isolated, like
--      momo_* / freight_quote / carriers).
--   ✅ RLS = admin/service_role only (no public read — internal directory).
--   ❌ No ALTER/DROP/RENAME/TRUNCATE of any existing table or enum.
--
-- Idempotent (safe to re-run): create … if not exists · policies drop-then-create.
-- NOT APPLIED TO PROD by the agent — เดฟ applies (direct-DB is back up).
-- ════════════════════════════════════════════════════════════

create table if not exists public.partners (
  id            uuid primary key default gen_random_uuid(),

  -- Stable lowercase code for programmatic refs ("gogo", "jmf", "ttp",
  -- "momo", "cargothai", "sang", "ctt", "mk", "mx"). Used in URLs +
  -- future integration-config lookups. Immutable after first reference
  -- (orphans future links) — edit semantics enforce this in the action.
  code          text not null unique,

  -- Display name (TH/primary). name_en optional for the EN UI + docs.
  name          text not null,
  name_en       text,

  -- What kind of partner — drives grouping/filtering in the directory.
  -- Free-text-with-CHECK so the list can grow without a Postgres enum
  -- migration (Pacred convention — same as freight_quote.service).
  partner_type  text not null default 'other'
                  check (partner_type in (
                    'cargo_consolidator',  -- จีน→ไทย consolidator (GOGO/JMF/TTP-style)
                    'freight',             -- FCL/LCL freight forwarder / liner
                    'customs',             -- customs broker / ตัวแทนออกของ
                    'warehouse',           -- china/thai warehouse partner (sang/ctt/mk/mx)
                    'last_mile',           -- last-mile carrier (overlaps `carriers` — kept for completeness)
                    'messenger',           -- messenger / errand service
                    'api_provider',        -- a partner whose API we consume (MOMO/CargoThai)
                    'other'
                  )),

  -- Primary contact (a single contact card — keep it simple for the MVP).
  contact_name  text,
  contact_phone text,
  contact_email text,

  -- Free-form admin notes (contract terms, rate-sheet link, account no., …).
  note          text,

  -- Soft-delete: mark inactive without deleting (preserves history). The
  -- action ALSO supports hard-delete (the staff-CRUD audit explicitly
  -- wanted hard-delete capability) — but soft is the default safe path.
  is_active     boolean not null default true,

  -- Manual sort order for the admin list.
  sort          int not null default 100,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.partners is
  'External logistics/business partner directory (GOGO/JMF/TTP/MOMO/CargoThai/warehouse/customs/etc.). Admin-managed CRM-style company cards. NOT partner-portal login, NOT API-config wiring. Created 2026-06-02 (staff-CRUD gap §PM-6 · MVP).';
comment on column public.partners.code is
  'Stable lowercase identifier — used in URLs + future integration-config lookups. Treated as immutable after creation (do soft-delete + recreate if the code itself was wrong).';
comment on column public.partners.partner_type is
  'cargo_consolidator | freight | customs | warehouse | last_mile | messenger | api_provider | other.';

-- Code format guard: lowercase letters/digits/underscore, 2-32 chars.
alter table public.partners
  drop constraint if exists partners_code_format_chk;
alter table public.partners
  add constraint partners_code_format_chk
  check (code ~ '^[a-z0-9_]+$' and char_length(code) between 2 and 32);

create index if not exists partners_active_sort_idx
  on public.partners(is_active, sort, name);
create index if not exists partners_type_idx
  on public.partners(partner_type);

-- updated_at trigger (set_updated_at() exists from earlier migrations)
drop trigger if exists partners_updated_at_trigger on public.partners;
create trigger partners_updated_at_trigger
  before update on public.partners
  for each row execute function public.set_updated_at();

-- ── RLS — admin/service_role only (internal directory, no public read) ──
alter table public.partners enable row level security;

drop policy if exists partners_admin_all on public.partners;
create policy partners_admin_all
  on public.partners for all
  using      (public.is_admin(array['super']))
  with check (public.is_admin(array['super']));

-- (No seed — the owner/staff populate this from the directory UI. The
--  candidate seeds GOGO/JMF/TTP/MOMO/CargoThai/sang/ctt/mk/mx are noted in
--  the commit summary for the owner to confirm partner_type mapping first.)
