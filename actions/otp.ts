"use server";

/**
 * OTP server actions — request + verify.
 *
 * `OTP_BYPASS=true` (dev): skip SMS + accept any code.
 * Production: 6-digit code, hashed with SHA-256 + pepper, TTL 15 min, max 5 attempts,
 *             rate-limited 3 requests/hour/phone.
 */

import { createHash, randomInt } from "crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms/gateway";
import { normalizePhone } from "@/lib/utils/phone";
import { checkRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { logger, redactPhone } from "@/lib/logger";

// 15 min — must comfortably exceed real SMS delivery time. 2026-05-22: prod
// ThaiBulkSMS was observed delivering an OTP SMS ~5 min 13s after submit; a
// 5-min TTL meant the code expired the instant the SMS landed → every
// registration failed with invalid_otp. The slow delivery itself is a
// ThaiBulkSMS sender/route issue (fix it provider-side); this longer TTL
// just stops the code dying before a still-slow SMS arrives.
const OTP_TTL_MS = 15 * 60 * 1000;
const RATE_LIMIT_PER_HOUR = 3;
const MAX_ATTEMPTS = 5;

// ⚠️ EMERGENCY 2026-05-22 — OTP bypass HARDCODED ON.
// prod ThaiBulkSMS gateway broken, customers couldn't sign up, sales losing
// leads. Switched from env-gated (`process.env.OTP_BYPASS === "true"`) to a
// hardcoded constant so it stays on regardless of the Vercel env state.
//
// Effect: `requestOtp` returns {ok:true, bypass:true} without sending an SMS,
// and `verifyOtp` short-circuits to true. The register page UI already
// handles `bypass:true` by skipping the OTP entry step + submitting the form
// directly (`app/[locale]/(auth)/register/page.tsx:290` + `:543`).
//
// SECURITY HOLE: anyone can register with any phone, no verification. The
// docs/env.md §3 "production blocker" warning. Restore the env check below
// (and revert this constant to `false`) the moment SMS routing is fixed.
const EMERGENCY_OTP_BYPASS = true;

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
  if (EMERGENCY_OTP_BYPASS || process.env.OTP_BYPASS === "true") {
    return { ok: true, bypass: true };
  }

  const phone = normalizePhone(phoneRaw);
  const admin = createAdminClient();

  // C-5 — IP rate-limit the OTP SEND. The per-phone cap below stops one
  // number being spammed; it does NOT stop a script cycling distinct phone
  // numbers from one IP to drain the paid ThaiBulkSMS balance. This IP
  // ceiling closes that abuse path (each send = one real SMS).
  const ip = getClientIpFromHeaders(await headers());
  const ipBlocked = await checkRateLimit("otpRequest", ip);
  if (ipBlocked) return { ok: false, error: "rate_limit" };

  // Per-phone rate limit — 3/hour/phone counted from the otp_codes table.
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

  // Send the SMS FIRST — only persist the otp_codes row once the send
  // succeeds. The per-phone rate limit counts otp_codes rows, so inserting
  // before sending meant a failed send still burned a 3/hour quota slot;
  // three failed sends silently exhausted the quota and the user then got
  // no SMS at all. A failed send now leaves no row and no quota consumed.
  const sms = await sendSms(
    phone,
    `Pacred: รหัสยืนยัน ${code} (หมดอายุใน 15 นาที)`,
  );
  if (!sms.ok) {
    // Capture the actual gateway reason — without this, every prod
    // SMS failure looks identical to the user ("ส่ง SMS ไม่สำเร็จ")
    // and we can't tell apart a credit-exhausted account from a
    // rotated API key or a sender-ID block.
    logger.error("otp", "sendSms failed for requestOtp", undefined, {
      purpose,
      phone:  redactPhone(phone),
      reason: sms.error,
    });
    return { ok: false, error: "sms_failed" };
  }

  const { error: insertErr } = await admin.from("otp_codes").insert({
    phone,
    code_hash: codeHash,
    purpose,
    expires_at: expiresAt,
  });
  if (insertErr) return { ok: false, error: "db_error" };

  return { ok: true };
}

export async function verifyOtp(
  phoneRaw: string,
  code: string,
  purpose: Purpose,
): Promise<boolean> {
  if (EMERGENCY_OTP_BYPASS || process.env.OTP_BYPASS === "true") return true;

  const phone = normalizePhone(phoneRaw);
  const admin = createAdminClient();

  const { data: otp, error: otpErr } = await admin
    .from("otp_codes")
    .select("*")
    .eq("phone", phone)
    .eq("purpose", purpose)
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (otpErr) {
    console.error(`[otp_codes list] failed`, { code: otpErr.code, message: otpErr.message });
  }

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
