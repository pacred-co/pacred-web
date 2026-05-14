-- ════════════════════════════════════════════════════════════
-- P-15 · Extend notifications.category CHECK to include
--        'sales_digest' for the daily sales digest cron.
-- ════════════════════════════════════════════════════════════
-- Original CHECK constraint set in 0014_notifications.sql allowed
-- 8 customer-facing event categories. P-15 spec calls for
-- category='sales_digest' on each admin notification dispatched
-- by /api/cron/sales-daily-digest — needs a new enum value.
--
-- Idempotent: drops + recreates with the new value appended.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════

alter table public.notifications
  drop constraint if exists notifications_category_check;

alter table public.notifications
  add constraint notifications_category_check
  check (category in (
    'order',
    'payment',
    'forwarder',
    'yuan_payment',
    'wallet',
    'sales',
    'system',
    'promo',
    'sales_digest'
  ));
