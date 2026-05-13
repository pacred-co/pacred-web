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
