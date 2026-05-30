import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { instrumentCron } from "@/lib/cron/instrument";

/**
 * GET /api/cron/expire-probation
 *
 * P0-22 — RETARGETED to legacy `tb_admin` (2026-05-30 night).
 *
 * Daily sweep of legacy PCS admin rows whose contract end-date (`enddate`)
 * has passed → flip `adminstatusa` from '1' (active) to '0' (suspended) so
 * the admin loses access. Skips permanent staff (`admintype='1'` = พนักงานประจำ).
 *
 * The prior implementation read/wrote `admin_contact_extras` (the rebuilt
 * sidecar, 0 rows in prod per migration 0110 docblock). The real 13 admins
 * still live in `tb_admin` until ภูม finishes the Wave 22 manual recreate.
 *
 * Legacy 1:1 port of pcs-admin/api/autorun/check-apprentice/index.php L13-21:
 *   SELECT endDate, adminID FROM tb_admin
 *     WHERE adminStatusA<>'0'
 *       AND endDate<'$now'
 *       AND endDate<>'0000-00-00 00:00'
 *       AND adminType<>'1';
 *   UPDATE tb_admin
 *     SET adminStatusA='0', adminDel='ลบโดยระบบ', dateDel='$now'
 *     WHERE adminID='...';
 *
 * Schema citations (supabase/migrations/0081_pcs_legacy_schema.sql):
 *   - tb_admin.adminstatusa L614 (varchar(1) DEFAULT '1' · COMMENT L664 "1=ใช้งาน,0=ไม่ใช้งาน")
 *   - tb_admin.adminid      L613 (varchar(20) NOT NULL)
 *   - tb_admin.enddate      L634 (timestamp without time zone)
 *   - tb_admin.admintype    L629 (varchar(1) · COMMENT L685 "1=ประจำ,2=ทดลอง,3=ฝึก,4=สหกิจ,5=พาสเนอร์,6=ในบ้าน")
 *   - tb_admin.admindel     L636 (varchar(40) NOT NULL)
 *   - tb_admin.datedel      L637 (timestamp without time zone)
 *
 * Schedule: "0 2 * * *" = daily 02:00 UTC = 09:00 ICT.
 *
 * Legacy PHP: C:\xampp\htdocs\pcscargo\member\pcs-admin\api\autorun\check-apprentice\index.php L11-24
 *
 * U4-1: wrapped in instrumentCron — response shape preserved.
 *
 * Idempotent: only flips rows where adminstatusa<>'0' AND enddate<now;
 * re-running on the same day matches zero rows (filter rejects already-'0').
 */
export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/expire-probation",
    request,
    handler: async () => {
      const supabase = createAdminClient();
      const nowIso   = new Date().toISOString();

      console.log("[cron.expire-probation] start", { nowIso });

      // Find candidates — past-due, not already suspended, not permanent staff.
      // Legacy "endDate<>'0000-00-00 00:00'" is implicit in PostgreSQL: NULL or
      // missing dates won't match enddate<nowIso, so .not("enddate","is",null)
      // handles the "endDate is set" check.
      const { data: expired, error: queryErr } = await supabase
        .from("tb_admin")
        .select("adminid, enddate, admintype, adminstatusa")
        .neq("adminstatusa", "0")
        .neq("admintype", "1")
        .not("enddate", "is", null)
        .lt("enddate", nowIso);

      if (queryErr) {
        console.error("[cron.expire-probation] query err", queryErr.message);
        return {
          status:     "failure" as const,
          error:      queryErr.message,
          payload:    { ok: false, stage: "query", error: queryErr.message },
          httpStatus: 500,
        };
      }

      if (!expired || expired.length === 0) {
        console.log("[cron.expire-probation] done — 0 scanned, 0 suspended");
        return {
          status:  "success" as const,
          summary: { scanned: 0, suspended: 0 },
          payload: { ok: true, scanned: 0, suspended: 0 },
        };
      }

      const adminIds = expired
        .map((r) => r.adminid)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      if (adminIds.length === 0) {
        console.log("[cron.expire-probation] done — 0 valid adminids");
        return {
          status:  "success" as const,
          summary: { scanned: expired.length, suspended: 0 },
          payload: { ok: true, scanned: expired.length, suspended: 0 },
        };
      }

      // Bulk-update; mirror legacy `UPDATE ... SET adminStatusA='0',
      // adminDel='ลบโดยระบบ', dateDel='$now'`. The .neq filter keeps the
      // operation idempotent across same-day reruns.
      const { data: suspendedRows, error: updErr } = await supabase
        .from("tb_admin")
        .update({
          adminstatusa: "0",
          admindel:     "ลบโดยระบบ",
          datedel:      nowIso,
        })
        .in("adminid", adminIds)
        .neq("adminstatusa", "0")
        .select("adminid");

      if (updErr) {
        console.error("[cron.expire-probation] update err", updErr.message);
        return {
          status:     "failure" as const,
          error:      updErr.message,
          payload:    { ok: false, stage: "update", error: updErr.message },
          httpStatus: 500,
        };
      }

      const suspendedCount = (suspendedRows ?? []).length;
      console.log(
        `[cron.expire-probation] done — scanned=${expired.length} suspended=${suspendedCount}`,
      );
      logger.info("cron.expire-probation", "suspended past-due admins", {
        scanned:        expired.length,
        suspended:      suspendedCount,
        suspendedIds:   (suspendedRows ?? []).map((r) => r.adminid),
        nowIso,
      });

      return {
        status:  "success" as const,
        summary: { scanned: expired.length, suspended: suspendedCount },
        payload: {
          ok:        true,
          scanned:   expired.length,
          suspended: suspendedCount,
        },
      };
    },
  });
}
