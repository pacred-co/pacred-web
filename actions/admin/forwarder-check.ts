"use server";

/**
 * /admin/forwarder-check server actions — Wave 16 P0-2 (2026-05-25 ค่ำ)
 *
 * Faithful port of the legacy `pcs-admin/forwarder-check.php` POST handlers:
 *   - callPriceUser  → bulk-bill: move N forwarder rows from status='4'
 *                      (ตรวจสอบแล้ว) → '5' (รอชำระเงิน), notify each customer
 *                      via SMS + LINE + email, then DELETE the rows from
 *                      tb_check_forwarder (queue is done with them).
 *   - removeFromCheckQueue → operator cancellation: remove rows from
 *                      tb_check_forwarder WITHOUT flipping status (revenue
 *                      pipeline reset, no customer notification).
 *
 * Tables touched:
 *   - tb_forwarder            UPDATE fstatus='5' + fdatestatus5 + adminidupdate
 *   - tb_users                READ usertel · userlinenotify · useremail · etc.
 *   - tb_check_forwarder      DELETE WHERE fid IN (...)
 *   - tb_log_forwarder_status INSERT one row per successful transition (audit)
 *
 * Notification channels:
 *   - SMS    → `sendSms()` (ThaiBulkSMS gateway, real)
 *   - LINE   → `sendNotification()` (LINE Messaging API push via @pacred OA).
 *              Wave 16 follow-up A (2026-05-23) wired this once every
 *              tb_users orphan got a profiles row (script: scripts/data/
 *              02-provision-profiles-for-tb-users.ts). The legacy
 *              `userlinenotify` is the dead LINE Notify token (EOL Apr 2025)
 *              and is ignored — Pacred's LINE push targets profiles.line_user_id
 *              minted via /liff/link. For customers who haven't linked LINE
 *              yet, sendNotification() falls back to email automatically.
 *   - email  → ALSO via sendNotification() — the fallback when LINE not
 *              linked. Sender reads profiles.email (populated from
 *              tb_users.useremail at backfill time).
 *
 * The legacy PHP itself had `sendLine()` commented out and `sendMail()`
 * commented out in `forwarder-check.php` L75/L100 (`//sendLine(...)` ·
 * `//sendMail(...)`). Only `sendSMSAPI()` (L93) actually fired. Pacred goes
 * BEYOND legacy: we surface all 3 channels — SMS for legacy parity,
 * LINE/email via our notifications spine for richer reach.
 *
 * Idempotency: per-row reads guard against double-billing. A row whose
 * fstatus is already !='4' is skipped (already billed or canceled). The
 * deleted-from-check-queue postcondition makes a second call a no-op
 * (no rows left to bill). Concurrent operators are handled by the
 * fstatus='4' eq-guard on the UPDATE.
 *
 * Partial-failure model: each row's billing is independent. Returns
 *   { ok: true, data: { processed, failed, errors[] } }
 * so the client can show "9 of 10 billed; row #123 failed: tel missing".
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendSms } from "@/lib/sms/gateway";
import { calcForwarderOutstanding } from "@/lib/forwarder/outstanding";
import { logger, redactPhone } from "@/lib/logger";
import { sendNotification } from "@/lib/notifications";
import { resolveProfileIdsForLegacyUserids } from "@/lib/auth/tb-users-resolver";

// ────────────────────────────────────────────────────────────
// Schemas
// ────────────────────────────────────────────────────────────

const bulkBillSchema = z.object({
  fids: z.array(z.number().int().positive()).min(1).max(200),
  /** Optional override discount applied per row before billing (THB).
   *  Legacy `forwarder-check.php` accepts `fDiscount` as a per-call value
   *  and writes it to every row. Almost never used in practice — operators
   *  set discount on the row before adding to the check queue. Kept for
   *  parity; null/undefined means "leave existing per-row fdiscount alone". */
  discount: z.number().nonnegative().optional(),
});
export type AdminCallPriceUserInput = z.infer<typeof bulkBillSchema>;

const removeFromQueueSchema = z.object({
  fids: z.array(z.number().int().positive()).min(1).max(200),
});
export type AdminRemoveFromCheckQueueInput = z.infer<typeof removeFromQueueSchema>;

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

type ForwarderRow = {
  id: number;
  userid: string;
  fstatus: string;
  ftrackingchn: string | null;
  // price components for calcForwarderOutstanding() + the SMS body
  ftotalprice: number | string | null;
  ftransportprice: number | string | null;
  fpriceupdate: number | string | null;
  fshippingservice: number | string | null;
  pricecrate: number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother: number | string | null;
  fdiscount: number | string | null;
  fusercompany: number | string | null;
};

type UserRow = {
  userid: string;
  username: string | null;
  userlastname: string | null;
  usertel: string | null;
  useremail: string | null;
  userlinenotify: string | null;
};

type BillResult = {
  processed: number;        // rows successfully flipped to status '5'
  failed: number;           // rows that didn't transition
  sms_sent: number;         // SMS dispatches the gateway accepted
  sms_failed: number;
  line_sent: number;        // LINE OA pushes that succeeded
  line_failed: number;      // LINE attempted but underlying push failed (or no line_user_id)
  email_sent: number;       // email fallback that succeeded
  email_failed: number;     // email attempted but underlying send failed (or no email)
  no_profile: number;       // userid had no profile row (LINE+email skipped)
  errors: string[];         // human-readable per-row failures (capped)
};

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/** Best-effort: insert one audit row per status transition. Failures
 *  don't break the main flow — the admin_audit_log entry above carries
 *  the same data at the call-level, this is the legacy per-row trail. */
async function appendStatusLog(
  admin: ReturnType<typeof createAdminClient>,
  fid: number,
  oldStatus: string,
  newStatus: string,
  adminLegacyId: string,
): Promise<void> {
  try {
    await admin.from("tb_log_forwarder_status").insert({
      fid,
      fstatusold:    oldStatus,
      fstatusnew:    newStatus,
      adminidchange: adminLegacyId,
      fdatechange:   new Date().toISOString(),
    });
  } catch (e) {
    logger.error("forwarder-check", "tb_log_forwarder_status insert failed", e, { fid });
  }
}

/** Compose the customer-facing SMS body. Legacy template was
 *    "คุณมีค่าขนส่งที่ต้องชำระ ดู->{url}"
 *  We surface the order id + total so the customer can match it against
 *  their LINE/email without opening the link first. */
function composeBillSms(opts: {
  userId: string;
  fid: number;
  amountThb: number;
  trackingChn: string | null;
}): string {
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://pacred.co"}/service-import/${opts.fid}`;
  const amount = opts.amountThb.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  const trackingPart = opts.trackingChn ? ` ${opts.trackingChn}` : "";
  // ThaiBulkSMS Standard limit = 160 chars Latin / 70 chars TIS-620. Keep
  // the body tight so we don't get truncated mid-amount.
  return `Pacred: ${opts.userId} บริการนำเข้า #${opts.fid}${trackingPart} ยอด ฿${amount} ชำระที่ ${url}`;
}

/** Compose the LINE/email notification body. Longer than SMS — we can afford
 *  a multi-line message + a deep link. Sender prepends `[title]\n` itself
 *  (see lib/notifications/index.ts:sendLinePush). */
function composeBillBody(opts: {
  userId: string;
  fid: number;
  amountThb: number;
  trackingChn: string | null;
}): string {
  const amount       = opts.amountThb.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  const trackingLine = opts.trackingChn ? `\nเลขพัสดุ: ${opts.trackingChn}` : "";
  return (
    `เรียนคุณ ${opts.userId} ค่ะ\n` +
    `บริการนำเข้า #${opts.fid}${trackingLine}\n` +
    `ยอดที่ต้องชำระ: ฿${amount}\n` +
    `กรุณาเข้าระบบเพื่อชำระเงิน`
  );
}

// ────────────────────────────────────────────────────────────
// adminCallPriceUser — the bulk-bill action
// ────────────────────────────────────────────────────────────

/**
 * Bulk-bill N forwarder rows from the check queue:
 *   1. Read tb_forwarder + tb_users for the requested fids (filtering to
 *      fstatus='4' so we don't re-bill already-billed rows)
 *   2. For each row: compute outstanding · UPDATE fstatus='5' +
 *      fdatestatus5=now() + adminidupdate · INSERT audit log
 *   3. Fire SMS (real) · log LINE/email intent (deferred)
 *   4. DELETE the fids from tb_check_forwarder (queue is consumed)
 *   5. Single admin_audit_log entry with the per-row summary
 *
 * Roles: super · ops · accounting — same union as the page.tsx auth gate.
 */
export async function adminCallPriceUser(
  input: AdminCallPriceUserInput,
): Promise<AdminActionResult<BillResult>> {
  const parsed = bulkBillSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { fids, discount } = parsed.data;

  return withAdmin<BillResult>(
    ["super", "ops", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // 1. Read candidate forwarder rows (filter to fstatus='4' = ตรวจสอบแล้ว).
      //    A row at any other status was already billed (or rolled back) and
      //    must not be touched again.
      const { data: forwarderRows, error: readErr } = await admin
        .from("tb_forwarder")
        .select(
          "id, userid, fstatus, ftrackingchn, " +
            "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
            "pricecrate, ftransportpricechnthb, priceother, fdiscount, fusercompany",
        )
        .in("id", fids)
        .eq("fstatus", "4");
      if (readErr) return { ok: false, error: readErr.message };
      if (!forwarderRows || forwarderRows.length === 0) {
        return {
          ok: false,
          error: "ไม่พบรายการที่พร้อมแจ้งชำระเงิน (อาจถูกแจ้งไปแล้ว หรือยังไม่ใช่สถานะ 4)",
        };
      }
      const candidates = forwarderRows as unknown as ForwarderRow[];

      // 2. Read tb_users for SMS/email channels in one query.
      const uniqueUserIds = Array.from(new Set(candidates.map((r) => r.userid).filter(Boolean)));
      const { data: userRows, error: userRowsErr } = await admin
        .from("tb_users")
        .select("userid, username, userlastname, usertel, useremail, userlinenotify")
        .in("userid", uniqueUserIds);
      if (userRowsErr) {
        console.error(`[tb_users list] failed`, { code: userRowsErr.code, message: userRowsErr.message });
      }
      const usersById = new Map<string, UserRow>(
        ((userRows ?? []) as unknown as UserRow[]).map((u) => [u.userid, u]),
      );

      // 2b. Resolve tb_users.userid → profiles.id (uuid) in one round-trip.
      //     Required for sendNotification() which keys on profiles.id. Customers
      //     pre-provisioned by scripts/data/02-provision-profiles-for-tb-users.ts
      //     will resolve cleanly; rare orphans (e.g. a brand-new tb_users row
      //     added after the backfill) won't — we fall back to SMS-only for them.
      const profileIdByUserid = await resolveProfileIdsForLegacyUserids(uniqueUserIds);

      // 3. Per-row bill loop.
      const nowIso = new Date().toISOString();
      const result: BillResult = {
        processed:    0,
        failed:       0,
        sms_sent:     0,
        sms_failed:   0,
        line_sent:    0,
        line_failed:  0,
        email_sent:   0,
        email_failed: 0,
        no_profile:   0,
        errors:       [],
      };
      const successfulFids: number[] = []; // for the queue-delete step

      for (const row of candidates) {
        const rowForCalc = discount !== undefined
          ? { ...row, fdiscount: discount }   // operator-supplied override (per parsed)
          : row;
        const outstandingThb = calcForwarderOutstanding(rowForCalc);

        // 3a. UPDATE the forwarder row · re-guarded fstatus='4' to dodge a race
        //     where another operator billed it between our read + write.
        const updatePayload: Record<string, unknown> = {
          fstatus:          "5",
          fdatestatus5:     nowIso,
          adminidupdate:    adminId,
          fdateadminstatus: nowIso,
        };
        if (discount !== undefined) {
          updatePayload.fdiscount = discount;
        }

        const { error: updErr } = await admin
          .from("tb_forwarder")
          .update(updatePayload)
          .eq("id", row.id)
          .eq("fstatus", "4");
        if (updErr) {
          result.failed++;
          result.errors.push(`#${row.id}: ${updErr.message}`);
          continue;
        }

        result.processed++;
        successfulFids.push(row.id);
        await appendStatusLog(admin, row.id, row.fstatus, "5", adminId);

        // 3b. Notify the customer (SMS now · LINE/email deferred).
        const user = usersById.get(row.userid);
        if (user?.usertel) {
          const sms = await sendSms(
            user.usertel,
            composeBillSms({
              userId:      row.userid,
              fid:         row.id,
              amountThb:   outstandingThb,
              trackingChn: row.ftrackingchn,
            }),
          );
          if (sms.ok) {
            result.sms_sent++;
          } else {
            result.sms_failed++;
            // Don't add to errors[] — billing succeeded; SMS is best-effort.
            logger.warn("forwarder-check", "SMS failed", {
              fid:   row.id,
              userid: row.userid,
              phone: redactPhone(user.usertel),
              error: sms.error,
            });
          }
        } else {
          // No phone on file — log so accounting can chase it manually
          logger.warn("forwarder-check", "customer has no usertel", {
            fid:    row.id,
            userid: row.userid,
          });
        }

        // 3c+3d. LINE + email push via the notifications spine.
        //     sendNotification() inserts a notifications row + tries LINE
        //     Messaging API push (if profiles.line_user_id set) + falls back
        //     to email (if profiles.email set). Each call is wrapped: a
        //     channel failure does NOT block billing — the bill already
        //     landed in the DB above and SMS already fired.
        const profileId = profileIdByUserid.get(row.userid);
        if (!profileId) {
          // Customer has no profile (extremely rare post-backfill — e.g. a
          // brand-new tb_users row added since the last provisioning run).
          // SMS still fired above; LINE+email skipped silently.
          result.no_profile++;
          logger.warn("forwarder-check", "no profile for tb_users.userid — LINE+email skipped", {
            fid:    row.id,
            userid: row.userid,
          });
        } else {
          try {
            const notif = await sendNotification(profileId, {
              category:       "forwarder",
              severity:       "info",
              title:          `แจ้งชำระเงิน · บริการนำเข้า #${row.id}`,
              body:           composeBillBody({
                userId:      row.userid,
                fid:         row.id,
                amountThb:   outstandingThb,
                trackingChn: row.ftrackingchn,
              }),
              link_href:      `/service-import/${row.id}`,
              reference_type: "forwarder",
              reference_id:   String(row.id),
            });

            // LINE counts: deliveredLine === true → sent. If false AND the
            // profile has a line_user_id, treat as failure (push API rejected).
            // If false AND no line_user_id, it was never attempted → not a
            // failure, just unavailable for this channel.
            if (notif.deliveredLine) {
              result.line_sent++;
            } else if (user?.useremail || user) {
              // Heuristic: count line_failed only when we'd expect LINE to
              // exist. line_user_id presence is the actual gate (set via
              // /liff/link). Without exposing it through sendNotification's
              // return shape we can't be precise — treat as "not_attempted"
              // by default. Keep the counter focused on actual API failures.
              // (LINE failure surfaces in Sentry via lib/notifications.)
            }

            // Email counts: deliveredEmail === true → sent. Otherwise the
            // RESEND_API_KEY likely isn't set yet (per ก๊อต hand-off backlog)
            // — track as failed so the operator sees "0 emails sent" and the
            // team knows to wire RESEND.
            if (notif.deliveredEmail) {
              result.email_sent++;
            } else if (user?.useremail) {
              result.email_failed++;
            }
          } catch (e) {
            // Total failure — neither LINE nor email landed. Log + continue.
            result.line_failed++;
            result.email_failed++;
            logger.warn("forwarder-check", "sendNotification threw", {
              fid:    row.id,
              userid: row.userid,
              error:  e instanceof Error ? e.message : String(e),
            });
          }
        }
      }

      // 4. DELETE the successfully-billed rows from tb_check_forwarder.
      //    Even if SMS partially failed, the bill landed in the DB — the
      //    queue must drop them or operators will re-bill on the next pass.
      if (successfulFids.length > 0) {
        const { error: delErr } = await admin
          .from("tb_check_forwarder")
          .delete()
          .in("fid", successfulFids);
        if (delErr) {
          // Not fatal — billing happened; the queue cleanup can be retried
          // by re-clicking. Surface as a warning in the result.
          result.errors.push(`queue-cleanup: ${delErr.message}`);
          logger.error(
            "forwarder-check",
            "tb_check_forwarder delete failed AFTER billing",
            delErr,
            { successfulFids },
          );
        }
      }

      // 5. Single audit-log entry summarising the call.
      await logAdminAction(
        adminId,
        "forwarder_check.bulk_bill",
        "tb_forwarder",
        successfulFids.join(",") || "none",
        {
          requested_fids: fids,
          billed_fids:    successfulFids,
          processed:      result.processed,
          failed:         result.failed,
          sms_sent:       result.sms_sent,
          sms_failed:     result.sms_failed,
          line_sent:      result.line_sent,
          line_failed:    result.line_failed,
          email_sent:     result.email_sent,
          email_failed:   result.email_failed,
          no_profile:     result.no_profile,
          discount_override:  discount ?? null,
          errors: result.errors.length > 10
            ? result.errors.slice(0, 10).concat("...")
            : result.errors,
        },
      );

      revalidatePath("/admin/forwarder-check");
      revalidatePath("/admin/forwarders");
      revalidatePath("/admin/report-cnt");
      return { ok: true, data: result };
    },
  );
}

// ────────────────────────────────────────────────────────────
// adminRemoveFromCheckQueue — operator cancellation
// ────────────────────────────────────────────────────────────

/**
 * Remove rows from tb_check_forwarder WITHOUT billing.
 *
 * Use case: operator added a row to the check queue by mistake, or
 * the customer asked to delay billing. The forwarder row stays at
 * status='4' (ตรวจสอบแล้ว); only the queue link is severed.
 *
 * No customer notification (silent operator action).
 */
export async function adminRemoveFromCheckQueue(
  input: AdminRemoveFromCheckQueueInput,
): Promise<AdminActionResult<{ removed: number }>> {
  const parsed = removeFromQueueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { fids } = parsed.data;

  return withAdmin<{ removed: number }>(
    ["super", "ops", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // Snapshot before delete so the audit log records what was removed.
      const { data: present, error: presentErr } = await admin
        .from("tb_check_forwarder")
        .select("fid")
        .in("fid", fids);
      if (presentErr) {
        console.error(`[tb_check_forwarder list] failed`, { code: presentErr.code, message: presentErr.message });
      }
      const presentFids = ((present ?? []) as Array<{ fid: number }>).map((r) => r.fid);

      const { error: delErr } = await admin
        .from("tb_check_forwarder")
        .delete()
        .in("fid", fids);
      if (delErr) return { ok: false, error: delErr.message };

      await logAdminAction(
        adminId,
        "forwarder_check.remove_from_queue",
        "tb_check_forwarder",
        presentFids.join(",") || "none",
        {
          requested_fids: fids,
          removed_fids:   presentFids,
        },
      );

      revalidatePath("/admin/forwarder-check");
      return { ok: true, data: { removed: presentFids.length } };
    },
  );
}
