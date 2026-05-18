import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { captureIncident } from "@/lib/observability/incident-store";
import { logger } from "@/lib/logger";
import type {
  IncidentSource,
  IncidentSeverity,
} from "@/lib/validators/platform-incident";

/**
 * POST /api/observability/sentry-webhook — IO-1 Sentry-issue ingest
 * (design doc §6.3, IO-1.5).
 *
 * Sentry's cross-browser crash capture is the one rail Pacred cannot
 * cheaply rebuild. This route pulls Sentry's issues INTO Pacred's own
 * store — when Sentry's "Issue" / "Error" alert webhook fires, this
 * upserts a platform_incidents row (deduped by fingerprint, same as the
 * client ingest). So the triage status lives in Pacred, queryable by
 * Pacred RLS, surfaced on Pacred pages. Sentry stays the rail; Pacred
 * owns the system of record.
 *
 * SECURITY — Sentry signs every webhook with `Sentry-Hook-Signature`
 * (HMAC-SHA256 of the raw request body, keyed by the integration
 * client-secret). This route VERIFIES that signature before doing
 * anything — closing the "open partner webhook" leak class by
 * construction (design doc §6.3). The secret is `SENTRY_WEBHOOK_SECRET`.
 *
 * Inert until SENTRY_WEBHOOK_SECRET is set — IO-1.3/IO-1.4 (the
 * boundary + own ingest) do not depend on it; this only enriches.
 */

// Node runtime — we need `crypto` HMAC + the raw request body.
export const runtime = "nodejs";

/** Verify Sentry's HMAC-SHA256 webhook signature against the raw body. */
function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  // Constant-time compare — both buffers must be equal length first.
  const sigBuf = Buffer.from(signature, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length) return false;
  try {
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

/** Map a Sentry issue level → a Pacred incident severity. */
function mapSeverity(level: unknown): IncidentSeverity {
  switch (String(level)) {
    case "fatal":   return "critical";
    case "error":   return "high";
    case "warning": return "medium";
    default:        return "medium";
  }
}

/** Map a Sentry platform/tag hint → a Pacred incident source. */
function mapSource(payload: Record<string, unknown>): IncidentSource {
  const event = (payload.event ?? {}) as Record<string, unknown>;
  const tags = Array.isArray(event.tags) ? (event.tags as unknown[]) : [];
  // Sentry tags arrive as [["key","value"], ...].
  for (const t of tags) {
    if (Array.isArray(t) && t[0] === "runtime.name") return "server";
  }
  const platform = String(event.platform ?? payload.platform ?? "");
  if (platform.includes("node")) return "server";
  if (platform.includes("javascript")) return "portal";
  return "partner";
}

export async function POST(request: Request) {
  const secret = process.env.SENTRY_WEBHOOK_SECRET;

  // Inert until configured — return 503 so Sentry retries once the
  // secret lands (rather than 200-acking into the void).
  if (!secret) {
    logger.warn("observability", "sentry-webhook hit but SENTRY_WEBHOOK_SECRET unset");
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  // Read the RAW body — signature is computed over the exact bytes.
  const rawBody = await request.text();

  // Sentry sends the HMAC in `Sentry-Hook-Signature` (newer integration
  // webhooks) — accept the legacy header name too for resilience.
  const signature =
    request.headers.get("sentry-hook-signature") ??
    request.headers.get("x-sentry-hook-signature");

  if (!verifySignature(rawBody, signature, secret)) {
    logger.warn("observability", "sentry-webhook signature verification failed");
    return NextResponse.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  // Parse the now-verified body.
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  // Sentry's issue/error alert payloads vary by integration version.
  // Pull the fields defensively — data.event / event / data.issue.
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const event = (data.event ?? payload.event ?? {}) as Record<string, unknown>;
  const issue = (data.issue ?? payload.issue ?? {}) as Record<string, unknown>;

  const message =
    String(
      event.title ??
      event.message ??
      issue.title ??
      payload.message ??
      "Sentry issue",
    ).slice(0, 4000);

  const culprit = event.culprit ?? issue.culprit;
  const route = typeof culprit === "string" ? culprit : null;

  const sentryIssueUrl =
    (typeof issue.url === "string" && issue.url) ||
    (typeof event.web_url === "string" && event.web_url) ||
    (typeof payload.url === "string" && payload.url) ||
    null;

  // Capture — deduped by fingerprint just like the client ingest.
  const result = await captureIncident({
    source:         mapSource({ event, ...payload }),
    kind:           "js_error",
    message,
    severity:       mapSeverity(event.level ?? issue.level),
    route,
    surfaceMeta:    { via: "sentry", sentry_issue_id: issue.id ?? event.issue_id ?? null },
    sentryIssueUrl,
  });

  if (!result.ok) {
    logger.error("observability", "sentry-webhook capture failed", null, {
      error: result.error,
    });
    // 200 anyway — Sentry retries on non-2xx, and a retry would just
    // re-fail. The error is logged for the dev to see.
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  return NextResponse.json({ ok: true, incidentId: result.id, deduped: result.created === false });
}
