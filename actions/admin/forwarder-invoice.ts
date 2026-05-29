"use server";

/**
 * /admin/accounting/forwarder-invoice — server actions
 *
 * ── HISTORY ───────────────────────────────────────────────────────
 *
 * Wave 28 F3 (2026-05-29) — built the MANUAL-issue path treating it as
 * "ใบแจ้งหนี้" with a single-fid radio + Pacred's own `PR<yyMMdd>-N` doc
 * number. ภูม later flagged this was wrong: legacy never wired ใบแจ้งหนี้
 * end-to-end; the actual money lane is the 2-click receipt flow.
 *
 * Wave 29 P0 #206+#208 (2026-05-30) — PIVOTED to the legacy-faithful
 * receipt-flow model per `docs/research/legacy-accounting-billing-workflow.md`:
 *
 *   1. AUTO PATH — `lib/admin/auto-issue-receipt.ts` fires from
 *      `actions/admin/wallet-trans.ts:adminApproveWalletHs` and
 *      `actions/admin/tb-bulk.ts:adminBulkApproveWalletHs` the moment a
 *      forwarder payment lands (matches legacy `grenrateReceiptF`).
 *
 *   2. MANUAL OVERRIDE PATH — this file. Used when auto failed, or when
 *      accounting needs to consolidate multiple paid forwarder rows for
 *      the same customer onto ONE receipt manually. Multi-row checkbox
 *      submit · one `tb_receipt` + N × `tb_receipt_item`.
 *
 * ── Legacy reference ──────────────────────────────────────────────
 *   pcs-admin/include/pages/hs-forwarder-invoice/add.php
 *   pcs-admin/include/pages/hs-forwarder-invoice/forwarder-invoice/listForwarderItem.php
 *   pcs-admin/include/functions.php :: grenrateReceiptF (the doc-number rules)
 *
 * Key changes from Wave 28 → Wave 29:
 *   - Input shape: `forwarderId: number` → `fids: number[]` (≥ 1)
 *   - All fids must share the same userid (re-verified server-side)
 *   - All fids must be fstatus='5' (รอชำระเงิน)
 *   - Doc-number minter swapped: `mintReceiptId` (Pacred PR-format) →
 *     `mintReceiptDocNo` (`lib/admin/mint-receipt-doc-no.ts`, legacy FRC/FRG)
 *   - WHT 1% deduction logic ported from `grenrateReceiptF` L557-559
 *   - Single tb_receipt INSERT · batch tb_receipt_item INSERTs (was 1-1)
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
 * Manual-issue rid format: `FRC<yyMM>-<00001>` (juristic) or
 * `FRG<yyMM>-<00001>` (individual). Sequence keyed off `issuedate`
 * yyMM partition + per-corporate-type. Minted via `mintReceiptDocNo`
 * (main thread provides at `lib/admin/mint-receipt-doc-no.ts`).
 *
 * Roles: super | accounting (money tier · matches forwarder-check.ts billing).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { mintReceiptDocNo } from "@/lib/admin/mint-receipt-doc-no";
import { sendSms } from "@/lib/sms/gateway";
import { logger, redactPhone } from "@/lib/logger";
import { sendNotification } from "@/lib/notifications";
import { resolveProfileIdsForLegacyUserids } from "@/lib/auth/tb-users-resolver";

// ────────────────────────────────────────────────────────────
// Schema — multi-row batch input
// ────────────────────────────────────────────────────────────

const issueInvoiceSchema = z.object({
  /**
   * The tb_forwarder.id rows the receipt should cover. All must belong
   * to the same userid · all must be fstatus='5'. Min 1, max 50 — the
   * upper bound matches the legacy DataTables checkbox plugin's default
   * page size + adds a safety cap.
   */
  fids: z.array(z.number().int().positive()).min(1).max(50),
  /** Customer-facing issue date (YYYY-MM-DD). Legacy "วันที่ออกเอกสาร". */
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Customer-facing due date (YYYY-MM-DD). Legacy "วันที่ครบกำหนดจ่าย". */
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Operator notes (visible to customer on the printed receipt) */
  notes: z.string().max(1000).optional(),
});
export type AdminIssueForwarderInvoiceInput = z.infer<typeof issueInvoiceSchema>;

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

type ForwarderRowForReceipt = {
  id: number;
  userid: string;
  fstatus: string;
  ftrackingchn: string | null;
  // For per-row totals (matches grenrateReceiptF L548)
  ftotalprice: number | string | null;
  ftransportprice: number | string | null;
  fpriceupdate: number | string | null;
  fshippingservice: number | string | null;
  pricecrate: number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother: number | string | null;
  fdiscount: number | string | null;
};

type UserRowForReceipt = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userEmail: string | null;
};

type CorpRowForReceipt = {
  corporatenumber: string | null;
  corporatename: string | null;
  corporateaddress: string | null;
};

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Per-row raw price (pre-WHT) — same bucket list as legacy
 * `grenrateReceiptF` L548 + `calPriceForwarderMain` L1878.
 */
function perRowRaw(r: ForwarderRowForReceipt): number {
  return (
    toNumber(r.ftotalprice) +
    toNumber(r.ftransportprice) +
    toNumber(r.fpriceupdate) +
    toNumber(r.fshippingservice) +
    toNumber(r.pricecrate) +
    toNumber(r.ftransportpricechnthb) +
    toNumber(r.priceother) -
    toNumber(r.fdiscount)
  );
}

function composeReceiptSms(opts: {
  userId: string;
  rid: string;
  fid: number;          // representative fid for the URL
  amountThb: number;
}): string {
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://pacred.co"}/service-import/${opts.fid}/invoice`;
  const amount = opts.amountThb.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  return `Pacred: ${opts.userId} ใบเสร็จ ${opts.rid} ยอด ฿${amount} ดูที่ ${url}`;
}

function composeReceiptBody(opts: {
  userId: string;
  rid: string;
  fids: number[];
  amountThb: number;
  dueDate: string;
}): string {
  const amount = opts.amountThb.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  const orderList = opts.fids.length === 1
    ? `บริการนำเข้า #${opts.fids[0]}`
    : `บริการนำเข้า ${opts.fids.length} รายการ (#${opts.fids.slice(0, 3).join(", #")}${opts.fids.length > 3 ? "..." : ""})`;
  return (
    `เรียนคุณ ${opts.userId}\n` +
    `ใบเสร็จรับเงิน ${opts.rid}\n` +
    `${orderList}\n` +
    `ยอดที่ต้องชำระ: ฿${amount}\n` +
    `ครบกำหนดชำระ: ${opts.dueDate}\n` +
    `กรุณาเข้าระบบเพื่อชำระเงิน`
  );
}

// ────────────────────────────────────────────────────────────
// adminIssueForwarderInvoice — MANUAL OVERRIDE batch path
// ────────────────────────────────────────────────────────────

/**
 * Issue ONE receipt for N tb_forwarder rows (all fstatus='5', same userid).
 *
 * This is the MANUAL OVERRIDE — used when auto-receipt failed, or
 * accounting needs to consolidate multiple paid forwarder rows for the
 * same customer onto a single tb_receipt.
 *
 * Steps:
 *   1. Re-read all fids, verify same userid + fstatus='5' + not already
 *      on a receipt
 *   2. Determine corporate (1=juristic / 2=individual) from tb_corporate
 *   3. Compute totals — pre-WHT (totalbeforewithholding) + post-juristic-1%
 *      (rAmount); WHT applies only if corporate=1 AND total ≥ 1000
 *   4. Mint rid via `mintReceiptDocNo` (FRC/FRG yyMM-NNNNN)
 *   5. INSERT tb_receipt · batch INSERT N × tb_receipt_item
 *   6. Notify customer (SMS + LINE + email · best-effort)
 *   7. Audit log + revalidate paths
 */
export async function adminIssueForwarderInvoice(
  input: AdminIssueForwarderInvoiceInput,
): Promise<AdminActionResult<{ receiptId: number; rid: string; rAmount: number; totalBeforeWithholding: number }>> {
  const parsed = issueInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { fids: rawFids, issueDate, dueDate, notes } = parsed.data;
  const fids = Array.from(new Set(rawFids)); // dedup

  return withAdmin<{ receiptId: number; rid: string; rAmount: number; totalBeforeWithholding: number }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // 1a. Read tb_forwarder rows — all must be fstatus='5'.
      const { data: fwRows, error: readErr } = await admin
        .from("tb_forwarder")
        .select(
          "id, userid, fstatus, ftrackingchn, " +
            "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
            "pricecrate, ftransportpricechnthb, priceother, fdiscount",
        )
        .in("id", fids)
        .eq("fstatus", "5");
      if (readErr) {
        console.error(`[tb_forwarder read] failed`, { code: readErr.code, message: readErr.message });
        return { ok: false, error: readErr.message };
      }
      const rows = ((fwRows ?? []) as unknown as ForwarderRowForReceipt[]);
      if (rows.length === 0) {
        return {
          ok: false,
          error: "ไม่พบรายการที่สถานะ 'รอชำระเงิน' (fstatus=5) — อาจถูกออกใบเสร็จไปแล้ว หรือยังไม่ได้แจ้งชำระ",
        };
      }
      if (rows.length !== fids.length) {
        return {
          ok: false,
          error: `เลือก ${fids.length} รายการ พบเพียง ${rows.length} รายการที่พร้อมออกใบเสร็จ (อาจมีบางรายการถูกเปลี่ยนสถานะแล้ว)`,
        };
      }

      // 1b. All fids must share the same userid.
      const userIds = Array.from(new Set(rows.map((r) => r.userid)));
      if (userIds.length !== 1) {
        return {
          ok: false,
          error: "เลือกรายการต้องมาจากลูกค้ารายเดียวกัน — พบมากกว่า 1 รหัสสมาชิก",
        };
      }
      const userid = userIds[0]!;

      // 1c. Idempotency — none of the fids may already be on a tb_receipt.
      const { data: existing, error: existingErr } = await admin
        .from("tb_receipt_item")
        .select("fid, rid")
        .in("fid", fids);
      if (existingErr) {
        console.error(`[tb_receipt_item check] failed`, { code: existingErr.code, message: existingErr.message });
        return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
      }
      if ((existing ?? []).length > 0) {
        const blocked = ((existing ?? []) as Array<{ fid: number; rid: string }>);
        const sample = blocked.slice(0, 3).map((b) => `#${b.fid}(${b.rid})`).join(", ");
        return {
          ok: false,
          error: `มี ${blocked.length} รายการถูกออกใบเสร็จไปแล้ว: ${sample}${blocked.length > 3 ? "..." : ""}`,
        };
      }

      // 2. Customer info — tb_users + tb_corporate.
      const { data: userRow, error: userErr } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName, userTel, userEmail")
        .eq("userID", userid)
        .maybeSingle<UserRowForReceipt>();
      if (userErr) {
        console.error(`[tb_users read] failed`, { code: userErr.code, message: userErr.message });
      }
      const { data: corpRow, error: corpErr } = await admin
        .from("tb_corporate")
        .select("corporatenumber, corporatename, corporateaddress")
        .eq("userid", userid)
        .maybeSingle<CorpRowForReceipt>();
      if (corpErr && corpErr.code !== "PGRST116") {
        console.error(`[tb_corporate read] failed`, { code: corpErr.code, message: corpErr.message });
      }
      const corporate: 1 | 2 = corpRow?.corporatenumber ? 1 : 2;

      // 3. Totals — sum per-row raw + apply juristic 1% if eligible
      //    (legacy `grenrateReceiptF` L548-559).
      const pricePayAll = rows.reduce((s, r) => s + perRowRaw(r), 0);
      const totalBeforeWithholding = Math.round(pricePayAll * 100) / 100;
      const applyJuristic1Pct = corporate === 1 && pricePayAll >= 1000;
      const rAmount = applyJuristic1Pct
        ? Math.round(pricePayAll * 0.99 * 100) / 100
        : totalBeforeWithholding;

      // 4. Mint the rid — main thread provides this minter.
      const issueDateObj = new Date(`${issueDate}T00:00:00`);
      if (Number.isNaN(issueDateObj.getTime())) {
        return { ok: false, error: "วันที่ออกเอกสารไม่ถูกต้อง" };
      }
      let rid: string;
      try {
        rid = await mintReceiptDocNo(admin, { corporate, dateSlip: issueDateObj });
      } catch (e) {
        console.error(`[mintReceiptDocNo] threw`, {
          error: e instanceof Error ? e.message : String(e),
          userid, corporate,
        });
        return { ok: false, error: `mint_failed: ${e instanceof Error ? e.message : "unknown"}` };
      }

      // 5a. INSERT tb_receipt — single header row.
      const nowIso = new Date().toISOString();
      const issueIso = issueDateObj.toISOString();
      const insertReceipt: Record<string, unknown> = {
        rstatus:                "3",                           // pending payment (manual override default)
        rid,
        refid:                  notes ?? "",                   // หมายเหตุ
        rdatecreate:            nowIso,
        rdate:                  issueIso,
        issuedate:              issueIso,
        ramount:                rAmount,                       // post-juristic-1%
        totalbeforewithholding: totalBeforeWithholding,        // pre-WHT
        adminid:                safeLegacyAdminId(adminId, 30),
        userid,
        statusprint:            "0",
        adminidprint:           "",
        statusprintcopy:        "0",
        adminidprintcopy:       "",
        recompnumber:           corpRow?.corporatenumber ?? "",
        recompname:             corpRow?.corporatename
                                  ?? `${userRow?.userName ?? ""} ${userRow?.userLastName ?? ""}`.trim(),
        recompaddress:          corpRow?.corporateaddress ?? "",
        rpopup:                 "0",
        corporatetype:          String(corporate),
        documentissuer:         `Admin ${safeLegacyAdminId(adminId, 30)} (manual)`,
        documentapprover:       "",
        refwhid:                null,
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

      // 5b. Batch INSERT N × tb_receipt_item — one row per fid (matches
      //     legacy `INSERT INTO tb_receipt_item VALUES (rid,fid),(rid,fid),...`
      //     L568-569).
      const itemRows = rows.map((r) => ({ rid: receiptRow.rid, fid: r.id }));
      const { error: itemErr } = await admin
        .from("tb_receipt_item")
        .insert(itemRows);
      if (itemErr) {
        // Best-effort cleanup — delete the orphan receipt header.
        console.error(`[tb_receipt_item batch insert] failed`, {
          code: itemErr.code, message: itemErr.message, rid: receiptRow.rid,
        });
        await admin.from("tb_receipt").delete().eq("id", receiptRow.id);
        return { ok: false, error: `item-insert: ${itemErr.message}` };
      }

      // 6. Notify customer — LINE/SMS/email via the notifications spine.
      const profileIdMap = await resolveProfileIdsForLegacyUserids([userid]);
      const profileId = profileIdMap.get(userid);

      // SMS (always tries — gateway honours OTP_BYPASS / NOTIFY_BYPASS)
      if (userRow?.userTel) {
        const sms = await sendSms(
          userRow.userTel,
          composeReceiptSms({
            userId:    userid,
            rid:       receiptRow.rid,
            fid:       rows[0]!.id,
            amountThb: rAmount,
          }),
        );
        if (!sms.ok) {
          logger.warn("forwarder-invoice", "SMS failed", {
            rid:    receiptRow.rid,
            userid,
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
            title:          `ใบเสร็จรับเงิน ${receiptRow.rid}`,
            body:           composeReceiptBody({
              userId:    userid,
              rid:       receiptRow.rid,
              fids:      rows.map((r) => r.id),
              amountThb: rAmount,
              dueDate,
            }),
            link_href:      `/service-import/${rows[0]!.id}/invoice`,
            reference_type: "forwarder",
            reference_id:   String(rows[0]!.id),
          });
        } catch (e) {
          logger.warn("forwarder-invoice", "sendNotification threw", {
            rid:    receiptRow.rid,
            userid,
            error:  e instanceof Error ? e.message : String(e),
          });
        }
      }

      // 7. Audit log + revalidate.
      await logAdminAction(
        adminId,
        "forwarder_invoice.manual_issue",
        "tb_receipt",
        String(receiptRow.id),
        {
          rid:                      receiptRow.rid,
          fids:                     rows.map((r) => r.id),
          userid,
          total_before_withholding: totalBeforeWithholding,
          r_amount:                 rAmount,
          applied_juristic_1pct:    applyJuristic1Pct,
          corporate,
          issue_date:               issueDate,
          due_date:                 dueDate,
          notes:                    notes ?? null,
          source:                   "manual_override",
        },
      );

      revalidatePath("/admin/accounting/forwarder-invoice");
      revalidatePath(`/admin/accounting/forwarder-invoice/${receiptRow.id}`);
      revalidatePath("/admin/forwarders");
      for (const r of rows) {
        revalidatePath(`/service-import/${r.id}/invoice`);
      }

      return {
        ok:   true,
        data: {
          receiptId:              receiptRow.id,
          rid:                    receiptRow.rid,
          rAmount,
          totalBeforeWithholding,
        },
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

// ────────────────────────────────────────────────────────────
// adminMarkReceiptPrinted — flip statusprint=1 + stamp adminidprint + rdateprint
// ────────────────────────────────────────────────────────────

/**
 * Mark a receipt as printed. Mirrors legacy `printReceipt.php:65-66`:
 *   UPDATE tb_receipt SET statusprint='1', adminidprint='<adminId>',
 *                         rdateprint=NOW() WHERE rID='<rid>'
 *
 * Called from the print page client component on print-button click —
 * BEFORE window.print() — so the audit trail reflects who triggered the
 * print. Idempotent: re-pressing print re-stamps adminidprint + rdateprint
 * but doesn't error.
 */
const markPrintedSchema = z.object({
  receiptId: z.number().int().positive(),
});
export type AdminMarkReceiptPrintedInput = z.infer<typeof markPrintedSchema>;

export async function adminMarkReceiptPrinted(
  input: AdminMarkReceiptPrintedInput,
): Promise<AdminActionResult<{ receiptId: number }>> {
  const parsed = markPrintedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { receiptId } = parsed.data;

  return withAdmin<{ receiptId: number }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const nowIso = new Date().toISOString();

      const { error: updErr } = await admin
        .from("tb_receipt")
        .update({
          statusprint:  "1",
          adminidprint: safeLegacyAdminId(adminId, 30),
          rdateprint:   nowIso,
        })
        .eq("id", receiptId);
      if (updErr) {
        console.error(`[tb_receipt mark printed] failed`, { code: updErr.code, message: updErr.message });
        return { ok: false, error: updErr.message };
      }

      await logAdminAction(
        adminId,
        "forwarder_invoice.print",
        "tb_receipt",
        String(receiptId),
        { ts: nowIso },
      );

      // No revalidate — we want the click to feel instant; the print page is
      // already rendered and the user is about to leave it via window.print().

      return { ok: true, data: { receiptId } };
    },
  );
}
