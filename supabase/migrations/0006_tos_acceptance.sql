-- ════════════════════════════════════════════════════════════
-- Phase B6 — TOS (Terms of Service) acceptance gate
-- ════════════════════════════════════════════════════════════
-- Legacy mapping: tb_terms_service (per-user version log) → two
-- columns on profiles. We don't need the full history at the
-- customer side; if compliance ever needs an audit trail, add a
-- terms_acceptance_log table in admin phase (G).
--
-- The current TOS version is a constant in lib/tos.ts (CURRENT_TOS_
-- VERSION). When marketing publishes new terms, bump the constant
-- and every existing user sees the acceptance modal on next login.
-- ════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists tos_accepted_version text,
  add column if not exists tos_accepted_at      timestamptz;
