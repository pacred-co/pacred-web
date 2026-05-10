/**
 * Admin Supabase client (service-role key — bypasses RLS).
 *
 * ⚠️ SERVER-ONLY. Never import this in a "use client" component.
 * Use sparingly — only when you genuinely need to bypass RLS
 * (e.g. inserting OTP rows that the user can't write themselves,
 * looking up users by member_code before sign-in).
 *
 * Most operations should go through `lib/supabase/server.ts`.
 */

import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL in env",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
