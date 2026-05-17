import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";
import { VISITOR_COOKIE, newVisitorId } from "./lib/experiments";

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

  // Triggers token refresh if needed; failures are silent (placeholder env vars in dev)
  const { data: { user } } = await supabase.auth.getUser();

  // S-4 — edge backstop for the admin surface. An unauthenticated request to
  // any /admin route is redirected to /login here, regardless of whether the
  // matching admin layout/page remembered its requireAdmin() guard. Defence-
  // in-depth: the layout requireAdmin() stays the authoritative role-level
  // gate (this only asserts "signed in"). getUser() uses the same cookie
  // plumbing as the layout's server client, so a null here is the same null
  // the layout would see — no new false-logout path, just one layer earlier.
  // The (protected) routes keep their layout requireAuth() — they share no
  // URL prefix, so an edge denylist would be fragile.
  if (!user && isAdminPath(request.nextUrl.pathname)) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    // carry over cookies the middleware set (visitor id, refreshed session)
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
