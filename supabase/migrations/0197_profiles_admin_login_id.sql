-- 0197_profiles_admin_login_id.sql
-- Owner 2026-06-21: "เอา admin_name ไปผูกกับ email ต้องแยกกัน · อีเมลก็อีเมล ·
-- admin_name อีกอันไว้เป็น id ตอน login · ตอนเพิ่มพนักงาน set id login เองได้".
--
-- Today the staff login username (admin_<name>), the Supabase Auth email
-- (admin_<name>@pacred.co.th) AND the displayed profiles.email are the SAME
-- synthetic string — so the directory shows a fake email as "อีเมลส่วนตัว" and
-- there is nowhere to keep the staffer's REAL email.
--
-- This migration adds a dedicated `profiles.admin_login_id` to remember the
-- username, so `profiles.email` is freed for the REAL email. The auth key stays
-- admin_<login_id>@pacred.co.th (in auth.users — UNCHANGED · signInAdmin keeps
-- working · zero lockout). Additive + idempotent.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_login_id text;

-- Backfill from the existing synthetic email (admin_*@pacred.co.th → admin_*).
UPDATE public.profiles
   SET admin_login_id = split_part(email, '@', 1)
 WHERE admin_login_id IS NULL
   AND email ILIKE 'admin\_%@pacred.co.th';

-- Unique among non-null (one login-id per person · customers stay NULL).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_admin_login_id_uniq
  ON public.profiles (admin_login_id)
  WHERE admin_login_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.admin_login_id IS
  'Staff login username (admin_<name>). The auth email stays admin_<name>@pacred.co.th; profiles.email is now the REAL email. Owner 2026-06-21: separate login-id from email.';
