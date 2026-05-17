/**
 * Cron instrumentation — wraps every /api/cron/* handler so each
 * invocation is logged to public.cron_invocations.
 *
 *   import { instrumentCron } from "@/lib/cron/instrument";
 *
 *   export async function GET(request: Request) {
 *     return instrumentCron({
 *       cronPath: "/api/cron/auto-cancel-orders",
 *       request,
 *       handler: async () => {
 *         // …existing logic…
 *         return {
 *           status:  "success",
 *           summary: { cancelled: candidates.length },
 *           payload: { ok: true, cancelled: candidates.length, h_nos: ... },
 *         };
 *       },
 *     });
 *   }
 *
 * Contract:
 *   - The wrapper STILL returns the original NextResponse JSON shape.
 *     Vercel + uptime monitors depend on it — we ONLY add logging.
 *   - Auth check (x-vercel-cron header or Bearer CRON_SECRET) is centralised
 *     here so each cron route doesn't repeat it. Returns 401 with NO log
 *     row written (unauthorised callers shouldn't pollute the health log).
 *   - Logging is best-effort: a DB write failure NEVER changes the HTTP
 *     response; we just console.error and move on.
 *   - DEV (NODE_ENV !== "production"): auth is bypassed, same as the
 *     pre-refactor pattern, so manual `curl localhost:3000/api/cron/...`
 *     still works.
 *
 * Server-only.
 */

import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export type CronStatus = "success" | "failure" | "partial";

/** Handler return — every per-cron branch can shape `payload` freely
 * (it's serialised straight to the JSON response). We deliberately type
 * it as `Record<string, unknown>` so TS doesn't try to narrow across
 * branches (which produced false-positive intersection errors). */
export type CronHandlerResult = {
  /** Lifecycle outcome. */
  status:  CronStatus;
  /** Per-cron meta (kept tiny — goes to result_summary jsonb). */
  summary?: Record<string, unknown>;
  /** Error description when status='failure' or 'partial'. */
  error?:   string;
  /** Body returned in the NextResponse (preserves existing shape). */
  payload:  Record<string, unknown>;
  /** HTTP status to return (defaults to 200; some crons return 500 on hard errors). */
  httpStatus?: number;
};

export type CronInstrumentOptions = {
  cronPath: string;
  request:  Request;
  handler:  () => Promise<CronHandlerResult>;
};

export async function instrumentCron(
  opts: CronInstrumentOptions,
): Promise<NextResponse> {
  const { cronPath, request, handler } = opts;

  // ── Auth (same rule the original routes used) ────────────────────
  const isProd     = process.env.NODE_ENV === "production";
  const vercelCron = request.headers.get("x-vercel-cron") === "1";
  const authHeader = request.headers.get("authorization");
  const secret     = process.env.CRON_SECRET;
  const bearerOk   = !!secret && authHeader === `Bearer ${secret}`;

  if (isProd && !vercelCron && !bearerOk) {
    // Don't log unauthorised attempts — would pollute the health view.
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // ── Run + measure ────────────────────────────────────────────────
  const startedAt = Date.now();
  const firedAtIso = new Date(startedAt).toISOString();

  let result: CronHandlerResult;
  try {
    result = await handler();
  } catch (e) {
    const errMsg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    logger.error("cron.instrument", `unhandled exception in ${cronPath}`, e);
    await persistInvocation({
      cronPath,
      firedAtIso,
      finishedAtIso: new Date().toISOString(),
      durationMs:    Date.now() - startedAt,
      status:        "failure",
      summary:       null,
      errorMessage:  errMsg.slice(0, 2000), // cap to keep DB column reasonable
    });
    return NextResponse.json(
      { ok: false, error: "internal_error", message: errMsg },
      { status: 500 },
    );
  }

  const finishedAt = Date.now();
  await persistInvocation({
    cronPath,
    firedAtIso,
    finishedAtIso: new Date(finishedAt).toISOString(),
    durationMs:    finishedAt - startedAt,
    status:        result.status,
    summary:       result.summary ?? null,
    errorMessage:  result.error ? result.error.slice(0, 2000) : null,
  });

  return NextResponse.json(result.payload, {
    status: result.httpStatus ?? 200,
  });
}

// ── DB persistence (best-effort) ───────────────────────────────────

type PersistArgs = {
  cronPath:      string;
  firedAtIso:    string;
  finishedAtIso: string;
  durationMs:    number;
  status:        CronStatus;
  summary:       Record<string, unknown> | null;
  errorMessage:  string | null;
};

async function persistInvocation(args: PersistArgs): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("cron_invocations").insert({
      cron_path:      args.cronPath,
      fired_at:       args.firedAtIso,
      finished_at:    args.finishedAtIso,
      duration_ms:    args.durationMs,
      status:         args.status,
      result_summary: args.summary,
      error_message:  args.errorMessage,
    });
  } catch (e) {
    // Don't crash the response on log failure — visibility nice-to-have.
    logger.error("cron.instrument", "cron_invocations insert failed", e, {
      cronPath: args.cronPath,
    });
  }
}

// ── Manual-trigger HTTP helper (used by /admin/system/crons "Trigger now") ──

/**
 * Build the absolute URL + headers for a manual cron trigger.
 * Centralised so the admin UI doesn't have to know about CRON_SECRET.
 *
 * Returns null when CRON_SECRET is unset (e.g. local dev without env).
 * The caller (Server Action) should bail with an error in that case.
 */
export function buildCronTriggerRequest(cronPath: string): {
  url:      string;
  headers:  Record<string, string>;
} | null {
  const secret = process.env.CRON_SECRET;
  const base   = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  if (!secret) return null;
  return {
    url:     `${base}${cronPath}`,
    headers: { Authorization: `Bearer ${secret}` },
  };
}
