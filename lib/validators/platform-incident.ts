/**
 * Zod schemas + shared constants for IO-1 platform-observability
 * (0077 platform_incidents — auto-incident capture + triage).
 *
 * Per docs/research/platform-observability-system-2026-05-18.md §6 —
 * Stage 1 (MVP). platform_incidents auto-captures errors with NO submit
 * button, deduped by fingerprint, and carries an
 * open→acknowledged→in_progress→resolved/ignored lifecycle the user sees.
 *
 * These constants are the single source of truth shared by the migration
 * (0077), the ingest route, the Sentry webhook, the Server Actions
 * (actions/admin/incidents.ts) and the triage UI (/admin/incidents). The
 * string literals MUST match the migration's CHECK constraints exactly.
 */

import { z } from "zod";

// ── Source — which surface emitted the error ─────────────────────────
export const INCIDENT_SOURCES = [
  "public",   // the marketing site (no auth)
  "portal",   // the customer portal
  "admin",    // the back-office
  "partner",  // a partner webhook (Sentry / MOMO)
  "server",   // a server-side / route-handler / cron error
] as const;
export type IncidentSource = (typeof INCIDENT_SOURCES)[number];

export const INCIDENT_SOURCE_LABEL: Record<IncidentSource, string> = {
  public:  "เว็บหน้าบ้าน",
  portal:  "พอร์ทัลลูกค้า",
  admin:   "หลังบ้าน",
  partner: "พาร์ทเนอร์",
  server:  "เซิร์ฟเวอร์",
};

// ── Kind — the error category ────────────────────────────────────────
export const INCIDENT_KINDS = [
  "js_error",       // client-side render / runtime error
  "server_error",   // a thrown server / route-handler error
  "failed_action",  // a Server Action threw (withObservability)
  "api_error",      // a non-2xx from an API / partner call
] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export const INCIDENT_KIND_LABEL: Record<IncidentKind, string> = {
  js_error:      "JS error",
  server_error:  "Server error",
  failed_action: "Action ล้มเหลว",
  api_error:     "API error",
};

// ── Severity — triage urgency ────────────────────────────────────────
export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  low:      "ต่ำ",
  medium:   "ปานกลาง",
  high:     "สูง",
  critical: "วิกฤต",
};

/** A new incident at this severity (or above) fires the seed dev-alert. */
export const ALERTING_SEVERITIES: readonly IncidentSeverity[] = ["high", "critical"];

// ── Status — the lifecycle the owner asked for ───────────────────────
// open → acknowledged → in_progress → resolved (terminal) | ignored (terminal)
export const INCIDENT_STATUSES = [
  "open",
  "acknowledged",
  "in_progress",
  "resolved",
  "ignored",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/** Internal/admin-facing status label (Thai). */
export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  open:         "เปิด (รอตรวจ)",
  acknowledged: "รับเรื่องแล้ว",
  in_progress:  "กำลังแก้ไข",
  resolved:     "แก้ไขแล้ว",
  ignored:      "ปิด (ไม่ใช่บั๊ก)",
};

/**
 * The plain-Thai status the USER WHO HIT THE ERROR sees — the owner's
 * explicit vocabulary (design doc §6.4). 'ignored' is never surfaced to
 * a user (it is silently closed), so it maps to the "filed" copy.
 */
export const INCIDENT_USER_STATUS_LABEL: Record<IncidentStatus, string> = {
  open:         "ส่งเรื่องแล้ว",
  acknowledged: "กำลังดำเนินการ",
  in_progress:  "กำลังดำเนินการ",
  resolved:     "แก้ไขแล้ว",
  ignored:      "ส่งเรื่องแล้ว",
};

/** Statuses considered "live" — open on the triage queue, not closed. */
export const LIVE_INCIDENT_STATUSES: readonly IncidentStatus[] = [
  "open",
  "acknowledged",
  "in_progress",
];

/**
 * Legal status transitions (the work_items / disbursement pattern). The
 * triage actions validate the requested (from → to) hop against this
 * map; the DB write also carries an optimistic .eq("status", from)
 * race-guard so two devs cannot clobber each other.
 */
export const INCIDENT_STATUS_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  open:         ["acknowledged", "ignored"],
  acknowledged: ["in_progress", "resolved", "ignored"],
  in_progress:  ["resolved", "ignored"],
  resolved:     ["open"],     // re-open a regression
  ignored:      ["open"],     // re-open a wrongly-dismissed incident
};

// ── Status-badge Tailwind classes (mirror /admin/system/crons) ───────
export const INCIDENT_STATUS_BADGE: Record<IncidentStatus, string> = {
  open:         "bg-red-50 text-red-700 border-red-200",
  acknowledged: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress:  "bg-blue-50 text-blue-700 border-blue-200",
  resolved:     "bg-green-50 text-green-700 border-green-200",
  ignored:      "bg-surface-alt text-muted border-border",
};

export const INCIDENT_SEVERITY_BADGE: Record<IncidentSeverity, string> = {
  low:      "bg-surface-alt text-muted border-border",
  medium:   "bg-amber-50 text-amber-700 border-amber-200",
  high:     "bg-orange-50 text-orange-700 border-orange-200",
  critical: "bg-red-50 text-red-700 border-red-200",
};

// ── Ingest payload — what the client error boundary POSTs ────────────
// The boundary auto-POSTs this (no submit button). Kept deliberately
// small — message + stack + route + a tiny meta bag. The server adds
// fingerprint / severity / actor context. Stack is capped so a hostile
// or runaway client cannot store an unbounded blob.
export const incidentIngestSchema = z.object({
  /** The error message. */
  message:  z.string().trim().min(1, "message required").max(4000),
  /** The error kind — client boundaries only ever send 'js_error'. */
  kind:     z.enum(INCIDENT_KINDS).default("js_error"),
  /** The path the error happened on (e.g. /wallet/deposit). */
  route:    z.string().trim().max(512).optional().or(z.literal("")),
  /** The stack trace — capped; PII-stripped server-side again before insert. */
  stack:    z.string().trim().max(8000).optional().or(z.literal("")),
  /** Which surface — defaults to 'portal' (most client errors are signed-in). */
  source:   z.enum(INCIDENT_SOURCES).optional(),
  /** Small bag — browser/OS, component name. No PII. */
  meta:     z.record(z.string(), z.unknown()).optional(),
});
export type IncidentIngestInput = z.infer<typeof incidentIngestSchema>;

// ── Triage action schemas (actions/admin/incidents.ts) ───────────────

/** Acknowledge an incident (open → acknowledged, assigns self). */
export const acknowledgeIncidentSchema = z.object({
  id: z.string().uuid(),
});
export type AcknowledgeIncidentInput = z.infer<typeof acknowledgeIncidentSchema>;

/** Mark an acknowledged incident as actively being worked. */
export const markInProgressSchema = z.object({
  id: z.string().uuid(),
});
export type MarkInProgressInput = z.infer<typeof markInProgressSchema>;

/** Resolve an incident — a resolution note is required (the DB CHECK). */
export const resolveIncidentSchema = z.object({
  id:   z.string().uuid(),
  note: z.string().trim().min(1, "ต้องระบุสิ่งที่แก้ไข").max(2000),
});
export type ResolveIncidentInput = z.infer<typeof resolveIncidentSchema>;

/** Ignore an incident — not a real bug. An optional reason note. */
export const ignoreIncidentSchema = z.object({
  id:   z.string().uuid(),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type IgnoreIncidentInput = z.infer<typeof ignoreIncidentSchema>;

/** Assign / reassign an incident to an admin. */
export const assignIncidentSchema = z.object({
  id:       z.string().uuid(),
  /** A profiles.id (an admin) — empty string unassigns is NOT allowed once triaged. */
  assignee: z.string().uuid(),
});
export type AssignIncidentInput = z.infer<typeof assignIncidentSchema>;

/** Spawn a fix work_item from a triaged incident (the §2.7 bridge). */
export const spawnFixWorkItemSchema = z.object({
  id: z.string().uuid(),
});
export type SpawnFixWorkItemInput = z.infer<typeof spawnFixWorkItemSchema>;

// ── Helpers ──────────────────────────────────────────────────────────

/** True when an incident is still live (on the triage queue). */
export function isIncidentLive(status: IncidentStatus): boolean {
  return (LIVE_INCIDENT_STATUSES as readonly string[]).includes(status);
}

// ── Auto-close (detector-cron lifecycle) ─────────────────────────────
/**
 * Prefix stamped on the `resolution_note` of an incident closed
 * AUTOMATICALLY by the detector cron that opened it (the condition it
 * reported went green again) — never by a human.
 *
 * WHY the closed status is 'ignored' and not 'resolved': the 0077 CHECK
 * `platform_incidents_triaged_consistent` requires `acknowledged_at` +
 * `assigned_to` (a profiles FK) on a 'resolved' row. A cron has no human
 * identity, and stamping a real admin as the assignee would fabricate
 * attribution in an audited table. 'ignored' is the only terminal status
 * the CHECK permits with no assignee — both terminal statuses are
 * excluded from LIVE_INCIDENT_STATUSES and from the
 * platform_incidents_fingerprint_live_idx partial-unique index, so a
 * re-violation still opens a FRESH incident. This prefix exists so the
 * triage UI can label the row honestly ("ปิดอัตโนมัติ — ระบบเขียวแล้ว")
 * instead of the human wording "ปิด (ไม่ใช่บั๊ก)".
 */
export const AUTO_RESOLVED_NOTE_PREFIX = "ปิดอัตโนมัติ:";

/** True when this resolution note was written by an auto-close (not a human). */
export function isAutoResolvedNote(note: string | null | undefined): boolean {
  return typeof note === "string" && note.trimStart().startsWith(AUTO_RESOLVED_NOTE_PREFIX);
}

/**
 * Build the Thai resolution note for an auto-close. `detail` says WHICH
 * detector went green (e.g. the data-health check id) — the prefix makes
 * it machine-detectable, the timestamp makes it auditable.
 */
export function buildAutoResolvedNote(detail: string, at: Date = new Date()): string {
  const when = at.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  return `${AUTO_RESOLVED_NOTE_PREFIX} ${detail} เมื่อ ${when} (ระบบตรวจซ้ำแล้วไม่พบปัญหา — ปิดโดยอัตโนมัติ ไม่ใช่คนกดปิด)`.slice(0, 2000);
}

/** True when a new incident at this severity should fire the dev-alert. */
export function shouldAlert(severity: IncidentSeverity): boolean {
  return (ALERTING_SEVERITIES as readonly string[]).includes(severity);
}
