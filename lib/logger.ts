/**
 * Structured logger with PII redaction.
 *
 * Use everywhere instead of raw `console.log/warn/error`:
 *
 *   import { logger, redactPhone } from "@/lib/logger";
 *
 *   logger.info("sms", "OTP bypass active", { phone: redactPhone(phone) });
 *   logger.warn("notifications", "LINE token missing — skip push");
 *   logger.error("audit", "insert failed", err, { adminId });
 *
 * Behaviour:
 *   - dev (NODE_ENV !== "production"): pretty console with scope tag
 *   - prod: single-line JSON to stdout so Vercel/Sentry parse structured
 *
 * Never log raw phone/email/UUID — use the `redact*` helpers below.
 *
 * Server-only (do NOT import in client components).
 */

import "server-only";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogPayload = {
  ts:     string;
  level:  LogLevel;
  scope:  string;
  msg:    string;
  err?:   { name: string; message: string; stack?: string };
  ctx?:   Record<string, unknown>;
};

const IS_PROD = process.env.NODE_ENV === "production";

function emit(payload: LogPayload): void {
  if (IS_PROD) {
    // Single-line JSON for Vercel log ingestion / Sentry breadcrumb pickup
    process.stdout.write(JSON.stringify(payload) + "\n");
    return;
  }

  // Dev: pretty-print with scope tag
  const tag   = `[${payload.scope}]`;
  const ctx   = payload.ctx ? ` ${JSON.stringify(payload.ctx)}` : "";
  const errOut = payload.err ? `\n  → ${payload.err.name}: ${payload.err.message}` : "";
  const line  = `${tag} ${payload.msg}${ctx}${errOut}`;

  switch (payload.level) {
    case "debug": console.debug(line); break;
    case "info":  console.log(line);   break;
    case "warn":  console.warn(line);  break;
    case "error": console.error(line); break;
  }
}

function makePayload(level: LogLevel, scope: string, msg: string, err?: unknown, ctx?: Record<string, unknown>): LogPayload {
  const payload: LogPayload = {
    ts:    new Date().toISOString(),
    level,
    scope,
    msg,
  };
  if (err instanceof Error) {
    payload.err = { name: err.name, message: err.message };
    if (!IS_PROD) payload.err.stack = err.stack;
  } else if (err != null) {
    payload.err = { name: "UnknownError", message: String(err) };
  }
  if (ctx && Object.keys(ctx).length > 0) payload.ctx = ctx;
  return payload;
}

export const logger = {
  debug: (scope: string, msg: string, ctx?: Record<string, unknown>) =>
    emit(makePayload("debug", scope, msg, undefined, ctx)),

  info: (scope: string, msg: string, ctx?: Record<string, unknown>) =>
    emit(makePayload("info", scope, msg, undefined, ctx)),

  warn: (scope: string, msg: string, ctx?: Record<string, unknown>) =>
    emit(makePayload("warn", scope, msg, undefined, ctx)),

  /**
   * Error log — captures stack in dev only (avoid leaking source paths in prod logs).
   */
  error: (scope: string, msg: string, err?: unknown, ctx?: Record<string, unknown>) =>
    emit(makePayload("error", scope, msg, err, ctx)),
};

// ── PII redaction helpers ─────────────────────────────────────────────────

/**
 * Mask a phone number — keeps first 2 + last 4 digits.
 *   redactPhone("0812345678")  // "08****5678"
 *   redactPhone("+66812345678") // "+6********5678"
 */
export function redactPhone(phone: string | null | undefined): string {
  if (!phone) return "<empty>";
  const s = String(phone);
  if (s.length <= 6) return "*".repeat(s.length);
  return s.slice(0, 2) + "*".repeat(s.length - 6) + s.slice(-4);
}

/**
 * Mask an email — keeps first + last char of local part.
 *   redactEmail("admin@pacred.co")  // "a***n@pacred.co"
 *   redactEmail("a@x.com")          // "a@x.com"  (too short to mask)
 */
export function redactEmail(email: string | null | undefined): string {
  if (!email) return "<empty>";
  const at = email.indexOf("@");
  if (at < 0) return "<malformed>";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local}${domain}`;
  return `${local[0]}${"*".repeat(local.length - 2)}${local.slice(-1)}${domain}`;
}

/**
 * Mask a UUID — keeps first 8 chars (enough to grep across logs).
 *   redactId("550e8400-e29b-41d4-a716-446655440000") // "550e8400-***"
 */
export function redactId(id: string | null | undefined): string {
  if (!id) return "<empty>";
  if (id.length <= 8) return id;
  return id.slice(0, 8) + "-***";
}
