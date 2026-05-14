/**
 * Server-side hCaptcha token verification.
 *
 *   import { verifyHcaptcha } from "@/lib/hcaptcha";
 *
 *   const captcha = await verifyHcaptcha(token, getClientIp(request));
 *   if (!captcha.success) {
 *     return { ok: false, error: "captcha_failed" };
 *   }
 *
 * Activates only when `HCAPTCHA_SECRET_KEY` is set. In dev (DSN unset)
 * it returns `{ success: true }` so flows aren't blocked locally. In
 * production with secret unset it FAILS CLOSED (returns
 * `missing_secret`) — better to break loudly than silently accept
 * unverified tokens.
 *
 * Pairs with the client-side `<HCaptchaInvisible />` component which
 * obtains the token. Configure `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` for
 * the client + `HCAPTCHA_SECRET_KEY` for the server (separate values).
 *
 * Server-only.
 */

import "server-only";
import { logger } from "@/lib/logger";

export type HcaptchaVerifyResult = {
  success: boolean;
  /** Hostname returned by hCaptcha — useful for cross-checking your domain. */
  hostname?: string;
  /** Comma-separated error codes when success=false (machine-readable). */
  error?:    string;
};

/**
 * Verify a hCaptcha response token via the official siteverify endpoint.
 *
 * @param token  The token returned by the client-side widget's onVerify
 *               callback (or `execute({async:true})` resolution).
 * @param ip     Optional client IP — passed as `remoteip` to hCaptcha
 *               so they can correlate against their own bot signals.
 *               Use `getClientIp(req)` from `lib/rate-limit.ts`.
 */
export async function verifyHcaptcha(
  token: string | null | undefined,
  ip?: string,
): Promise<HcaptchaVerifyResult> {
  const secret = process.env.HCAPTCHA_SECRET_KEY;

  // Dev-only no-op: in production we must have a real secret to verify
  // tokens, but in dev we let everything through so signup/contact
  // flows work without a Pacred-owned hCaptcha account.
  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      return { success: true };
    }
    logger.error("hcaptcha", "HCAPTCHA_SECRET_KEY unset in production — failing closed");
    return { success: false, error: "missing_secret" };
  }

  if (!token) {
    return { success: false, error: "missing_token" };
  }

  const params = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") {
    params.append("remoteip", ip);
  }

  try {
    const res = await fetch("https://api.hcaptcha.com/siteverify", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    params.toString(),
    });

    if (!res.ok) {
      logger.error("hcaptcha", "siteverify HTTP failed", undefined, { status: res.status });
      return { success: false, error: `http_${res.status}` };
    }

    const data = (await res.json()) as {
      success:        boolean;
      "error-codes"?: string[];
      hostname?:      string;
      challenge_ts?:  string;
    };

    if (!data.success) {
      const codes = (data["error-codes"] ?? []).join(",");
      logger.warn("hcaptcha", "verify rejected", { errorCodes: codes });
      return { success: false, error: codes || "verify_failed" };
    }

    return { success: true, hostname: data.hostname };
  } catch (err) {
    // Network or JSON parse error. Fail-closed in prod is the safer default
    // for an anti-abuse signal — false negatives (block real users on
    // outage) are easier to forgive than false positives (let bots through).
    logger.error("hcaptcha", "siteverify request failed", err);
    return { success: false, error: "verify_request_failed" };
  }
}
