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

/**
 * HMAC-SHA256(secret, `{docType}:{id}`) → first 128 bits as lowercase hex.
 *
 * `docType` is a domain-separation prefix so a token minted for one document
 * kind can NEVER be replayed as another: a receipt token hashes `receipt:{id}`
 * while a bill token hashes `bill:{id}`, so for the same numeric id the two
 * hmacs differ and `verifyBillToken` rejects a receipt token (and vice-versa).
 * Same secret, same discipline — only the hashed message is namespaced.
 */
function hmacFor(docType: "receipt" | "bill", id: number): string {
  return createHmac("sha256", tokenSecret())
    .update(`${docType}:${id}`)
    .digest("hex")
    .slice(0, 32);
}

/** Build the public token `{id}-{32-hex-hmac}` for a receipt's numeric id. */
export function signReceiptToken(id: number): string {
  return `${id}-${hmacFor("receipt", id)}`;
}

/** Build the public token `{id}-{32-hex-hmac}` for a billing-run invoice id. */
export function signBillToken(id: number): string {
  return `${id}-${hmacFor("bill", id)}`;
}

/**
 * Parse + verify a `{docType}` token. Returns the id when the hmac matches
 * (constant-time), or null for any malformed / forged / tampered / wrong-type
 * token. The format is strict: `{digits}-{32 lowercase hex}`; anything else,
 * or an id whose hmac was minted for a DIFFERENT docType, → null.
 */
function verifyToken(docType: "receipt" | "bill", token: string): number | null {
  const m = /^(\d{1,18})-([0-9a-f]{32})$/.exec(token);
  if (!m) return null;
  const id = Number(m[1]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;

  const expected = Buffer.from(hmacFor(docType, id), "hex");
  const given = Buffer.from(m[2], "hex");
  if (expected.length !== given.length) return null;
  // Constant-time compare so a timing side-channel can't reveal the hmac.
  return timingSafeEqual(expected, given) ? id : null;
}

/**
 * Verify a public RECEIPT token. Returns the receipt id when the hmac matches
 * (constant-time), or null for any malformed / forged / tampered token — or a
 * token that was minted for a different document kind (e.g. a bill token).
 *
 * A probe like `/r/15118` or `/r/15118-deadbeef` never resolves.
 */
export function verifyReceiptToken(token: string): number | null {
  return verifyToken("receipt", token);
}

/**
 * Verify a public BILL (ใบวางบิล) token. Returns the invoice id when the hmac
 * matches (constant-time), or null for any malformed / forged / tampered token
 * — or a token minted for a different document kind (e.g. a receipt token).
 *
 * A probe like `/b/42` or `/b/42-deadbeef` never resolves.
 */
export function verifyBillToken(token: string): number | null {
  return verifyToken("bill", token);
}
