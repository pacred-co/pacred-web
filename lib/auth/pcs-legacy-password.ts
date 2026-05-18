/**
 * Legacy PCS Cargo sign-in primitives — password hashing + identifier shaping.
 *
 * The legacy customer table `tb_users.userpass` stores passwords hashed by the
 * PHP function `pass_tam()` (member/include/encryptPass.php). The scheme is
 * unsalted + deterministic — re-implemented here so migrated customers sign in
 * with their EXISTING password via the "เชื่อมต่อบัญชี PCS CARGO" bridge, with
 * no password reset.
 *
 *   a = md5(plaintext)        // 32 hex chars
 *   b = a.slice(0, 15)        // first 15 chars of a
 *   c = md5(b)                // 32 hex chars
 *   d = a reversed            // 32 hex chars
 *   userpass = d + b + c      // 79 chars (the column is varchar(80))
 *
 * The hashing functions use node:crypto (server-side); the identifier helpers
 * below are pure. Consumed by the auth bridge `lib/auth/pcs-legacy-bridge.ts`.
 */
import { createHash } from "node:crypto";

function md5(input: string): string {
  return createHash("md5").update(input, "utf8").digest("hex");
}

/** Re-implementation of the legacy PHP `pass_tam()` password hash. */
export function passTam(plaintext: string): string {
  const a = md5(plaintext);
  const b = a.slice(0, 15);
  const c = md5(b);
  const d = a.split("").reverse().join("");
  return d + b + c;
}

/**
 * Verify a plaintext password against a legacy `tb_users.userpass` hash.
 *
 * The legacy scheme is unsalted MD5 — cryptographically weak. On a successful
 * login the caller should re-hash the password with the modern scheme and drop
 * the legacy hash (lazy, login-time migration).
 */
export function verifyLegacyPassword(plaintext: string, storedHash: string): boolean {
  const computed = passTam(plaintext);
  if (computed.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Thai phone-number forms to match against the legacy `tb_users.usertel`
 * column. Legacy data stores Thai numbers inconsistently (`081…`, `+66…`,
 * bare `66…`); given whatever the customer typed at sign-in this returns every
 * plausible stored form, so the bridge lookup `usertel IN (…)` finds the row.
 * Returns `[]` when the input is not a phone number (e.g. a letter-only member
 * handle such as PW / JET) — the caller then falls back to a userid lookup.
 */
export function legacyPhoneCandidates(input: string): string[] {
  const cleaned = input.replace(/[\s-()]/g, "");
  let nsn = cleaned; // national significant number — no country code, no leading 0
  if (nsn.startsWith("+66")) nsn = nsn.slice(3);
  else if (nsn.startsWith("66")) nsn = nsn.slice(2);
  else if (nsn.startsWith("0")) nsn = nsn.slice(1);
  if (nsn.length === 0 || !/^\d+$/.test(nsn)) return [];
  return [...new Set([cleaned, `0${nsn}`, `+66${nsn}`, `66${nsn}`])];
}

/**
 * Synthetic e-mail for a migrated customer whose legacy `tb_users.usertel` is
 * unusable (junk / empty). The auth bridge provisions the Supabase user with
 * this address instead of a phone. Uses the RFC-2606 reserved `.invalid` TLD
 * so it can never collide with — or be mistaken for — a real address.
 */
export function legacySyntheticEmail(userid: string): string {
  return `pcs-legacy-${userid.trim().toLowerCase()}@users.pacred.invalid`;
}
