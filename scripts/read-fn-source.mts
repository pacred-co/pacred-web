/**
 * Read the live source of generate_member_code() via a tiny SECURITY DEFINER
 * helper. Self-contained: creates helper, calls it, drops it.
 *
 * If this fails, the user must run the diagnostic SQL in Supabase Studio
 * (see end of script).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
console.log("target:", url);

// The supabase-js client doesn't expose raw SQL — but we can use the PostgREST
// "rpc" endpoint to call a built-in function if one exists. Let's see if there
// is a `query` rpc or similar via the dashboard pg-meta API.
//
// Reality: PostgREST does NOT expose pg-meta. We need to either:
//   (a) Have the user paste SQL in Supabase Studio
//   (b) Connect via the postgres library with a direct connection string
//
// Let's just print the SQL the user needs to run:

console.log(`
═══════════════════════════════════════════════════════════════════
🔍 ก๊อต/เดฟ: paste this in Supabase Studio → SQL Editor → run
═══════════════════════════════════════════════════════════════════

-- 1. Show current generate_member_code source
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'generate_member_code';

-- 2. List all triggers on profiles
SELECT tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t
WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal;

-- 3. Show what current function computes as max + first vacant
SELECT COALESCE(MAX((substring(member_code from 3))::int), 0) AS max_n
  FROM public.profiles WHERE member_code ~ '^PR[0-9]+$';

SELECT g AS first_vacant_n
  FROM generate_series(1, 10905) g
  WHERE ('PR' || g) NOT IN (
    SELECT member_code FROM public.profiles WHERE member_code ~ '^PR[0-9]+$'
  )
  ORDER BY g LIMIT 1;
═══════════════════════════════════════════════════════════════════
`);
