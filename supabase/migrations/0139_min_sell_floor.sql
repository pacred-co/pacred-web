-- ════════════════════════════════════════════════════════════════
-- 0139 — Sales min-sell floor (pricing guardrail) seed.
-- Lane C · 2026-06-04 · global-trade-group-2026-06-04.md §5.
-- ════════════════════════════════════════════════════════════════
-- "Sales min-sell guardrail: define the lowest a sales rep may quote —
--  e.g. 2,900 / 4,900 (กว่างโจว / อี้อู) + เรือ 300."
--
-- The floor is the lowest China→Thailand transport PRICE a sales rep / CS may
-- quote, per origin warehouse + transport mode. It is the per-route mirror of
-- the CEO profit-CAP (≤15k/ตู้ · lib/pricing/margin-advisory.ts) — that one is
-- the ceiling, this is the floor.
--
-- Config home (ADR-0024): `business_config` is the canonical home for
-- Pacred-native config that the LEGACY pricing engine does NOT read. The
-- min-sell floor is a Pacred SALES POLICY (not a tb_rate_* rate), so it lives
-- here — editable via /admin/settings/business-config (JSON value_type → the
-- editor renders a textarea). No new editor page needed.
--
-- Shape (consumed by lib/pricing/min-sell.ts MinSellFloors):
--   base      : THB floor per origin warehouse  (1=กวางโจว · 2=อี้อู)
--   surcharge : additive THB per transport mode (1=รถ · 2=เรือ · 3=อากาศ)
--   enabled   : master switch (false = guardrail inert)
--   block     : false = hard-WARN (overridable) · true = hard-BLOCK the quote
-- Effective floor for a route = base[warehouse] + surcharge[transport].
--
-- Defaults below = the owner's example (กว่างโจว 2,900 · อี้อู 4,900 · เรือ +300).
-- Mirrors lib/pricing/min-sell.ts DEFAULT_MIN_SELL_FLOORS so applying this
-- migration is OPTIONAL — the loader falls back to the same defaults if the
-- row is missing. Idempotent: ON CONFLICT (key) DO NOTHING preserves later
-- admin edits.
-- ════════════════════════════════════════════════════════════════

insert into public.business_config (key, value, value_type, category, description)
values
  (
    'pricing.min_sell_floor',
    '{
       "base":      { "1": 2900, "2": 4900 },
       "surcharge": { "1": 0,    "2": 300, "3": 0 },
       "enabled":   true,
       "block":     false
     }'::jsonb,
    'json',
    'pricing',
    'ราคาขายขั้นต่ำที่เซลเสนอได้ (Sales min-sell floor) — base ต่อโกดัง (1=กวางโจว 2=อี้อู) + surcharge ต่อขนส่ง (1=รถ 2=เรือ 3=อากาศ) · ราคาขั้นต่ำ = base[โกดัง]+surcharge[ขนส่ง] · enabled=เปิด/ปิด · block=true เพื่อบล็อก, false เพื่อเตือน'
  )
on conflict (key) do nothing;
