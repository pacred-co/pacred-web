/**
 * Legacy PCS Cargo password support.
 *
 * The legacy customer table `tb_users.userPass` stores passwords hashed by the
 * PHP function `pass_tam()` (member/include/encryptPass.php). The scheme is
 * unsalted + deterministic — re-implemented here so migrated customers sign in
 * with their EXISTING password via the "เชื่อมต่อบัญชี PCS CARGO" bridge, with
 * no password reset.
 *
 *   a = md5(plaintext)        // 32 hex chars
 *   b = a.slice(0, 15)        // first 15 chars of a
 *   c = md5(b)                // 32 hex chars
 *   d = a reversed            // 32 hex chars
 *   userPass = d + b + c      // 79 chars (the column is varchar(80))
 *
 * Server-only (uses node:crypto).
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
 * Verify a plaintext password against a legacy `tb_users.userPass` hash.
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
