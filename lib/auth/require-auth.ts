/**
 * Server-side auth guard helpers — call from layouts/pages/Server Actions.
 *
 * - `requireAuth()` redirects to /login if not signed in,
 *   and to /complete-profile if profile.status === "incomplete"
 *   (unless `allowIncomplete: true`).
 * - `requireGuest()` redirects to / if already signed in
 *   (use on /login, /register).
 */

import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUserWithProfile, type Profile } from "./get-user";
import type { User } from "@supabase/supabase-js";

export async function requireAuth(opts?: {
  allowIncomplete?: boolean;
}): Promise<{ user: User; profile: Profile | null }> {
  const data = await getCurrentUserWithProfile();
  if (!data || !data.user) redirect("/login");

  if (
    !opts?.allowIncomplete &&
    data.profile &&
    data.profile.status === "incomplete"
  ) {
    redirect("/complete-profile");
  }

  return data;
}

export async function requireGuest(): Promise<void> {
  const data = await getCurrentUserWithProfile();
  if (data?.user) redirect("/");
}
