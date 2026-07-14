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
import { isBillableForwarder } from "@/lib/forwarder/billing-eligibility";
import { computeForwarderDebitBatch } from "@/lib/forwarder/forwarder-debit-total";

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
  // BUG B (2026-06-14) — credit-eligibility flags so a juristic+credit order
  // (fstatus 5/6 · fcredit='1' · paydeposit<>'1') can be put on a receipt.
  fcredit: string | null;
  paydeposit: string | null;
  ftrackingchn: string | null;
  // ค่าส่งเหมาๆ anchor — the carrier code (PCSF/PRF) + tracking + container decide the
  // once-per-DELIVERY เหมาๆ flat fee (computeForwarderDebitBatch · one container = one fee).
  fcabinetnumber: string | null;
  fshipby: string | null;
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
    // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles issue/manage
    // receipts (tb_receipt/_item only · no wallet/payment writes) per
    // `docs/research/ops-workflow-audit-2026-06-05.md` §28.
    ["super", "accounting", "freight_export_doc", "freight_import_doc"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // 1a. Read tb_forwarder rows by id, then gate in-memory on the BILLABLE
      // predicate (BUG B 2026-06-14): a row is eligible when it is รอชำระเงิน
      // (fstatus='5') OR a credit-unsettled order (fstatus 5/6 · fcredit='1' ·
      // paydeposit<>'1'). Dropping the SQL `.eq("fstatus","5")` lets credit
      // orders onto a receipt; we then drop any non-billable row explicitly.
      const { data: fwRows, error: readErr } = await admin
        .from("tb_forwarder")
        .select(
          "id, userid, fstatus, fcredit, paydeposit, ftrackingchn, fcabinetnumber, fshipby, " +
            "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
            "pricecrate, ftransportpricechnthb, priceother, fdiscount",
        )
        .in("id", fids);
      if (readErr) {
        console.error(`[tb_forwarder read] failed`, { code: readErr.code, message: readErr.message });
        return { ok: false, error: readErr.message };
      }
      const allRows = ((fwRows ?? []) as unknown as ForwarderRowForReceipt[]);
      const rows = allRows.filter((r) => isBillableForwarder(r));
      if (rows.length === 0) {
        return {
          ok: false,
          error: "ไม่พบรายการที่ออกใบเสร็จได้ (ต้องสถานะ 'รอชำระเงิน' fstatus=5 หรือเป็นออเดอร์เครดิตที่ยังไม่ชำระ) — อาจถูกออกใบเสร็จไปแล้ว หรือยังไม่ได้แจ้งชำระ",
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

      // 3. Totals — sum per-row raw (base buckets) + ค่าส่งเหมาๆ + apply
      //    juristic 1% if eligible (legacy `grenrateReceiptF` L548-559).
      const pricePayBase = rows.reduce((s, r) => s + perRowRaw(r), 0);

      // เหมาๆ (PCSF/PRF flat ฿100/shipment · ภูม 2026-06-23) — perRowRaw carries only
      // the base outstanding buckets (= calcForwarderOutstanding), which EXCLUDE the
      // เหมาๆ. The ใบวางบิล DOES add it (mao_fee_thb on tb_forwarder_invoice) → without
      // this the receipt ran ฿100 SHORT of its bill and dropped the "ค่าส่งเหมาๆ" line
      // (owner · PR7429 · FRG…). Pull JUST the maoFee from the SAME once-per-shipment
      // anchor engine the bill + the auto-issue path use, fold it into the total, and
      // store it separately (mao_fee_thb) so the receipt paper renders its own line and
      // the two docs reconcile to the satang.
      const maoBatch = computeForwarderDebitBatch(
        rows.map((r) => ({
          id: r.id, fshipby: r.fshipby, ftrackingchn: r.ftrackingchn, fcabinetnumber: r.fcabinetnumber,
          ftotalprice: r.ftotalprice, ftransportprice: r.ftransportprice,
          fpriceupdate: r.fpriceupdate, fshippingservice: r.fshippingservice,
          pricecrate: r.pricecrate, ftransportpricechnthb: r.ftransportpricechnthb,
          priceother: r.priceother, fdiscount: r.fdiscount,
        })),
        { userId: userid, isCorporate: corporate === 1 },
      );
      const maoFeeThb = Math.round(
        maoBatch.lines.reduce((s, l) => s + l.breakdown.maoFee, 0) * 100,
      ) / 100;
      const pricePayAll = pricePayBase + maoFeeThb;

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
        ramount:                rAmount,                       // post-juristic-1% (incl เหมาๆ)
        totalbeforewithholding: totalBeforeWithholding,        // pre-WHT (incl เหมาๆ)
        mao_fee_thb:            maoFeeThb,                      // ค่าส่งเหมาๆ — its own line · already part of the totals above
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
    // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles issue/manage
    // receipts (tb_receipt/_item only · no wallet/payment writes) per
    // `docs/research/ops-workflow-audit-2026-06-05.md` §28.
    ["super", "accounting", "freight_export_doc", "freight_import_doc"],
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
    // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles issue/manage
    // receipts (tb_receipt/_item only · no wallet/payment writes) per
    // `docs/research/ops-workflow-audit-2026-06-05.md` §28.
    ["super", "accounting", "freight_export_doc", "freight_import_doc"],
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

// ────────────────────────────────────────────────────────────
// adminBackfillReceiptItems — recovery for receipts with missing tb_receipt_item
// ────────────────────────────────────────────────────────────

/**
 * ภูม flag #1 (2026-06-02) — receipt FRG2605-00218-1 rendered with banner
 * "รายการพัสดุไม่พบใน tb_receipt_item" + Total = 0.00 because tb_receipt_item
 * had no rows for that rid. The receipt header (`totalbeforewithholding` +
 * `ramount`) was correct but the per-line items were missing.
 *
 * Possible root causes (all real, all need a recovery path):
 *   1. Legacy migration where `tb_receipt_item` rows weren't ported (the
 *      legacy `pcsc_main` HAD them, but the data-load did not include the
 *      child table) — the most likely cause for old-yyMM rids like 2503
 *      or PCS-era rids
 *   2. Wave 28 PR-format pollution + cleanup that touched parent rid but
 *      not child rid → orphan items deleted, parent stays
 *   3. Wave 29 manual-create flow batch-INSERT bug — verified clean now
 *      (auto + manual both delete the parent receipt header on item-insert
 *      failure, so this should not produce a parent-without-children state)
 *   4. Manual SQL clean-up by an admin that removed items without removing
 *      the receipt
 *
 * ── Recovery strategy ────────────────────────────────────────────
 *
 * Reconstruct the missing items from the source-of-truth payment trail.
 * The link between a receipt and its forwarder rows lives in
 * `tb_wallet_hs` — every approved payment-for-a-forwarder row records:
 *   - `userid`        = the customer
 *   - `typeservice`   = '2'  (forwarder payment)
 *   - `status`        = '2'  (approved)
 *   - `reforder`      = the tb_forwarder.id as a string
 *   - `dateslip`      = when the customer paid (= receipt.issuedate ± hours)
 *
 * Algorithm:
 *   1. Read tb_receipt by id → pin userid, issuedate, rid, totals
 *   2. If tb_receipt_item already has rows for this rid → return early
 *      (no backfill needed)
 *   3. Strategy A — wallet_hs trail (highest confidence):
 *      - Find tb_wallet_hs rows for this userid · typeservice='2' ·
 *        status='2' · dateslip BETWEEN issuedate − 7d AND issuedate + 7d
 *      - Extract numeric reforder values → candidate fids
 *      - Filter out any fid already on a DIFFERENT receipt (we never
 *        double-link)
 *      - Try exact-match: find the subset whose perRowRaw sum equals
 *        tb_receipt.totalbeforewithholding (±1 baht). If exactly one
 *        subset matches → insert items, done.
 *   4. Strategy B — fdatestatus5 fallback:
 *      - Find tb_forwarder rows for this userid where fdatestatus5
 *        (the "moved to fstatus=5 (รอชำระเงิน)" timestamp) is within
 *        a 14-day window around issuedate
 *      - Same filtering + matching as A
 *   5. If neither strategy converges → return `ambiguous` with the
 *      candidate fids so the admin can manually call adminLinkReceiptItems
 *      with their explicit pick. (We don't auto-guess on ambiguity —
 *      mis-linking is worse than missing-items because it falsely attests
 *      to a payment trail.)
 *
 * ── Safety guarantees ────────────────────────────────────────────
 *   - Idempotent — re-running on a receipt that already has items is a no-op
 *   - Never overwrites — only INSERTs into an empty join
 *   - Never double-links — a fid on receipt A will not be backfilled to receipt B
 *   - Audit-logged via admin_audit_log with full payload (chosen fids,
 *     strategy, candidates, totals)
 *
 * Roles: super | accounting (money tier · matches the rest of this file).
 */

const backfillReceiptItemsSchema = z.object({
  receiptId: z.number().int().positive(),
});
export type AdminBackfillReceiptItemsInput = z.infer<typeof backfillReceiptItemsSchema>;

export type AdminBackfillReceiptItemsCandidate = {
  fid:            number;
  perRowRaw:      number;
  ftrackingchn:   string | null;
  fcabinetnumber: string | null;
  fdatestatus5:   string | null;
  fstatus:        string;
};

export type AdminBackfillReceiptItemsData = {
  receiptId:      number;
  rid:            string;
  /** Reason for outcome — discriminator for the UI message. */
  status:         "already_has_items" | "filled" | "ambiguous" | "no_candidates";
  /** When `status='filled'` — the fids that were linked + the strategy used. */
  linkedFids?:    number[];
  strategy?:      "wallet_hs" | "fdatestatus5";
  itemsInserted?: number;
  /** When `status='ambiguous'` — candidate fids the admin can pick from. */
  candidates?:    AdminBackfillReceiptItemsCandidate[];
  expectedTotal?: number;
};

export type AdminBackfillReceiptItemsResult = AdminActionResult<AdminBackfillReceiptItemsData>;

type WalletHsRow = {
  id:           number;
  reforder:     string | null;
  dateslip:     string | null;
  status:       string | null;
  typeservice:  string | null;
};

type FwBackfillRow = ForwarderRowForReceipt & {
  fcabinetnumber: string | null;
  fdatestatus5:   string | null;
};

/**
 * Find every subset of `rows` whose perRowRaw sum equals `target` (±tolerance).
 * Brute-force across `rows` with pruning. Returns at most `maxSolutions` matches
 * — when more than 1 exists we treat as ambiguous and don't auto-pick.
 *
 * Complexity is 2^N; we cap N at 18 (262K subsets — sub-second on prod hardware).
 * Beyond 18 candidates we fall back to "ambiguous" without enumerating.
 */
function findExactSubsets(
  rows: Array<{ fid: number; raw: number }>,
  target: number,
  tolerance: number,
  maxSolutions: number,
): number[][] {
  if (rows.length > 18) return []; // too many — defer to admin pick
  const solutions: number[][] = [];
  const n = rows.length;
  // Skip 0-size subset (matches target=0 vacuously; never useful)
  for (let mask = 1; mask < (1 << n); mask++) {
    let sum = 0;
    const picked: number[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += rows[i]!.raw;
        picked.push(rows[i]!.fid);
      }
    }
    if (Math.abs(sum - target) <= tolerance) {
      solutions.push(picked);
      if (solutions.length >= maxSolutions) return solutions;
    }
  }
  return solutions;
}

export async function adminBackfillReceiptItems(
  input: AdminBackfillReceiptItemsInput,
): Promise<AdminBackfillReceiptItemsResult> {
  const parsed = backfillReceiptItemsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { receiptId } = parsed.data;

  return withAdmin<AdminBackfillReceiptItemsData>(
    // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles issue/manage
    // receipts (tb_receipt/_item only · no wallet/payment writes) per
    // `docs/research/ops-workflow-audit-2026-06-05.md` §28.
    ["super", "accounting", "freight_export_doc", "freight_import_doc"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // 1. Read receipt header — needed for userid, issuedate, totals.
      type ReceiptHdr = {
        id:                     number;
        rid:                    string;
        userid:                 string;
        issuedate:              string | null;
        rdate:                  string | null;
        rdatecreate:            string | null;
        totalbeforewithholding: number | string | null;
        ramount:                number | string | null;
        corporatetype:          string | null;
      };
      const { data: receiptData, error: rdErr } = await admin
        .from("tb_receipt")
        .select(
          "id, rid, userid, issuedate, rdate, rdatecreate, " +
            "totalbeforewithholding, ramount, corporatetype",
        )
        .eq("id", receiptId)
        .maybeSingle<ReceiptHdr>();
      if (rdErr) {
        console.error(`[backfill: tb_receipt read] failed`, {
          code: rdErr.code, message: rdErr.message, receiptId,
        });
        return { ok: false, error: `db_error:${rdErr.code ?? "unknown"}` };
      }
      if (!receiptData) {
        return { ok: false, error: "not_found: receipt does not exist" };
      }
      const receipt = receiptData;

      // 2. Already has items? — idempotent early return.
      const { data: existingItems, error: itErr } = await admin
        .from("tb_receipt_item")
        .select("id, fid")
        .eq("rid", receipt.rid);
      if (itErr) {
        console.error(`[backfill: tb_receipt_item check] failed`, {
          code: itErr.code, message: itErr.message, rid: receipt.rid,
        });
        return { ok: false, error: `db_error:${itErr.code ?? "unknown"}` };
      }
      if ((existingItems ?? []).length > 0) {
        return {
          ok:   true,
          data: {
            receiptId,
            rid:     receipt.rid,
            status:  "already_has_items",
            itemsInserted: 0,
          },
        };
      }

      // The "expected total" — what the receipt header attests to.
      const expectedTotal = Math.round(toNumber(receipt.totalbeforewithholding) * 100) / 100;
      // Window anchor — prefer issuedate, then rdate, then rdatecreate.
      const anchorIso = receipt.issuedate ?? receipt.rdate ?? receipt.rdatecreate;
      if (!anchorIso) {
        return { ok: false, error: "receipt_missing_dates" };
      }
      const anchor = new Date(anchorIso);
      if (Number.isNaN(anchor.getTime())) {
        return { ok: false, error: "receipt_dates_unparseable" };
      }

      // ── Build the "already-linked elsewhere" exclusion set ──
      // Pull all tb_receipt_item rows that mention any fid we might consider.
      // We'll union all candidate fids first, then exclude.
      //
      // Helper: query tb_forwarder by ids → expand to BackfillRow.
      async function loadForwarderRows(fids: number[]): Promise<FwBackfillRow[]> {
        if (fids.length === 0) return [];
        const { data, error } = await admin
          .from("tb_forwarder")
          .select(
            "id, userid, fstatus, ftrackingchn, fcabinetnumber, fdatestatus5, " +
              "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
              "pricecrate, ftransportpricechnthb, priceother, fdiscount",
          )
          .in("id", fids)
          .eq("userid", receipt.userid);
        if (error) {
          console.error(`[backfill: tb_forwarder load] failed`, {
            code: error.code, message: error.message, count: fids.length,
          });
          return [];
        }
        return ((data ?? []) as unknown as FwBackfillRow[]);
      }

      // Helper: filter out fids already attached to a DIFFERENT receipt rid.
      async function dropAlreadyLinked(fids: number[]): Promise<number[]> {
        if (fids.length === 0) return [];
        const { data, error } = await admin
          .from("tb_receipt_item")
          .select("fid, rid")
          .in("fid", fids);
        if (error) {
          console.error(`[backfill: tb_receipt_item exclusion check] failed`, {
            code: error.code, message: error.message,
          });
          return fids; // fail open — don't silently drop everything on a transient error
        }
        const linked = new Set<number>(
          ((data ?? []) as Array<{ fid: number; rid: string }>)
            .filter((r) => r.rid !== receipt.rid)
            .map((r) => r.fid),
        );
        return fids.filter((f) => !linked.has(f));
      }

      // ────────────────────────────────────────────────────────────
      // STRATEGY A — wallet_hs trail (highest confidence)
      // ────────────────────────────────────────────────────────────
      //
      // ±7-day window around issuedate · approved · typeservice='2'.
      const winAStart = new Date(anchor.getTime() - 7 * 86400_000).toISOString();
      const winAEnd   = new Date(anchor.getTime() + 7 * 86400_000).toISOString();
      const { data: whsRows, error: whsErr } = await admin
        .from("tb_wallet_hs")
        .select("id, reforder, dateslip, status, typeservice")
        .eq("userid",      receipt.userid)
        .eq("typeservice", "2")
        .eq("status",      "2")
        .gte("dateslip",   winAStart)
        .lte("dateslip",   winAEnd);
      if (whsErr) {
        console.error(`[backfill: tb_wallet_hs window read] failed`, {
          code: whsErr.code, message: whsErr.message, userid: receipt.userid,
        });
      }
      const whsFidsRaw: number[] = ((whsRows ?? []) as unknown as WalletHsRow[])
        .map((w) => Number(w.reforder))
        .filter((n) => Number.isFinite(n) && n > 0);
      const whsFids = Array.from(new Set(whsFidsRaw));
      const whsFidsAvail = await dropAlreadyLinked(whsFids);
      const whsRowsLoaded = await loadForwarderRows(whsFidsAvail);

      // 3a. Try exact-subset match on wallet_hs candidates.
      if (whsRowsLoaded.length > 0) {
        const indexed = whsRowsLoaded.map((r) => ({ fid: r.id, raw: perRowRaw(r) }));
        const subsets = findExactSubsets(indexed, expectedTotal, 1.0, 2);
        if (subsets.length === 1) {
          const chosen = subsets[0]!;
          const itemRows = chosen.map((fid) => ({ rid: receipt.rid, fid }));
          const { error: insErr } = await admin
            .from("tb_receipt_item")
            .insert(itemRows);
          if (insErr) {
            console.error(`[backfill: tb_receipt_item insert wallet_hs] failed`, {
              code: insErr.code, message: insErr.message, rid: receipt.rid,
            });
            return { ok: false, error: `insert_failed: ${insErr.message}` };
          }
          await logAdminAction(
            adminId,
            "forwarder_invoice.backfill_items",
            "tb_receipt",
            String(receiptId),
            {
              rid:           receipt.rid,
              strategy:      "wallet_hs",
              expectedTotal,
              linkedFids:    chosen,
              candidateCount: whsRowsLoaded.length,
            },
          );
          revalidatePath(`/admin/accounting/forwarder-invoice/${receiptId}`);
          revalidatePath("/admin/accounting/forwarder-invoice");
          return {
            ok:   true,
            data: {
              receiptId,
              rid:           receipt.rid,
              status:        "filled",
              strategy:      "wallet_hs",
              linkedFids:    chosen,
              itemsInserted: chosen.length,
            },
          };
        }
      }

      // ────────────────────────────────────────────────────────────
      // STRATEGY B — fdatestatus5 fallback
      // ────────────────────────────────────────────────────────────
      //
      // Wider 14-day window — useful when wallet_hs lost trace (e.g.
      // approve flow flipped fstatus but legacy didn't always write
      // wallet_hs reforder).
      const winBStart = new Date(anchor.getTime() - 14 * 86400_000).toISOString();
      const winBEnd   = new Date(anchor.getTime() + 14 * 86400_000).toISOString();
      const { data: fwWindow, error: fwWinErr } = await admin
        .from("tb_forwarder")
        .select(
          "id, userid, fstatus, ftrackingchn, fcabinetnumber, fdatestatus5, " +
            "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
            "pricecrate, ftransportpricechnthb, priceother, fdiscount",
        )
        .eq("userid",      receipt.userid)
        .gte("fdatestatus5", winBStart)
        .lte("fdatestatus5", winBEnd);
      if (fwWinErr) {
        console.error(`[backfill: tb_forwarder fdatestatus5 window] failed`, {
          code: fwWinErr.code, message: fwWinErr.message, userid: receipt.userid,
        });
      }
      const fwWinFids = ((fwWindow ?? []) as unknown as FwBackfillRow[]).map((r) => r.id);
      const fwWinAvail = await dropAlreadyLinked(fwWinFids);
      const fwWinRows = ((fwWindow ?? []) as unknown as FwBackfillRow[])
        .filter((r) => fwWinAvail.includes(r.id));

      if (fwWinRows.length > 0) {
        const indexed = fwWinRows.map((r) => ({ fid: r.id, raw: perRowRaw(r) }));
        const subsets = findExactSubsets(indexed, expectedTotal, 1.0, 2);
        if (subsets.length === 1) {
          const chosen = subsets[0]!;
          const itemRows = chosen.map((fid) => ({ rid: receipt.rid, fid }));
          const { error: insErr } = await admin
            .from("tb_receipt_item")
            .insert(itemRows);
          if (insErr) {
            console.error(`[backfill: tb_receipt_item insert fdatestatus5] failed`, {
              code: insErr.code, message: insErr.message, rid: receipt.rid,
            });
            return { ok: false, error: `insert_failed: ${insErr.message}` };
          }
          await logAdminAction(
            adminId,
            "forwarder_invoice.backfill_items",
            "tb_receipt",
            String(receiptId),
            {
              rid:           receipt.rid,
              strategy:      "fdatestatus5",
              expectedTotal,
              linkedFids:    chosen,
              candidateCount: fwWinRows.length,
            },
          );
          revalidatePath(`/admin/accounting/forwarder-invoice/${receiptId}`);
          revalidatePath("/admin/accounting/forwarder-invoice");
          return {
            ok:   true,
            data: {
              receiptId,
              rid:           receipt.rid,
              status:        "filled",
              strategy:      "fdatestatus5",
              linkedFids:    chosen,
              itemsInserted: chosen.length,
            },
          };
        }
      }

      // ────────────────────────────────────────────────────────────
      // NO EXACT MATCH → return candidates for admin pick
      // ────────────────────────────────────────────────────────────
      //
      // Combine both candidate pools (dedup) so the UI can show
      // everything plausible. If both pools are empty → no_candidates.
      const allCandidatesById = new Map<number, FwBackfillRow>();
      for (const r of whsRowsLoaded)  allCandidatesById.set(r.id, r);
      for (const r of fwWinRows)      allCandidatesById.set(r.id, r);
      const candidates = Array.from(allCandidatesById.values())
        .sort((a, b) => {
          const da = a.fdatestatus5 ? new Date(a.fdatestatus5).getTime() : 0;
          const db = b.fdatestatus5 ? new Date(b.fdatestatus5).getTime() : 0;
          return db - da;
        })
        .map((r) => ({
          fid:            r.id,
          perRowRaw:      Math.round(perRowRaw(r) * 100) / 100,
          ftrackingchn:   r.ftrackingchn,
          fcabinetnumber: r.fcabinetnumber,
          fdatestatus5:   r.fdatestatus5,
          fstatus:        r.fstatus,
        }));

      if (candidates.length === 0) {
        await logAdminAction(
          adminId,
          "forwarder_invoice.backfill_items_no_candidates",
          "tb_receipt",
          String(receiptId),
          { rid: receipt.rid, expectedTotal },
        );
        return {
          ok:   true,
          data: {
            receiptId,
            rid:           receipt.rid,
            status:        "no_candidates",
            expectedTotal,
            candidates:    [],
          },
        };
      }

      await logAdminAction(
        adminId,
        "forwarder_invoice.backfill_items_ambiguous",
        "tb_receipt",
        String(receiptId),
        {
          rid:            receipt.rid,
          expectedTotal,
          candidateCount: candidates.length,
        },
      );

      return {
        ok:   true,
        data: {
          receiptId,
          rid:           receipt.rid,
          status:        "ambiguous",
          expectedTotal,
          candidates,
        },
      };
    },
  );
}

// ────────────────────────────────────────────────────────────
// adminLinkReceiptItems — manual fid pick for the ambiguous case
// ────────────────────────────────────────────────────────────

/**
 * Companion to `adminBackfillReceiptItems`. When the backfill returns
 * `status:'ambiguous'` with N candidates, the admin reviews them and
 * picks a specific subset to link. This action takes that explicit
 * list and inserts the tb_receipt_item rows.
 *
 * Guards (matching adminIssueForwarderInvoice):
 *   - Receipt must exist
 *   - All fids must belong to the receipt's userid
 *   - No fid may already be on a different receipt
 *   - tb_receipt_item must currently be EMPTY for this rid (we never
 *     append after the fact — that would re-open the door to silent
 *     double-counting)
 */
const linkItemsSchema = z.object({
  receiptId: z.number().int().positive(),
  fids:      z.array(z.number().int().positive()).min(1).max(50),
});
export type AdminLinkReceiptItemsInput = z.infer<typeof linkItemsSchema>;

export async function adminLinkReceiptItems(
  input: AdminLinkReceiptItemsInput,
): Promise<AdminActionResult<{ receiptId: number; rid: string; itemsInserted: number }>> {
  const parsed = linkItemsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { receiptId, fids: rawFids } = parsed.data;
  const fids = Array.from(new Set(rawFids));

  return withAdmin<{ receiptId: number; rid: string; itemsInserted: number }>(
    // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles issue/manage
    // receipts (tb_receipt/_item only · no wallet/payment writes) per
    // `docs/research/ops-workflow-audit-2026-06-05.md` §28.
    ["super", "accounting", "freight_export_doc", "freight_import_doc"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // 1. Receipt must exist; capture rid + userid.
      const { data: receiptData, error: rdErr } = await admin
        .from("tb_receipt")
        .select("id, rid, userid")
        .eq("id", receiptId)
        .maybeSingle<{ id: number; rid: string; userid: string }>();
      if (rdErr) {
        console.error(`[link items: tb_receipt read] failed`, {
          code: rdErr.code, message: rdErr.message, receiptId,
        });
        return { ok: false, error: `db_error:${rdErr.code ?? "unknown"}` };
      }
      if (!receiptData) {
        return { ok: false, error: "not_found: receipt does not exist" };
      }
      const receipt = receiptData;

      // 2. tb_receipt_item must be currently empty for this rid.
      const { data: existing, error: existErr } = await admin
        .from("tb_receipt_item")
        .select("id")
        .eq("rid", receipt.rid)
        .limit(1);
      if (existErr) {
        console.error(`[link items: tb_receipt_item existence check] failed`, {
          code: existErr.code, message: existErr.message,
        });
        return { ok: false, error: `db_error:${existErr.code ?? "unknown"}` };
      }
      if ((existing ?? []).length > 0) {
        return { ok: false, error: "receipt_already_has_items" };
      }

      // 3. All fids must belong to this userid.
      const { data: fwRows, error: fwErr } = await admin
        .from("tb_forwarder")
        .select("id, userid")
        .in("id", fids);
      if (fwErr) {
        console.error(`[link items: tb_forwarder verify] failed`, {
          code: fwErr.code, message: fwErr.message,
        });
        return { ok: false, error: `db_error:${fwErr.code ?? "unknown"}` };
      }
      const rows = ((fwRows ?? []) as unknown as Array<{ id: number; userid: string }>);
      if (rows.length !== fids.length) {
        return { ok: false, error: "some_fids_not_found" };
      }
      const wrongOwner = rows.filter((r) => r.userid !== receipt.userid);
      if (wrongOwner.length > 0) {
        return {
          ok: false,
          error: `fids_wrong_owner: ${wrongOwner.map((r) => `#${r.id}(${r.userid})`).join(", ")}`,
        };
      }

      // 4. No fid may already be on a different receipt.
      const { data: dupRows, error: dupErr } = await admin
        .from("tb_receipt_item")
        .select("fid, rid")
        .in("fid", fids);
      if (dupErr) {
        console.error(`[link items: tb_receipt_item dup check] failed`, {
          code: dupErr.code, message: dupErr.message,
        });
        return { ok: false, error: `db_error:${dupErr.code ?? "unknown"}` };
      }
      const conflicts = ((dupRows ?? []) as Array<{ fid: number; rid: string }>)
        .filter((r) => r.rid !== receipt.rid);
      if (conflicts.length > 0) {
        return {
          ok: false,
          error: `fids_on_other_receipt: ${conflicts.slice(0, 3).map((c) => `#${c.fid}→${c.rid}`).join(", ")}`,
        };
      }

      // 5. INSERT — same shape as adminIssueForwarderInvoice's batch insert.
      const itemRows = fids.map((fid) => ({ rid: receipt.rid, fid }));
      const { error: insErr } = await admin
        .from("tb_receipt_item")
        .insert(itemRows);
      if (insErr) {
        console.error(`[link items: tb_receipt_item insert] failed`, {
          code: insErr.code, message: insErr.message, rid: receipt.rid,
        });
        return { ok: false, error: `insert_failed: ${insErr.message}` };
      }

      await logAdminAction(
        adminId,
        "forwarder_invoice.link_items_manual",
        "tb_receipt",
        String(receiptId),
        { rid: receipt.rid, fids, source: "admin_pick" },
      );

      revalidatePath(`/admin/accounting/forwarder-invoice/${receiptId}`);
      revalidatePath("/admin/accounting/forwarder-invoice");

      return {
        ok:   true,
        data: { receiptId, rid: receipt.rid, itemsInserted: fids.length },
      };
    },
  );
}
