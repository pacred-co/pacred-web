/**
 * POST /auth/signout — clears Supabase session and redirects to home.
 *
 * Also clears the G-4 impersonation cookie + the admin-login ticket
 * (`pacred_admin`, 2026-06-19) if present, so a re-signed-in user on the
 * same browser doesn't inherit a stale viewing/admin session. Both would
 * already be rejected on next read (admin_id mismatch / role check), but
 * clearing here keeps the cookie jar tidy AND ensures the next normal login
 * cannot carry a live admin ticket.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clearImpersonationCookie } from "@/lib/auth/impersonation";
import { clearAdminSessionCookie } from "@/lib/auth/admin-session";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearImpersonationCookie();
  await clearAdminSessionCookie();

  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
