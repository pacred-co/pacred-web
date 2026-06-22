"use server";

/**
 * Customer "magic login" — OTP-gated, non-expiring (owner 2026-06-22).
 *
 * Two server actions backing the public `/k/[token]` page:
 *   1. requestMagicLoginOtp(token) — resolve the customer from the capability
 *      token, send an OTP to their registered phone (purpose 'login').
 *   2. redeemMagicLogin(token, otp) — verify the OTP, then mint the CUSTOMER's
 *      Supabase session and return ok (the client redirects into the portal).
 *
 * The link never expires; the OTP (delivered to the customer's phone) is the
 * security gate — see lib/auth/customer-magic-link.ts for the threat model.
 *
 * Session minting is NON-DESTRUCTIVE (it must NOT change the customer's
 * password — staff handed them one at create-time). We use Supabase's
 * passwordless server pattern: admin.generateLink({type:'magiclink'}) →
 * hashed_token → serverClient.verifyOtp({token_hash}), which sets the SSR
 * session cookies without ever touching the password. generateLink is
 * email-keyed, so for a phone-only customer we provision a stable synthetic
 * email first (same scheme migrated customers already carry).
 */

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requestOtp, verifyOtp } from "./otp";
import { verifyCustomerLoginToken } from "@/lib/auth/customer-magic-link";
import { legacySyntheticEmail } from "@/lib/auth/pcs-legacy-password";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { logger, redactPhone } from "@/lib/logger";

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

type CustomerForLogin = {
  uid: string;
  memberCode: string;
  phone: string | null;
  email: string | null;
  status: string | null;
  firstName: string | null;
};

/**
 * Resolve a magic-login token → the customer's auth/profile fields. Returns a
 * stable error string when the token is forged or the account can't log in.
 */
async function resolveTokenCustomer(
  token: string,
): Promise<{ ok: true; customer: CustomerForLogin } | { ok: false; error: string }> {
  const code = verifyCustomerLoginToken(token);
  if (!code) return { ok: false, error: "invalid_link" };

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, phone, email, status, first_name")
    .eq("member_code", code)
    .maybeSingle<{
      id: string;
      phone: string | null;
      email: string | null;
      status: string | null;
      first_name: string | null;
    }>();
  if (error) {
    logger.error("customer-magic-link", "profiles lookup failed", error, { memberCode: code, code: error.code });
    return { ok: false, error: "lookup_failed" };
  }
  if (!profile) return { ok: false, error: "not_found" };
  // A suspended / retired account must not be able to log in via the link.
  if (profile.status === "suspended") return { ok: false, error: "account_suspended" };

  return {
    ok: true,
    customer: {
      uid: profile.id,
      memberCode: code,
      phone: profile.phone,
      email: profile.email,
      status: profile.status,
      firstName: profile.first_name,
    },
  };
}

/** Mask an E.164 phone to its last 4 digits for a UI hint ("•••• 2006"). */
function maskPhone(phone: string | null): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "เบอร์ที่ลงทะเบียนไว้";
  return `•••• ${digits.slice(-4)}`;
}

/**
 * Step 1 — send the login OTP to the customer's registered phone.
 * Forwards `bypass` so dev/emergency mode skips the SMS round-trip in the UI.
 */
export async function requestMagicLoginOtp(
  token: string,
): Promise<Result<{ bypass?: boolean; phoneHint: string }>> {
  const ip = getClientIpFromHeaders(await headers());
  const blocked = await checkRateLimit("otpRequest", ip);
  if (blocked) return { ok: false, error: "rate_limit" };

  const resolved = await resolveTokenCustomer(token);
  if (!resolved.ok) return resolved;
  const { customer } = resolved;

  if (!customer.phone) {
    // No phone on file → we can't OTP. (Admin-created customers always have a
    // phone; this only trips for a malformed legacy row.)
    return { ok: false, error: "no_phone" };
  }

  const res = await requestOtp(customer.phone, "login");
  if (!res.ok) return { ok: false, error: res.error };

  return { ok: true, data: { bypass: res.bypass, phoneHint: maskPhone(customer.phone) } };
}

/**
 * Step 2 — verify the OTP and mint the customer's session. On ok the client
 * does a full navigation to "/" so middleware picks up the fresh session.
 */
export async function redeemMagicLogin(token: string, otp: string): Promise<Result> {
  const ip = getClientIpFromHeaders(await headers());
  const blocked = await checkRateLimit("otpVerify", ip);
  if (blocked) return { ok: false, error: "rate_limit" };

  const resolved = await resolveTokenCustomer(token);
  if (!resolved.ok) return resolved;
  const { customer } = resolved;

  if (!customer.phone) return { ok: false, error: "no_phone" };

  const otpOk = await verifyOtp(customer.phone, otp, "login");
  if (!otpOk) return { ok: false, error: "invalid_otp" };

  // ── Mint the session (non-destructive · never touches the password) ──
  const admin = createAdminClient();

  // generateLink is email-keyed. Use the customer's real email when present;
  // otherwise provision the stable synthetic email (the same scheme migrated
  // customers carry) so a phone-only customer can still be issued a magic
  // token. This is a one-time, idempotent backfill — it adds an email where
  // there was none, never overwrites a real one.
  let email = customer.email && customer.email.trim().length > 0 ? customer.email.trim() : null;
  if (!email) {
    const synthetic = legacySyntheticEmail(customer.memberCode);
    const { error: setEmailErr } = await admin.auth.admin.updateUserById(customer.uid, {
      email: synthetic,
      email_confirm: true,
    });
    if (setEmailErr) {
      logger.error("customer-magic-link", "synthetic email provision failed", setEmailErr, {
        memberCode: customer.memberCode,
        phone: redactPhone(customer.phone),
      });
      return { ok: false, error: "signin_failed" };
    }
    email = synthetic;
  }

  // Generate a magic-link token for this email (this does NOT send any email —
  // generateLink only mints the token; we consume it server-side ourselves).
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const hashedToken = link?.properties?.hashed_token;
  if (linkErr || !hashedToken) {
    logger.error("customer-magic-link", "generateLink failed", linkErr ?? undefined, {
      memberCode: customer.memberCode,
    });
    return { ok: false, error: "signin_failed" };
  }

  // Consume the token on the cookie-aware SSR client → sets the session cookies.
  const supabase = await createClient();
  const { error: vErr } = await supabase.auth.verifyOtp({
    token_hash: hashedToken,
    type: "magiclink",
  });
  if (vErr) {
    logger.error("customer-magic-link", "verifyOtp(token_hash) failed — session not set", vErr, {
      memberCode: customer.memberCode,
    });
    return { ok: false, error: "signin_failed" };
  }

  logger.info("customer-magic-link", "magic login succeeded", { memberCode: customer.memberCode });
  return { ok: true };
}
