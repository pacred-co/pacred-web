/**
 * OAuth callback handler.
 *
 * Flow: provider redirects here with `?code=...` after user approves.
 * We exchange the code for a session, then ensure a profile row exists,
 * and redirect into the app (locale prefix added by next-intl).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorParam)}`, url.origin),
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      new URL(`/login?error=oauth_failed`, url.origin),
    );
  }

  // Ensure profile exists (first-time OAuth user) — use upsert to be idempotent
  const { data: existing, error: existingErr } = await supabase
    .from("profiles")
    .select("id, status")
    .eq("id", data.user.id)
    .maybeSingle();
  if (existingErr) {
    console.error(`[profiles list] failed`, { code: existingErr.code, message: existingErr.message });
  }

  if (!existing) {
    await supabase.from("profiles").insert({
      id: data.user.id,
      account_type: "personal",
      email: data.user.email,
      status: "incomplete",
    });
    // First-time user → send to complete-profile (will be built in Phase 4)
    return NextResponse.redirect(new URL("/complete-profile", url.origin));
  }

  if (existing.status === "incomplete") {
    return NextResponse.redirect(new URL("/complete-profile", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
