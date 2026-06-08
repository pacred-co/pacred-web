-- ════════════════════════════════════════════════════════════
-- 0148 — Broaden SELECT RLS for Doc roles on tax / freight invoices
-- ════════════════════════════════════════════════════════════
-- Companion to ops-workflow audit Lane 2 (2026-06-08): the page-level
-- gate (`requireAdmin(['freight_export_doc','freight_import_doc',…])`)
-- now lets Doc users into the admin pages for Commercial Invoice /
-- Packing List / D/O Letter / Form-E / freight receipt / tax invoice.
-- The pages themselves render fine via createAdminClient (service-role).
--
-- BUT the actual PDF download routes under `app/api/*` route the parent
-- header lookup through createClient() (user-session, RLS-scoped):
--
--   app/api/tax-invoice/[id]/route.tsx              → tax_invoices SELECT
--   app/api/freight-invoice/[id]/route.tsx          → freight_invoices SELECT
--   app/api/freight-invoice/[id]/do-letter/route.tsx        → ↑
--   app/api/freight-invoice/[id]/form-e/route.tsx           → ↑
--   app/api/freight-invoice/[id]/packing-list/route.tsx     → ↑
--   app/api/freight-receipt/[id]/route.tsx          → freight_invoices SELECT
--
-- This is intentional (the row visibility IS the auth decision; cf. the
-- header comment on each route). It means today, a Doc user with the
-- page open clicks "ดู PDF" → 404 "not_found_or_unauthorised", because
-- the migration-0034/0051 admin policies only admit super/accounting
-- (tax) and super/ops/accounting (freight) — Doc isn't in the list.
--
-- This migration broadens the **SELECT-side** policies on these 4 tables
-- (parent + lines) to include the Doc roles. Writes (INSERT/UPDATE/DELETE)
-- stay at the original roles → Doc cannot issue or amend; they can only
-- view + download the PDFs they're responsible for shipping to customers.
--
-- Why this is safe:
--   * Doc role = "ผู้ออกเอกสาร" — workflow says they assemble/print, not
--     approve. Accounting + super still own issuance and money writes.
--   * Service-role (admin client) already bypasses RLS for both reads
--     and writes; nothing about server-action issuance changes.
--   * Customer self-read scope (`profile_id = auth.uid()`) untouched.
--   * Tax-invoice has no Doc seat distinction (it's a Thai-RD doc, not
--     a freight doc) — but we still broaden it because admins in the
--     freight_*_doc lane often need to read the tax invoice attached to
--     a freight shipment for cross-checking the consignee snapshot
--     (audit Lane 2 §28).
--   * `tax_invoice_seq` / `freight_invoice_seq` policies left at the
--     original roles — Doc never mints serials (the SECURITY DEFINER
--     `next_*_serial()` function is the only writer; called from
--     server actions gated by withAdmin).
--   * `freight_invoice_payments` policies untouched — payment
--     recording is an accounting/super flow; Doc doesn't enter payments.
--   * Storage policies (0035) untouched — PDF blobs are fetched with
--     the admin client inside the route once visibility is proved.
--
-- Roles added (per migration 0091 admins_role_check):
--   * freight_export_doc      (#20) — Freight Export documentation
--   * freight_import_doc      (#26) — Freight Import documentation
--   * freight_clearance_both  (#22) — shared Import & Export clearance,
--                                     handles docs on both lanes
--
-- Idempotent: every CREATE preceded by DROP POLICY IF EXISTS.
-- ════════════════════════════════════════════════════════════

-- 1) tax_invoices — broaden SELECT
-- Original policy `tax_invoices_admin_all` covered SELECT + writes via
-- FOR ALL. We split it: keep the writes at super/accounting via a new
-- FOR ALL covering the same set, and add a separate FOR SELECT that
-- ALSO admits the Doc roles for reads.
drop policy if exists tax_invoices_admin_all on public.tax_invoices;

drop policy if exists tax_invoices_admin_write on public.tax_invoices;
create policy tax_invoices_admin_write
  on public.tax_invoices for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

drop policy if exists tax_invoices_admin_read on public.tax_invoices;
create policy tax_invoices_admin_read
  on public.tax_invoices for select
  using (public.is_admin(array[
    'super','accounting',
    'freight_export_doc','freight_import_doc','freight_clearance_both'
  ]));

-- 2) tax_invoice_lines — broaden SELECT (parent ownership)
drop policy if exists tax_invoice_lines_admin_write on public.tax_invoice_lines;
create policy tax_invoice_lines_admin_write
  on public.tax_invoice_lines for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- Existing customer-via-parent read policy already covers admin (it
-- ORs profile_id = auth.uid() with is_admin([super,accounting])). To
-- extend it to Doc, we replace it with a version that ORs the broader
-- admin set.
drop policy if exists tax_invoice_lines_via_parent_read on public.tax_invoice_lines;
create policy tax_invoice_lines_via_parent_read
  on public.tax_invoice_lines for select
  using (
    exists (
      select 1 from public.tax_invoices ti
       where ti.id          = tax_invoice_lines.tax_invoice_id
         and (ti.profile_id = auth.uid()
              or public.is_admin(array[
                'super','accounting',
                'freight_export_doc','freight_import_doc','freight_clearance_both'
              ]))
    )
  );

-- 3) freight_invoices — broaden SELECT
drop policy if exists freight_invoices_admin_all on public.freight_invoices;

drop policy if exists freight_invoices_admin_write on public.freight_invoices;
create policy freight_invoices_admin_write
  on public.freight_invoices for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists freight_invoices_admin_read on public.freight_invoices;
create policy freight_invoices_admin_read
  on public.freight_invoices for select
  using (public.is_admin(array[
    'super','ops','accounting',
    'freight_export_doc','freight_import_doc','freight_clearance_both'
  ]));

-- 4) freight_invoice_lines — broaden SELECT
-- Original migration 0051 split lines into two policies: customer
-- read-via-parent + an admin FOR ALL. We split the admin FOR ALL the
-- same way: a write policy at the original roles + a SELECT policy
-- that admits the Doc roles too.
drop policy if exists freight_invoice_lines_admin_all on public.freight_invoice_lines;

drop policy if exists freight_invoice_lines_admin_write on public.freight_invoice_lines;
create policy freight_invoice_lines_admin_write
  on public.freight_invoice_lines for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists freight_invoice_lines_admin_read on public.freight_invoice_lines;
create policy freight_invoice_lines_admin_read
  on public.freight_invoice_lines for select
  using (public.is_admin(array[
    'super','ops','accounting',
    'freight_export_doc','freight_import_doc','freight_clearance_both'
  ]));

-- 5) Comments + sanity
comment on policy tax_invoices_admin_read         on public.tax_invoices
  is '2026-06-08 mig 0148 — Doc roles can READ tax invoices (PDF download · audit Lane 2).';
comment on policy tax_invoice_lines_via_parent_read on public.tax_invoice_lines
  is '2026-06-08 mig 0148 — broadened to admit freight_*_doc roles (via parent invoice ownership).';
comment on policy freight_invoices_admin_read     on public.freight_invoices
  is '2026-06-08 mig 0148 — Doc roles can READ freight invoices (PDF download · audit Lane 2).';
comment on policy freight_invoice_lines_admin_read on public.freight_invoice_lines
  is '2026-06-08 mig 0148 — Doc roles can READ freight invoice lines (PDF download · audit Lane 2).';

-- ════════════════════════════════════════════════════════════
-- next free = 0149
-- ════════════════════════════════════════════════════════════
