import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless public-receipt token (ภูม flag round 8 · point 4).
 *
 * The public receipt page (`/r/[token]`) must be reachable WITHOUT a login so a
 * customer can scan the QR on their printed ใบเสร็จ and open it. But the raw
 * receipt id (`15118`) and the human doc number (`FRG2605-00218-1`) are both
 * ENUMERABLE — exposing either as the URL would let anyone iterate and read
 * every customer's financial document (a serious PII + money leak).
 *
 * So the URL carries an UNGUESSABLE token instead: `{id}-{hmac}` where the hmac
 * is HMAC-SHA256(secret, `receipt:{id}`) truncated to 128 bits (32 hex chars).
 * Without the server secret an attacker cannot forge a valid token for any id,
 * so the page is effectively capability-gated by the link itself — exactly how
 * Peak / most accounting portals expose a public document.
 *
 * NO DB COLUMN / NO MIGRATION: the token is derived, not stored, so it is
 * stable for a printed QR forever (as long as the keying secret is stable) and
 * needs no schema change to ship.
 *
 * Keying secret resolution:
 *   1. `RECEIPT_TOKEN_SECRET` — a dedicated env var (preferred; set it ONCE in
 *      Vercel before customers start scanning, then it never changes).
 *   2. `SUPABASE_SERVICE_ROLE_KEY` — always present server-side, high entropy,
 *      never shipped to the client. The zero-config fallback so this works on
 *      prod TODAY without an env change. (Documented in docs/env.md.)
 *
 * Both are server-only; `import "server-only"` guarantees this module never
 * leaks into a client bundle.
 */

function tokenSecret(): string {
  const s = process.env.RECEIPT_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    // Neither secret present — fail closed. (Both missing only in a broken env;
    // signing/verifying would otherwise silently use an empty key.)
    throw new Error(
      "receipt-token: neither RECEIPT_TOKEN_SECRET nor SUPABASE_SERVICE_ROLE_KEY is set",
    );
  }
  return s;
}

/** HMAC-SHA256(secret, `receipt:{id}`) → first 128 bits as lowercase hex (32 chars). */
function hmacFor(id: number): string {
  return createHmac("sha256", tokenSecret())
    .update(`receipt:${id}`)
    .digest("hex")
    .slice(0, 32);
}

/** Build the public token `{id}-{32-hex-hmac}` for a receipt's numeric id. */
export function signReceiptToken(id: number): string {
  return `${id}-${hmacFor(id)}`;
}

/**
 * Parse + verify a public token. Returns the receipt id when the hmac matches
 * (constant-time), or null for any malformed / forged / tampered token.
 *
 * The format is strict: `{digits}-{32 lowercase hex}`. Anything else → null,
 * so a probe like `/r/15118` or `/r/15118-deadbeef` never resolves.
 */
export function verifyReceiptToken(token: string): number | null {
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
