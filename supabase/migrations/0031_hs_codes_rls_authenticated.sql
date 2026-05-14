-- 0031_hs_codes_rls_authenticated.sql
-- P-20-followup-rls: tighten hs_codes_select_all RLS to authenticated only.
--
-- 0030_hs_codes_rates.sql created the policy with `using (true)` (open to
-- anon).  The intent per file comment was "authenticated users can read
-- this reference data" — fix the policy to match.  Risk is low (HS codes
-- are public reference data — no PII), but the inconsistency between
-- comment + actual policy is a footgun for future maintainers.

drop policy if exists hs_codes_select_all on public.hs_codes;

create policy hs_codes_select_all on public.hs_codes
  for select
  using (auth.role() = 'authenticated');
