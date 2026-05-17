-- ════════════════════════════════════════════════════════════
-- 0076 · G-10 — Editable business config (super-only single source)
-- ════════════════════════════════════════════════════════════
-- Source: docs/research/gap-admin.md G-10 — every "magic constant"
-- today (OTP TTL, min-deposit amount, cashback %, bank account list,
-- feature flags like LIFF enabled) is a code constant. Admin can't
-- tweak without a dev push. Slows ops + creates the "ask dev" rut.
--
-- ── Design ──────────────────────────────────────────────────
-- One table, one source of truth. Key/value/type/category schema.
-- lib/business-config.ts:
--   - getBusinessConfig(key, defaultValue) — 60s in-memory cache,
--     returns the typed value; falls back to defaultValue on miss.
--   - setBusinessConfig(key, value) — service-role write +
--     invalidates the cache key.
-- adminUpdateBusinessConfig (super only) calls setBusinessConfig
-- + writes audit log with before/after.
--
-- Admin UI at /admin/settings/business-config — tabbed by category
-- (OTP / Wallet / Cashback / Banks / Features). Type-aware editor
-- (number/boolean/json) + validation.
--
-- ── Schema ──────────────────────────────────────────────────
-- value is jsonb — flexible enough for number, string, boolean,
-- array, object. value_type hints the editor + validator. Note
-- that jsonb numbers MUST be unwrapped via `value->>0`-style or
-- `(value)::numeric` cast at read; the lib helper does this.
-- ════════════════════════════════════════════════════════════

create table if not exists public.business_config (
  key                     text primary key,
  value                   jsonb not null,
  value_type              text not null check (
    value_type in ('number','string','boolean','json','currency_thb','percent','duration_ms')
  ),
  category                text,
  description             text,
  updated_by_admin_id     uuid references public.profiles(id) on delete set null,
  updated_at              timestamptz not null default now(),
  created_at              timestamptz not null default now()
);

comment on table public.business_config is
  'G-10 — admin-editable business constants. Read via lib/business-config.ts (60s cache). Write via actions/admin/business-config.ts adminUpdateBusinessConfig (super only). Seeded from in-code defaults; an unset key falls back to the call-site defaultValue so the system never breaks on a missing row.';

create index if not exists business_config_category_idx
  on public.business_config(category);

-- ════════════════════════════════════════════════════════════
-- RLS — super read+write; ops/etc. read (other admin pages may
-- call getBusinessConfig); customer no access.
-- ════════════════════════════════════════════════════════════
alter table public.business_config enable row level security;

drop policy if exists "business_config_select_admin" on public.business_config;
create policy "business_config_select_admin" on public.business_config
  for select
  using (public.is_admin(array['super','ops','accounting','sales_admin']));

-- Writes go through the service-role client (createAdminClient) +
-- withAdmin(["super"]) at the app layer, so no RLS write policy.
-- This matches the pattern in 0015 (admins, settings, etc).

-- ════════════════════════════════════════════════════════════
-- Seed defaults — idempotent (do nothing on conflict)
-- ════════════════════════════════════════════════════════════
-- Source of truth for these values is currently scattered: OTP TTL
-- in lib/auth/otp.test.ts (5 * 60 * 1000), wallet min/max in
-- lib/validators/wallet.ts (positive() + max(1_000_000)), bank
-- accounts in components/seo/site.ts, etc. Seeding HERE makes the
-- table the eventual source — call-site code should migrate to
-- getBusinessConfig(key, hardcoded_default) progressively. Until
-- then, the table is read-mostly + the defaults match today's
-- behaviour, so adopting the helper is a no-op.

insert into public.business_config (key, value, value_type, category, description) values
  ('otp.ttl_ms',                  to_jsonb(300000),                              'duration_ms',   'OTP',      'OTP code time-to-live (ms). Default 5 minutes.'),
  ('otp.rate_limit_per_hour',     to_jsonb(3),                                   'number',        'OTP',      'Max OTP requests per (phone, purpose) per rolling hour.'),
  ('wallet.deposit_min_thb',      to_jsonb(1),                                   'currency_thb',  'Wallet',   'Minimum allowed deposit amount (THB). Should match lib/validators/wallet.ts positive() floor.'),
  ('wallet.deposit_max_thb',      to_jsonb(1000000),                             'currency_thb',  'Wallet',   'Maximum allowed deposit amount (THB). Should match lib/validators/wallet.ts max(1_000_000).'),
  ('wallet.withdraw_min_thb',     to_jsonb(100),                                 'currency_thb',  'Wallet',   'Minimum allowed withdraw amount (THB).'),
  ('wallet.withdraw_max_thb',     to_jsonb(1000000),                             'currency_thb',  'Wallet',   'Maximum allowed withdraw amount (THB).'),
  ('cashback.default_pct',        to_jsonb(0),                                   'percent',       'Cashback', 'Default cashback percent applied to completed orders (0..100).'),
  ('banks.deposit_accounts',      '[]'::jsonb,                                   'json',          'Banks',    'Bank accounts shown on /wallet/deposit page. Array of {bank,account_no,account_name,active}.'),
  ('features.liff_enabled',       to_jsonb(false),                               'boolean',       'Features', 'LIFF (LINE Front-end Framework) flow on customer portal. Default off until DV-2 ships.'),
  ('features.china_search_demo',  to_jsonb(true),                                'boolean',       'Features', 'China-search demo mode (ADR-0003 Option E).')
on conflict (key) do nothing;
