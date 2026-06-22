import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless public-quotation token — the ใบเสนอราคา twin of
 * `lib/receipt/receipt-token.ts` (owner ภูม 2026-06-22).
 *
 * The public quotation page (`/q/[token]`) must be reachable WITHOUT a login so
 * a customer can open the ใบเสนอราคา the sales rep sent them. But the row id
 * (`42`) is ENUMERABLE — exposing it as the URL would let anyone iterate and
 * read every customer's quotation (price + PII leak).
 *
 * So the URL carries an UNGUESSABLE token instead: `{id}-{hmac}` where the hmac
 * is HMAC-SHA256(secret, `quote:{id}`) truncated to 128 bits (32 hex chars).
 * Without the server secret an attacker cannot forge a valid token for any id,
 * so the page is capability-gated by the link itself — exactly how the receipt
 * `/r/[token]` page works.
 *
 * NO extra DB column: the token is DERIVED from the row id, not stored, so it is
 * stable for a shared link forever (as long as the keying secret is stable).
 *
 * Keying secret resolution (identical to the receipt token):
 *   1. `RECEIPT_TOKEN_SECRET` — the dedicated env var (preferred; one secret for
 *      every public-document link — set it ONCE in Vercel, then it never changes).
 *   2. `SUPABASE_SERVICE_ROLE_KEY` — always present server-side, high entropy,
 *      never shipped to the client. The zero-config fallback so this works on
 *      prod TODAY without an env change.
 *
 * Both are server-only; `import "server-only"` guarantees this module never
 * leaks into a client bundle. (Sharing `RECEIPT_TOKEN_SECRET` is safe — the
 * keying STRING differs per doc type: `quote:{id}` vs `receipt:{id}` — so a
 * receipt token can never be replayed as a quotation token for the same id.)
 */

function tokenSecret(): string {
  const s = process.env.RECEIPT_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    // Neither secret present — fail closed. (Both missing only in a broken env;
    // signing/verifying would otherwise silently use an empty key.)
    throw new Error(
      "quote-token: neither RECEIPT_TOKEN_SECRET nor SUPABASE_SERVICE_ROLE_KEY is set",
    );
  }
  return s;
}

/** HMAC-SHA256(secret, `quote:{id}`) → first 128 bits as lowercase hex (32 chars). */
function hmacFor(id: number): string {
  return createHmac("sha256", tokenSecret())
    .update(`quote:${id}`)
    .digest("hex")
    .slice(0, 32);
}

/** Build the public token `{id}-{32-hex-hmac}` for a quotation's numeric id. */
export function signQuoteToken(id: number): string {
  return `${id}-${hmacFor(id)}`;
}

/**
 * Parse + verify a public token. Returns the quotation id when the hmac matches
 * (constant-time), or null for any malformed / forged / tampered token.
 *
 * The format is strict: `{digits}-{32 lowercase hex}`. Anything else → null,
 * so a probe like `/q/42` or `/q/42-deadbeef` never resolves.
 */
export function verifyQuoteToken(token: string): number | null {
  const m = /^(\d{1,18})-([0-9a-f]{32})$/.exec(token);
  if (!m) return null;
  const id = Number(m[1]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;

  const expected = Buffer.from(hmacFor(id), "hex");
  const given = Buffer.from(m[2], "hex");
  if (expected.length !== given.length) return null;
  // Constant-time compare so a timing side-channel can't reveal the hmac.
  return timingSafeEqual(expected, given) ? id : null;
}
