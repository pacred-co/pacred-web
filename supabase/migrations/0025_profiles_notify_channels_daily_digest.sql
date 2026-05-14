-- ════════════════════════════════════════════════════════════
-- P-15 · Add daily_digest flag to profiles.notify_channels jsonb
-- ════════════════════════════════════════════════════════════
-- Per Part O2 Sprint 6 P-15 (เดฟ assigned 2026-05-14): the
-- /api/cron/sales-daily-digest endpoint loops admins where
--   role IN ('super','sales_admin') AND notify_channels.daily_digest = true
-- and calls sendNotification() per opted-in admin.
--
-- The notify_channels column already exists (migration 0014), used
-- for {line, email} toggles. We extend the JSON shape with a third
-- key. Default: false — admins must opt in via /profile (UI work
-- can come later; for now toggle via Supabase Table Editor).
--
-- Idempotent — uses jsonb || merge so existing keys stay.
-- ════════════════════════════════════════════════════════════

update public.profiles
   set notify_channels = coalesce(notify_channels, '{}'::jsonb) || '{"daily_digest": false}'::jsonb
 where notify_channels is null
    or notify_channels->>'daily_digest' is null;

-- New rows: notify_channels has no enforced default key shape, so
-- the cron endpoint treats `notify_channels->>'daily_digest' = 'true'`
-- as opt-in (anything else, including null/missing, = opt-out).
