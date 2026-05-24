-- ════════════════════════════════════════════════════════════
-- G5 · LINE Notify per-user OAuth (legacy port — transition impl)
-- ════════════════════════════════════════════════════════════
-- Adds the per-user LINE Notify access token columns to `profiles`
-- so the legacy "Connect LINE Notify" button keeps working for migrated
-- PCS customers. Mirrors legacy tb_users.userLineNotify (single string
-- token per user) but enriches with:
--   · connected_at (timestamptz)  — when the OAuth grant landed
--   · channels (jsonb)            — per-event subscription map
--                                   e.g. {"order_created": true, "shipment_arrived": true}
--
-- Legacy reference:
--   pcsc/public_html/member/api/linenotify/callback/index.php
--     UPDATE tb_users SET userLineNotify='$access_token' WHERE userID='$userID'
--   pcsc/public_html/run-time/line/index.php
--     sendLineNotify($token, $sMessage)  — POST notify-api.line.me/api/notify
--
-- ⚠️ LINE Notify service is EOL April 2025 (announced by LINE Corp). This
--    port keeps existing connect-buttons functional for migrated customers
--    during the transition window. Long-term replacement: LINE Messaging
--    API per-user model (see ADR-0001 + lib/notifications/index.ts).
--
-- Migration 0101 chosen because:
--   · 0100 is the most recent migration (pad PR<n> codes)
--   · No 0101+ slot taken yet (verified by `ls supabase/migrations/0101*`)
--
-- RLS: profiles already has owner-only RLS (profiles_select_own /
-- profiles_update_own from schema.sql) — new columns inherit that.
-- The token column is sensitive (bearer token to LINE Notify API on
-- behalf of the user), so all reads must go through the user's own
-- session or the service-role admin client.
--
-- Token storage note: stored as plain text for now. Production hardening
-- task: wrap in pgsodium / KMS encryption (TODO — see line-notify.ts
-- pushToLineNotify helper). Risk window: the foundation port is internal-
-- network only until UI ships in a later sprint.
-- ════════════════════════════════════════════════════════════

alter table public.profiles
  -- Access token returned by LINE Notify token endpoint. Plain text for
  -- now (TODO: encrypt with pgsodium when wrapper helper lands).
  add column if not exists line_notify_token        text,

  -- When the OAuth grant successfully exchanged for a token. Cleared on
  -- disconnect (revoke). Used by UI to show "connected since" + by ops to
  -- audit reconnections after the EOL window.
  add column if not exists line_notify_connected_at timestamptz,

  -- Per-event subscription map. NULL or missing key = subscribed by
  -- default (opt-out model — matches legacy where any event triggers
  -- the single token when set). Shape:
  --   { "order_created": true, "shipment_arrived": true, ... }
  -- Future expansion: each notify category gets its own toggle so a
  -- customer can mute payment alerts while keeping shipment alerts.
  add column if not exists line_notify_channels     jsonb;

-- Index for the cron push dispatcher (later sprint) — fast lookup of all
-- users with a token currently set. Partial index keeps it tiny (only the
-- connected subset).
create index if not exists profiles_line_notify_connected_idx
  on public.profiles(id)
  where line_notify_token is not null;

-- Comment on the columns so the schema is self-documenting in Supabase
-- Studio + database introspection tools.
comment on column public.profiles.line_notify_token is
  'LINE Notify per-user OAuth access token (legacy tb_users.userLineNotify port). EOL April 2025 transition column — to be removed once Messaging-API per-user model lands.';
comment on column public.profiles.line_notify_connected_at is
  'Timestamp the LINE Notify OAuth grant completed for this profile. NULL when not connected.';
comment on column public.profiles.line_notify_channels is
  'Per-event subscription map (jsonb). Missing key = opt-in by default. Shape: {"<event_key>": boolean}.';
