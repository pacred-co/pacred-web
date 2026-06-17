-- 0187_forwarder_custom_comparison.sql
-- ────────────────────────────────────────────────────────────────────────
-- Per-order ค่าเทียบ (KG-vs-CBM comparison) override — DURABLE persistence.
--
-- WHY (ภูม 2026-06-17 · owner confirmed "ให้สวิตซ์ค้างถาวรเลย"):
--   The forwarder edit-form's "คิดค่าเทียบแบบกำหนดเอง" toggle
--   (customComparison + ค่าเทียบ value) recomputed the price on save but had
--   NO tb_forwarder column to store the per-order override — so the toggle
--   re-seeded from the customer's general tb_users.userComparison on every
--   reload (the price persisted via ftotalprice, but the SWITCH state did not).
--   These two columns make the per-order override durable: once saved ON, the
--   toggle stays ON with its value on reload.
--
-- MONEY-SAFETY:
--   · Additive only — no existing column/row touched · default '0'/0 = "no
--     per-order override" = the prior compute-only behaviour for every existing
--     row (the resolver reads the customer's tb_users value when this is '0').
--   · NOT a new pricing input by itself — the resolver
--     (lib/forwarder/resolve-rate.ts) already accepts the comparison
--     switch/value; this only stores what the admin chose so it can be
--     re-seeded. The rate math is unchanged.
--
--   custom_comparison        varchar(1)  — '1' = this order uses its own ค่าเทียบ
--                                          (wins over tb_users.userComparison) ·
--                                          '0'/NULL = follow the customer default.
--   custom_comparison_value  numeric     — the per-order ค่าเทียบ threshold
--                                          (1 คิว = N kg) · only meaningful when
--                                          custom_comparison = '1'.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE tb_forwarder
  ADD COLUMN IF NOT EXISTS custom_comparison       varchar(1) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS custom_comparison_value numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN tb_forwarder.custom_comparison IS
  'Per-order ค่าเทียบ override switch — ''1'' = use custom_comparison_value (wins over tb_users.userComparison) · ''0'' = follow the customer default. (0187 · ภูม 2026-06-17)';
COMMENT ON COLUMN tb_forwarder.custom_comparison_value IS
  'Per-order ค่าเทียบ threshold (1 คิว = N kg) — only when custom_comparison = ''1''. (0187 · ภูม 2026-06-17)';
