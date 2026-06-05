-- 0144 — Employee code (รหัสพนักงาน) on profiles.
--
-- Owner 2026-06-06: staff need a short employee code (format YYMMNO, e.g.
-- 690601 = ปี 69 · เดือน 06 · ลำดับ 01) that — like a game login — can be
-- typed to sign in, and serves as the HR identifier when the org scales.
-- The owner assigns the actual running numbers later; this just adds the
-- field + makes it a login key (see actions/auth.ts employee-code branch).
--
-- Purely additive: nullable text column. Customers leave it null; only staff
-- get a code. A PARTIAL unique index enforces "no two staff share a code"
-- while still allowing unlimited NULLs (every customer).

alter table public.profiles
  add column if not exists employee_code text;

comment on column public.profiles.employee_code is
  'รหัสพนักงาน (HR) — format YYMMNO (e.g. 690601). Staff-only (null for customers). A login identifier (actions/auth.ts resolves a bare 5-8 digit code → this row''s email). Owner assigns the running numbers.';

-- Unique only among non-null values (partial index — many nulls allowed).
create unique index if not exists profiles_employee_code_key
  on public.profiles (employee_code)
  where employee_code is not null;
