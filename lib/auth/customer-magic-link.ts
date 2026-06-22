import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Customer "magic login" capability token — `/k/[token]`.
 *
 * Owner 2026-06-22: after an admin creates a customer, the system hands out a
 * UNIQUE link that lets the customer get into their own account directly. The
 * owner's two constraints:
 *   1. the link NEVER expires, and
 *   2. clicking it does NOT log you straight in — the customer must request an
 *      OTP (sent to their registered phone) and pass it first. Only then is a
 *      session minted.
 *
 * Security model — possession of the link is NOT access:
 *   - The token is an UNGUESSABLE HMAC capability link (`{memberCode}-{32hex}`,
 *     same construction as the public receipt token · lib/receipt/receipt-token.ts).
 *     Without the server secret nobody can forge a valid token for any code.
 *   - The link alone proves nothing — `redeemMagicLogin` (actions/customer-magic-link.ts)
 *     still requires a fresh OTP delivered to the customer's phone. So even a
 *     leaked link can't sign anyone in without the phone (the second factor).
 *   - No expiry is therefore acceptable: the OTP, not the link, is the gate.
 *
 * NO DB COLUMN / NO MIGRATION: the token is derived from the member code, not
 * stored, so it is stable forever (as long as the keying secret is stable).
 *
 * Keying secret resolution mirrors the receipt token (so it works on prod today
 * with zero env change): `RECEIPT_TOKEN_SECRET` if set, else the always-present
 * server-only `SUPABASE_SERVICE_ROLE_KEY`. Both are server-only; `import
 * "server-only"` keeps this module out of any client bundle.
 */

function tokenSecret(): string {
  const s = process.env.RECEIPT_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error(
      "customer-magic-link: neither RECEIPT_TOKEN_SECRET nor SUPABASE_SERVICE_ROLE_KEY is set",
    );
  }
  return s;
}

/** Normalise a member code for keying — uppercase, trimmed (PR codes are uppercase). */
function normCode(memberCode: string): string {
  return memberCode.trim().toUpperCase();
}

/** HMAC-SHA256(secret, `mlogin:{CODE}`) → first 128 bits as lowercase hex (32 chars). */
function hmacFor(memberCode: string): string {
  return createHmac("sha256", tokenSecret())
    .update(`mlogin:${normCode(memberCode)}`)
    .digest("hex")
    .slice(0, 32);
}

/** Build the magic-login token `{MEMBERCODE}-{32-hex-hmac}` for a customer. */
export function signCustomerLoginToken(memberCode: string): string {
  return `${normCode(memberCode)}-${hmacFor(memberCode)}`;
}

/**
 * Parse + verify a magic-login token. Returns the member code (uppercased) when
 * the hmac matches (constant-time), or null for any malformed / forged token.
 *
 * Strict format: `PR{digits}-{32 lowercase hex}` (case-insensitive on the PR
 * prefix). Anything else → null, so a probe like `/k/PR123` never resolves.
 */
export function verifyCustomerLoginToken(token: string): string | null {
  const m = /^(PR\d{1,12})-([0-9a-f]{32})$/i.exec(token.trim());
  if (!m) return null;
  const code = m[1]!.toUpperCase();

  const expected = Buffer.from(hmacFor(code), "hex");
  const given = Buffer.from(m[2]!.toLowerCase(), "hex");
  if (expected.length !== given.length) return null;
  // Constant-time compare so a timing side-channel can't reveal the hmac.
  return timingSafeEqual(expected, given) ? code : null;
}
