/**
 * Server-side helpers to read the current user + profile.
 *
 * Always use these in Server Components / Server Actions / Route Handlers
 * so RLS protects data access via the user's session cookie.
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  // identity
  id: string;
  account_type: "personal" | "juristic";
  member_code: string | null;
  status: "incomplete" | "active" | "suspended";
  is_active: boolean;

  // contact
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;

  // marketing/sign-up
  services: string[] | null;
  how_know: string | null;
  register_with: "email" | "facebook" | "google" | "line" | null;
  referral_channel: string | null;
  recommended_by: string | null;

  // juristic-only (extended in B2 corporate table)
  tax_id: string | null;
  company_name: string | null;
  address: Record<string, unknown> | null;

  // demographics
  sex: "male" | "female" | "other" | null;
  birthday: string | null;
  last_login_at: string | null;

  // media + socials
  avatar_url: string | null;
  line_id: string | null;
  facebook_url: string | null;

  // LINE Messaging API push (ADR-0001)
  line_user_id: string | null;
  line_linked_at: string | null;
  notify_channels: { line: boolean; email: boolean } | null;

  // customer classification
  customer_group: string;
  freight_type: "seafreight" | "cargo" | null;
  shop_user: boolean;

  // admin linkage
  admin_id: string | null;
  sales_admin_id: string | null;

  // shipping preferences
  transport_type: string | null;
  ship_by: string | null;
  pay_method: "origin" | "destination" | null;

  // credit + comparison
  comparison_enabled: boolean;
  comparison_value: number;
  credit_enabled: boolean;
  credit_limit: number;
  credit_days: number;

  note: string | null;

  // TOS acceptance (B6)
  tos_accepted_version: string | null;
  tos_accepted_at: string | null;

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
