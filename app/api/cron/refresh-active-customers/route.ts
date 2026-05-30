import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { instrumentCron } from "@/lib/cron/instrument";

/**
 * GET /api/cron/refresh-active-customers
 *
 * P0-22 — RETARGETED to legacy `tb_*` tables (2026-05-30 night).
 *
 * Legacy 1:1 port of pcs-admin/api/autorun/update-active-customers/index.php
 * (8,898 real customers live in tb_users · the rebuilt `profiles` is empty,
 * so the prior implementation was a silent dead-write).
 *
 * Activity streams (verbatim from legacy SQL):
 *   1) tb_header_order WHERE hstatus>2 AND hstatus<>6
 *      (status 3=ordered, 4=awaiting-CN, 5=success — excludes 1/2 pending + 6 cancelled)
 *   2) tb_forwarder    WHERE fstatus>5
 *      (the moment goods reach the CN warehouse / leave / arrive Thailand)
 *   3) tb_payment      WHERE paystatus=2
 *      (yuan transfer approved)
 * Update:
 *   tb_users.useractive = '1' for every userID matched (idempotent — flipping
 *   '1'→'1' is a no-op; never demotes).
 *
 * Schema citations (supabase/migrations/0081_pcs_legacy_schema.sql):
 *   - tb_users.useractive    L5866 (varchar(1) NOT NULL · COMMENT L6016 "1=ใช้งานแล้ว")
 *   - tb_users.userid        L5830 (varchar(10) NOT NULL · COMMENT L5876 "รหัสสมาชิก")
 *   - tb_header_order.hstatus L2508 (COMMENT L2568 "1=รอดำเนินการ 2=รอชำระเงิน 3=สั่งสินค้า 4=รอร้านจีนจัดส่ง 5=สำเร็จ 6=ยกเลิก")
 *   - tb_header_order.userid L2551
 *   - tb_forwarder.fstatus   L1601
 *   - tb_forwarder.userid    L1684
 *   - tb_payment.paystatus   L3615
 *   - tb_payment.userid      L3625
 *
 * Legacy PHP: C:\xampp\htdocs\pcscargo\member\pcs-admin\api\autorun\update-active-customers\index.php L12-47
 *
 * U4-1: wrapped in instrumentCron — response shape preserved.
 */
export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/refresh-active-customers",
    request,
    handler: async () => {
      const supabase = createAdminClient();
      const userIds = new Set<string>();

      console.log("[cron.refresh-active-customers] start");

      // Stream 1 — service-order activity (legacy: hStatus>2 AND hStatus<>6)
      // hstatus is varchar(1), so quote the literals.
      const { data: orderRows, error: orderErr } = await supabase
        .from("tb_header_order")
        .select("userid")
        .in("hstatus", ["3", "4", "5"]);

      if (orderErr) {
        console.error("[cron.refresh-active-customers] tb_header_order err", orderErr.message);
        return {
          status:     "failure" as const,
          error:      orderErr.message,
          payload:    { ok: false, stage: "tb_header_order", error: orderErr.message },
          httpStatus: 500,
        };
      }
      for (const row of orderRows ?? []) {
        if (row.userid && typeof row.userid === "string") userIds.add(row.userid);
      }

      // Stream 2 — forwarder activity (legacy: fStatus>5 → '6','7','8','9')
      // tb_forwarder.fstatus is varchar(2) so we cover 2-digit values too.
      // Per legacy, the canonical fstatus alphabet is single-digit; we just
      // enumerate the >5 set to keep the indexed IN-list selective.
      const { data: fwdRows, error: fwdErr } = await supabase
        .from("tb_forwarder")
        .select("userid")
        .in("fstatus", ["6", "7", "8", "9"]);

      if (fwdErr) {
        console.error("[cron.refresh-active-customers] tb_forwarder err", fwdErr.message);
        return {
          status:     "failure" as const,
          error:      fwdErr.message,
          payload:    { ok: false, stage: "tb_forwarder", error: fwdErr.message },
          httpStatus: 500,
        };
      }
      for (const row of fwdRows ?? []) {
        if (row.userid && typeof row.userid === "string") userIds.add(row.userid);
      }

      // Stream 3 — yuan transfer payments approved (legacy: payStatus=2)
      const { data: payRows, error: payErr } = await supabase
        .from("tb_payment")
        .select("userid")
        .eq("paystatus", "2");

      if (payErr) {
        console.error("[cron.refresh-active-customers] tb_payment err", payErr.message);
        return {
          status:     "failure" as const,
          error:      payErr.message,
          payload:    { ok: false, stage: "tb_payment", error: payErr.message },
          httpStatus: 500,
        };
      }
      for (const row of payRows ?? []) {
        if (row.userid && typeof row.userid === "string") userIds.add(row.userid);
      }

      if (userIds.size === 0) {
        console.log("[cron.refresh-active-customers] done — 0 scanned, 0 flipped");
        return {
          status:  "success" as const,
          summary: { scanned: 0, flipped: 0 },
          payload: { ok: true, scanned: 0, flipped: 0 },
        };
      }

      // Flip only inactive rows (useractive <> '1') → keeps audit clean +
      // mirrors the legacy idempotent behaviour. PostgREST IN expects an array.
      const { data: flipped, error: updErr } = await supabase
        .from("tb_users")
        .update({ useractive: "1" })
        .in("userid", [...userIds])
        .neq("useractive", "1")
        .select("userid");

      if (updErr) {
        console.error("[cron.refresh-active-customers] update err", updErr.message);
        return {
          status:     "failure" as const,
          error:      updErr.message,
          payload:    { ok: false, stage: "tb_users_update", error: updErr.message },
          httpStatus: 500,
        };
      }

      const flippedCount = (flipped ?? []).length;
      console.log(
        `[cron.refresh-active-customers] done — scanned=${userIds.size} flipped=${flippedCount}`,
      );
      logger.info("cron.refresh-active-customers", "swept", {
        scanned: userIds.size,
        flipped: flippedCount,
      });

      return {
        status:  "success" as const,
        summary: { scanned: userIds.size, flipped: flippedCount },
        payload: {
          ok:      true,
          scanned: userIds.size,
          flipped: flippedCount,
        },
      };
    },
  });
}
