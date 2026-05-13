-- ════════════════════════════════════════════════════════════
-- P-3 · Extend otp_codes.purpose for phone-change flow
-- ════════════════════════════════════════════════════════════
-- Original schema.sql constrained purpose to ('register','login','reset').
-- P-3 needs a separate purpose so the change-phone OTP rate-limit and
-- one-time use stay isolated from password-reset codes.
-- ════════════════════════════════════════════════════════════

alter table public.otp_codes
  drop constraint if exists otp_codes_purpose_check;

alter table public.otp_codes
  add constraint otp_codes_purpose_check
  check (purpose in ('register','login','reset','change_phone'));
