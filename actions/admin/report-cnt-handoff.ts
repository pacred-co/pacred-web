"use server";

/**
 * warehouse → accounting handoff — พี่ป๊อป spec (2026-07-06 · TASK #4).
 *
 * The owner's "แจ้งส่งต่องานบัญชี (ยิงครบแล้ว)" button on the container /
 * report-cnt view. After the warehouse team has scanned every box into a
 * container (ยิงครบ), the warehouse head presses this to hand the container
 * off to accounting for ตรวจตู้ → วางบิล.
 *
 * ⚠️ STATUS-ONLY. This action deliberately:
 *   - does NOT flip `tb_forwarder.fstatus` (accounting drives 4→5 via วางบิล)
 *   - does NOT touch any money field (cost / price / profit / wallet / bill)
 *   - only NOTIFIES accounting (+ super/ultra) + writes an audit-log row.
 *
 * There is no dedicated `warehouse_submitted_at` column and the spec says
 * NOT to add a migration for it in this task — so the handoff is expressed
 * purely as a notification + audit entry. The moment a column lands, this
 * action is the single seam to also stamp it.
 *
 * Auth — warehouse / ops / super (the roles that reach the report-cnt
 * container view and physically run the คลัง). Best-effort notify: a failed
 * ping never fails the handoff (the audit row is the durable record).
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { notifyStaffGroup } from "@/lib/notifications/staff-group";
import { logger } from "@/lib/logger";

const SCOPE = "report-cnt-handoff";

const HandoffSchema = z.object({
  fcabinetnumber: z.string().trim().min(1, "ต้องระบุเลขตู้"),
});

export async function submitWarehouseAccountingHandoff(
  input: unknown,
): Promise<AdminActionResult> {
  const parsed = HandoffSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const { fcabinetnumber } = parsed.data;

  return withAdmin(["super", "ops", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Sanity: the cabinet must exist (a forwarder row carries it). Also gives
    // us the container's warehouse for the message context. No money read.
    const { data: firstRow, error: cabErr } = await admin
      .from("tb_forwarder")
      .select("id, fwarehousename")
      .eq("fcabinetnumber", fcabinetnumber)
      .limit(1)
      .maybeSingle<{ id: number; fwarehousename: string | null }>();
    if (cabErr) {
      logger.error(SCOPE, "cabinet lookup failed", cabErr, { fcabinetnumber });
      return { ok: false, error: "ตรวจสอบเลขตู้ไม่สำเร็จ" };
    }
    if (!firstRow) {
      return { ok: false, error: `ไม่พบตู้ ${fcabinetnumber}` };
    }

    const link = `/admin/report-cnt/${encodeURIComponent(fcabinetnumber)}`;
    const title = "คลังส่งต่องานบัญชี (ยิงครบแล้ว)";
    const body = `ตู้ ${fcabinetnumber} — คลังยิงรับครบแล้ว ส่งต่อให้บัญชีตรวจตู้ + วางบิล`;

    // Fan-out in-app notifications to accounting + the god roles that watch
    // the money loop (best-effort — the audit row is the durable record).
    try {
      const { data: targetAdmins, error: adminsErr } = await admin
        .from("admins")
        .select("profile_id")
        .in("role", ["accounting", "super", "ultra"])
        .eq("is_active", true);
      if (adminsErr) {
        logger.error(SCOPE, "accounting admins lookup failed", adminsErr, {});
      }
      const seen = new Set<string>();
      for (const row of targetAdmins ?? []) {
        const pid = (row as { profile_id: string }).profile_id;
        if (!pid || seen.has(pid)) continue;
        seen.add(pid);
        await sendNotification(pid, {
          category: "forwarder",
          severity: "info",
          title,
          body,
          link_href: link,
          reference_type: "forwarder",
          reference_id: fcabinetnumber,
        });
      }
    } catch (e) {
      // Never fail the handoff on a notify error.
      logger.error(SCOPE, "in-app notify fan-out failed", e, { fcabinetnumber });
    }

    // Also ping the staff LINE group (env-gated no-op until the group id lands).
    try {
      await notifyStaffGroup(`📦 ${body}`, { url: link, urlLabel: "เปิดดูตู้", title });
    } catch {
      /* best-effort */
    }

    // Durable audit trail — WHO handed off WHICH cabinet WHEN.
    await logAdminAction(adminId, "warehouse_accounting_handoff", "container", fcabinetnumber, {
      fwarehousename: firstRow.fwarehousename ?? null,
    });

    return { ok: true };
  });
}
