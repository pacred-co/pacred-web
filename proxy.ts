import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";

const handleI18n = createIntlMiddleware(routing);

export default async function middleware(request: NextRequest) {
  // Skip i18n routing for /auth/* (OAuth callback, signout) — they live outside the [locale] segment
  const isAuthRoute = request.nextUrl.pathname.startsWith("/auth/");

  const response = isAuthRoute ? NextResponse.next() : handleI18n(request);

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
