import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";
import { VISITOR_COOKIE, newVisitorId } from "./lib/experiments";
import { isPhase2PlusRoute } from "./lib/admin/phase-access";

const handleI18n = createIntlMiddleware(routing);

const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// S-4 — true when `pathname` (after stripping an optional leading locale
// segment) is inside the /admin route group. Locale prefix is `as-needed`,
// so admin URLs are `/admin/…` (th, the default) or `/<locale>/admin/…`.
function isAdminPath(pathname: string): boolean {
  let p = pathname;
  for (const loc of routing.locales) {
    if (p === `/${loc}`) return false;                  // bare /<locale> = home
    if (p.startsWith(`/${loc}/`)) { p = p.slice(loc.length + 1); break; }
  }
  return p === "/admin" || p.startsWith("/admin/");
}

export default async function middleware(request: NextRequest) {
  // Skip i18n routing for /auth/* (OAuth callback, signout) — they live outside the [locale] segment
  const isAuthRoute = request.nextUrl.pathname.startsWith("/auth/");

  const response = isAuthRoute ? NextResponse.next() : handleI18n(request);

  // Visitor ID for A/B bucketing (L-24) — assign on first visit, 1y TTL.
  // Setting on the request makes it readable by RSC during this same render;
  // setting on the response sends it to the browser for subsequent requests.
  if (!request.cookies.get(VISITOR_COOKIE)) {
    const vid = newVisitorId();
    request.cookies.set(VISITOR_COOKIE, vid);
    response.cookies.set(VISITOR_COOKIE, vid, {
      maxAge: VISITOR_COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: false, // client-side JS reads for analytics + client variant lookup
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  // Refresh Supabase session — copy any updated cookies onto the response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Triggers token refresh if needed.
  //
  // 🚨 Wave 24 bounce-loop fix (2026-05-27 ดึก · ภูม "เด้งๆ มาหน้าหลัก" repro):
  // Previously we silently destructured `error` away — a Supabase
  // ConnectTimeoutError (10 s · prod region throttle) made `user` null even for
  // signed-in admins. proxy.ts then redirected /admin → /login. The /login
  // page's (auth) layout calls requireGuest() which does a FRESH auth check —
  // this one usually succeeds (cookies are warm now) → sees signed-in user
  // → redirect("/"). Net: admin click on /admin bounces to homepage. Worse
  // still: every retry from the now-homepage hits the same race.
  //
  // Capture `error` explicitly. A confirmed-null user (no error) IS unauth →
  // safe to redirect. A failed RPC (network/timeout) is AMBIGUOUS — let the
  // layout's requireAdmin() decide with its own retry (cache-shared with the
  // page) rather than slamming the user to /login from the edge.
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    // Log so we can see when transient timeouts fire. Don't redirect.
    console.warn("[proxy.ts] auth.getUser() failed — passing through to layout", {
      message: authErr.message,
      pathname: request.nextUrl.pathname,
    });
  }

  // S-4 — edge backstop for the admin surface. An unauthenticated request to
  // any /admin route is redirected to /login here, regardless of whether the
  // matching admin layout/page remembered its requireAdmin() guard. Defence-
  // in-depth: the layout requireAdmin() stays the authoritative role-level
  // gate (this only asserts "signed in"). getUser() uses the same cookie
  // plumbing as the layout's server client, so a null here is the same null
  // the layout would see — no new false-logout path, just one layer earlier.
  // The (protected) routes keep their layout requireAuth() — they share no
  // URL prefix, so an edge denylist would be fragile.
  //
  // GUARD: only redirect when getUser() returned a CONFIRMED null (no error).
  // On a failed RPC we pass through; the layout retries (different cache
  // window) and renders properly when the auth check succeeds.
  if (!user && !authErr && isAdminPath(request.nextUrl.pathname)) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    // carry over cookies the middleware set (visitor id, refreshed session)
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  // ──────────────────────────────────────────────────────────────
  // Phase 2/3/4 hard route block (2026-05-20 night owner brief).
  //
  // Three tiers of enforcement, fail-closed:
  //   (1) Sidebar visibility filter — `lib/admin/sidebar-menu.ts` +
  //       `components/sections/admin-sidebar.tsx` drop Phase-2+ items
  //       from the rendered menu for non-`super` roles. UX layer only.
  //   (2) Page-level helper — `canAccessRoute()` in
  //       `lib/admin/phase-access.ts`, available to any Server
  //       Component / Action that wants a per-request gate.
  //   (3) Network-level block (THIS BLOCK) — bounces a non-`super`
  //       admin who requests a Phase-2+ URL directly (typing into the
  //       address bar, bookmark, etc.) back to /admin (the Phase-1
  //       dashboard they CAN see).
  //
  // Threat model:
  //   ✓ Prevents accidental URL typing reaching a Phase-2 page
  //   ✓ Prevents a bookmarked Phase-2 URL from rendering for a non-super
  //   ✗ Does NOT prevent a malicious admin from extracting data via the
  //     API/Supabase directly — that is RLS's job. RBAC + RLS sit below.
  //
  // Cost note: the admins-table query only fires for signed-in users
  // who actually hit a Phase-2+ pathname (the cheap `isPhase2PlusRoute`
  // string-match runs first). Phase-1 admin pages — the common case —
  // take zero extra DB hits.
  //
  // Strategy: `redirect('/admin')` (NOT `rewrite('/404')`) — this repo
  // has no `/404` route + no `app/not-found.tsx`, so a rewrite would
  // serve a 200 with the framework default body (status-code mismatch
  // + brittle if Next 16 changes that resolution). A redirect to the
  // dashboard is unambiguous, well-supported in middleware, and
  // matches the user's "redirect cleaner" guidance in the brief.
  // (A future `app/not-found.tsx` + switch to `rewrite` would preserve
  // the typed URL — but the visibility goal is already met here.)
  // ──────────────────────────────────────────────────────────────
  if (user && isPhase2PlusRoute(request.nextUrl.pathname)) {
    const { data: rows } = await supabase
      .from("admins")
      .select("role")
      .eq("profile_id", user.id)
      .eq("is_active", true);
    const isSuper = (rows ?? []).some((r) => r.role === "super");
    if (!isSuper) {
      const bounce = NextResponse.redirect(new URL("/admin", request.url));
      response.cookies.getAll().forEach((c) => bounce.cookies.set(c));
      return bounce;
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
