"use server";

/**
 * Wave 8 Group A — Bulk-action server actions for the legacy `tb_*` schema.
 *
 * 3 endpoints (all admin-only · all use `service_role` via createAdminClient):
 *   1. adminBulkApproveWalletHs        — approve N pending tb_wallet_hs rows
 *   2. adminBulkApproveYuanPayments    — approve N pending tb_payment rows
 *   3. adminBulkApproveCustomers       — activate N pending tb_users rows
 *
 * Pattern reference: `actions/admin/wallet.ts` (rebuilt-schema bulk approve).
 * Why separate file: the rebuilt-schema actions live in `wallet.ts` /
 * `yuan-payments.ts`; the tb_*-schema bulk actions live here so they're
 * trivially deletable when the rebuilt schema fully retires (Phase C+).
 *
 * Audit: every approval emits an `admin_audit_log` row with the before/after
 * status + the affected row IDs.
 */

import { revalidatePath } from "next/cache";
import { MAO_FLAT_FEE } from "@/lib/forwarder/mao-fee";
import { findDuplicateSlips, findDuplicateYuanSlips } from "@/lib/admin/duplicate-slip-check";
import { bustAdminChrome } from "@/lib/cache/revalidate-chrome";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendSms } from "@/lib/sms/gateway";
import { logger, redactPhone } from "@/lib/logger";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import { resolveProfileIdsForLegacyUserids } from "@/lib/auth/tb-users-resolver";
import { autoIssueReceiptOnPaymentLand } from "@/lib/admin/auto-issue-receipt";
import { issueYuanTaxInvoice } from "@/lib/admin/yuan-tax-invoice";
import { isShopYuanTaxInvoiceEnabled } from "@/lib/tax/shop-yuan-flag";
import { modeFromPref } from "@/lib/tax/tax-doc-mode";
import { spendCashbackAtCheckout } from "./wallet-hs";
import { cashbackRefId, parseCashbackNoteTag } from "@/lib/cashback/note-tag";
import { classifyWalletHsRow } from "@/lib/wallet/classify-approve-row";
// F3 — server-side capture rail (see wallet-hs.ts docblock). Delegate the
// throwing bulk money action to a non-exported *Impl run through
// withObservability — transparent, re-throws the ORIGINAL error, files only
// UNEXPECTED throws (handled `{ ok:false }` returns are untouched).
import { withObservability } from "@/lib/observability/with-observability";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — duplicated from wallet-trans.ts L49 (fourth caller).
// 2026-05-28 B-4 P0: writing the Supabase UUID (36 chars) into
// tb_wallet_hs.adminid (varchar(20)) throws 22001 → every bulk-approve
// row silently failed. Resolve the legacy admin slug + write that instead.
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[tb-bulk auth getUser] failed`, { code: authErr.code, message: authErr.message });
  }
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (error) {
    console.error(`[tb-bulk tb_admin lookup] failed`, { code: error.code, message: error.message });
  }
  if (data?.adminID) return data.adminID;
  // Fall back to the email's local-part, slice to 20 to match the column width
  // (legacy convention — adminid is varchar(20) on tb_wallet_hs vs varchar(10)
  // on tb_forwarder; safeLegacyAdminId() defaults to 10 so we slice inline).
  return email.split("@")[0].slice(0, 20);
}

// ════════════════════════════════════════════════════════════════
// 1. WALLET — bulk approve tb_wallet_hs pending rows
// ════════════════════════════════════════════════════════════════
//
// Legacy flow (pcs-admin/wallet.php `?action=approve`):
//   UPDATE tb_wallet_hs SET status='2', adminid=$adminID WHERE id IN (...)
//   For each row, also adjust tb_wallet.wallettotal:
//     type 1,2 (deposit / manual deposit) → wallettotal += amount
//     type 7   (withdraw)                  → wallettotal −= amount
//     type 4   (order payment)             → wallettotal −= amount (already
//                                           debited at order time · double
//                                           check legacy before flipping)
//
// Pacred replication: sequential per-row updates inside a per-row loop. No
// multi-table atomic transaction (PostgREST doesn't expose one without an
// RPC). Failures partial-rollback by manual reversal — caller sees the
// summary { ok, processed, failed }.

const bulkApproveWalletHsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
  // Exact-slip group review issues one combined receipt, so accounting may
  // carry the step-2 hand-picked document number into this bulk settlement.
  overrideRid: z.string().trim().min(1).max(20).optional(),
});
export type AdminBulkApproveWalletHsInput = z.infer<typeof bulkApproveWalletHsSchema>;

export async function adminBulkApproveWalletHs(
  input: AdminBulkApproveWalletHsInput,
): Promise<AdminActionResult<{ processed: number; failed: number; errors: string[]; receiptIds: number[] }>> {
  // F3 — capture UNEXPECTED throws as a platform_incident, then re-throw
  // unchanged (handled `{ ok:false }` returns propagate normally).
  return withObservability("adminBulkApproveWalletHs", adminBulkApproveWalletHsImpl)(input);
}

async function adminBulkApproveWalletHsImpl(
  input: AdminBulkApproveWalletHsInput,
): Promise<AdminActionResult<{ processed: number; failed: number; errors: string[]; receiptIds: number[] }>> {
  const parsed = bulkApproveWalletHsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { ids, overrideRid } = parsed.data;

  return withAdmin<{ processed: number; failed: number; errors: string[]; receiptIds: number[] }>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // 2026-05-28 B-4 P0 fix: resolve the LEGACY admin slug (varchar(20)
      // tb_admin.adminID) instead of writing the Supabase UUID (36 chars)
      // — the latter throws 22001 "value too long for character varying(20)"
      // on tb_wallet_hs.adminid and silently bumps result.failed for every
      // row. The single-row path (wallet-trans.ts) already does this; this
      // is the bulk path catching up. `adminId` (UUID) stays in the audit
      // log as a separate column where it belongs.
      const legacyAdminId = await resolveLegacyAdminId();

      // 1. Fetch all candidate rows in one query (filter to pending only).
      //    Wave 29: include typeservice + reforder + dateslip so we can fire
      //    the auto-receipt hook for any forwarder payment in the batch.
      //    P0 mark-paid symmetry: also read wusercredit so the per-row
      //    fStatus 5→6 settle below can pick the credit vs non-credit branch.
      const { data: rows, error: readErr } = await admin
        .from("tb_wallet_hs")
        .select("id, userid, amount, type, status, typeservice, reforder, reforder2, dateslip, imagesslip, note, wusercredit, reviewed_at")
        .in("id", ids)
        .eq("status", "1");
      if (readErr) return { ok: false, error: readErr.message };
      if (!rows || rows.length === 0) {
        return { ok: false, error: "ไม่พบรายการที่รออนุมัติ (อาจถูกอนุมัติไปแล้ว)" };
      }

      type Row = {
        id: number;
        userid: string;
        amount: number;
        type: string;
        status: string;
        typeservice: string | null;
        reforder: string | null;
        reforder2: string | null;
        dateslip: string | null;
        imagesslip: string | null;
        note: string | null;
        wusercredit: string | null;
        reviewed_at: string | null;
      };
      const candidates = rows as Row[];

      // 2. Per-row: UPDATE tb_wallet_hs status='2' + adjust tb_wallet.wallettotal.
      //    Wave 29: collect forwarder-payment rows (typeservice='2') per userid
      //    so we can fire ONE auto-receipt per (userid, dateSlip-day) batch
      //    after the loop — matches the legacy `grenrateReceiptF` behaviour
      //    of grouping multiple paid fids onto a single tb_receipt.
      let processed = 0;
      let failed = 0;
      const errors: string[] = [];
      // refWhId = a REPRESENTATIVE wallet_hs.id of the batch (the first slip that
      // formed it). Same-customer same-day batch → any funding slip is a valid
      // "อ้างอิงชำระเงิน" jump-off; the receipt list links there. (Legacy: 1 receipt
      // ← 1 topup; Pacred bulk may fold several same-day slips into 1 receipt.)
      const receiptBatches = new Map<string, { userid: string; dateSlip: Date; fids: number[]; refWhId: number }>();
      // BUG-1 — track which (userid · dateSlip-day) receipt batches have already
      // had the PCSF เหมาๆ ฿50 persisted to a forwarder row, so a batch with
      // multiple PCSF-zero rows gets the ฿50 on the FIRST one only (the receipt
      // SUMS all rows → total = freight_sum + 50, matching the single paid total).
      const pcsf50AppliedBatches = new Set<string>();

      for (const r of candidates) {
        // A4 TWO-ROUND verify (owner 2026-06-21) — bulk approve is ROUND 2; it
        // only settles rows already ROUND-1 reviewed (reviewed_at set). Customer
        // payment slips (type 1/4/8) not yet reviewed are SKIPPED + reported so
        // the accountant does round-1 first (single view), then bulk-approves.
        if ((r.type === "1" || r.type === "4" || r.type === "8") && !r.reviewed_at) {
          failed++;
          errors.push(`id=${r.id}: ยังไม่ได้ตรวจสลิป รอบ 1 — ตรวจรอบ 1 ที่หน้ารายละเอียดก่อน แล้วค่อยอนุมัติ`);
          continue;
        }

        // ชั้น-1 dup gate (legacy w-s-deposit-detail.php) — a SAME-CUSTOMER
        // same-day same-amount pending/approved twin = a likely double-paid slip.
        // Auto-debit rows with no slip short-circuit (dateslip null). In the BULK
        // path we can't show a per-row confirm, so we SKIP such a row and report
        // it: the accountant clears it one-by-one on /admin/wallet/[id] (where
        // the confirm-to-override dialog lives).
        {
          const dups = await findDuplicateSlips(admin, {
            id: r.id,
            userid: r.userid,
            amount: r.amount,
            dateslip: r.dateslip,
            imagesslip: r.imagesslip,
          });
          if (dups.length > 0) {
            failed++;
            errors.push(`id=${r.id}: พบสลิปที่อาจซ้ำ (${dups.length} รายการ) — ตรวจสอบทีละรายการที่หน้ารายละเอียด`);
            continue;
          }
        }
        // Determine the wallet delta via the shared classifier (money-critical ·
        // 2026-07-02). DIRECT-CUT: a ฝากนำเข้า direct-slip (type='4'
        // typeservice='2' reforder set · reforder2 empty · no paydeposit link)
        // settled from the bank at CREATE and NEVER credited the wallet
        // (submitForwarderPayment · forwarder.ts L509-561) → walletDelta 0, so
        // the negative-wallet guard + debit below are inert and admins can
        // finally settle real slips against a ฿0 wallet. A cascade/wallet-funded
        // row keeps its legacy delta (credits +amt · debits −amt · else 0) so the
        // guard stays armed. type='3' (withdraw) is delta=0 (debit-hold at submit).
        //   Resolve the paydeposit link defensively (empty for direct slips · set
        //   for the topup-and-pay cascade shape).
        let rowHasPaydepositLink = false;
        {
          const { data: pdLinks, error: pdErr } = await admin
            .from("tb_wallet_paydeposit")
            .select("id")
            .eq("whid", r.id)
            .limit(1);
          if (pdErr) {
            // Fail-safe: a money classification we can't complete must hold.
            failed++;
            errors.push(`id=${r.id} ${r.userid}: paydeposit-link check failed: ${pdErr.message}`);
            continue;
          }
          rowHasPaydepositLink = (pdLinks?.length ?? 0) > 0;
        }
        const rowClass = classifyWalletHsRow(
          { type: r.type, typeservice: r.typeservice, reforder: r.reforder, reforder2: r.reforder2, amount: r.amount },
          { hasPaydepositLink: rowHasPaydepositLink },
        );
        // Preserve the legacy withdraw (type='3') delta=0 exactly (classifier
        // returns 0 for it too since '3' ∉ {1,2,4,7}). The classifier's
        // direct-slip → 0 is the behavior change; everything else is identical.
        const delta = rowClass.walletDelta;

        // NEGATIVE-WALLET GUARD (owner 2026-06-21) — mirror of the single-row
        // approve: never let a debit (type 4/7) drive the wallet below 0 (the
        // legacy "เติม-แล้วจ่าย" pair bug · PR130 −646). Pre-check BEFORE the claim
        // so the row stays pending (the accountant approves the paired topup
        // first). Inert for a direct-slip (delta 0 · money in bank).
        if (delta < 0) {
          const { data: wPre, error: wPreErr } = await admin
            .from("tb_wallet").select("wallettotal").eq("userid", r.userid)
            .maybeSingle<{ wallettotal: number | string | null }>();
          if (wPreErr) {
            // Fail-safe: a money guard we can't complete must hold (skip the row).
            failed++;
            errors.push(`id=${r.id} ${r.userid}: wallet pre-check failed: ${wPreErr.message}`);
            continue;
          }
          const bal0 = Number(wPre?.wallettotal ?? 0);
          if (bal0 + delta < -0.01) {
            failed++;
            errors.push(`id=${r.id} ${r.userid}: ยอดกระเป๋าไม่พอหัก (มี ฿${bal0.toFixed(2)} · หัก ฿${(-delta).toFixed(2)}) — อนุมัติรายการเติมเงินคู่กันก่อน`);
            continue;
          }
        }

        // Approve the wallet_hs row first — ATOMIC CLAIM. Folding the
        // `.eq("status","1")` into the UPDATE + checking the affected row makes
        // this TOCTOU-safe: a 0-row result means a concurrent path (the
        // /admin/wallet/[id] single-row approve, or a second bulk click on the
        // same id) already flipped this row → we MUST skip the balance mutation
        // below, else tb_wallet is double-credited. PostgREST returns NO error
        // on a 0-row match, so the error check alone is insufficient — we need
        // the affected-row count. (Mirrors the 2026-06-14 cnt-hs / forwarder-
        // credit / yuan-payment optimistic-concurrency fold.)
        const { data: claimed, error: updHsErr } = await admin
          .from("tb_wallet_hs")
          .update({ status: "2", adminid: legacyAdminId })
          .eq("id", r.id)
          .eq("status", "1")  // re-guard against race
          .select("id")
          .maybeSingle();
        if (updHsErr) {
          failed++;
          errors.push(`id=${r.id}: ${updHsErr.message}`);
          continue;
        }
        if (!claimed) {
          // 0-row claim — another path already approved this id. NOT a failure
          // (it got processed, just not by us) → skip the balance write silently.
          continue;
        }

        // Adjust wallet balance (if applicable).
        if (delta !== 0) {
          // Read current balance (upsert if missing — new customer).
          const { data: wRow, error: wRowErr } = await admin
            .from("tb_wallet")
            .select("userid, wallettotal")
            .eq("userid", r.userid)
            .maybeSingle<{ userid: string; wallettotal: number }>();
          if (wRowErr) {
            console.error(`[tb_wallet list] failed`, { code: wRowErr.code, message: wRowErr.message });
          }

          if (!wRow) {
            // No tb_wallet row yet — insert with the delta.
            const { error: insErr } = await admin
              .from("tb_wallet")
              .insert({ userid: r.userid, wallettotal: delta });
            if (insErr) {
              failed++;
              errors.push(`id=${r.id} wallet-insert ${r.userid}: ${insErr.message}`);
              continue;
            }
          } else {
            const newTotal = Number(wRow.wallettotal) + delta;
            const { error: updWErr } = await admin
              .from("tb_wallet")
              .update({ wallettotal: newTotal })
              .eq("userid", r.userid);
            if (updWErr) {
              failed++;
              errors.push(`id=${r.id} wallet-update ${r.userid}: ${updWErr.message}`);
              continue;
            }
          }
        }

        processed++;

        // ADR-0025 — settle carried cashback ([CB:] tag) for forwarder-payment
        // slips in this batch. Idempotent on cbhrefid (re-approve can't double-
        // debit); best-effort — never fails the row (money already moved).
        const cbReq = parseCashbackNoteTag(r.note);
        if (cbReq > 0) {
          try {
            await spendCashbackAtCheckout(admin, {
              userid: r.userid,
              requested: cbReq,
              cbhrefid: cashbackRefId("forwarder", `walleths:${r.id}`),
              nowIso: new Date().toISOString(),
            });
          } catch (e) {
            logger.warn("tb-bulk", "cashback settle failed (non-fatal)", {
              wallet_hs_id: r.id, userid: r.userid, error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // Wave 29: queue forwarder-payment rows for the auto-receipt
        // hook (typeservice='2' + reforder = a tb_forwarder.id). Group
        // by (userid · dateSlip-day) so a batch of fids for the same
        // customer becomes ONE tb_receipt — matches legacy grenrateReceiptF
        // which loops over multiple `refOrder` rows under one whID.
        if (r.typeservice === "2" && r.reforder) {
          const fid = Number(r.reforder);
          if (Number.isFinite(fid) && fid > 0) {
            // P0 mark-paid symmetry — settle tb_forwarder for this paid row
            // (per-row · inside the loop). submitForwarderPayment leaves the
            // forwarder at fStatus=5; the slip-approve is where it settles —
            // else paid forwarders stay "รอชำระเงิน" + the AR cockpit never
            // decrements. Same branch split as adminApproveWalletHs
            // (wallet-trans.ts · legacy pay-users.php L467/L469):
            //   standard   → fstatus='6' + fdateadminstatus + fdatestatus6 (guard fstatus='5')
            //   credit row → fcredit='' + fdateadminstatus (NO fstatus flip · guard fcredit='1')
            // Idempotent via the eq-guard; best-effort + logged — a flip
            // failure must NOT fail the row (the money already moved).
            const nowIso = new Date().toISOString();
            const isCredit = (r.wusercredit ?? "").trim() === "1";
            let flipErrMsg: string | null = null;
            if (isCredit) {
              const { error: flipErr } = await admin
                .from("tb_forwarder")
                .update({ fcredit: "", fdateadminstatus: nowIso })
                .eq("id", fid)
                .eq("userid", r.userid)
                .eq("fcredit", "1");
              flipErrMsg = flipErr?.message ?? null;
            } else {
              const { error: flipErr } = await admin
                .from("tb_forwarder")
                .update({ fstatus: "6", fdateadminstatus: nowIso, fdatestatus6: nowIso })
                .eq("id", fid)
                .eq("userid", r.userid)
                .eq("fstatus", "5");
              flipErrMsg = flipErr?.message ?? null;
            }
            if (flipErrMsg) {
              logger.warn("tb-bulk", "forwarder settle flip failed (non-fatal · money already moved)", {
                wallet_hs_id: r.id, userid: r.userid, fid, isCredit, error: flipErrMsg,
              });
            }

            const dt = r.dateslip ? new Date(r.dateslip) : new Date();
            const dayKey = `${r.userid}|${dt.toISOString().slice(0, 10)}`;

            // BUG-1 — persist the PCSF เหมาๆ ฿50 onto tb_forwarder.ftransportprice
            // BEFORE the batch receipt is issued. submitForwarderPayment (self-pay)
            // folds the ฿50 into tb_wallet_hs.amount but never writes it back to the
            // forwarder, so autoIssueReceiptOnPaymentLand (re-reads the rows) would
            // sum freight-only. Mirror admin pay-on-behalf (pay-user.ts:615): on a
            // settled typeservice='2' / type='4' row whose forwarder is still
            // fshipby='PCSF' & ftransportprice=0, bump it to 50 — but ONLY the FIRST
            // such row per receipt batch (the others stay 0; the receipt sums all →
            // freight_sum + 50). The conditional WHERE makes it idempotent (a
            // re-approve / a row already bumped by the admin path = 0-row no-op); the
            // affected-row count confirms this row WAS the PCSF-zero one before we
            // mark the batch done (so a leading non-PCSF row doesn't consume the slot).
            if ((r.typeservice === "2") && (r.type ?? "") === "4" && !pcsf50AppliedBatches.has(dayKey)) {
              const { data: bumped, error: pcsfErr } = await admin
                .from("tb_forwarder")
                .update({ ftransportprice: MAO_FLAT_FEE })
                .eq("id", fid)
                .eq("userid", r.userid)
                .in("fshipby", ["PCSF", "PRF"])
                .eq("ftransportprice", 0)
                .select("id")
                .maybeSingle<{ id: number }>();
              if (pcsfErr) {
                logger.warn("tb-bulk", "PCSF ftransportprice=50 persist failed (non-fatal · money already moved)", {
                  wallet_hs_id: r.id, userid: r.userid, fid, error: pcsfErr.message,
                });
              } else if (bumped) {
                // This row was the PCSF-zero one and got the ฿50 → lock the batch.
                pcsf50AppliedBatches.add(dayKey);
              }
            }

            const existing = receiptBatches.get(dayKey);
            if (existing) {
              existing.fids.push(fid);
            } else {
              receiptBatches.set(dayKey, { userid: r.userid, dateSlip: dt, fids: [fid], refWhId: Number(r.id) });
            }
          }
        }

        // ADR-0028 — shop-order (ฝากสั่งซื้อ) slip-pay settle: a pending
        // type='8' / typeservice='1' row → mark the order PAID
        // (tb_header_order.hstatus '2'→'3'). The wallet delta was already 0
        // (type='8' ∉ {1,2,4,7}) so NO balance moved — this is a bank-transfer
        // payment. Best-effort + logged · idempotent via the hstatus='2' guard.
        if (r.typeservice === "1" && r.type === "8" && r.reforder) {
          const shopNow = new Date().toISOString();
          const { error: shopFlipErr } = await admin
            .from("tb_header_order")
            .update({ hstatus: "3", hdate3: shopNow, hdateupdate: shopNow, paydeposit: "1" })
            .eq("hno", r.reforder)
            .eq("userid", r.userid)
            .eq("hstatus", "2");
          if (shopFlipErr) {
            logger.warn("tb-bulk", "shop-order settle flip failed (non-fatal · slip approved)", {
              wallet_hs_id: r.id, userid: r.userid, hno: r.reforder, error: shopFlipErr.message,
            });
          }
        }
      }

      // 3. Wave 29: fire auto-receipt for each (userid · dateSlip-day) batch.
      //    Best-effort — receipt failures DO NOT roll back the bulk approve
      //    (the money already moved · receipts can be re-generated manually
      //    via /admin/accounting/forwarder-invoice/add?mode=manual).
      const receiptsIssued: Array<{ receiptId: number; rid: string; fids: number[] }> = [];
      for (const batch of receiptBatches.values()) {
        const r = await autoIssueReceiptOnPaymentLand(admin, {
          userid:   batch.userid,
          fids:     batch.fids,
          dateSlip: batch.dateSlip,
          source:   "wallet_hs.bulk_approve",
          refWhId:  batch.refWhId,   // อ้างอิงชำระเงิน → funding slip (batch representative)
          overrideRid: receiptBatches.size === 1 ? overrideRid : undefined,
        });
        if (r.ok) {
          receiptsIssued.push({ receiptId: r.data.receiptId, rid: r.data.rid, fids: batch.fids });
          revalidatePath(`/admin/accounting/forwarder-invoice/${r.data.receiptId}`);
          for (const fid of batch.fids) {
            revalidatePath(`/service-import/${fid}/invoice`);
          }
        } else if (!r.alreadyIssued) {
          logger.warn("tb-bulk", "auto-receipt failed in bulk-approve (non-fatal)", {
            userid: batch.userid,
            fids:   batch.fids,
            error:  r.error,
          });
        }
      }
      if (receiptsIssued.length > 0) {
        revalidatePath("/admin/accounting/forwarder-invoice");
      }

      // Audit one entry per call (not per row) — payload carries the list.
      await logAdminAction(adminId, "tb_wallet_hs.bulk_approve", "tb_wallet_hs", ids.join(","), {
        requested_ids: ids,
        processed,
        failed,
        errors: errors.length > 10 ? errors.slice(0, 10).concat("...") : errors,
        receipts_issued: receiptsIssued,
      });

      revalidatePath("/admin/wallet");
      revalidatePath("/admin");
      // Bulk wallet-hs approve moved the topup/withdraw queues + wallet totals;
      // refresh the admin sidebar/total badges immediately.
      bustAdminChrome();

      return { ok: true, data: { processed, failed, errors, receiptIds: receiptsIssued.map((r) => r.receiptId) } };
    },
  );
}

// ════════════════════════════════════════════════════════════════
// 2. YUAN PAYMENTS — bulk approve tb_payment pending rows
// ════════════════════════════════════════════════════════════════
//
// Legacy flow (pcs-admin/payment.php `?action=approve`):
//   UPDATE tb_payment SET paystatus='2', adminid=$adminID,
//   paydateadmin=NOW() WHERE id IN (...)
//
// Pacred verified prod column names (see /admin/yuan-payments/page.tsx
// docblock): paystatus, paytype, paydate, paydateadmin, payyuan, payrate,
// paythb, paythbcost, payprofitthb, userid, adminid, adminidupdate.
//
// No wallet adjustment — yuan payments don't credit wallet (they're an
// outgoing transfer; wallet was already debited at customer-submit time).

const bulkApproveYuanSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
});
export type AdminBulkApproveYuanPaymentsTbInput = z.infer<typeof bulkApproveYuanSchema>;

export async function adminBulkApproveYuanPaymentsTb(
  input: AdminBulkApproveYuanPaymentsTbInput,
): Promise<AdminActionResult<{ processed: number; failed: number; errors: string[] }>> {
  const parsed = bulkApproveYuanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { ids } = parsed.data;

  return withAdmin<{ processed: number; failed: number; errors: string[] }>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // 2026-05-30 P0-10 fix: tb_payment.adminid is varchar(10) (see
      // supabase/migrations/0081_pcs_legacy_schema.sql L3626) — writing the
      // Supabase UUID (36 chars) here throws Postgres 22001 "string data
      // right truncation" and the entire bulk approve fails. Mirror the
      // wallet-path pattern at L107: resolve the LEGACY admin slug (varchar(20)
      // tb_admin.adminID) and use that for the column. `adminId` (UUID)
      // stays as the audit log actor below where the column is uuid.
      const legacyAdminId = await resolveLegacyAdminId();

      const { data: rows, error: readErr } = await admin
        .from("tb_payment")
        .select("id, userid, payyuan, paythb, paystatus, tax_doc_pref, reviewed_at, paydate")
        .in("id", ids)
        .eq("paystatus", "1");
      if (readErr) return { ok: false, error: readErr.message };
      if (!rows || rows.length === 0) {
        return { ok: false, error: "ไม่พบรายการที่รออนุมัติ" };
      }

      const nowIso = new Date().toISOString();
      const approvedRows = rows as unknown as Array<{
        id: number; userid: string | null;
        payyuan: number | string | null; paythb: number | string | null;
        tax_doc_pref: string | null; reviewed_at: string | null; paydate: string | null;
      }>;

      // ── Legacy approve cost-capture (payment.php L613-625) ──────────────
      // Default the cost rate from tb_settings.hRateCostDefault and stamp
      // payTHBCost / payProfitTHB so the yuan-profit + acc-payment reports
      // aren't left at cost 0 / overstated profit. Legacy's BULK path omitted
      // this (only the single-row ?page=update captured it) — we extend the
      // single-row legacy behaviour to bulk for report correctness: SAME
      // default, no new formula ("legacy ก่อน แล้วค่อยพัฒนาต่อ").
      const { data: settingsRow, error: settingsErr } = await admin
        .from("tb_settings")
        .select("hratecostdefault")
        .eq("id", 1)
        .maybeSingle<{ hratecostdefault: number | string | null }>();
      if (settingsErr) {
        logger.warn("tb-bulk", "yuan bulk approve: hratecostdefault read failed (cost defaults 0)", { code: settingsErr.code });
      }
      const payRateCost = Number(settingsRow?.hratecostdefault ?? 0) || 0;

      // Per-row conditional UPDATE — cost = payYuan × rate differs per row, and
      // the folded .eq("paystatus","1") keeps each flip idempotent + TOCTOU-safe
      // (a concurrent approve / double-click yields 0 rows → skipped, not
      // double-counted). Sequential: this is an admin batch (≤200), not a
      // customer hot path.
      const errors: string[] = [];
      const okIds: number[] = [];
      for (const r of approvedRows) {
        // A4 two-round (owner 2026-06-21): bulk is ROUND 2 — only settle yuan
        // slips already ROUND-1 reviewed. Skip un-reviewed rows + report them.
        if (!r.reviewed_at) {
          errors.push(`id=${r.id}: ยังไม่ได้ตรวจสลิป รอบ 1 — ตรวจรอบ 1 ที่หน้ารายละเอียดก่อน`);
          continue;
        }
        // 🔴 เวียนเทียน dup-slip GATE (bug-hunt 2026-07-18): the single-row yuan
        // approve (yuan-payments.ts adminUpdateYuanPayment) blocks a duplicate slip
        // (same userid + paydate-day + paythb) with an acknowledge dialog; the bulk
        // path skipped it entirely → a re-used/double slip could settle. Yuan lives
        // in tb_payment (the wallet dup-gate never covers it), so this is the ONLY
        // เวียนเทียน guard for yuan. Skip a suspected dup → force one-by-one on the
        // detail page where the acknowledge dialog lives.
        const yuanDups = await findDuplicateYuanSlips(admin, { id: r.id, userid: r.userid, paythb: r.paythb, paydate: r.paydate });
        if (yuanDups.length > 0) {
          errors.push(`id=${r.id}: พบสลิปโอนหยวนที่อาจซ้ำ (${yuanDups.map((d) => `#${d.id}`).join(", ")}) — อนุมัติทีละรายการที่หน้ารายละเอียดเพื่อยืนยัน`);
          continue;
        }
        const payThbCost   = Math.round(Number(r.payyuan ?? 0) * payRateCost * 100) / 100;
        const payProfitThb = Math.round((Number(r.paythb ?? 0) - payThbCost) * 100) / 100;
        const { data: upRow, error: upErr } = await admin
          .from("tb_payment")
          .update({
            paystatus:    "2",
            adminid:      legacyAdminId,
            paydateadmin: nowIso,
            payratecost:  payRateCost,
            paythbcost:   payThbCost,
            payprofitthb: payProfitThb,
          })
          .eq("id", r.id)
          .eq("paystatus", "1")
          .select("id")
          .maybeSingle<{ id: number }>();
        if (upErr) { errors.push(`#${r.id}: ${upErr.message}`); continue; }
        if (upRow) okIds.push(r.id);
      }
      const okSet = new Set(okIds);

      // ── TAX-DOCUMENT BRIDGE for ฝากโอน (bulk yuan-approve · migration 0152) ──
      //   Same contract as adminUpdateYuanPayment's single-row hook: for each
      //   just-approved (paystatus now '2') yuan row whose customer chose a VAT
      //   document (tb_payment.tax_doc_pref · 0140), issue a ใบกำกับ/ใบขน into
      //   the tb_*-native store (0152). 🔴 GATED behind tax_invoice.shop_yuan_enabled
      //   (default OFF → no document). BEST-EFFORT · idempotent on payment id ·
      //   the "ฝากโอนกับเราเท่านั้น" completed-gate is enforced in the issuer.
      try {
        if (await isShopYuanTaxInvoiceEnabled()) {
          for (const r of approvedRows) {
            if (!okSet.has(r.id)) continue;   // only docs for rows actually flipped
            const docMode = modeFromPref(r.tax_doc_pref);
            if (docMode === "none") continue;
            const taxRes = await issueYuanTaxInvoice(admin, {
              paymentId: r.id,
              userid:    r.userid ?? undefined,
              issuedBy:  "system-auto",
              mode:      docMode,
            });
            if (!taxRes.ok && !taxRes.alreadyIssued) {
              logger.warn("tb-bulk", "bulk yuan tax-invoice bridge failed (non-fatal · approval stands)", {
                payment_id: r.id, userid: r.userid, mode: docMode, error: taxRes.error,
              });
            }
          }
        }
      } catch (e) {
        logger.warn("tb-bulk", "bulk yuan tax-invoice bridge threw (non-fatal)", {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      const processed = okIds.length;
      await logAdminAction(adminId, "tb_payment.bulk_approve", "tb_payment", ids.join(","), {
        requested_ids: ids,
        approved_ids: okIds,
        processed,
        failed: errors.length,
      });

      revalidatePath("/admin/yuan-payments");
      revalidatePath("/admin");
      // Bulk yuan-payment approve moved the ฝากโอน pending queue; refresh the
      // admin sidebar badge immediately.
      bustAdminChrome();

      return { ok: true, data: { processed, failed: errors.length, errors } };
    },
  );
}

// ════════════════════════════════════════════════════════════════
// 3. CUSTOMERS — bulk activate tb_users (useractive '0' → '1')
// ════════════════════════════════════════════════════════════════
//
// Legacy flow (pcs-admin/user-active.php · approve action):
//   UPDATE tb_users SET useractive='1', adminidupdate=$adminID,
//   userdateactive=NOW() WHERE userid IN (...)

const bulkApproveCustomersSchema = z.object({
  user_ids: z.array(z.string().regex(/^PR\d+$/i, "user_id ต้องเป็นรหัส PR####"))
    .min(1)
    .max(200),
});
export type AdminBulkApproveCustomersInput = z.infer<typeof bulkApproveCustomersSchema>;

export async function adminBulkApproveCustomers(
  input: AdminBulkApproveCustomersInput,
): Promise<AdminActionResult<{ processed: number; failed: number; errors: string[] }>> {
  const parsed = bulkApproveCustomersSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { user_ids } = parsed.data;

  return withAdmin<{ processed: number; failed: number; errors: string[] }>(
    ["ops", "sales_admin", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // Pull the contact fields too so the post-approval SMS + sales-rep
      // notification can be sent without a second round-trip.
      const { data: rows, error: readErr } = await admin
        .from("tb_users")
        .select("userID, userActive, userTel, userName, userLastName")
        .in("userID", user_ids)
        .eq("userActive", "0");
      if (readErr) return { ok: false, error: readErr.message };
      if (!rows || rows.length === 0) {
        return { ok: false, error: "ไม่พบสมาชิกที่รออนุมัติ (อาจถูกอนุมัติไปแล้ว)" };
      }

      type ApproveRow = {
        userID: string;
        userTel: string | null;
        userName: string | null;
        userLastName: string | null;
      };
      const candidates = rows as ApproveRow[];
      const toApprove = candidates.map((r) => r.userID);

      // userActive '0'→'1' is the activation. The who/when is recorded by
      // logAdminAction below — `adminidupdate`/`userdateactive` are NOT real
      // tb_users columns (writing them 42703-errored the WHOLE update, so the
      // member-approve silently failed for every pending signup · 2026-06-22).
      const { error: updErr } = await admin
        .from("tb_users")
        .update({ userActive: "1" })
        .in("userID", toApprove)
        .eq("userActive", "0");

      if (updErr) {
        return { ok: false, error: updErr.message };
      }

      await logAdminAction(adminId, "tb_users.bulk_approve", "tb_users", toApprove.join(","), {
        requested_user_ids: user_ids,
        approved_user_ids: toApprove,
        processed: toApprove.length,
      });

      // E2E loop fix · Agent F1 · 2026-05-29 (Gap #3 part 1):
      // Send welcome SMS + LINE/email notification to every approved
      // customer (NOTIFY_BYPASS-respected via sendSms gateway).
      // Best-effort per row — log on failure but never roll back the bulk
      // approve. Sales-rep auto-assign for the BULK path is INTENTIONALLY
      // deferred: doing fair least-loaded round-robin across 200 rows
      // would require N successive queries (read count → assign → repeat)
      // which is too slow for an admin bar action. Single-row approve
      // (`approveCustomer`) does handle auto-assign — admins who want
      // owner attribution should use single-row approve on new signups.
      const profileIdMap = await resolveProfileIdsForLegacyUserids(toApprove);
      let smsSent = 0;
      let smsFailed = 0;
      for (const r of candidates) {
        if (!toApprove.includes(r.userID)) continue;
        if (r.userTel) {
          const msg =
            `ยินดีต้อนรับสู่ Pacred · บัญชี ${r.userID} อนุมัติแล้ว · ` +
            `เริ่มสั่งสินค้าได้เลย: pacred.co.th`;
          const sms = await sendSms(r.userTel, msg);
          if (sms.ok) smsSent++;
          else {
            smsFailed++;
            logger.warn("tb_users.bulk_approve", "welcome SMS failed", {
              userID: r.userID,
              phone:  redactPhone(r.userTel),
              error:  sms.error,
            });
          }
        }
        const profileId = profileIdMap.get(r.userID);
        if (profileId) {
          void sendNotification(profileId, notify.customerApproved({ memberCode: r.userID }));
        }
      }

      revalidatePath("/admin/customers/pending");
      revalidatePath("/admin/customers");
      revalidatePath("/admin");
      // Customers approved → the customer-pending queue badge shrank; refresh
      // the admin sidebar immediately.
      bustAdminChrome();

      return {
        ok: true,
        data: {
          processed: toApprove.length,
          failed:    smsFailed,
          errors:    smsSent > 0 || smsFailed > 0
            ? [`sms sent: ${smsSent}, failed: ${smsFailed}`]
            : [],
        },
      };
    },
  );
}
