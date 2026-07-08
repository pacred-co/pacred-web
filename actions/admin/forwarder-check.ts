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
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { sendSms } from "@/lib/sms/gateway";
import {
  computeForwarderCollectTotal,
  type ForwarderCollectRow,
} from "@/lib/forwarder/forwarder-collect-total";
import { logger, redactPhone } from "@/lib/logger";
import { sendNotification } from "@/lib/notifications";
import { appendStatusLog as appendStatusLogShared } from "@/lib/notifications/status-flip-helper";
import { resolveProfileIdsForLegacyUserids } from "@/lib/auth/tb-users-resolver";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canAnyRoleFlipFstatus } from "@/lib/auth/check-fstatus-transition";
import { autoFillThShippingForForwarder } from "@/lib/admin/auto-fill-th-shipping";

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
  // price components for computeForwarderCollectTotal() + the notify body.
  // G2 (2026-07-08): the notify now quotes the SAME collect total the
  // customer actually pays in the portal (computeForwarderCollectTotal),
  // which needs fshipby (เหมาๆ detection), paymethod (COD guard) +
  // faddressdistrict (หนองแขม exemption) — fields the old per-row
  // calcForwarderOutstanding didn't. The juristic 1% lever comes from
  // tb_users.userCompany (BUG-2b — NOT the row's fusercompany), so
  // fusercompany is no longer selected here.
  fshipby: string | null;
  paymethod: number | string | null;
  faddressdistrict: string | null;
  ftotalprice: number | string | null;
  ftransportprice: number | string | null;
  fpriceupdate: number | string | null;
  fshippingservice: number | string | null;
  pricecrate: number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother: number | string | null;
  fdiscount: number | string | null;
};

type UserRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userEmail: string | null;
  userLineNotify: string | null;
  userCompany: number | string | null; // '1' = นิติบุคคล — the collect 1% lever (BUG-2b source)
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
 *  the same data at the call-level, this is the legacy per-row trail.
 *
 *  2026-05-28 ดึก (G8 unification) — now delegates to
 *  `lib/notifications/status-flip-helper.ts` so every call site goes
 *  through the same code path. Signature kept stable for the few
 *  internal callers here. */
async function appendStatusLog(
  admin: ReturnType<typeof createAdminClient>,
  fid: number,
  oldStatus: string,
  newStatus: string,
  adminLegacyId: string,
): Promise<void> {
  await appendStatusLogShared(admin, fid, oldStatus, newStatus, adminLegacyId);
}

/** Compose the customer-facing SMS body. Legacy template was
 *    "คุณมีค่าขนส่งที่ต้องชำระ ดู->{url}"
 *
 *  G2 (2026-07-08) — one SMS per CUSTOMER (not per row) quoting the FULL
 *  collect total the customer actually pays in the portal (เหมาๆ ฿100 +
 *  batch-1% included, COD legs excluded — computeForwarderCollectTotal).
 *  The link points at `/service-import` (the pay surface whose pay-bar
 *  computes the identical collect), not a single-fid invoice — the SMS
 *  amount and the pay screen now agree exactly.
 *
 *  Char budget — ThaiBulkSMS encodes Thai as TIS-620 (1 SMS = 70 chars
 *  · multi-part up to 153/segment). We aim for ≤155 chars TIS-620 so
 *  the message ships in at most 3 segments.
 */
function composeBillSms(opts: {
  userId: string;
  count: number;
  amountThb: number;
}): string {
  // Domain root — env override · falls back to bare "pacred.co.th" (no
  // protocol) which gives us ~7 chars of head-room over "https://" + the
  // domain is the launch property.
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "";
  // Strip trailing slash · drop protocol so the SMS body stays compact
  // (most carriers auto-linkify bare domains). If the env wasn't set we
  // emit the launch host directly.
  const host = (envUrl !== "" ? envUrl : "pacred.co.th")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const payUrl = `${host}/service-import`;
  const amount = opts.amountThb.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  // Tight single-block message under 155 chars TIS-620 — every line
  // is mandatory for the customer to act:
  //   1. Sender identity + how many parcels this bill covers
  //   2. Amount to pay (the most-read line · the full collect)
  //   3. Pay link (the pay-bar shows the same amount)
  //   4. Wallet-pay CTA (the close-the-loop hint)
  return (
    `Pacred · ฝากนำเข้า ${opts.count} รายการ\n` +
    `ยอดที่ต้องชำระ: ฿${amount}\n` +
    `ชำระเงิน: ${payUrl}\n` +
    `จ่ายจากกระเป๋าได้เลย`
  );
}

/** Compose the LINE/email notification body. Longer than SMS — we can afford
 *  a multi-line message + a deep link. Sender prepends `[title]\n` itself
 *  (see lib/notifications/index.ts:sendLinePush).
 *
 *  G2 (2026-07-08) — per-customer, quotes the same FULL collect total. */
function composeBillBody(opts: {
  userId: string;
  count: number;
  amountThb: number;
}): string {
  const amount = opts.amountThb.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  return (
    `เรียนคุณ ${opts.userId} ค่ะ\n` +
    `บริการนำเข้า ${opts.count} รายการ\n` +
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

      // Wave 26 G5 (2026-05-28 ดึก) — status-transition role gate.
      // Bulk-bill is universally 4→5 (the .eq below pins the from-status),
      // so we check ONCE before reading. Matrix: 4→5 = accounting (super /
      // manager override). The existing union ["super","ops","accounting"]
      // page-level gate already filtered out e.g. Sales — but a future
      // role-expansion that touches this action would bypass the matrix
      // without this row-level helper call. We compute roles once.
      const callerRoles = (await getAdminRoles()) ?? [];
      if (!canAnyRoleFlipFstatus(callerRoles, "4", "5")) {
        return { ok: false, error: "forbidden_transition" };
      }

      // 1. Read candidate forwarder rows (filter to fstatus='4' = ตรวจสอบแล้ว).
      //    A row at any other status was already billed (or rolled back) and
      //    must not be touched again.
      const { data: forwarderRows, error: readErr } = await admin
        .from("tb_forwarder")
        .select(
          "id, userid, fstatus, ftrackingchn, fshipby, paymethod, faddressdistrict, " +
            "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
            "pricecrate, ftransportpricechnthb, priceother, fdiscount",
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
        .select("userID, userName, userLastName, userTel, userEmail, userLineNotify, userCompany")
        .in("userID", uniqueUserIds);
      if (userRowsErr) {
        console.error(`[tb_users list] failed`, { code: userRowsErr.code, message: userRowsErr.message });
      }
      const usersById = new Map<string, UserRow>(
        ((userRows ?? []) as unknown as UserRow[]).map((u) => [u.userID, u]),
      );

      // 2b. Resolve tb_users.userid → profiles.id (uuid) in one round-trip.
      //     Required for sendNotification() which keys on profiles.id. Customers
      //     pre-provisioned by scripts/data/02-provision-profiles-for-tb-users.ts
      //     will resolve cleanly; rare orphans (e.g. a brand-new tb_users row
      //     added after the backfill) won't — we fall back to SMS-only for them.
      const profileIdByUserid = await resolveProfileIdsForLegacyUserids(uniqueUserIds);

      // 3. Per-row bill loop (UPDATE per row) — billing stays row-by-row so a
      //    single bad row fails independently; the customer NOTIFY is grouped
      //    per-customer AFTER the loop (G2) so the SMS/LINE quotes the ONE
      //    collect total the customer actually pays in the portal.
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
      let autoFilledThCount = 0;           // #7 ค่าส่งไทย auto-filled this call

      // G2 — accumulate the EFFECTIVE collect rows (post-autofill, post-discount)
      // per customer, ONLY for rows that actually flipped to '5'. After the loop
      // we run ONE computeForwarderCollectTotal per customer over their billed
      // set → the notify amount == the portal charge for that same set (batch
      // เหมาๆ ฿100 once + batch-1%, COD legs excluded — never a per-row net).
      const billedRowsByUser = new Map<string, ForwarderCollectRow[]>();

      for (const row of candidates) {
        // #7 auto-fill ค่าส่งไทย (owner 2026-07-08 "ต้อง auto") — if a delivery leg
        // applies but ftransportprice is still ฿0, auto-fill the zone default so the
        // bulk-bill includes the TH cost (no manual detour). Best-effort · never
        // overwrites a set cost. The filled cost feeds the collect total below.
        const autoTh = await autoFillThShippingForForwarder(admin, row.id);
        const effectiveTransport = autoTh ? autoTh.cost : row.ftransportprice;
        if (autoTh) autoFilledThCount++;

        // 3a. UPDATE the forwarder row · re-guarded fstatus='4' to dodge a race
        //     where another operator billed it between our read + write.
        const updatePayload: Record<string, unknown> = {
          fstatus:          "5",
          fdatestatus5:     nowIso,
          adminidupdate:    safeLegacyAdminId(adminId, 10),
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

        // 3b. Stage the effective collect row for this customer (post-autofill,
        //     post-discount-override). Amount is computed once per customer below.
        const collectRow: ForwarderCollectRow = {
          fshipby:               row.fshipby,
          ftransportprice:       effectiveTransport,
          paymethod:             row.paymethod,
          faddressdistrict:      row.faddressdistrict,
          ftotalprice:           row.ftotalprice,
          fpriceupdate:          row.fpriceupdate,
          fshippingservice:      row.fshippingservice,
          pricecrate:            row.pricecrate,
          ftransportpricechnthb: row.ftransportpricechnthb,
          priceother:            row.priceother,
          fdiscount:             discount !== undefined ? discount : row.fdiscount,
        };
        const bucket = billedRowsByUser.get(row.userid);
        if (bucket) bucket.push(collectRow);
        else billedRowsByUser.set(row.userid, [collectRow]);
      }

      // 3c. Per-CUSTOMER notify pass (G2). One SMS + one LINE/email per customer
      //     quoting the collect total for their whole just-billed set — the exact
      //     amount computeForwarderCollectTotal charges in the portal.
      for (const [userid, collectRows] of billedRowsByUser) {
        const user = usersById.get(userid);
        const { total: collectTotal } = computeForwarderCollectTotal(collectRows, {
          userId:      userid,
          userCompany: String(user?.userCompany ?? ""),
        });
        const count = collectRows.length;

        // SMS (real · best-effort — billing already landed above).
        if (user?.userTel) {
          const sms = await sendSms(
            user.userTel,
            composeBillSms({ userId: userid, count, amountThb: collectTotal }),
          );
          if (sms.ok) {
            result.sms_sent++;
          } else {
            result.sms_failed++;
            logger.warn("forwarder-check", "SMS failed", {
              userid,
              phone: redactPhone(user.userTel),
              error: sms.error,
            });
          }
        } else {
          logger.warn("forwarder-check", "customer has no usertel", { userid });
        }

        // LINE + email push via the notifications spine.
        const profileId = profileIdByUserid.get(userid);
        if (!profileId) {
          result.no_profile++;
          logger.warn("forwarder-check", "no profile for tb_users.userid — LINE+email skipped", {
            userid,
          });
        } else {
          try {
            const notif = await sendNotification(profileId, {
              category:       "forwarder",
              severity:       "info",
              title:          `แจ้งชำระเงิน · บริการนำเข้า ${count} รายการ`,
              body:           composeBillBody({ userId: userid, count, amountThb: collectTotal }),
              link_href:      `/service-import`,
              reference_type: "forwarder",
              reference_id:   userid,
            });

            if (notif.deliveredLine) {
              result.line_sent++;
            }
            // (LINE not-attempted vs failed is indistinguishable via the return
            //  shape — real API failures surface in Sentry via lib/notifications.)

            if (notif.deliveredEmail) {
              result.email_sent++;
            } else if (user?.userEmail) {
              result.email_failed++;
            }
          } catch (e) {
            result.line_failed++;
            result.email_failed++;
            logger.warn("forwarder-check", "sendNotification threw", {
              userid,
              error: e instanceof Error ? e.message : String(e),
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
          .in("fID", successfulFids);
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
          th_shipping_autofilled: autoFilledThCount,
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
        .select("fID")
        .in("fID", fids);
      if (presentErr) {
        console.error(`[tb_check_forwarder list] failed`, { code: presentErr.code, message: presentErr.message });
      }
      const presentFids = ((present ?? []) as Array<{ fID: number }>).map((r) => r.fID);

      const { error: delErr } = await admin
        .from("tb_check_forwarder")
        .delete()
        .in("fID", fids);
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
