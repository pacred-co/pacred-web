import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { instrumentCron } from "@/lib/cron/instrument";

/**
 * GET /api/cron/expire-driver-assignments
 *
 * P0-22 — RETARGETED to legacy `tb_forwarder_driver` (2026-05-30 night).
 *
 * Sweeps tb_forwarder_driver rows where fdstatus='1' (assigned · driver has
 * been called) and the assignment deadline (`endtime`) has passed → flip to
 * fdstatus='3' (expired). The driver lost the chance to pick up — admin can
 * re-assign. Cascades into tb_forwarder_driver_item where fdistatus='' →
 * fdistatus='3'.
 *
 * The prior implementation wrote `forwarder_driver` (rebuilt, empty in prod).
 *
 * Legacy 1:1 port of pcs-admin/forwarder-driver.php L4-17 (the deadline path):
 *   SELECT ID FROM tb_forwarder_driver WHERE endTime<'$date' AND fdStatus=1;
 *   UPDATE tb_forwarder_driver SET fdStatus='3' WHERE ID IN ('$ids');
 *   UPDATE tb_forwarder_driver_item SET fdiStatus='3'
 *     WHERE fdiStatus='' AND fdID IN ('$ids');
 *
 * NOTE on the threshold:
 *   - Legacy forwarder-driver.php (entry-page sweep, runs on admin page load)
 *     uses `endTime<NOW()` — the per-row deadline that admin chose when calling
 *     the driver (legacy uses the form input "$endTime hour" to compute endTime,
 *     typically 17/24/30 hours per dispatch).
 *   - Legacy api/autorun/check-apprentice/index.php L26-43 uses the simpler
 *     `fdDate<NOW()-17h` constant-threshold fallback.
 *   - We use `endtime<now()` because it's the canonical per-row deadline and
 *     it's the path forwarder-driver.php L4-17 takes (the task spec cited it).
 *
 * Schema citations (supabase/migrations/0081_pcs_legacy_schema.sql):
 *   - tb_forwarder_driver.id        L1977 (bigint NOT NULL)
 *   - tb_forwarder_driver.fddate    L1978 (timestamp without time zone)
 *   - tb_forwarder_driver.fdstatus  L1983 (varchar(1) NOT NULL)
 *   - tb_forwarder_driver.endtime   L1984 (timestamp without time zone)
 *   - tb_forwarder_driver_item.fdid       L2013 (bigint NOT NULL)
 *   - tb_forwarder_driver_item.fdistatus  L2015 (varchar(1) NOT NULL)
 *
 * Schedule: "0 * * * *" = every hour.
 *
 * Legacy PHP: C:\xampp\htdocs\pcscargo\member\pcs-admin\forwarder-driver.php L1-20
 *
 * U4-1: wrapped in instrumentCron — response shape preserved.
 */
export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/expire-driver-assignments",
    request,
    handler: async () => {
      const supabase = createAdminClient();
      const nowIso   = new Date().toISOString();

      console.log("[cron.expire-driver-assignments] start", { nowIso });

      // Step 1 — flip stale parent assignments to fdstatus='3'.
      const { data: expired, error: updErr } = await supabase
        .from("tb_forwarder_driver")
        .update({ fdstatus: "3" })
        .eq("fdstatus", "1")
        .lt("endtime", nowIso)
        .select("id");

      if (updErr) {
        console.error("[cron.expire-driver-assignments] parent update err", updErr.message);
        return {
          status:     "failure" as const,
          error:      updErr.message,
          payload:    { ok: false, stage: "tb_forwarder_driver_update", error: updErr.message },
          httpStatus: 500,
        };
      }

      const expiredIds   = (expired ?? []).map((r) => r.id).filter((v): v is number => typeof v === "number");
      const expiredCount = expiredIds.length;

      // Step 2 — cascade into items (only the rows that haven't already been
      // marked on/off-loaded). Legacy guards `fdiStatus=''` (empty string) so
      // we mirror that filter; passing the same empty-string predicate to
      // PostgREST as .eq("fdistatus", "").
      let cascadeCount = 0;
      if (expiredIds.length > 0) {
        const { data: cascaded, error: itemErr } = await supabase
          .from("tb_forwarder_driver_item")
          .update({ fdistatus: "3" })
          .in("fdid", expiredIds)
          .eq("fdistatus", "")
          .select("id");

        if (itemErr) {
          console.error(
            "[cron.expire-driver-assignments] cascade err",
            itemErr.message,
          );
          return {
            status:     "failure" as const,
            error:      itemErr.message,
            payload:    {
              ok:    false,
              stage: "tb_forwarder_driver_item_update",
              error: itemErr.message,
              parent_expired: expiredCount,
            },
            httpStatus: 500,
          };
        }

        cascadeCount = (cascaded ?? []).length;
      }

      console.log(
        `[cron.expire-driver-assignments] done — parent=${expiredCount} cascade_items=${cascadeCount}`,
      );

      if (expiredCount > 0) {
        logger.info(
          "cron.expire-driver-assignments",
          "expired stale assignments",
          {
            nowIso,
            expiredCount,
            cascadeCount,
            expiredIds,
          },
        );
      }

      return {
        status:  "success" as const,
        summary: { cutoff: nowIso, expired: expiredCount, cascaded: cascadeCount },
        payload: {
          ok:       true,
          cutoff:   nowIso,
          expired:  expiredCount,
          cascaded: cascadeCount,
        },
      };
    },
  });
}
