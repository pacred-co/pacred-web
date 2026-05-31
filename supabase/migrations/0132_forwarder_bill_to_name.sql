-- ============================================================
-- 0132 — bill-to-name override on tb_forwarder (Pacred-original)
-- ============================================================
-- Theme: bill-to-override (re-sweep · the one genuinely Pacred-original
-- forwarder editor field — there is NO legacy tb_forwarder column for it).
--
-- Owner decision 2026-06-01: a single OPTIONAL per-forwarder string is best
-- modeled as a COLUMN, not a side-table (a whole table + join for one nullable
-- value is overkill). `ADD COLUMN` nullable with NO default is a Postgres
-- METADATA-ONLY change — instant even on the 47k-row tb_forwarder (no table
-- rewrite, no row touch). This is the faithful target of the rebuilt
-- `forwarders.bill_to_name_override`; the admin action repoints to it.
--
-- Null = use the ship-to name on the invoice/receipt (default).
-- varchar(200) matches the rebuilt column + faddressname width.
--
-- Idempotent: IF NOT EXISTS → safe to re-run.
-- ============================================================

ALTER TABLE public.tb_forwarder
  ADD COLUMN IF NOT EXISTS fbilltoname varchar(200);

COMMENT ON COLUMN public.tb_forwarder.fbilltoname IS
  'Pacred bill-to-name override for the invoice/receipt (migration 0132). NULL = use the ship-to name. Faithful target of the rebuilt forwarders.bill_to_name_override.';
