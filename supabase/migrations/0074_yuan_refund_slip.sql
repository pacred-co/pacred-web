-- ════════════════════════════════════════════════════════════
-- G-5 fix · yuan_payments refund slip + metadata
-- ════════════════════════════════════════════════════════════
-- Per `docs/research/gap-schema-security.md` G-5 — today admin can
-- transition a yuan_payment to status='refunded' via
-- adminUpdateYuanPayment WITHOUT attaching proof of the refund or
-- recording who/when. The wallet-paid path reverses the debit
-- correctly (audit-core-2026-05-18 §2 H-2), but the slip-only path
-- has no audit-grade evidence the money actually went back to the
-- customer. Accounting reconciliation cannot tie the refund to a
-- bank-statement entry.
--
-- Three additive nullable columns close the loop:
--   refund_slip_path        text  — storage key in 'slips' bucket
--                                   under yuan-refunds/{id}/{ts}.{ext}
--   refunded_at             timestamptz — stamped by the action
--   refunded_by_admin_id    uuid  — profile_id of the acting admin
--
-- The new adminMarkYuanPaymentRefunded action (this batch) requires
-- the slip + stamps both timestamps and admin id atomically. The
-- legacy adminUpdateYuanPayment refund branch stays callable (used
-- by older flows) but is now considered the unproved-refund path —
-- a follow-up migration may make the new fields NOT NULL once all
-- callers route through the new action.
--
-- Storage: reuses the existing 'slips' private bucket (migration
-- 0007). Path pattern: yuan-refunds/{yuan_payment_id}/{timestamp}.{ext}.
-- The admin-side action writes via service_role so the existing per-
-- user RLS policies (which scope path[1] to auth.uid()) don't apply —
-- the path prefix is "yuan-refunds" which no user owns, so a customer
-- bypassing the action cannot self-insert there even if RLS opened.
--
-- Idempotent + additive. No data migration.
-- ════════════════════════════════════════════════════════════

alter table public.yuan_payments
  add column if not exists refund_slip_path     text,
  add column if not exists refunded_at          timestamptz,
  add column if not exists refunded_by_admin_id uuid references public.profiles(id);

create index if not exists yuan_payments_refunded_at_idx
  on public.yuan_payments(refunded_at) where refunded_at is not null;

comment on column public.yuan_payments.refund_slip_path is
  'G-5: storage key (slips bucket) of the bank-transfer slip proving the refund actually moved money back to the customer. Path layout: yuan-refunds/{yuan_payment_id}/{timestamp}.{ext}. NULL = legacy/un-proved refund.';
comment on column public.yuan_payments.refunded_at is
  'G-5: timestamp the refund slip was attached + admin marked the row refunded via adminMarkYuanPaymentRefunded. Distinct from updated_at (touched on every edit).';
comment on column public.yuan_payments.refunded_by_admin_id is
  'G-5: profile_id of the admin (super/accounting) who attached the refund slip + stamped refunded_at. NULL = legacy/un-proved refund.';

-- ── Storage RLS — explicit admin write under yuan-refunds/ prefix ─
-- The 'slips' bucket policies in 0007 only allow auth.uid() == path[1]
-- writes. yuan-refunds/{yuan_payment_id}/... uses a UUID as the first
-- folder which never matches a user, so no customer can write there via
-- the user-scoped policies. The admin path uses the service role via
-- createAdminClient and bypasses RLS, so no extra storage policy is
-- needed. This block exists only to document the intent + future-proof
-- against a "let yuan_payment.profile_id read its own refund slip"
-- customer-side feature (currently OUT OF SCOPE).
--
-- Future extension (commented):
--   create policy "yuan_refunds_owner_read" on storage.objects
--     for select using (
--       bucket_id = 'slips'
--       and (storage.foldername(name))[1] = 'yuan-refunds'
--       and (storage.foldername(name))[2]::uuid in (
--         select id from public.yuan_payments where profile_id = auth.uid()
--       )
--     );

do $g5$
begin
  raise notice
    'G-5 (0074): yuan_payments now has refund_slip_path + refunded_at + refunded_by_admin_id (all nullable). New action adminMarkYuanPaymentRefunded enforces slip + stamps fields atomically.';
end
$g5$;
