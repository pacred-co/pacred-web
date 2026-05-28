/**
 * /register — Server Component wrapper.
 *
 * Detects mid-signup juristic users (signed in + `profile.status='incomplete'`
 * + `account_type='juristic'`) and resumes them at Step 2 or Step 3 of the
 * juristic flow, skipping the auth Step 1 (their auth.user + profile already
 * exist — re-running Step 1 would slam into the phone-already-registered
 * unique constraint and trap them in a loop).
 *
 * Fixes the 2026-05-25 follow-on to the requireGuest() P0:
 *   - /complete-profile already detects juristic-incomplete and routes here
 *     via "ไปหน้าลงทะเบียนนิติบุคคล" → /register?tab=juristic
 *   - Without this wrapper, the client form started at Step 1 and asked for
 *     the phone again → registerJuristicStep1 → "phone already exists" → user
 *     stuck. With this wrapper, the form opens directly at Step 2 (or Step 3
 *     if the corporate row was already saved).
 *
 * Guest users (no session) get the normal Step 1 → Step 2 → Step 3 flow.
 */

import type { TabId } from "./register-client";
import { RegisterClient, type RegisterResumeState } from "./register-client";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{ tab?: string; recom?: string }>;
};

/**
 * Parse + sanitize the `?recom=<code>` URL param — affiliate / co-brand
 * attribution captured at signup. Legacy `regis-tam.php` accepted
 * THADA / SIN / OOAEOM / SWAN here and persisted the resolved value to
 * `tb_users.coID` (e.g. `?recom=THADA` → `coID='THADA.VIP'`). Pacred-era
 * codes are open-ended and stored verbatim into `profiles.customer_group`
 * (default 'PR' if no recom). Pattern restricted to safe filename chars
 * so an attacker can't smuggle script / SQL via the URL.
 */
function sanitizeRecom(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^[A-Za-z0-9._-]{1,30}$/.test(trimmed)) return null;
  return trimmed;
}

export default async function RegisterPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tabParam = params.tab === "juristic" ? "juristic" : "personal";
  const initialRecom = sanitizeRecom(params.recom);

  const data = await getCurrentUserWithProfile();

  // Resume mid-flow ONLY if signed-in + incomplete + juristic. Guest users
  // (most common) skip this branch entirely and get the normal flow.
  let juristicResume: RegisterResumeState | null = null;
  let initialTab: TabId = tabParam;

  if (
    data?.user &&
    data.profile?.status === "incomplete" &&
    data.profile?.account_type === "juristic"
  ) {
    // Check if Step 2 (corporate info) was saved. If yes → jump to Step 3.
    // If no → Step 2.
    const supabase = await createClient();
    const { data: corp, error: corpErr } = await supabase
      .from("corporate")
      .select("tax_id, company_name, company_address")
      .eq("profile_id", data.user.id)
      .maybeSingle<{
        tax_id: string | null;
        company_name: string | null;
        company_address: string | null;
      }>();
    if (corpErr) {
      // Server page — must not silently swallow DB errors as a 404/redirect.
      // Throw so Next renders the real error boundary instead of dropping the
      // user into a wrong-step resume state.
      console.error(`[register/page] corporate lookup failed`, {
        code: corpErr.code, message: corpErr.message, userId: data.user.id,
      });
      throw new Error(`corporate lookup failed: ${corpErr.message}`);
    }

    juristicResume = {
      step: corp ? 3 : 2,
      taxId: corp?.tax_id ?? "",
      companyName: corp?.company_name ?? "",
      companyAddress: corp?.company_address ?? "",
    };
    initialTab = "juristic";
  }

  return (
    <RegisterClient
      initialTab={initialTab}
      juristicResume={juristicResume}
      initialRecom={initialRecom}
    />
  );
}
