/**
 * Server-side helpers to read the current user + profile.
 *
 * Always use these in Server Components / Server Actions / Route Handlers
 * so RLS protects data access via the user's session cookie.
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  account_type: "personal" | "juristic";
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  services: string[] | null;
  how_know: string | null;
  tax_id: string | null;
  company_name: string | null;
  address: Record<string, unknown> | null;
  status: "incomplete" | "active" | "suspended";
  created_at: string;
  updated_at: string;
};

/**
 * Returns the current Supabase auth user, or null if not signed in.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * Returns the current user + their profile row.
 * Profile may be null if user signed up but profile row hasn't been created yet.
 */
export async function getCurrentUserWithProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  return { user, profile };
}
