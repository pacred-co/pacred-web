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

export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  // Dev bypass — log a redacted line so we can see in dev without leaking PII
  if (process.env.OTP_BYPASS === "true") {
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
  if (process.env.OTP_BYPASS === "true") {
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
    return { ok: false, error: "missing_credentials" };
  }

  // ThaiBulkSMS expects msisdn without leading "+"
  const msisdn = phone.replace(/^\+/, "");
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  try {
    const res = await fetch("https://api-v2.thaibulksms.com/sms", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        msisdn,
        message,
        sender,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `http_${res.status}:${body.slice(0, 200)}` };
    }

    const data = (await res.json().catch(() => ({}))) as {
      messageId?: string;
      id?: string;
    };
    return { ok: true, messageId: data.messageId ?? data.id };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
