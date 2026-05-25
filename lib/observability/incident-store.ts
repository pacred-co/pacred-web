/**
 * IO-1 incident store — the upsert + dedup core.
 *
 * The single place an incident is written. Both capture-rail entry
 * points use it:
 *   - app/api/observability/incident/route.ts  (the client-error sink)
 *   - app/api/observability/sentry-webhook/route.ts (Sentry issues)
 *   - lib/observability/with-observability.ts   (the Server-Action wrap)
 *
 * Dedup contract (design doc §6.2): the SAME fingerprint that already
 * has a LIVE incident (status NOT IN resolved/ignored) → bump
 * occurrence_count + last_seen, return that row. Otherwise INSERT a
 * fresh 'open' row. The 0077 partial-unique index on fingerprint
 * (live statuses) is the DB-level backstop against a race double-insert.
 *
 * On a NEW high/critical incident this fires the seed dev-alert (the
 * IO-1 single alert rule — §6.7) via the shipped sendNotification()
 * pipeline. Best-effort: an alert failure never fails the capture.
 *
 * PII posture (§3.4): the caller is responsible for passing already-
 * stripped data; this module additionally truncates message/stack and
 * never logs the raw body.
 *
 * Server-only.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger, redactId } from "@/lib/logger";
import { sendNotification } from "@/lib/notifications";
import { computeFingerprint } from "./fingerprint";
import {
  shouldAlert,
  type IncidentKind,
  type IncidentSource,
  type IncidentSeverity,
} from "@/lib/validators/platform-incident";

/** Money-path route fragments — an error here is triaged 'high'. */
const HIGH_SEVERITY_ROUTE_HINTS = [
  "/wallet",
  "/payment",
  "/service-payment",
  "/checkout",
  "/refund",
  "/disbursement",
  "/credit",
  "/tax-invoice",
];

/**
 * Ingest-time severity rule (design doc §6.2). A money-path route → high;
 * any server-side error (500-class) → high; everything else → medium.
 * The caller may override (e.g. the Sentry webhook reads Sentry's level).
 */
export function classifySeverity(args: {
  kind:   IncidentKind;
  route?: string | null;
}): IncidentSeverity {
  if (args.kind === "server_error") return "high";
  const route = (args.route ?? "").toLowerCase();
  if (HIGH_SEVERITY_ROUTE_HINTS.some((h) => route.includes(h))) return "high";
  return "medium";
}

/** Build a short human title from an error message (truncated). */
export function deriveTitle(message: string): string {
  const firstLine = message.split("\n")[0]?.trim() ?? message.trim();
  return firstLine.length > 0 ? firstLine.slice(0, 200) : "Unknown error";
}

export type CaptureIncidentInput = {
  source:    IncidentSource;
  kind:      IncidentKind;
  message:   string;
  /** Optional — defaults to the ingest-time severity rule. */
  severity?: IncidentSeverity;
  stack?:    string | null;
  route?:    string | null;
  surfaceMeta?: Record<string, unknown> | null;
  /** A role, never an identity (design doc §3.4). */
  actorRole?: string | null;
  /** A redactId()-form id — NOT a raw uuid. */
  actorRef?:  string | null;
  /** Set when the row originates from the Sentry webhook. */
  sentryIssueUrl?: string | null;
};

export type CaptureIncidentResult = {
  ok:           boolean;
  id?:          string;
  /** True when this was a brand-new incident (vs a dedup re-fire). */
  created?:     boolean;
  fingerprint?: string;
  error?:       string;
};

/**
 * Capture (upsert) an incident. The button-less rails all funnel here.
 * Never throws — capture must not break the surface that hit the error.
 */
export async function captureIncident(
  input: CaptureIncidentInput,
): Promise<CaptureIncidentResult> {
  try {
    const admin = createAdminClient();

    const fingerprint = computeFingerprint({
      kind:    input.kind,
      message: input.message,
      route:   input.route,
    });
    const severity = input.severity ?? classifySeverity({
      kind:  input.kind,
      route: input.route,
    });
    const nowIso = new Date().toISOString();

    // ── Dedup — is there already a LIVE incident for this fingerprint? ──
    const { data: existing, error: existingErr } = await admin
      .from("platform_incidents")
      .select("id, occurrence_count, status, severity")
      .eq("fingerprint", fingerprint)
      .not("status", "in", "(resolved,ignored)")
      .maybeSingle<{
        id: string; occurrence_count: number;
        status: string; severity: string;
      }>();
    if (existingErr) {
      console.error(`[platform_incidents list] failed`, { code: existingErr.code, message: existingErr.message });
    }

    if (existing) {
      // Re-fire — bump the counter + last_seen. Do NOT reset status:
      // if a dev already acknowledged it, a recurrence keeps that
      // triage state (the occurrence count tells them it is still live).
      const { error: bumpErr } = await admin
        .from("platform_incidents")
        .update({
          occurrence_count: existing.occurrence_count + 1,
          last_seen:        nowIso,
        })
        .eq("id", existing.id);

      if (bumpErr) {
        logger.error("observability", "incident occurrence bump failed", bumpErr, {
          incidentId: redactId(existing.id),
        });
        return { ok: false, error: bumpErr.message, fingerprint };
      }
      return { ok: true, id: existing.id, created: false, fingerprint };
    }

    // ── New incident — INSERT a fresh 'open' row. ──
    // The 0077 partial-unique index is the race backstop: if a
    // concurrent request inserted the same fingerprint between the
    // SELECT and here, this INSERT hits a unique violation — we then
    // re-read + bump instead of failing the capture.
    const { data: inserted, error: insErr } = await admin
      .from("platform_incidents")
      .insert({
        fingerprint,
        source:           input.source,
        kind:             input.kind,
        severity,
        status:           "open",
        title:            deriveTitle(input.message),
        message:          input.message.slice(0, 4000),
        stack:            input.stack ? input.stack.slice(0, 8000) : null,
        route:            input.route ?? null,
        surface_meta:     input.surfaceMeta ?? null,
        actor_role:       input.actorRole ?? null,
        actor_ref:        input.actorRef ?? null,
        sentry_issue_url: input.sentryIssueUrl ?? null,
        occurrence_count: 1,
        first_seen:       nowIso,
        last_seen:        nowIso,
      })
      .select("id")
      .single<{ id: string }>();

    if (insErr || !inserted) {
      // Unique-violation → a concurrent insert won the race. Re-read +
      // bump so the occurrence is still counted.
      if (insErr?.code === "23505") {
        const { data: raced, error: racedErr } = await admin
          .from("platform_incidents")
          .select("id, occurrence_count")
          .eq("fingerprint", fingerprint)
          .not("status", "in", "(resolved,ignored)")
          .maybeSingle<{ id: string; occurrence_count: number }>();
        if (racedErr) {
          console.error(`[platform_incidents list] failed`, { code: racedErr.code, message: racedErr.message });
        }
        if (raced) {
          await admin
            .from("platform_incidents")
            .update({
              occurrence_count: raced.occurrence_count + 1,
              last_seen:        nowIso,
            })
            .eq("id", raced.id);
          return { ok: true, id: raced.id, created: false, fingerprint };
        }
      }
      logger.error("observability", "incident insert failed", insErr, { fingerprint });
      return { ok: false, error: insErr?.message ?? "insert_failed", fingerprint };
    }

    // ── Seed alert — a NEW high/critical incident notifies a dev. ──
    if (shouldAlert(severity)) {
      await fireSeedAlert(inserted.id, deriveTitle(input.message), severity, input.route);
    }

    return { ok: true, id: inserted.id, created: true, fingerprint };
  } catch (e) {
    logger.error("observability", "captureIncident threw", e);
    return { ok: false, error: e instanceof Error ? e.message : "capture_failed" };
  }
}

/**
 * The IO-1 seed alert (design doc §6.7) — the single hard-coded alert
 * rule (the full engine is Stage 4). On a new high/critical incident,
 * notify every super-role admin via the shipped sendNotification()
 * pipeline (LINE push + email). Best-effort — never fails the capture.
 */
async function fireSeedAlert(
  incidentId: string,
  title: string,
  severity: IncidentSeverity,
  route: string | null | undefined,
): Promise<void> {
  try {
    const admin = createAdminClient();

    // The IO-1 alert target = the super-role admins (design doc §13 Q4
    // — promotable to a proper on-call rota in Stage 4).
    const { data: supers, error: supersErr } = await admin
      .from("admins")
      .select("profile_id")
      .eq("role", "super")
      .eq("is_active", true);
    if (supersErr) {
      console.error(`[admins list] failed`, { code: supersErr.code, message: supersErr.message });
    }

    const targets = [...new Set((supers ?? []).map((r) => r.profile_id as string))];
    if (targets.length === 0) {
      logger.warn("observability", "seed alert — no active super admin to notify", {
        incidentId: redactId(incidentId),
      });
      return;
    }

    const icon = severity === "critical" ? "🔴" : "🟠";
    const where = route ? ` (${route})` : "";

    await Promise.all(
      targets.map((profileId) =>
        sendNotification(profileId, {
          category:       "observability",
          severity:       "error",
          title:          `${icon} เกิดข้อผิดพลาดใหม่ในระบบ`,
          body:           `${title}${where}`,
          link_href:      `/admin/incidents?status=open`,
          reference_type: "platform_incident",
          reference_id:   incidentId,
        }),
      ),
    );
  } catch (e) {
    // An alert failure must never break capture — log + swallow.
    logger.error("observability", "seed alert dispatch failed", e, {
      incidentId: redactId(incidentId),
    });
  }
}
