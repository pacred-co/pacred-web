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
import {
  isThShippingCostMissing,
  codBaseTrackings,
  diagnoseThShippingBlock,
} from "@/lib/forwarder/domestic-shipping";
import { baseTracking } from "@/lib/admin/momo-bill-header";
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
  /** C2 (2026-07-13) ค่าส่งไทย "ห้ามลืม" ack — mirrors createBillingRunInvoice's
   *  allowMissingThShip. When false (default) a row whose domestic delivery leg
   *  applies (fshipby ≠ self-pickup/เหมาๆ/COD) but whose ค่าส่งไทย (ftransportprice)
   *  is still ฿0 (auto-fill couldn't quote → unmeasured/oversize) is SKIPPED +
   *  surfaced, never billed at a ฿0 domestic leg. Set true to bill anyway.
   *  `.optional()` (no default) so an existing `{ fids }` caller stays valid. */
  allowMissingThShip: z.boolean().optional(),
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
  // owner 2026-07-17 ("ผิดพลาด 8") — DIAGNOSIS-ONLY reads. `diagnoseThShippingBlock`
  // needs the same inputs `resolveAutoThShippingFill` uses (zip + girth + kg) so the
  // failure can name the EXACT missing field instead of a generic "ค่าส่งไทย ฿0".
  // Read-only · never written by this action.
  faddresszipcode: string | null;
  fweight: number | string | null;
  fwidth: number | string | null;
  flength: number | string | null;
  fheight: number | string | null;
};

/**
 * BillFailure — ทำไมแถวนี้แจ้งชำระไม่ได้ (owner 2026-07-17 · [[wrong-error-message-hides-real-block]]).
 *
 * เดิม action เก็บเหตุผลไว้ใน `errors: string[]` แต่ client ไม่เคยอ่าน → จอโชว์แค่
 * "ผิดพลาด 8" ลอยๆ. ตัวนี้คือเหตุผล **รายตัว** แบบมีโครงสร้าง ให้ UI แจงได้ว่า
 * แถวไหน · ติดอะไร · ต้องทำอะไรต่อ. ตัวตนลูกค้า/ตู้/แทรคกิ้ง ไม่ต้องส่งกลับ — client
 * join กับ `rows` ที่ถืออยู่แล้ว (ชื่อนิติที่ resolve แล้ว · §0g).
 */
export type BillFailure = {
  fid: number;
  /** machine code — สำหรับ group/นับ. */
  code:
    | "zero_import_price"   // C1 ค่านำเข้า ฿0 (ยังไม่ตั้งราคา/วัด)
    | "th_shipping_missing" // C2 ยังไม่มีค่าส่งไทย (+ ระบบเติมอัตโนมัติไม่ได้)
    | "not_status_4"        // แถวไม่ได้อยู่สถานะ 4 → action อ่านไม่เจอ (เดิม = หายเงียบ)
    | "update_failed";      // UPDATE ไม่ผ่าน (race / DB error)
  /** เหตุผลไทย อ่านรู้เรื่องในตาแรก. */
  reason: string;
  /** ต้องทำอะไรต่อ — ใคร ทำอะไร. */
  nextAction: string;
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
  errors: string[];         // human-readable per-row failures (capped) — audit-log shape
  /** owner 2026-07-17 — เหตุผลรายตัวแบบมีโครงสร้าง ให้ UI แจงได้ (แทน "ผิดพลาด N" ลอยๆ). */
  failures: BillFailure[];
};

/** `errors` (audit-log/back-compat) derived from the structured failures — one home for the text. */
function failureLine(f: BillFailure): string {
  return `#${f.fid}: ${f.reason} — ${f.nextAction}`;
}

/**
 * Diagnose the fids that the fstatus='4' read DIDN'T return. Previously these
 * vanished from the result entirely (neither processed nor failed) — an operator
 * who ticked a mixed selection got a count that silently didn't add up. Read-only.
 */
async function diagnoseDroppedFids(
  admin: ReturnType<typeof createAdminClient>,
  droppedIds: number[],
): Promise<BillFailure[]> {
  if (droppedIds.length === 0) return [];
  const { data, error } = await admin
    .from("tb_forwarder")
    .select("id, fstatus")
    .in("id", droppedIds);
  if (error) {
    return droppedIds.map((fid) => ({
      fid,
      code: "not_status_4" as const,
      reason: "อ่านสถานะรายการไม่ได้",
      nextAction: "ลองใหม่อีกครั้ง · ถ้ายังไม่ได้แจ้งทีมเทคนิค",
    }));
  }
  const statusById = new Map<number, string>(
    ((data ?? []) as Array<{ id: number; fstatus: string }>).map((r) => [r.id, r.fstatus]),
  );
  return droppedIds.map((fid) => {
    const st = statusById.get(fid);
    if (st === undefined) {
      return {
        fid,
        code: "not_status_4" as const,
        reason: "ไม่พบรายการนี้ในระบบแล้ว (อาจถูกลบ)",
        nextAction: "กด 🗑️ ลบออกจากคิว เพื่อเคลียร์คิวตรวจสอบ",
      };
    }
    const label = STATUS_LABEL_TH[st] ?? `สถานะ ${st}`;
    return {
      fid,
      code: "not_status_4" as const,
      reason: `สถานะตอนนี้คือ "${label}" — ไม่ใช่ "ตรวจสอบแล้ว (4)" จึงแจ้งชำระไม่ได้`,
      nextAction:
        Number(st) >= 5
          ? "แจ้งชำระไปแล้ว/เลยขั้นตอนนี้ไปแล้ว — กด 🗑️ ลบออกจากคิว เพื่อเคลียร์คิวตรวจสอบ"
          : "รอตรวจตู้ให้ถึงสถานะ ตรวจสอบแล้ว (4) ก่อน แล้วค่อยแจ้งชำระ",
    };
  });
}

/** สถานะไทย — mirror ของ FSTATUS ที่หน้าตารางใช้ (ให้ error พูดภาษาคน ไม่ใช่ "fstatus=7"). */
const STATUS_LABEL_TH: Record<string, string> = {
  "1":  "รอเข้าโกดังจีน",
  "2":  "ถึงโกดังจีนแล้ว",
  "3":  "กำลังส่งมาไทย",
  "4":  "ตรวจสอบแล้ว",
  "5":  "รอชำระเงิน",
  "6":  "เตรียมส่ง",
  "7":  "ส่งแล้ว",
  "99": "พิเศษ",
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
  const { fids, discount, allowMissingThShip } = parsed.data;

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
            "pricecrate, ftransportpricechnthb, priceother, fdiscount, " +
            // diagnosis-only (owner 2026-07-17) — never written here
            "faddresszipcode, fweight, fwidth, flength, fheight",
        )
        .in("id", fids)
        .eq("fstatus", "4");
      if (readErr) return { ok: false, error: readErr.message };
      const candidates = (forwarderRows ?? []) as unknown as ForwarderRow[];

      // owner 2026-07-17 — every ticked fid the fstatus='4' read didn't return used to
      // DISAPPEAR from the tally (not processed, not failed). Diagnose them so the
      // operator sees a reason per row instead of a count that doesn't add up.
      const foundIds = new Set(candidates.map((r) => r.id));
      const droppedFailures = await diagnoseDroppedFids(
        admin,
        fids.filter((id) => !foundIds.has(id)),
      );

      // Nothing billable — return the PER-ROW reasons (ok:true) instead of the old
      // blanket "ไม่พบรายการที่พร้อมแจ้งชำระเงิน" error, which was exactly the
      // vague message that hid the real block ([[wrong-error-message-hides-real-block]]).
      if (candidates.length === 0) {
        return {
          ok: true,
          data: {
            processed: 0, failed: droppedFailures.length,
            sms_sent: 0, sms_failed: 0, line_sent: 0, line_failed: 0,
            email_sent: 0, email_failed: 0, no_profile: 0,
            errors: droppedFailures.map(failureLine),
            failures: droppedFailures,
          },
        };
      }

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
        // seeded with the ticked rows that weren't at fstatus='4' — they used to
        // vanish from the tally entirely (owner 2026-07-17).
        failed:       droppedFailures.length,
        sms_sent:     0,
        sms_failed:   0,
        line_sent:    0,
        line_failed:  0,
        email_sent:   0,
        email_failed: 0,
        no_profile:   0,
        errors:       droppedFailures.map(failureLine),
        failures:     [...droppedFailures],
      };
      const successfulFids: number[] = []; // for the queue-delete step
      let autoFilledThCount = 0;           // #7 ค่าส่งไทย auto-filled this call

      // G2 — accumulate the EFFECTIVE collect rows (post-autofill, post-discount)
      // per customer, ONLY for rows that actually flipped to '5'. After the loop
      // we run ONE computeForwarderCollectTotal per customer over their billed
      // set → the notify amount == the portal charge for that same set (batch
      // เหมาๆ ฿100 once + batch-1%, COD legs excluded — never a per-row net).
      const billedRowsByUser = new Map<string, ForwarderCollectRow[]>();

      // C2 (2026-07-13) — SHIPMENT-level COD set (any candidate whose base-tracking is
      // COD). Used to exempt box-split siblings that kept paymethod='1' from the ค่าส่งไทย
      // gate below (same rule createBillingRunInvoice uses). Computed once over candidates.
      const codBases = codBaseTrackings(candidates);

      for (const row of candidates) {
        // C1 (2026-07-13 · MONEY · owner "เก็บเงินขาด") — ZERO-IMPORT-COST guard. A row
        // whose import freight SELL (ค่านำเข้า · ftotalprice) is still ฿0 was never
        // measured/priced (no rate card for its warehouse×transport×product tuple →
        // computeAndFillForwarderImportRate wrote nothing). Flipping it 4→5 + SMS-
        // collecting bills ฿0 = เก็บเงินขาด. This path has NO positive-override channel,
        // so any ftotalprice<=0 is a genuine under-charge → skip + surface it (mirrors the
        // createBillingRunInvoice zero-transport gate + report-cnt bill-to-customer guard).
        if ((Number(row.ftotalprice) || 0) <= 0) {
          const f: BillFailure = {
            fid: row.id,
            code: "zero_import_price",
            reason: "ค่านำเข้า (ค่าขนส่งจีน-ไทย) ยังเป็น ฿0 — ยังไม่ได้วัด/ตั้งราคา ถ้าแจ้งชำระตอนนี้จะเก็บเงินขาด",
            nextAction: "ให้โกดังวัดขนาด+น้ำหนัก และให้ Pricing ตั้งเรท แล้วกดแจ้งชำระอีกครั้ง",
          };
          result.failed++;
          result.failures.push(f);
          result.errors.push(failureLine(f));
          continue;
        }

        // #7 auto-fill ค่าส่งไทย (owner 2026-07-08 "ต้อง auto") — if a delivery leg
        // applies but ftransportprice is still ฿0, auto-fill the zone default so the
        // bulk-bill includes the TH cost (no manual detour). Best-effort · never
        // overwrites a set cost. The filled cost feeds the collect total below.
        const autoTh = await autoFillThShippingForForwarder(admin, row.id);
        const effectiveTransport = autoTh ? autoTh.cost : row.ftransportprice;
        if (autoTh) autoFilledThCount++;

        // C2 (2026-07-13 · MONEY) — ค่าส่งไทย "ห้ามลืม" gate (mirrors createBillingRunInvoice
        // a3). After the auto-fill, if a domestic leg still applies (effective fshipby ≠
        // self-pickup/เหมาๆ/COD) but ค่าส่งไทย is STILL ฿0 (auto-fill couldn't quote — the
        // parcel is unmeasured/oversize → resolveThShippingAutoPrice returned null → no
        // write), billing 4→5 would collect ฿0 for the domestic leg = เก็บเงินขาด. Skip +
        // surface unless the operator acked allowMissingThShip. เหมาๆ ฿0 rows are exempt
        // (B1 isMaoCarrier) + COD rows/siblings are exempt (shipmentIsCod). No orphan write:
        // if this fires, autoFillThShippingForForwarder returned null (nothing was written).
        const effFshipby = autoTh?.carrier ?? row.fshipby;
        const effPaymethod = autoTh?.payMethod ?? row.paymethod;
        const shipmentIsCod = codBases.has(baseTracking(row.ftrackingchn ?? "") ?? "");
        if (
          !allowMissingThShip &&
          isThShippingCostMissing({
            fshipby: effFshipby,
            ftransportprice: effectiveTransport,
            payMethod: effPaymethod,
            shipmentIsCod,
          })
        ) {
          // The gate is UNCHANGED — it blocks correctly (billing a ฿0 domestic leg =
          // เก็บเงินขาด). What was broken is that "ผิดพลาด" never said WHY. The auto-fill
          // above returned null for a SPECIFIC reason (no address / not measured / over
          // Flash's cap / manual carrier) — name it, so the operator knows what to fix.
          const diag = diagnoseThShippingBlock({
            fshipby: effFshipby,
            zip: row.faddresszipcode,
            weightKg: Number(row.fweight) || 0,
            sizeCm:
              (Number(row.fwidth) || 0) + (Number(row.flength) || 0) + (Number(row.fheight) || 0),
          });
          const f: BillFailure = {
            fid: row.id,
            code: "th_shipping_missing",
            reason: `ค่าส่งในไทยยังเป็น ฿0 · ระบบคิดให้อัตโนมัติไม่ได้ เพราะ ${diag.reason}`,
            nextAction: diag.nextAction,
          };
          result.failed++;
          result.failures.push(f);
          result.errors.push(failureLine(f));
          continue;
        }

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
          const f: BillFailure = {
            fid: row.id,
            code: "update_failed",
            reason: `บันทึกสถานะไม่สำเร็จ (${updErr.message})`,
            nextAction: "รีเฟรชหน้าแล้วลองใหม่ — ถ้ายังไม่ได้ แจ้งทีมเทคนิคพร้อมเลขรายการนี้",
          };
          result.failed++;
          result.failures.push(f);
          result.errors.push(failureLine(f));
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
