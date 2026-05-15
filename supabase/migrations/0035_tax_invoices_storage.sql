-- ════════════════════════════════════════════════════════════
-- T-P4 G2c · tax-invoices Storage bucket
-- ════════════════════════════════════════════════════════════
-- Per ADR-0006 §5: PDF generated server-side at issuance, uploaded
-- to 'tax-invoices' Storage bucket, customer downloads through
-- /api/tax-invoice/[id] (gated by RLS-style ownership check).
--
-- Bucket is PRIVATE (signed URL or server-streamed). Path layout:
--   tax-invoices/{profile_id}/{INV-YYYYMM-NNNN}.pdf
--
-- Server-side writes happen through admin client (service_role bypasses
-- RLS) so we only define a customer-side READ policy. Optional convenience
-- — server reads also use admin client + bypass these policies.
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Bucket --------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('tax-invoices', 'tax-invoices', false)                    -- private; signed/streamed only
on conflict (id) do nothing;

-- 2) Customer-side read policy ------------------------------------
-- Authenticated user can read PDFs filed under their own user_id
-- folder. This mirrors the slips/avatars pattern. The route handler
-- additionally re-verifies ownership against tax_invoices.profile_id
-- before streaming.
drop policy if exists "tax_invoices_user_read" on storage.objects;
create policy "tax_invoices_user_read"
  on storage.objects for select
  using (
    bucket_id = 'tax-invoices'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 3) Admin (super/accounting) read policy --------------------------
-- Admins can read any tax-invoice PDF for support/audit. Server actions
-- already gate via withAdmin(["super","accounting"]) — this policy is a
-- belt-and-braces for cases where an admin browses Storage directly.
drop policy if exists "tax_invoices_admin_read" on storage.objects;
create policy "tax_invoices_admin_read"
  on storage.objects for select
  using (
    bucket_id = 'tax-invoices'
    and public.is_admin(array['super','accounting'])
  );

-- NOTE: no INSERT/UPDATE/DELETE policies for users — all writes go
-- through service_role (admin client) inside server actions. If a
-- non-admin somehow tries to upload here, RLS will reject (default-deny).
