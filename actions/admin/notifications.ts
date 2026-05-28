"use server";

/**
 * Sprint-11 P2.3.B — Admin notification dispatch retry.
 *
 * Companion to /admin/notifications/dispatch — lets super/ops retry a
 * notification that failed delivery (LINE Notify push, email, etc).
 *
 * Retry strategy: we DON'T re-push synchronously here — that would
 * couple the admin UI to upstream LINE/email latency and a flaky push
 * could time out the admin action. Instead we RESET the row to a state
 * the existing dispatcher crons will pick up on their next tick:
 *
 *   - delivered_line_notify_at  → null   (puts row back in cron scan)
 *   - delivery_attempts         → 0      (resets the giveup counter
 *                                          gated by MAX_FAILED_ATTEMPTS=5)
 *   - last_delivery_error       → null   (clear stale error)
 *   - delivery_status           → "pending"
 *
 * ⚠️ 2026-05-26 — /api/cron/dispatch-line-notify was REMOVED with the
 * dead LINE Notify stack. Retry currently just resets the row; the
 * Messaging-API dispatcher (via lib/notifications/index.ts) lands
 * with task L.
 *
 * RBAC: super + ops.
 * Audit: each retry writes admin_audit_log (action=notification.retry).
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const ROLES = ["super", "ops"] as const;

/**
 * Reset a single notification row so the cron picks it up on next tick.
 * Returns `not_found` if the row doesn't exist or wasn't a failed row
 * (we intentionally refuse to retry already-delivered rows to avoid
 * double-pushing — the caller can still see them in the page list, but
 * the retry button is hidden for those).
 */
export async function retryNotificationDispatch(
  notificationId: string,
): Promise<AdminActionResult<{ id: string }>> {
  if (!notificationId || typeof notificationId !== "string") {
    return { ok: false, error: "invalid_id" };
  }

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Fetch the current state so we know what we're resetting.
    const { data: row, error: fetchErr } = await admin
      .from("notifications")
      .select("id, profile_id, category, delivery_status, delivery_attempts, delivered_line_notify_at, delivered_line_at, delivered_email_at, last_delivery_error")
      .eq("id", notificationId)
      .maybeSingle<{
        id: string;
        profile_id: string;
        category: string;
        delivery_status: string | null;
        delivery_attempts: number | null;
        delivered_line_notify_at: string | null;
        delivered_line_at: string | null;
        delivered_email_at: string | null;
        last_delivery_error: string | null;
      }>();
    if (fetchErr) return { ok: false, error: fetchErr.message };
    if (!row)     return { ok: false, error: "not_found" };

    // Refuse to retry a row that already delivered successfully via any
    // channel. Operators can still see it on the dispatch page; this
    // guard prevents accidental double-pushes.
    const alreadyOk =
      row.delivery_status === "delivered" ||
      row.delivery_status === "read";
    if (alreadyOk) {
      return { ok: false, error: "already_delivered" };
    }

    // Reset to a state a future dispatcher will pick up. (The LINE-Notify
    // cron scanning `delivered_line_notify_at IS NULL AND
    // delivery_attempts < MAX` was removed 2026-05-26 — task L brings
    // a Messaging-API dispatcher back into the same loop without
    // changing the schema.)
    const { error: updErr } = await admin
      .from("notifications")
      .update({
        delivery_status:           "pending",
        delivery_attempts:         0,
        delivered_line_notify_at:  null,
        last_delivery_error:       null,
        delivery_error:            null,
      })
      .eq("id", row.id);
    if (updErr) return { ok: false, error: updErr.message };

    void logAdminAction(adminId, "notification.retry", "notification", row.id, {
      profile_id: row.profile_id,
      category:   row.category,
      previous_status:   row.delivery_status,
      previous_attempts: row.delivery_attempts,
      previous_error:    row.last_delivery_error,
    });

    revalidatePath("/admin/notifications/dispatch");
    revalidatePath("/admin/system/notifications");

    return { ok: true, data: { id: row.id } };
  });
}
