-- 0166 · 2026-06-09 — broaden the customs_declarations admin RLS to the full
-- customs role set (DEFENSIVE · aligns the DB policy with the action role sets
-- in actions/admin/{customs,cargo}-declarations.ts).
--
-- ⚠️ NOT a live-bug fix: every admin surface for customs declarations uses the
-- SERVICE-ROLE client (createAdminClient · bypasses RLS) gated by withAdmin([...]),
-- so freight_import_doc / pricing are NOT actually blocked today. This migration
-- future-proofs any user-session read/write of these tables by the two roles
-- that legitimately work customs declarations beyond super/accounting:
--   - freight_import_doc  (the freight Docs role · owns ใบขน)
--   - pricing             (cargo Pricing · owns the per-line declared value)
-- The customer self-read policy (customs_declarations_customer_read · status ≥
-- submitted) is intentionally left untouched. Idempotent (drop+recreate).

drop policy if exists customs_declarations_admin_all on public.customs_declarations;
create policy customs_declarations_admin_all
  on public.customs_declarations for all
  using      (public.is_admin(array['super','accounting','freight_import_doc','pricing']))
  with check (public.is_admin(array['super','accounting','freight_import_doc','pricing']));

drop policy if exists customs_declaration_lines_admin_all on public.customs_declaration_lines;
create policy customs_declaration_lines_admin_all
  on public.customs_declaration_lines for all
  using      (public.is_admin(array['super','accounting','freight_import_doc','pricing']))
  with check (public.is_admin(array['super','accounting','freight_import_doc','pricing']));

drop policy if exists customs_declaration_seq_admin_all on public.customs_declaration_seq;
create policy customs_declaration_seq_admin_all
  on public.customs_declaration_seq for all
  using      (public.is_admin(array['super','accounting','freight_import_doc','pricing']))
  with check (public.is_admin(array['super','accounting','freight_import_doc','pricing']));
