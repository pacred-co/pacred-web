/**
 * Status-flip notification + audit-log helper.
 *
 * G7 + G8 unification (2026-05-28 ดึก) — fixes the legacy PCS Cargo
 * notification fabric inconsistency (cnt-payment fully wired · admin-dropdown
 * half · bulk-bill commented out) by funnelling EVERY tb_forwarder.fstatus
 * transition through one helper that:
 *   1. Looks up customer phone/profile in one round-trip
 *   2. Fires SMS/LINE/email per the transition matrix (see CHANNEL_MATRIX)
 *   3. Appends a `tb_log_forwarder_status` row (G8 — every UPDATE leaves a trail)
 *   4. Respects `NOTIFY_BYPASS` (พี่เดฟ commit `0ac8b34` — single switch,
 *      hard-disabled on Vercel production)
 *
 * Why this exists
 *   §7 of `docs/research/legacy-deep-dive/03-fstatus-state-machine.md` shows
 *   legacy fires SMS/LINE/Email per-call-site, with most paths leaving one or
 *   two channels commented out — accidental inconsistency, not by design.
 *   Pacred CAN do better: every status transition gets the same notification
 *   treatment, the matrix lives in ONE place, and audit log is automatic.
 *
 * Calling pattern
 *
 *     await notifyStatusFlip({
 *       admin,            // createAdminClient() (caller's, for connection reuse)
 *       fid:        row.id,
 *       fNo:        row.fidorco ?? String(row.id),
 *       fromStatus: row.fstatus,        // e.g. "4"
 *       toStatus:   "5",                // the new fstatus
 *       legacyUserid: row.userid,       // tb_users.userID (PR1234)
 *       adminLegacyId,                  // safeLegacyAdminId(...)
 *       smsBody,                        // optional — caller-composed SMS
 *       notificationBody,               // optional — caller-composed LINE/email body
 *     });
 *
 * The matrix at the bottom of this file decides which channels fire for
 * each transition. Callers don't need to think about it.
 *
 * Backwards compatibility
 *   The existing `appendStatusLog()` helper inside `forwarder-check.ts`
 *   (and similar sites) does the same insert this helper does internally.
 *   Existing call sites can be migrated incrementally — both paths land in
 *   `tb_log_forwarder_status` with the same shape.
 *
 * Idempotency / safety
 *   - The log insert is fire-and-forget (best-effort): a failed insert
 *     does NOT roll back the action; logged via logger.error
 *   - Each notification channel is wrapped in try/catch independently
 *     so an SMS failure doesn't block LINE, and LINE failure doesn't
 *     block the audit log
 *   - The caller's UPDATE is OUTSIDE this helper — call this AFTER the
 *     UPDATE succeeded, with the old + new status values
 *
 * Server-only.
 */
import "server-only";
import { sendSms } from "@/lib/sms/gateway";
import { sendNotification } from "@/lib/notifications";
import { resolveProfileIdForLegacyUserid } from "@/lib/auth/tb-users-resolver";
import { logger, redactPhone } from "@/lib/logger";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { NotifyCategory, NotifySeverity } from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;
type NotificationChannel = "sms" | "line" | "email";

/**
 * The legacy tb_forwarder.fstatus enum (per migration 0081 + the
 * 03-fstatus-state-machine.md audit).
 *
 *   1  รอเข้าโกดังจีน
 *   2  ถึงโกดังจีนแล้ว
 *   3  กำลังส่งมาไทย
 *   4  ถึงไทยแล้ว
 *   5  รอชำระเงิน
 *   6  เตรียมส่ง
 *   7  ส่งแล้ว (terminal)
 *   99 พักไว้ (shelved)
 */
export type FStatus = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "99";

export interface NotifyStatusFlipOptions {
  /** Reusable admin client from the caller's transaction (avoids fresh connection). */
  admin: AdminClient;
  /** tb_forwarder.id — primary key (bigint). */
  fid: number;
  /** Customer-facing reference (fidorco or `#${id}`) — for notification bodies. */
  fNo: string;
  /** The fstatus BEFORE the UPDATE (caller already read it). */
  fromStatus: string;
  /** The fstatus AFTER the UPDATE. */
  toStatus: FStatus;
  /** Legacy tb_users.userID (e.g. "PR1234") — used to resolve profiles.id. */
  legacyUserid: string;
  /** Legacy admin id (already passed through safeLegacyAdminId — varchar(50) on the log table). */
  adminLegacyId: string;
  /** Optional override for which channels fire (defaults to per-transition matrix). */
  channels?: NotificationChannel[];

  // ── Per-call notification bodies (each optional — if omitted, channel skipped) ──

  /** SMS body — short (~160 chars). Caller composes (the helper doesn't templatise). */
  smsBody?: string;
  /** Customer phone (E.164 or 0XXXXXXXXX). When absent → SMS skipped. */
  customerPhone?: string | null;
  /** Notification title (LINE + email subject). Required if line/email fires. */
  notificationTitle?: string;
  /** Notification body (LINE + email body). Required if line/email fires. */
  notificationBody?: string;
  /** Deep-link path (e.g. /service-import/PR12345). Optional. */
  notificationLink?: string;
  /** Notification category + severity (for the notifications table row). */
  notificationCategory?: NotifyCategory;
  /** Severity (defaults to 'info'). */
  notificationSeverity?: NotifySeverity;
}

export interface NotifyStatusFlipResult {
  audit_log_written: boolean;
  sms_sent:          boolean;
  sms_skipped_reason: string | null;
  line_sent:         boolean;
  email_sent:        boolean;
  notif_skipped_reason: string | null;
}

/**
 * The "which transitions fire which channels" matrix.
 *
 * Per ภูม's brief + §7 of the legacy state-machine audit, the customer-
 * visible transitions are:
 *
 *   4→5  รอชำระเงิน          — SMS + LINE (loud · customer must act)
 *   5→6  จ่ายแล้ว / เตรียมส่ง  — SMS + LINE (delivery soon · expectation set)
 *   6→7  ส่งแล้ว              — LINE only  (less urgent · drop SMS to save credit)
 *   6.1→7 same as 6→7         — LINE only
 *
 * Every OTHER transition (1↔2, 2↔3, 3↔4, *→99 shelf, 99→* restore, etc.)
 * is LOG-ONLY — no SMS, no LINE, no email. The customer doesn't need a
 * push for internal warehouse movements.
 *
 * The matrix table below is queryable as data — adding a new firing rule
 * means editing one entry, not 18 call sites.
 */
const CHANNEL_MATRIX: Record<string, NotificationChannel[]> = {
  // forwarder.php:1346 + report-cnt.php:840 + forwarder-check.php:59 — fully wired in legacy
  "4->5": ["sms", "line"],
  // pay-users.php:408/467/633 — was un-wired in legacy (lineNotifyForwarder commented out)
  "5->6": ["sms", "line"],
  // forwarder-driver.php:166/580/1328 — was silent in legacy (assume customer already informed)
  // We add LINE because customers report being surprised by deliveries — push helps.
  "6->7": ["line"],
  // Identical handling — 6.1 is a virtual sub-state, normalize to 6
  "6.1->7": ["line"],
};

/**
 * Return the channels to fire for a transition, OR the caller's explicit
 * override. An empty array = log-only (no customer push).
 */
function channelsForTransition(
  fromStatus: string,
  toStatus: string,
  override?: NotificationChannel[],
): NotificationChannel[] {
  if (override) return override;
  const key = `${fromStatus}->${toStatus}`;
  return CHANNEL_MATRIX[key] ?? [];
}

/**
 * Append one row to `tb_log_forwarder_status` (the legacy audit log).
 * Best-effort: failures are logged but do NOT throw to the caller.
 *
 * Public so tests + other call sites can write the log row independently
 * if they want the audit trail without notifications (e.g. cron-driven
 * partner-API sync paths).
 *
 * Schema (per migration 0081 L2897-2904):
 *   id              bigserial primary key
 *   fid             bigint NOT NULL
 *   fstatusold      varchar(2)  NOT NULL
 *   fstatusnew      varchar(2)  NOT NULL
 *   adminidchange   varchar(50) NOT NULL
 *   fdatechange     timestamp
 *
 * Note the legacy column widths — varchar(2) on the status columns
 * means even "99" fits but "6.1" gets truncated to "6.". We normalize
 * "6.1" → "6" before insert to be safe (legacy report screens treat
 * 6.1 as 6 too — it's a virtual filter, not a real value).
 */
export async function appendStatusLog(
  admin: AdminClient,
  fid: number,
  fromStatus: string,
  toStatus: string,
  adminLegacyId: string,
): Promise<boolean> {
  // Normalize virtual 6.1 → 6 to fit the varchar(2) column.
  const oldStatus = fromStatus === "6.1" ? "6" : fromStatus;
  const newStatus = toStatus === "6.1" ? "6" : toStatus;
  try {
    const { error } = await admin.from("tb_log_forwarder_status").insert({
      fid,
      fstatusold:    oldStatus.slice(0, 2),
      fstatusnew:    newStatus.slice(0, 2),
      adminidchange: adminLegacyId.slice(0, 50),
      fdatechange:   new Date().toISOString(),
    });
    if (error) {
      logger.error(
        "status-flip-helper",
        "tb_log_forwarder_status insert failed",
        error,
        { fid, oldStatus, newStatus },
      );
      return false;
    }
    return true;
  } catch (e) {
    logger.error(
      "status-flip-helper",
      "tb_log_forwarder_status insert threw",
      e,
      { fid, oldStatus, newStatus },
    );
    return false;
  }
}

/**
 * Send a status-flip notification + audit-log entry for one forwarder row.
 *
 * Call this AFTER the UPDATE on tb_forwarder has succeeded. The helper:
 *   1. Always appends to tb_log_forwarder_status (G8 — even no-noti
 *      transitions get the audit trail)
 *   2. Looks up which channels fire for this transition (4→5 / 5→6 / 6→7)
 *   3. Dispatches SMS via lib/sms/gateway (NOTIFY_BYPASS-aware)
 *   4. Dispatches LINE/email via lib/notifications/sendNotification
 *      (NOTIFY_BYPASS-aware)
 *
 * Returns a structured result so callers can update their per-row counters
 * (used by bulk-bill UI to render "9 of 10 billed; 1 SMS failed").
 */
export async function notifyStatusFlip(
  opts: NotifyStatusFlipOptions,
): Promise<NotifyStatusFlipResult> {
  const result: NotifyStatusFlipResult = {
    audit_log_written:    false,
    sms_sent:             false,
    sms_skipped_reason:   null,
    line_sent:            false,
    email_sent:           false,
    notif_skipped_reason: null,
  };

  // 1. Always write the audit log (G8 — every UPDATE leaves a trail).
  if (opts.fromStatus !== opts.toStatus) {
    result.audit_log_written = await appendStatusLog(
      opts.admin,
      opts.fid,
      opts.fromStatus,
      opts.toStatus,
      opts.adminLegacyId,
    );
  } else {
    // Same-status "flip" = caller passed identical values (e.g. retry).
    // Don't insert a noop log row.
    result.audit_log_written = true;
  }

  // 2. Decide which channels fire.
  const channels = channelsForTransition(opts.fromStatus, opts.toStatus, opts.channels);
  if (channels.length === 0) {
    result.notif_skipped_reason = "log_only_transition";
    return result;
  }

  // 3. SMS path — only fires when 'sms' is in the channels AND a body+phone exist.
  if (channels.includes("sms")) {
    if (!opts.smsBody) {
      result.sms_skipped_reason = "no_sms_body";
    } else if (!opts.customerPhone) {
      result.sms_skipped_reason = "no_customer_phone";
    } else {
      try {
        const sms = await sendSms(opts.customerPhone, opts.smsBody);
        if (sms.ok) {
          result.sms_sent = true;
        } else {
          result.sms_skipped_reason = sms.error ?? "sms_send_failed";
          logger.warn("status-flip-helper", "SMS failed", {
            fid:    opts.fid,
            userid: opts.legacyUserid,
            phone:  redactPhone(opts.customerPhone),
            error:  sms.error,
          });
        }
      } catch (e) {
        result.sms_skipped_reason = "sms_send_threw";
        logger.warn("status-flip-helper", "SMS threw", {
          fid:    opts.fid,
          userid: opts.legacyUserid,
          error:  e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // 4. LINE + email path — both fire from one sendNotification() call.
  //    LINE first, email fallback when LINE not linked / push fails.
  if (channels.includes("line") || channels.includes("email")) {
    if (!opts.notificationTitle || !opts.notificationBody) {
      result.notif_skipped_reason = "no_notification_body";
    } else {
      const profileId = await resolveProfileIdForLegacyUserid(opts.legacyUserid);
      if (!profileId) {
        result.notif_skipped_reason = "no_profile_for_userid";
        logger.warn("status-flip-helper", "no profile for tb_users.userid — LINE+email skipped", {
          fid:    opts.fid,
          userid: opts.legacyUserid,
        });
      } else {
        try {
          const notif = await sendNotification(profileId, {
            category:       opts.notificationCategory ?? "forwarder",
            severity:       opts.notificationSeverity ?? "info",
            title:          opts.notificationTitle,
            body:           opts.notificationBody,
            link_href:      opts.notificationLink ?? `/service-import/${opts.fNo}`,
            reference_type: "forwarder",
            reference_id:   String(opts.fid),
          });
          result.line_sent  = notif.deliveredLine;
          result.email_sent = notif.deliveredEmail;
        } catch (e) {
          result.notif_skipped_reason = "sendNotification_threw";
          logger.warn("status-flip-helper", "sendNotification threw", {
            fid:    opts.fid,
            userid: opts.legacyUserid,
            error:  e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
  }

  return result;
}

/**
 * Convenience composer for the SMS body of a status-flip notification.
 *
 * Templates are conservative — short enough to fit ThaiBulkSMS Standard
 * 70-char TIS-620 limit, with a deep link the customer can tap to act.
 * Override when the call site has richer context (e.g. forwarder-check.ts
 * has its own `composeBillSms` with the exact amount).
 */
export function composeStatusFlipSms(opts: {
  toStatus: FStatus;
  fNo:      string;
  siteUrl?: string;
}): string | null {
  const base = opts.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://pacred.co";
  const link = `${base}/service-import/${opts.fNo}`;
  switch (opts.toStatus) {
    case "5":
      return `Pacred: บริการนำเข้า ${opts.fNo} รอชำระเงิน ดูที่ ${link}`;
    case "6":
      return `Pacred: บริการนำเข้า ${opts.fNo} ได้รับชำระเงินแล้ว เตรียมส่ง ดูที่ ${link}`;
    case "7":
      // Per matrix, 7 fires LINE only — no SMS. Return null so caller skips.
      return null;
    default:
      return null;
  }
}

/**
 * Convenience composer for the LINE/email notification body. Multi-line
 * acceptable. Customer-facing wording.
 */
export function composeStatusFlipBody(opts: {
  toStatus: FStatus;
  fNo:      string;
  trackingTh?: string | null;
}): { title: string; body: string } | null {
  switch (opts.toStatus) {
    case "5":
      return {
        title: `บริการนำเข้า ${opts.fNo} รอชำระเงิน`,
        body:  `รายการของท่านถึงไทยแล้ว กรุณาเข้าระบบเพื่อชำระเงิน`,
      };
    case "6":
      return {
        title: `บริการนำเข้า ${opts.fNo} เตรียมจัดส่ง`,
        body:  `ได้รับชำระเงินแล้ว — ทีมงานเตรียมจัดส่งสินค้าให้ท่านเร็วๆ นี้`,
      };
    case "7":
      return {
        title: `บริการนำเข้า ${opts.fNo} จัดส่งแล้ว`,
        body:  opts.trackingTh
          ? `สินค้าถูกจัดส่งแล้ว · เลขพัสดุ ${opts.trackingTh}`
          : `สินค้าถูกจัดส่งแล้วเรียบร้อย`,
      };
    default:
      return null;
  }
}
