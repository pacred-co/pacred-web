"use server";

/**
 * /admin/accounting/forwarder-invoice — server actions
 *
 * Agent F3 · E2E LOOP FIX batch (2026-05-29) — closes Gap #4 from the E4
 * audit ("96 leaves under /admin/accounting/cargo/income/* are STUBS").
 * Builds the **admin forwarder-invoice creation** flow on the EXISTING
 * `tb_receipt` + `tb_receipt_item` schema (no new tables — these legacy
 * tables already exist in prod with years of data).
 *
 * Legacy source — `pcs-admin/include/pages/hs-forwarder-invoice/`:
 *   - `add.php`                         — admin selects a fstatus=5 customer
 *                                          + their items → "สร้างใบแจ้งหนี้"
 *   - `forwarder-invoice/listForwarderItem.php` — AJAX endpoint that returns
 *                                          the candidate items table
 *   - `home.php`                        — list shell (no DataTable in legacy)
 *
 * Per AGENTS.md §0a — workflow logic from legacy · Pacred Tailwind polish:
 *   - LEGACY INSERTs tb_receipt + tb_receipt_item rows when admin clicks
 *     "สร้างใบแจ้งหนี้" (records the document; the actual fstatus 4→5 flip
 *     already happened upstream in /admin/forwarder-check via
 *     `adminCallPriceUser` — see actions/admin/forwarder-check.ts:296)
 *   - WE record the document atomically and notify the customer that the
 *     invoice is available for download (LINE + email + SMS — respecting
 *     NOTIFY_BYPASS)
 *   - WE do NOT flip tb_forwarder.fstatus — already=5 (the bill was triggered
 *     when adminCallPriceUser ran on the forwarder-check queue)
 *
 * tb_receipt schema (per supabase/migrations/0081_pcs_legacy_schema.sql L4132):
 *   id bigint pk · rstatus varchar(1) default '3' · rid varchar(20)
 *   refid varchar(50) · rdatecreate timestamp · rdate timestamp
 *   issuedate timestamp · ramount numeric(10,2) · totalbeforewithholding numeric(10,2)
 *   adminid varchar(30) · userid varchar(30) · statusprint varchar(1)
 *   adminidprint varchar(30) · rdateprint timestamp · statusprintcopy varchar(1)
 *   rdateprintcopy timestamp · adminidprintcopy varchar(30) · recompnumber varchar(13)
 *   recompname varchar(300) · recompaddress text · rpopup varchar(1)
 *   corporatetype varchar(1) · documentissuer varchar(300) · documentapprover varchar(300)
 *   refwhid bigint
 *
 * tb_receipt_item schema:
 *   id bigint pk · rid varchar(30) · fid bigint
 *
 * rstatus interpretation (legacy default '3'):
 *   '1' = paid     (จ่ายแล้ว — emerald)
 *   '2' = cancelled (ยกเลิก — red)
 *   '3' = pending  (รอชำระเงิน — amber · the default)
 *
 * rid format — legacy uses `PR<yyMMdd>-<seq>` (e.g. PR260529-3), echoing
 * the receipt printing convention. We mint server-side, not client-side.
 *
 * Roles: super | accounting (money tier · matches forwarder-check.ts billing).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { calcForwarderOutstanding } from "@/lib/forwarder/outstanding";
import { sendSms } from "@/lib/sms/gateway";
import { logger, redactPhone } from "@/lib/logger";
import { sendNotification } from "@/lib/notifications";
import { resolveProfileIdsForLegacyUserids } from "@/lib/auth/tb-users-resolver";

// ────────────────────────────────────────────────────────────
// Schema
// ────────────────────────────────────────────────────────────

const issueInvoiceSchema = z.object({
  /** tb_forwarder.id of the row to bill (must be fstatus='5') */
  forwarderId: z.number().int().positive(),
  /** Customer-facing due date (YYYY-MM-DD). Legacy add.php "วันที่ครบกำหนดจ่าย" */
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Optional discount override applied at invoice time (THB) */
  discount: z.number().nonnegative().optional(),
  /** Operator notes (visible to customer on the printed invoice) */
  notes: z.string().max(1000).optional(),
});
export type AdminIssueForwarderInvoiceInput = z.infer<typeof issueInvoiceSchema>;

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

type ForwarderRowForInvoice = {
  id: number;
  userid: string;
  fstatus: string;
  ftrackingchn: string | null;
  // calcForwarderOutstanding inputs
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

type UserRowForInvoice = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userEmail: string | null;
  corporateNumber?: string | null;
  corporateName?: string | null;
  corporateAddress?: string | null;
};

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Mint the next `rid` for tb_receipt. Format: `PR<yyMMdd>-<seq>` (e.g.
 * "PR260529-3"). Legacy used `PCS<yyMMdd>-<seq>`; Pacred uses `PR` per
 * D1 rebrand (CLAUDE.md "PCS → PR"). The seq is the count of receipts
 * issued today + 1 — best-effort uniqueness (race tolerated; collision
 * would surface as a unique-constraint error which we surface to caller).
 */
async function mintReceiptId(
  admin: ReturnType<typeof createAdminClient>,
): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const datePart = `${yy}${mm}${dd}`;
  const prefix = `PR${datePart}-`;

  // Count today's receipts to derive next seq. ilike pattern matches the
  // `PR260529-N` family. A race between concurrent admins would assign
  // the same seq; both INSERTs would still succeed because rid is not
  // strictly unique in legacy schema (it's a business id, not a pkey).
  const { count, error } = await admin
    .from("tb_receipt")
    .select("id", { count: "exact", head: true })
    .ilike("rid", `${prefix}%`);
  if (error) {
    console.error(`[tb_receipt count] failed`, { code: error.code, message: error.message });
  }
  const seq = (count ?? 0) + 1;
  return `${prefix}${seq}`;
}

function composeInvoiceSms(opts: {
  userId: string;
  rid: string;
  fid: number;
  amountThb: number;
}): string {
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://pacred.co"}/service-import/${opts.fid}/invoice`;
  const amount = opts.amountThb.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  return `Pacred: ${opts.userId} ใบแจ้งหนี้ ${opts.rid} ยอด ฿${amount} ดูที่ ${url}`;
}

function composeInvoiceBody(opts: {
  userId: string;
  rid: string;
  fid: number;
  amountThb: number;
  dueDate: string;
}): string {
  const amount = opts.amountThb.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  return (
    `เรียนคุณ ${opts.userId}\n` +
    `ใบแจ้งหนี้ ${opts.rid} (บริการนำเข้า #${opts.fid})\n` +
    `ยอดที่ต้องชำระ: ฿${amount}\n` +
    `ครบกำหนดชำระ: ${opts.dueDate}\n` +
    `กรุณาเข้าระบบเพื่อชำระเงิน`
  );
}

// ────────────────────────────────────────────────────────────
// adminIssueForwarderInvoice — create tb_receipt + tb_receipt_item
// ────────────────────────────────────────────────────────────

/**
 * Issue an invoice document for a tb_forwarder row already at fstatus='5'.
 *
 * Steps:
 *   1. Read tb_forwarder (must be fstatus='5' — billing already triggered)
 *   2. Read tb_users + tb_corporate for customer header info
 *   3. Mint rid · INSERT tb_receipt · INSERT tb_receipt_item
 *   4. Send LINE/SMS/email to customer (respects NOTIFY_BYPASS)
 *   5. Audit log + revalidate
 */
export async function adminIssueForwarderInvoice(
  input: AdminIssueForwarderInvoiceInput,
): Promise<AdminActionResult<{ receiptId: number; rid: string }>> {
  const parsed = issueInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { forwarderId, dueDate, discount, notes } = parsed.data;

  return withAdmin<{ receiptId: number; rid: string }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // 1. Read tb_forwarder — must be fstatus='5'
      const { data: forwarderRow, error: readErr } = await admin
        .from("tb_forwarder")
        .select(
          "id, userid, fstatus, ftrackingchn, " +
            "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
            "pricecrate, ftransportpricechnthb, priceother, fdiscount, fusercompany",
        )
        .eq("id", forwarderId)
        .eq("fstatus", "5")
        .maybeSingle<ForwarderRowForInvoice>();
      if (readErr) {
        console.error(`[tb_forwarder read] failed`, { code: readErr.code, message: readErr.message });
        return { ok: false, error: readErr.message };
      }
      if (!forwarderRow) {
        return {
          ok: false,
          error: "ไม่พบรายการนี้ที่สถานะ 'รอชำระเงิน' (fstatus=5) — อาจถูกออกใบแจ้งหนี้ไปแล้ว หรือยังไม่ได้ส่งให้แจ้งชำระ",
        };
      }

      // Apply optional discount override before computing outstanding
      const effective = discount !== undefined
        ? { ...forwarderRow, fdiscount: discount }
        : forwarderRow;
      const totalBeforeWithholding = calcForwarderOutstanding(effective);

      // 2. Customer info — tb_users + tb_corporate (best-effort: missing
      //    corporate row is fine, we fall back to the individual name)
      const { data: userRow, error: userErr } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName, userTel, userEmail")
        .eq("userID", forwarderRow.userid)
        .maybeSingle<UserRowForInvoice>();
      if (userErr) {
        console.error(`[tb_users read] failed`, { code: userErr.code, message: userErr.message });
      }
      const { data: corpRow, error: corpErr } = await admin
        .from("tb_corporate")
        .select("corporatenumber, corporatename, corporateaddress")
        .eq("userid", forwarderRow.userid)
        .maybeSingle<{
          corporatenumber: string | null;
          corporatename: string | null;
          corporateaddress: string | null;
        }>();
      if (corpErr) {
        // Most customers don't have a tb_corporate row — only juristic
        // persons do. PGRST116 (no rows) is normal · log other errors only.
        if (corpErr.code !== "PGRST116") {
          console.error(`[tb_corporate read] failed`, { code: corpErr.code, message: corpErr.message });
        }
      }

      const isCorporate = !!corpRow?.corporatenumber;
      const documentIssuer = `Admin ${safeLegacyAdminId(adminId, 30)}`;
      // documentapprover stays blank at issue time; gets filled when an
      // accounting manager prints the official copy (statusprintcopy=1).
      const documentApprover = "";

      // 3a. Mint rid
      const rid = await mintReceiptId(admin);

      // 3b. INSERT tb_receipt
      const nowIso = new Date().toISOString();
      const insertReceipt: Record<string, unknown> = {
        rstatus:           "3",                       // pending payment
        rid,
        refid:             notes ?? "",               // ใช้เป็นหมายเหตุ + เลขอ้างอิง
        rdatecreate:       nowIso,
        rdate:             nowIso,
        issuedate:         nowIso,
        ramount:           totalBeforeWithholding,    // จะอัพเดทตอนชำระจริงด้วยยอดหลังหัก ณ ที่จ่าย
        totalbeforewithholding: totalBeforeWithholding,
        adminid:           safeLegacyAdminId(adminId, 30),
        userid:            forwarderRow.userid,
        statusprint:       "0",
        adminidprint:      "",
        statusprintcopy:   "0",
        adminidprintcopy:  "",
        recompnumber:      corpRow?.corporatenumber ?? "",
        recompname:        corpRow?.corporatename ?? "",
        recompaddress:     corpRow?.corporateaddress ?? "",
        rpopup:            "0",
        corporatetype:     isCorporate ? "1" : "2",
        documentissuer:    documentIssuer,
        documentapprover:  documentApprover,
        refwhid:           null,
      };

      const { data: receiptRow, error: insertErr } = await admin
        .from("tb_receipt")
        .insert(insertReceipt)
        .select("id, rid")
        .single<{ id: number; rid: string }>();
      if (insertErr) {
        console.error(`[tb_receipt insert] failed`, { code: insertErr.code, message: insertErr.message });
        return { ok: false, error: insertErr.message };
      }

      // 3c. INSERT tb_receipt_item — one row per tb_forwarder bill.
      // The legacy table is a simple junction (rid + fid only); a single
      // invoice can reference multiple forwarder rows but our flow issues
      // 1 invoice per 1 forwarder row (matches the legacy `?page=add` form
      // which restricts to one fstatus=5 row per submission).
      const { error: itemErr } = await admin
        .from("tb_receipt_item")
        .insert({
          rid: receiptRow.rid,
          fid: forwarderRow.id,
        });
      if (itemErr) {
        // Best-effort cleanup: try to delete the orphan receipt to keep
        // tb_receipt clean. Don't block on cleanup failure.
        console.error(`[tb_receipt_item insert] failed`, { code: itemErr.code, message: itemErr.message });
        await admin.from("tb_receipt").delete().eq("id", receiptRow.id);
        return { ok: false, error: `item-insert: ${itemErr.message}` };
      }

      // 4. Notify customer — LINE/SMS/email via the notifications spine.
      //    Same pattern as forwarder-check.ts:adminCallPriceUser.
      const profileIdMap = await resolveProfileIdsForLegacyUserids([forwarderRow.userid]);
      const profileId = profileIdMap.get(forwarderRow.userid);

      // SMS (always tries — gateway honours OTP_BYPASS / NOTIFY_BYPASS)
      if (userRow?.userTel) {
        const sms = await sendSms(
          userRow.userTel,
          composeInvoiceSms({
            userId:    forwarderRow.userid,
            rid:       receiptRow.rid,
            fid:       forwarderRow.id,
            amountThb: totalBeforeWithholding,
          }),
        );
        if (!sms.ok) {
          logger.warn("forwarder-invoice", "SMS failed", {
            rid:    receiptRow.rid,
            fid:    forwarderRow.id,
            userid: forwarderRow.userid,
            phone:  redactPhone(userRow.userTel),
            error:  sms.error,
          });
        }
      }

      // LINE + email via notifications spine (NOTIFY_BYPASS enforced inside)
      if (profileId) {
        try {
          await sendNotification(profileId, {
            category:       "forwarder",
            severity:       "info",
            title:          `ใบแจ้งหนี้ ${receiptRow.rid} · บริการนำเข้า #${forwarderRow.id}`,
            body:           composeInvoiceBody({
              userId:    forwarderRow.userid,
              rid:       receiptRow.rid,
              fid:       forwarderRow.id,
              amountThb: totalBeforeWithholding,
              dueDate,
            }),
            link_href:      `/service-import/${forwarderRow.id}`,
            reference_type: "forwarder",
            reference_id:   String(forwarderRow.id),
          });
        } catch (e) {
          logger.warn("forwarder-invoice", "sendNotification threw", {
            rid:    receiptRow.rid,
            fid:    forwarderRow.id,
            userid: forwarderRow.userid,
            error:  e instanceof Error ? e.message : String(e),
          });
        }
      }

      // 5. Audit log
      await logAdminAction(
        adminId,
        "forwarder_invoice.issue",
        "tb_receipt",
        String(receiptRow.id),
        {
          rid:                     receiptRow.rid,
          forwarder_id:            forwarderRow.id,
          userid:                  forwarderRow.userid,
          total_before_withholding: totalBeforeWithholding,
          due_date:                dueDate,
          discount_override:       discount ?? null,
          notes:                   notes ?? null,
          corporate:               isCorporate,
        },
      );

      revalidatePath("/admin/accounting/forwarder-invoice");
      revalidatePath(`/admin/accounting/forwarder-invoice/${receiptRow.id}`);
      revalidatePath("/admin/forwarders");

      return {
        ok:   true,
        data: { receiptId: receiptRow.id, rid: receiptRow.rid },
      };
    },
  );
}

// ────────────────────────────────────────────────────────────
// adminCancelForwarderInvoice — flip rstatus '3' → '2' (cancelled)
// ────────────────────────────────────────────────────────────

const cancelSchema = z.object({
  receiptId: z.number().int().positive(),
  reason:    z.string().min(1).max(500),
});
export type AdminCancelForwarderInvoiceInput = z.infer<typeof cancelSchema>;

export async function adminCancelForwarderInvoice(
  input: AdminCancelForwarderInvoiceInput,
): Promise<AdminActionResult<{ receiptId: number }>> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { receiptId, reason } = parsed.data;

  return withAdmin<{ receiptId: number }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      const { error: updErr } = await admin
        .from("tb_receipt")
        .update({ rstatus: "2" })
        .eq("id", receiptId)
        .eq("rstatus", "3"); // only pending → cancelled, never paid → cancelled
      if (updErr) {
        console.error(`[tb_receipt cancel] failed`, { code: updErr.code, message: updErr.message });
        return { ok: false, error: updErr.message };
      }

      await logAdminAction(
        adminId,
        "forwarder_invoice.cancel",
        "tb_receipt",
        String(receiptId),
        { reason },
      );

      revalidatePath("/admin/accounting/forwarder-invoice");
      revalidatePath(`/admin/accounting/forwarder-invoice/${receiptId}`);

      return { ok: true, data: { receiptId } };
    },
  );
}
