import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";
import { VISITOR_COOKIE, newVisitorId } from "./lib/experiments";

const handleI18n = createIntlMiddleware(routing);

const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

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
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
