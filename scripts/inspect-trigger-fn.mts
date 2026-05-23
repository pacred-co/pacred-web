/**
 * Pull the actual current generate_member_code function source from prod
 * + list all triggers on profiles, so we can see what code path is firing.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

console.log("target:", url);

// Use the Postgres REST RPC to run raw SQL — only works if we created the helper
// fn. Otherwise we need direct SQL via psql. Try `select pg_get_functiondef(...)`
// through the SQL editor in Supabase Studio.
//
// As a workaround — try inserting via service-role and check the resulting code,
// THEN read the trigger via a SECURITY DEFINER wrapper if one exists.

// Try public.pg_get_functiondef directly via .rpc (likely fails — no such RPC)
const { data, error } = await admin.rpc("pg_get_functiondef" as any, {
  funcid: "public.generate_member_code()::regprocedure" as any,
});
console.log("\nrpc attempt:", { data, error: error?.message });

console.log("\n→ rpc won't work without a helper. Use Supabase Studio SQL editor:");
console.log(`
   SELECT pg_get_functiondef(p.oid)
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'generate_member_code';

   SELECT tgname, pg_get_triggerdef(oid)
   FROM pg_trigger
   WHERE tgrelid = 'public.profiles'::regclass
     AND tgisinternal = false;
`);
