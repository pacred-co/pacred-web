import { createAdminClient } from "@/lib/supabase/admin";
import { instrumentCron } from "@/lib/cron/instrument";
import { captureIncident, autoResolveIncident } from "@/lib/observability/incident-store";
import { runDataHealthChecks, type HealthCheckResult } from "@/lib/admin/data-health/checks";

export const dynamic = "force-dynamic";

/** The detector identity — shared by the capture AND the auto-close. */
const INCIDENT_ROUTE = "/api/cron/data-health";

/**
 * The incident message for a data-health check. Deliberately STABLE per
 * check-id (no counts / samples inline) so computeFingerprint collapses
 * hourly re-runs into ONE live incident.
 *
 * ⚠️ ONE builder, used by BOTH the capture (red check) and the auto-close
 * (green check) below. The fingerprint is a hash of this string — a second
 * hand-written copy that drifted by one character would silently never
 * match the row it is meant to close, and the queue would never empty
 * (exactly the lifecycle bug this file now fixes).
 */
function incidentMessageFor(r: Pick<HealthCheckResult, "id" | "title">): string {
  return `Data-health invariant violated: ${r.id} — ${r.title}. READ-ONLY scan; drill down at /admin/data-health.`;
}

/**
 * GET /api/cron/data-health — hourly production data-invariant scan.
 *
 * Owner 2026-07-18: "ระบบควรจะ on green สม่ำเสมอ · ห้ามแสดงผลข้อมูลมั่ว · ลูกค้าจริง
 * ไม่ใช่หนูลองยา". Every check encodes an invariant a REAL past incident violated
 * (double-count residues · dup trackings · dangling staging ptrs · double-bills ·
 * ฿0 bills · unsettled credit · garbage cost · stuck statuses — the full
 * retrospective: docs/wip/plan-2026-07-18-data-health-invariants.md). This cron is
 * the layer that finds a violation BEFORE a customer does — especially load-bearing
 * with MOMO_CRON_AUTOCOMMIT=true writing billable rows unattended every 5 minutes.
 *
 * 100% READ-ONLY (lib/admin/data-health/checks.ts — no write path exists there).
 *
 * Alerting mirrors wallet-reconcile: ONE deduped incident per FAILING RED check
 * (STABLE message per check-id → computeFingerprint collapses hourly re-runs into
 * one live incident whose occurrence_count climbs; varying counts/samples live in
 * surface_meta + the structured console.error). Clean run → no error, no incident.
 * The live drill-down UI is /admin/data-health (runs the same checks on demand).
 */
export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/data-health",
    request,
    handler: async () => {
      const admin = createAdminClient();
      const report = await runDataHealthChecks(admin);

      const failingRed = report.results.filter((r) => r.severity === "red" && !r.ok);
      const failingWarn = report.results.filter((r) => r.severity === "warn" && !r.ok);

      if (failingRed.length > 0 || failingWarn.length > 0) {
        console.error("[cron.data-health] DATA INVARIANT VIOLATIONS", {
          red: failingRed.map((r) => ({ id: r.id, count: r.count, error: r.error ?? null })),
          warn: failingWarn.map((r) => ({ id: r.id, count: r.count, error: r.error ?? null })),
        });
      }

      for (const r of failingRed) {
        // STABLE message per check-id (no counts inline) → hourly re-runs dedupe
        // into ONE live incident; the moving numbers go to surface_meta.
        await captureIncident({
          source: "server",
          kind: "server_error",
          severity: "high",
          route: INCIDENT_ROUTE,
          message: incidentMessageFor(r),
          surfaceMeta: { checkId: r.id, count: r.count, sample: r.sample, error: r.error ?? null },
        });
      }

      // ── Auto-close the checks that went GREEN again ────────────────────
      // The other half of the incident lifecycle. Without this an incident
      // opened by a failing check stayed 'open' forever even after the data
      // was fixed, so the triage queue never emptied and staff could not
      // tell a real work item from stale noise.
      //
      // GREEN = r.ok === true, which runDataHealthChecks sets ONLY on
      // `count === 0` with no thrown error (a check that ERRORS reports
      // ok:false) — so a check we could not evaluate is never mistaken for
      // "clean" and never auto-closes its incident.
      //
      // Every green check is attempted regardless of severity (not just
      // red): if a check is ever downgraded red → warn, its old incident
      // would otherwise be orphaned open forever. A check with no live
      // incident is a cheap no-op lookup.
      const green = report.results.filter((r) => r.ok);
      const autoClosed: string[] = [];
      for (const r of green) {
        const res = await autoResolveIncident({
          source:  "server",
          kind:    "server_error",
          route:   INCIDENT_ROUTE,
          message: incidentMessageFor(r),   // ← same builder as the capture
          detail:  `data-health เขียวแล้ว (${r.id})`,
        });
        if (res.closed) autoClosed.push(r.id);
      }
      if (autoClosed.length > 0) {
        console.log("[cron.data-health] auto-closed incidents for healed checks", { autoClosed });
      }

      return {
        status: report.green ? "success" : "partial",
        ...(report.green ? {} : { error: `red=${report.redCount} warn=${report.warnCount}` }),
        summary: {
          green: report.green,
          red: report.redCount,
          warn: report.warnCount,
          info: report.infoCount,
          autoClosed: autoClosed.length,
        },
        payload: {
          ok: true,
          green: report.green,
          red: failingRed.map((r) => ({ id: r.id, count: r.count })),
          warn: failingWarn.map((r) => ({ id: r.id, count: r.count })),
          autoClosed,
        },
      };
    },
  });
}
