import { createAdminClient } from "@/lib/supabase/admin";
import { notifyStaffGroup } from "@/lib/notifications/staff-group";
import { logger } from "@/lib/logger";
import { instrumentCron } from "@/lib/cron/instrument";
import {
  buildContainerBulletin,
  formatBulletinMessage,
} from "@/lib/warehouse/container-bulletin";

/**
 * GET /api/cron/container-bulletin
 *
 * Daily container bulletin (Phase-B closeout · 2026-06-09) — the faithful
 * re-build of the U2-1 "daily bulletin generator" that was TOMBSTONED in D1
 * Wave 3 (it had been built on the retired warehouse "spine" tables). The
 * tombstone at `app/[locale]/(admin)/admin/warehouse/bulletin/page.tsx`
 * specified the faithful path: read `tb_forwarder GROUP BY fCabinetNumber`.
 *
 * Each morning this groups every in-flight forwarder (fstatus < 7) by cabinet,
 * rolls up a per-cabinet summary (count · status breakdown · volume/weight ·
 * arrival date · ready-to-ship flag), formats a concise Thai message, and
 * pushes it to the internal staff LINE group via `notifyStaffGroup`.
 *
 * READ-ONLY on tb_forwarder. No money path. Best-effort send: if the LINE
 * env / group id isn't configured, `notifyStaffGroup` logs + no-ops (returns
 * false) and this cron still returns success with `sent:false` — it never
 * crashes. Logic + formatting live in `lib/warehouse/container-bulletin.ts`.
 *
 * Schedule: "0 0 * * *" (00:00 UTC = 07:00 ICT — start of the warehouse day).
 *
 * Wrapped in instrumentCron — response shape: { ok, dateIct, totalCabinets,
 * totalParcels, arrived, ready, sent, messageLength }.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/container-bulletin",
    request,
    handler: async () => {
      const admin = createAdminClient();

      const bulletin = await buildContainerBulletin(admin);
      const message = formatBulletinMessage(bulletin);

      // Best-effort staff push — notifyStaffGroup never throws and returns
      // false when LINE isn't configured (dev / not-yet-activated). We still
      // report success so the cron-health log shows a clean run.
      const sent = await notifyStaffGroup(message, {
        title: `บุลเลตินตู้ประจำวัน ${bulletin.dateIct}`,
        url: "/admin/report-cnt",
        urlLabel: "เปิดรายงานตู้",
      });

      logger.info("cron.container-bulletin", "bulletin built", {
        dateIct: bulletin.dateIct,
        total_cabinets: bulletin.totalCabinets,
        total_parcels: bulletin.totalParcels,
        arrived: bulletin.arrived.length,
        ready: bulletin.ready.length,
        sent,
      });
      console.log(
        `[cron.container-bulletin] done — date=${bulletin.dateIct} cabinets=${bulletin.totalCabinets} parcels=${bulletin.totalParcels} arrived=${bulletin.arrived.length} ready=${bulletin.ready.length} sent=${sent}`,
      );

      return {
        status: "success" as const,
        summary: {
          dateIct: bulletin.dateIct,
          total_cabinets: bulletin.totalCabinets,
          total_parcels: bulletin.totalParcels,
          arrived: bulletin.arrived.length,
          ready: bulletin.ready.length,
          sent,
        },
        payload: {
          ok: true,
          dateIct: bulletin.dateIct,
          totalCabinets: bulletin.totalCabinets,
          totalParcels: bulletin.totalParcels,
          arrived: bulletin.arrived.length,
          ready: bulletin.ready.length,
          sent,
          messageLength: message.length,
        },
      };
    },
  });
}
