-- ════════════════════════════════════════════════════════════
-- 0106 · notifications.delivered_line_notify_at — Sprint-2 P1.3
-- ════════════════════════════════════════════════════════════
-- The G5 LINE Notify foundation (migration 0101) adds per-customer
-- access tokens to `profiles`. Sprint-2 P1.3 wires the dispatcher cron
-- that fans those notifications out to the customer's connected LINE
-- Notify channel. To keep this push channel idempotent + observable
-- without colliding with the existing LINE Messaging-API delivery
-- tracking (`notifications.delivered_line_at`), we add a dedicated
-- per-row timestamp column.
--
-- Semantics:
--   NULL                     → never pushed via LINE Notify
--   <timestamptz value>      → pushed successfully at this time (the
--                              dispatcher refuses to re-push when this
--                              column is set, except after a manual
--                              admin reset).
--
-- The cron runs every N minutes, scans `notifications` rows where
-- `delivered_line_notify_at IS NULL` AND the customer has a
-- `line_notify_token` set AND the per-event channel is not explicitly
-- false on `profiles.line_notify_channels`. Successful pushes stamp
-- this column; transient failures log to `last_delivery_error` +
-- increment `delivery_attempts` so the cron retries on the next tick.
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

alter table public.notifications
  add column if not exists delivered_line_notify_at timestamptz;

-- Partial index for the dispatcher scan: "notifications pending LINE
-- Notify push, oldest first". Keeps the cron's scan tight even with
-- 8K+ customers and tens of thousands of notifications already pushed.
create index if not exists notifications_line_notify_pending_idx
  on public.notifications (created_at)
  where delivered_line_notify_at is null;

comment on column public.notifications.delivered_line_notify_at is
  'When this notification was successfully pushed to the customer''s LINE Notify channel (per-user OAuth, EOL transition). Separate from delivered_line_at (LINE Messaging API channel) because the two paths coexist during the LINE Notify EOL window. NULL = never pushed via LINE Notify.';
