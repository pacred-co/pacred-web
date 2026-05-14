"use server";

/**
 * OTP server actions — request + verify.
 *
 * `OTP_BYPASS=true` (dev): skip SMS + accept any code.
 * Production: 6-digit code, hashed with SHA-256 + pepper, TTL 5 min, max 5 attempts,
 *             rate-limited 3 requests/hour/phone.
 */

import { createHash, randomInt } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms/gateway";
import { normalizePhone } from "@/lib/utils/phone";

const OTP_TTL_MS = 5 * 60 * 1000;
const RATE_LIMIT_PER_HOUR = 3;
const MAX_ATTEMPTS = 5;

type Purpose = "register" | "login" | "reset" | "change_phone";

function hashCodeWith(code: string, pepper: string): string {
  return createHash("sha256").update(code + pepper).digest("hex");
}

/** Hash for STORING a new code — always uses the primary pepper. */
function hashCode(code: string): string {
  const pepper = process.env.OTP_PEPPER ?? "default-pepper";
  return hashCodeWith(code, pepper);
}

/**
 * Peppers VERIFY should accept. Returns both `OTP_PEPPER` and
 * `OTP_PEPPER_NEXT` (when present) so codes minted under the old pepper
 * keep verifying for up to OTP_TTL_MS after a rotation — see
 * `docs/runbook/otp-pepper-rotation.md` for the 6-step dual-pepper
 * accept-window procedure.
 */
function activeVerifyPeppers(): string[] {
  const peppers = [process.env.OTP_PEPPER, process.env.OTP_PEPPER_NEXT].filter(
    (p): p is string => Boolean(p),
  );
  return peppers.length > 0 ? peppers : ["default-pepper"];
}

function genCode() {
  // 6-digit, zero-padded
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function requestOtp(
  phoneRaw: string,
  purpose: Purpose,
): Promise<{ ok: true; bypass?: boolean } | { ok: false; error: string }> {
  if (process.env.OTP_BYPASS === "true") {
    return { ok: true, bypass: true };
  }

  const phone = normalizePhone(phoneRaw);
  const admin = createAdminClient();

  // Rate limit
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin
    .from("otp_codes")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("created_at", oneHourAgo);

  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return { ok: false, error: "rate_limit" };
  }

  const code = genCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  const { error: insertErr } = await admin.from("otp_codes").insert({
    phone,
    code_hash: codeHash,
    purpose,
    expires_at: expiresAt,
  });
  if (insertErr) return { ok: false, error: "db_error" };

  const sms = await sendSms(
    phone,
    `Pacred: รหัสยืนยัน ${code} (หมดอายุใน 5 นาที)`,
  );
  if (!sms.ok) return { ok: false, error: "sms_failed" };

  return { ok: true };
}

export async function verifyOtp(
  phoneRaw: string,
  code: string,
  purpose: Purpose,
): Promise<boolean> {
  if (process.env.OTP_BYPASS === "true") return true;

  const phone = normalizePhone(phoneRaw);
  const admin = createAdminClient();

  const { data: otp } = await admin
    .from("otp_codes")
    .select("*")
    .eq("phone", phone)
    .eq("purpose", purpose)
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otp) return false;
  if (otp.attempts >= MAX_ATTEMPTS) return false;

  // Accept hashes under either OTP_PEPPER or OTP_PEPPER_NEXT during a
  // rotation accept-window. New mints use the primary pepper only.
  const valid = activeVerifyPeppers().some(
    (p) => hashCodeWith(code, p) === otp.code_hash,
  );

  if (!valid) {
    const nextAttempts = otp.attempts + 1;
    await admin
      .from("otp_codes")
      .update({
        attempts: nextAttempts,
        used: nextAttempts >= MAX_ATTEMPTS,
      })
      .eq("id", otp.id);
    return false;
  }

  await admin.from("otp_codes").update({ used: true }).eq("id", otp.id);
  return true;
}
