/**
 * GET /api/cron/momo-sync — Sprint-11 P2.1 wiring.
 *
 * Daily cron that pulls MOMO JMF container + shipment updates into the
 * Pacred cargo spine (cargo_containers / cargo_shipments /
 * cargo_shipment_tracking / cargo_container_status_history) via
 * `syncContainersFromMomo`.
 *
 * Suggested schedule: `30 18 * * *` (18:30 UTC = 01:30 ICT). Offset from
 * cargothai-sync (02:30 ICT) so the two partner syncs never compete for
 * the same lambda warm slot.
 *
 * Auth: instrumentCron handles the CRON_SECRET / x-vercel-cron header
 * check — same pattern as the other crons.
 *
 * Window default: last 24 hours via `since` param. The MOMO listContainers
 * client accepts an optional `updated_since` so re-running yesterday
 * doesn't reprocess everything.
 *
 * Degrade pattern: when MOMO env (MOMO_JMF_TOKEN / MOMO_JMF_BASE_URL) is
 * unset, syncContainersFromMomo returns ok with reason='not_configured'
 * and counters at 0 — we report status='failure' so the admin UI shows
 * the "ขอ token จาก MOMO ops" banner.
 *
 * @see lib/integrations/momo-jmf/sync.ts
 * @see docs/integrations/momo-jmf-api-spec.md
 */
import { instrumentCron } from "@/lib/cron/instrument";
import { syncContainersFromMomo } from "@/lib/integrations/momo-jmf";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/momo-sync",
    request,
    handler: async () => {
      // Default window: last 24 hours.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const res = await syncContainersFromMomo(since);

      if (!res.ok) {
        logger.warn("momo-cron", "sync failed", { reason: res.reason, errors: res.errors });
        return {
          status:  "failure",
          summary: { reason: res.reason ?? "unknown", errorCount: res.errors.length },
          payload: { ok: false, error: `momo_sync: ${res.reason ?? "unknown"}` },
        };
      }

      // Token unset → ok=true with reason='not_configured'. Surface as
      // failure so the cron-invocations log shows it (matches cargothai).
      if (res.reason === "not_configured") {
        return {
          status:  "failure",
          summary: { reason: "not_configured" },
          payload: { ok: false, error: "MOMO_JMF_TOKEN / MOMO_JMF_BASE_URL not set" },
        };
      }

      return {
        status:  res.errors.length > 0 ? "partial" : "success",
        summary: {
          since:               since.toISOString(),
          fetched:             res.fetched,
          upserted:            res.upserted,
          skipped:             res.skipped,
          shipments_upserted:  res.shipments_upserted,
          tracking_appended:   res.tracking_appended,
          status_transitions:  res.status_transitions,
          errorCount:          res.errors.length,
        },
        payload: {
          ok:                  true,
          since:               since.toISOString(),
          fetched:             res.fetched,
          upserted:            res.upserted,
          skipped:             res.skipped,
          shipments_upserted:  res.shipments_upserted,
          tracking_appended:   res.tracking_appended,
          status_transitions:  res.status_transitions,
          errors:              res.errors,
        },
      };
    },
  });
}
