/**
 * POST /auth/signout — clears Supabase session and redirects to home.
 *
 * Also clears the G-4 impersonation cookie (if present) so a re-signed-in
 * user on the same browser doesn't accidentally inherit a stale viewing
 * session. The stale cookie would already be rejected on next read
 * (admin_id mismatch), but clearing here keeps the cookie jar tidy.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clearImpersonationCookie } from "@/lib/auth/impersonation";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearImpersonationCookie();

  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
