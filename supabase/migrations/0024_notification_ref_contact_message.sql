-- ════════════════════════════════════════════════════════════
-- 0024 · Extend notifications.reference_type to include
--       'contact_message' so admin notifications fired by P-6
--       (commit 3a9252e + admin page 8db9140) can deep-link.
-- ════════════════════════════════════════════════════════════
-- Original CHECK constraint set in 0014_notifications.sql allowed
-- only customer-side reference types. Admin-side notifications
-- (e.g. "ข้อความใหม่จากฟอร์มติดต่อ") need 'contact_message' too.
--
-- Idempotent: drops + recreates the constraint with both old and
-- new values. Safe to re-run.
-- ════════════════════════════════════════════════════════════

alter table public.notifications
  drop constraint if exists notifications_reference_type_check;

alter table public.notifications
  add constraint notifications_reference_type_check
  check (reference_type in (
    'service_order',
    'forwarder',
    'yuan_payment',
    'wallet_transaction',
    'sales_commission',
    'sales_payout',
    'contact_message'
  ));
