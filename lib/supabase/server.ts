/**
 * Server Supabase client (anon key + cookies).
 *
 * Use this in Server Components, Server Actions, and Route Handlers.
 * Reads/writes auth cookies so the user's session is preserved across requests.
 * RLS still applies — for admin/elevated access use `lib/supabase/admin.ts`.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component context — ignore. Middleware (proxy.ts) refreshes cookies.
          }
        },
      },
    },
  );
}
