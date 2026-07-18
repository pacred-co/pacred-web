import { createAdminClient } from "@/lib/supabase/admin";
import { instrumentCron } from "@/lib/cron/instrument";
import { captureIncident } from "@/lib/observability/incident-store";
import { runDataHealthChecks } from "@/lib/admin/data-health/checks";

export const dynamic = "force-dynamic";

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
          route: "/api/cron/data-health",
          message: `Data-health invariant violated: ${r.id} — ${r.title}. READ-ONLY scan; drill down at /admin/data-health.`,
          surfaceMeta: { checkId: r.id, count: r.count, sample: r.sample, error: r.error ?? null },
        });
      }

      return {
        status: report.green ? "success" : "partial",
        ...(report.green ? {} : { error: `red=${report.redCount} warn=${report.warnCount}` }),
        summary: {
          green: report.green,
          red: report.redCount,
          warn: report.warnCount,
          info: report.infoCount,
        },
        payload: {
          ok: true,
          green: report.green,
          red: failingRed.map((r) => ({ id: r.id, count: r.count })),
          warn: failingWarn.map((r) => ({ id: r.id, count: r.count })),
        },
      };
    },
  });
}
