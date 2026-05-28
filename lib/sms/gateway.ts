/**
 * SMS gateway adapter — supports OTP_BYPASS for development.
 *
 * Default provider: ThaiBulkSMS (https://api-v2.thaibulksms.com)
 * Switch via SMS_PROVIDER env var. Add new provider by extending the switch.
 */

import "server-only";
import { logger, redactPhone } from "@/lib/logger";

export interface SmsResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Is the SMS dev-bypass in effect? Two env flags can each trip it:
 *
 *   - `OTP_BYPASS=true`      — skips the real ThaiBulkSMS send (OTP-only path).
 *                              Default `true` in `.env.example` so local dev
 *                              and Vercel preview don't burn credit.
 *   - `NOTIFY_BYPASS=true`   — UNIFIED admin-test guard (2026-05-28 B-1).
 *                              When ภูม or staff click any mutation in
 *                              `/admin/*` to test the system, SMS/LINE/Email
 *                              should NOT fire to real customer phones /
 *                              LINE OAs / inboxes. Setting NOTIFY_BYPASS=true
 *                              short-circuits ALL THREE channels in one place.
 *                              Read by:
 *                                lib/sms/gateway.ts (this file · OTP + admin SMS)
 *                                lib/notifications/index.ts (LINE + Email)
 *
 * BOTH are HARD-DISABLED on Vercel production regardless of the env value:
 * 2026-05-22 the prod deployment was found running with OTP_BYPASS=true (the
 * .env.example default, copied into Vercel). With bypass on, `sendSms` returns
 * a fake { ok:true, messageId:"bypass" } and never calls ThaiBulkSMS —
 * registration "succeeds" but the OTP SMS never reaches the customer, and
 * OTP verify accepts ANY code (an account-takeover hole). A dev default must
 * never silently do that in production.
 *
 * VERCEL_ENV is auto-set by Vercel ("production" only on the production
 * deployment); it is undefined under `pnpm dev`, so local dev still bypasses.
 *
 * Re-added 2026-05-23 night — was lost in a merge between 6299e6c (added it)
 * and 580fc48 (force=corporate fix) when their gateway.ts versions clashed;
 * route.ts kept the import but gateway.ts lost the export → Vercel build broke.
 *
 * Augmented 2026-05-28 ดึก (B-1) — NOTIFY_BYPASS added as a unified switch
 * across all three notification channels.
 */
export function isSmsBypassed(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.OTP_BYPASS === "true" || process.env.NOTIFY_BYPASS === "true";
}

export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  // Dev bypass — log a redacted line so we can see in dev without leaking PII
  if (isSmsBypassed()) {
    logger.info("sms", "bypass — would send SMS", {
      phone: redactPhone(phone),
      length: message.length,
    });
    return { ok: true, messageId: "bypass" };
  }

  const provider = (process.env.SMS_PROVIDER ?? "thaibulksms").toLowerCase();
  switch (provider) {
    case "thaibulksms":
      return sendThaiBulkSms(phone, message);
    default:
      return { ok: false, error: `unknown_provider:${provider}` };
  }
}

/**
 * Check SMS gateway balance — closes chat audit L-3 (silent OTP credit
 * depletion). Returns the remaining credit balance so a daily cron can
 * alert admins when balance < threshold.
 *
 * NOTE: ThaiBulkSMS v2 balance endpoint is TBD — best-guess based on
 * common patterns. ก๊อต/ภูม: confirm exact path with provider docs +
 * adjust the URL + response parsing here.
 */
export interface SmsBalanceResult {
  ok:        boolean;
  balance?:  number;        // remaining credit (varies by provider — could be currency or messages)
  unit?:     "messages" | "thb" | "credits";
  error?:    string;
}

export async function checkSmsBalance(): Promise<SmsBalanceResult> {
  if (isSmsBypassed()) {
    return { ok: true, balance: 9999, unit: "messages" };  // dev bypass — fake healthy balance
  }

  const provider = (process.env.SMS_PROVIDER ?? "thaibulksms").toLowerCase();
  switch (provider) {
    case "thaibulksms":
      return checkThaiBulkSmsBalance();
    default:
      return { ok: false, error: `unknown_provider:${provider}` };
  }
}

async function checkThaiBulkSmsBalance(): Promise<SmsBalanceResult> {
  const apiKey    = process.env.THAIBULKSMS_API_KEY;
  const apiSecret = process.env.THAIBULKSMS_API_SECRET;
  if (!apiKey || !apiSecret) return { ok: false, error: "missing_credentials" };

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  // TODO: confirm endpoint with ThaiBulkSMS docs.  Best-guess paths to try:
  //   GET https://api-v2.thaibulksms.com/credits
  //   GET https://api-v2.thaibulksms.com/sms/credits
  //   GET https://api-v2.thaibulksms.com/balance
  // The current path is the most-likely; if it 404s, ก๊อต updates this file.
  const url = "https://api-v2.thaibulksms.com/credits";

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `http_${res.status}:${body.slice(0, 200)}` };
    }

    // Response shape TBD.  Best-guess: { balance: number, unit?: "messages"|"thb" }.
    const data = (await res.json().catch(() => null)) as
      | { balance?: number; credits?: number; balance_thb?: number; unit?: string }
      | null;
    if (!data) return { ok: false, error: "parse_error" };

    // Try multiple field names in priority order
    const balance =
      typeof data.balance       === "number" ? data.balance :
      typeof data.credits       === "number" ? data.credits :
      typeof data.balance_thb   === "number" ? data.balance_thb :
      undefined;

    if (balance === undefined) {
      return { ok: false, error: `unknown_response_shape:${JSON.stringify(data).slice(0, 200)}` };
    }

    return {
      ok:      true,
      balance,
      unit:    data.unit === "thb" || data.unit === "credits" ? data.unit as "thb" | "credits" : "messages",
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function sendThaiBulkSms(
  phone: string,
  message: string,
): Promise<SmsResult> {
  const apiKey = process.env.THAIBULKSMS_API_KEY;
  const apiSecret = process.env.THAIBULKSMS_API_SECRET;
  const sender = process.env.THAIBULKSMS_SENDER ?? "Pacred";

  if (!apiKey || !apiSecret) {
    // Surface in Sentry — `requestOtp` swallows this to `sms_failed`
    // for the user, so without this log a missing key on Vercel looks
    // identical to an account-credit issue or a network blip.
    logger.error("sms", "ThaiBulkSMS credentials missing", undefined, {
      hasKey:    Boolean(apiKey),
      hasSecret: Boolean(apiSecret),
      phone:     redactPhone(phone),
    });
    return { ok: false, error: "missing_credentials" };
  }

  // Detect placeholder values that crept in from .env.example — they parse
  // as truthy above but ThaiBulkSMS will 401. Catch this loud-and-early.
  if (apiKey.startsWith("YOUR_") || apiSecret.startsWith("YOUR_")) {
    logger.error("sms", "ThaiBulkSMS credentials look like placeholders", undefined, {
      keyPrefix: apiKey.slice(0, 5),
      phone:     redactPhone(phone),
    });
    return { ok: false, error: "placeholder_credentials" };
  }

  // ThaiBulkSMS expects msisdn without leading "+"
  const msisdn = phone.replace(/^\+/, "");
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  // 2026-05-20 incident — `prod register` returned ERROR_INSUFFICIENT_CREDIT
  // even though the ThaiBulkSMS account had 7,302 Corporate credits — because
  // the v2 API defaults to the Standard pool (0 credits) when `force` is not
  // set. Pacred's "Pacred" sender ID approval is in the Corporate pool.
  //
  // 2026-05-22 — default now `"corporate"` to match the Corporate sender
  // approval (Vercel env `THAIBULKSMS_FORCE=corporate` set in parallel). The
  // previous default `"premium"` (`8155d74`) contradicted the comment above
  // and kept routing wrong — customers still couldn't sign up, so prod was
  // running on `OTP_BYPASS=true` as an emergency workaround (the
  // `docs/env.md` §3 "production blocker" security hole). Both fixed.
  // Override via `THAIBULKSMS_FORCE=standard|premium` if a different pool needed.
  // ThaiBulkSMS docs call this `force` with values `premium`/`standard`/`corporate`.
  const force = process.env.THAIBULKSMS_FORCE ?? "corporate";

  const params = new URLSearchParams({ msisdn, message, sender, force });

  try {
    const res = await fetch("https://api-v2.thaibulksms.com/sms", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const errorString = `http_${res.status}:${body.slice(0, 200)}`;
      // Log the real gateway response so we can tell apart 401 (bad keys),
      // 402 (insufficient credit), 400 (bad msisdn / unapproved sender),
      // and 5xx (provider outage) in Vercel logs / Sentry. Without this
      // the user-facing `sms_failed` is a black hole.
      logger.error("sms", "ThaiBulkSMS send failed (HTTP)", undefined, {
        status: res.status,
        body:   body.slice(0, 200),
        sender,
        phone:  redactPhone(phone),
      });
      return { ok: false, error: errorString };
    }

    const data = (await res.json().catch(() => ({}))) as {
      messageId?: string;
      id?: string;
    };
    return { ok: true, messageId: data.messageId ?? data.id };
  } catch (err) {
    logger.error("sms", "ThaiBulkSMS send threw", err, {
      phone: redactPhone(phone),
    });
    return { ok: false, error: String(err) };
  }
}
