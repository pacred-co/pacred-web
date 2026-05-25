import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { captureIncident } from "@/lib/observability/incident-store";
import { incidentIngestSchema } from "@/lib/validators/platform-incident";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logger, redactId } from "@/lib/logger";

/**
 * POST /api/observability/incident — IO-1 client-error ingest sink.
 *
 * The endpoint the React error boundary (app/global-error.tsx +
 * app/[locale]/error.tsx) auto-POSTs to on mount — the "no submit
 * button" mechanic (design doc §6.3, IO-1.4). The customer never
 * clicks "report"; the boundary reports for them.
 *
 * Pipeline:
 *   1. rate-limit (per IP) so a hostile client cannot flood the table
 *   2. Zod-validate the body
 *   3. resolve actor context — a ROLE + a REDACTED id (never raw PII)
 *      from the session, if any
 *   4. captureIncident() — fingerprint + dedup-upsert
 *
 * Always returns 2xx-ish quickly (the boundary does not act on the
 * response — capture is fire-and-forget). A bad body → 400; a rate
 * block → 429; everything else → 202 Accepted.
 *
 * Edge-safe: no Node-only APIs. createClient() reads the session
 * cookie; captureIncident() uses the service-role client.
 */

const NOT_ADMIN_ROLES = new Set(["customer", "anon", "partner"]);

export async function POST(request: Request) {
  // 1) Rate-limit per IP — the generic bucket (30/min). A flood of the
  //    same error still dedups to one row, but this caps raw ingest cost.
  const ip = getClientIp(request);
  const blocked = await checkRateLimit("generic", `obs-incident:${ip}`);
  if (blocked) {
    return NextResponse.json(
      { ok: false, error: "rate_limit" },
      { status: 429, headers: { "Retry-After": String(blocked.retryAfterSeconds) } },
    );
  }

  // 2) Parse + validate the body.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const parsed = incidentIngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // 3) Resolve actor context — a ROLE + a REDACTED id, never raw PII
  //    (design doc §3.4). Anonymous (no session) → actor_role 'anon'.
  let actorRole = "anon";
  let actorRef: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user }, error: dataErr } = await supabase.auth.getUser();
    if (dataErr) {
      console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
    }
    if (user) {
      actorRef = redactId(user.id);
      // Is this user an admin? If so, store the highest-trust role label
      // so triage knows "an ops-role user hit this". Else 'customer'.
      const { data: adminRows, error: adminRowsErr } = await supabase
        .from("admins")
        .select("role")
        .eq("profile_id", user.id)
        .eq("is_active", true);
      if (adminRowsErr) {
        console.error(`[admins list] failed`, { code: adminRowsErr.code, message: adminRowsErr.message });
      }
      const roles = (adminRows ?? []).map((r) => r.role as string);
      actorRole = roles.includes("super")
        ? "super"
        : roles[0] ?? "customer";
    }
  } catch (e) {
    // Session resolution must never fail the capture — fall back to anon.
    logger.warn("observability", "incident ingest — actor resolve failed", {
      err: e instanceof Error ? e.message : String(e),
    });
  }

  // The client boundary sends 'js_error'; the source defaults to the
  // surface the actor implies (a non-anon non-admin → portal).
  const source =
    input.source ??
    (actorRole === "anon"
      ? "public"
      : NOT_ADMIN_ROLES.has(actorRole)
        ? "portal"
        : "admin");

  // 4) Capture — fingerprint + dedup-upsert. Never throws.
  const result = await captureIncident({
    source,
    kind:        input.kind,
    message:     input.message,
    route:       input.route || null,
    stack:       input.stack || null,
    surfaceMeta: input.meta ?? null,
    actorRole,
    actorRef,
  });

  if (!result.ok) {
    // Do not leak internals to the client — log server-side, 200 the
    // boundary (it does not retry; a lost report is acceptable).
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  return NextResponse.json(
    { ok: true, deduped: result.created === false },
    { status: 202 },
  );
}
