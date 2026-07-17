-- 0260 — ⚠️ DRAFT · NOT APPLIED · OWNER DECISION REQUIRED ⚠️
-- MOMO cost default: un-flatten ROAD vs SEA. (owner 2026-07-17:
-- "เรท รถ และ เรือ ไม่เท่ากันนะครับ")
--
-- ══ WHY THIS EXISTS ══
-- 0194 set ALL EIGHT MOMO cost cells to 2,500 — both fcostship*defaultmomo (sea)
-- AND fcostcar*defaultmomo (road) — collapsing two different rates into one
-- number. Its own header even records the counter-evidence it then ignored:
-- "one invoice line was 4,700". The pre-0194 defaults were per-mode (sea 2,900 /
-- road 4,500); 0194 replaced them with a single flat 2,500. That flattening is
-- the regression the owner flagged.
--
-- ══ PROD EVIDENCE (read-only probe · 2026-07-17 · 44 containers / 601 rows) ══
-- What accounting ACTUALLY types at ตรวจตู้ (tb_cost_container), by mode:
--     ROAD (GZE*) : 4,700 — 5 of 5 containers, unanimous
--     SEA  (GZS*) : 2,500 — 23 of 23 containers, unanimous
-- Road is ~88% dearer than sea. The global default says they are identical.
--
-- ══ BLAST RADIUS (why this is small but NOT zero) ══
-- tb_settings is a FALLBACK only — tier 2 of the cost waterfall (lib/forwarder/
-- resolve-cost.ts). Any container accounting has rated uses tier 1 and is
-- unaffected by this migration. Probe: 0 of 601 rows currently carry a stored
-- cost derived from the tb_settings default — every attributable booked cost
-- (228 rows) came from the per-container rate. So this changes NO existing
-- booked money.
-- It DOES change:
--   (a) the live figure shown for a not-yet-rated ROAD container — today the
--       panel under-quotes those at 2,500 (e.g. GZE260709-1 / -0712-1 / -0714-1 /
--       -0716-1 · 158 rows, all stored cost = 0, none rated yet);
--   (b) what adminReportCntResetRate() WRITES if someone resets a road
--       container's rate (report-cnt-detail.ts:379 reads tb_settings) — today
--       that would book road cost at 2,500 = ~47% understated.
--
-- ══ 🔴 OWNER MUST CONFIRM BEFORE APPLYING ══
-- 1. Is 4,700 the standing MOMO ROAD rate, or was it specific to these 5
--    containers? (4,700 is unanimous in prod but the sample is 5.)
-- 2. Sea stays 2,500 — confirm.
-- 3. Yiwu cells (…momo2) stay 0/untouched — every invoice is Guangzhou, and we
--    never guess a rate.
-- Accounting can also do this from the UI without a migration:
--    /admin/settings/forwarder-costs  → MOMO → รถ → 4,700
-- The UI is the better route if the number is still being negotiated; this file
-- exists so the change is auditable + one command if the owner prefers that.
--
-- APPLY (only after the owner confirms):
--   SUPABASE_DB_PASSWORD=… node scripts/apply-migration-generic.mjs \
--     supabase/migrations/0260_momo_cost_road_vs_sea_DRAFT_NOT_APPLIED.sql --apply
--
-- COST cells only — no SELL/rate-card column is touched. Idempotent.

-- ROAD (รถ · GZE/EK) — accounting's unanimous rate.
UPDATE tb_settings SET
  fcostcar1defaultmomo = 4700, fcostcar2defaultmomo = 4700,
  fcostcar3defaultmomo = 4700, fcostcar4defaultmomo = 4700;

-- SEA (เรือ · GZS) — unchanged at 2,500; restated so the pair is explicit and
-- a future reader sees BOTH modes in one place (the 0194 failure was that the
-- road cells were changed silently alongside the sea ones).
UPDATE tb_settings SET
  fcostship1defaultmomo = 2500, fcostship2defaultmomo = 2500,
  fcostship3defaultmomo = 2500, fcostship4defaultmomo = 2500;
