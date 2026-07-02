"use server";

/**
 * Wave 19 BUG #3 — Server actions for the `/admin/wallet/[id]` topup-detail
 * edit form (faithful port of `pcs-admin/include/pages/wallet/w-s-deposit-detail.php`).
 *
 * Three actions:
 *   1. adminUpdateWalletHsDateSlip — admin types the correct "วันที่โอน
 *      ในสลิป" before approving (legacy form `updateDate`). This unlocks the
 *      similar-transaction detector + the auto-receipt date. STILL THE
 *      CANONICAL writer — does not need the paydeposit cascade.
 *   2. adminApproveWalletHs        — DEPRECATED 2026-05-30 (ADR-0018 D-3 #2 +
 *      P0-9/MS-1). Superseded by `adminApproveWalletDeposit` in `wallet-hs.ts`
 *      which adds the `tb_wallet_paydeposit` cascade (legacy `wallet.php`
 *      L444-568) that this single-row approve was MISSING. The detail-page
 *      edit-form.tsx now imports from `wallet-hs.ts`. This export remains as
 *      a no-changes-to-callsite tombstone (in case the bulk path in
 *      `tb-bulk.ts` is reached via a different route — it still uses the
 *      naked-credit pattern this implements). Retire when the last caller
 *      migrates.
 *   3. adminRejectWalletHs         — DEPRECATED 2026-05-30 (same as #2 ·
 *      superseded by `adminRejectWalletDeposit` in `wallet-hs.ts` which
 *      adds the cascade revert + type='7' refund per legacy L598-619).
 *
 * Why a NEW file (separate from wallet-hs.ts):
 *   wallet-hs.ts owns the manual-CREATE + the new D-2-rule-3 approve/reject.
 *   This file owns the dateslip edit + the deprecated naked-credit approve/
 *   reject. Keeping them apart so the next agent that retires the deprecated
 *   pair can delete those two functions cleanly without touching dateslip.
 *
 * Schema reference: supabase/migrations/0081_pcs_legacy_schema.sql L6159
 *   (tb_wallet_hs) + L6135 (tb_wallet · per-customer balance row).
 *
 * Status convention (legacy comment L6213):
 *   '1' pending · '2' approved · '3' rejected
 *
 * Type convention (legacy comment L6220):
 *   type='1' deposit · '2'=order pay · '3'=withdraw · '4'=order pay forwarder
 *   · '5'=refund · '6'=transfer · '7'=pending-topup
 *   typenew='1'=deposit · '2'=refund · '3..7' various pay
 * Wallet delta rule (matches tb-bulk.ts L83-87):
 *   type '1'/'2' → credit  (wallettotal += amount)
 *   type '4'/'7' → debit   (wallettotal -= amount)
 *   anything else → no balance change (safe default)
 */

import { revalidatePath } from "next/cache";
import { MAO_FLAT_FEE } from "@/lib/forwarder/mao-fee";
import { findDuplicateSlips } from "@/lib/admin/duplicate-slip-check";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { autoIssueReceiptOnPaymentLand } from "@/lib/admin/auto-issue-receipt";
import { logger } from "@/lib/logger";
import { spendCashbackAtCheckout, refundCashbackOnReject } from "./wallet-hs";
import { cashbackRefId, parseCashbackNoteTag } from "@/lib/cashback/note-tag";
import { classifyWalletHsRow } from "@/lib/wallet/classify-approve-row";

// ────────────────────────────────────────────────────────────
// UNIT C (owner 2026-06-19) — "หมายเหตุงาน" work-note append helper.
// Appends a staff work note onto the EXISTING tb_wallet_hs.note WITHOUT
// clobbering it. The note column carries load-bearing tags ([CB:<amt>] ·
// [WALLET:<thb>]) read by the cashback / wallet-refund settle logic, so we
// must never overwrite — only append with a separator. Returns the prior
// note unchanged when no work note is supplied (note stays optional /
// fully backward-compatible). Caps the combined string to fit the legacy
// column without surprises.
// ────────────────────────────────────────────────────────────
function appendWorkNote(prior: string | null | undefined, workNote: string | undefined): string | null {
  const base = (prior ?? "").trim();
  const add = (workNote ?? "").trim();
  if (!add) return prior ?? null; // nothing to add → leave the row untouched
  const combined = base ? `${base} | ${add}` : add;
  return combined;
}

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — duplicated from wallet-hs.ts L54 (third caller —
// next refactor task should lift it to actions/admin/common.ts).
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
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
    console.error(`[tb_admin list] failed`, { code: error.code, message: error.message });
  }
  if (data?.adminID) return data.adminID.slice(0, 20);
  // 2026-06-05 (ภูม flag · varchar overflow) — fallback was email.slice(0, 30)
  // which overflows tb_wallet_hs.adminid/adminidupdate (varchar(20)). Use
  // the username part of the email (truncated to 20) so logged-in admin
  // is still attributable, then fall back to "system".
  const localPart = email.split("@")[0] ?? "";
  return (localPart || "system").slice(0, 20);
}

// ════════════════════════════════════════════════════════════════
// 1. adminUpdateWalletHsDateSlip — admin sets "วันที่โอนในสลิป"
// ════════════════════════════════════════════════════════════════

const updateDateSlipSchema = z.object({
  id:       z.number().int().positive(),
  dateslip: z.string().trim().min(1, "ต้องระบุวันที่"),  // local datetime string e.g. "2026-05-25T10:30"
});
export type AdminUpdateWalletHsDateSlipInput = z.infer<typeof updateDateSlipSchema>;

export async function adminUpdateWalletHsDateSlip(
  input: AdminUpdateWalletHsDateSlipInput,
): Promise<AdminActionResult<{ id: number; dateslip: string }>> {
  const parsed = updateDateSlipSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, dateslip } = parsed.data;

  // Parse the wall-clock datetime string from the form. Treat as local time
  // (legacy stored "YYYY-MM-DD HH:mm:ss" as a wall clock).
  //
  // 2026-06-05 (ภูม flag) — toISOString() returns "2026-06-05T14:33:00.000Z"
  // (24 chars) which overflows tb_wallet_hs.dateslip varchar(20). Format
  // instead as MySQL DATETIME "YYYY-MM-DD HH:MM:SS" (19 chars) which is
  // what the legacy PHP wrote · also preserves the wall-clock semantics
  // (no UTC shift) the legacy mysqli relied on.
  const dt = new Date(dateslip);
  if (Number.isNaN(dt.getTime())) {
    return { ok: false, error: "วันที่ไม่ถูกต้อง" };
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateslipIso =
    `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ` +
    `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;

  return withAdmin<{ id: number; dateslip: string }>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();

      // Confirm row exists + is still pending (the only state where editing
      // the slip date matters for the "ตรวจสอบรายการซ้ำ" detector).
      const { data: existing, error: existingErr } = await admin
        .from("tb_wallet_hs")
        .select("id, status, userid, amount")
        .eq("id", id)
        .maybeSingle<{ id: number; status: string | null; userid: string; amount: number }>();
      if (existingErr) {
        console.error(`[tb_wallet_hs list] failed`, { code: existingErr.code, message: existingErr.message });
        return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
      }
      if (!existing) return { ok: false, error: "ไม่พบรายการ" };

      const { error: updErr } = await admin
        .from("tb_wallet_hs")
        .update({ dateslip: dateslipIso, adminidupdate: legacyAdminId })
        .eq("id", id);
      if (updErr) {
        console.error(`[tb_wallet_hs mutation] failed`, { code: updErr.code, message: updErr.message });
        return { ok: false, error: updErr.message };
      }

      await logAdminAction(adminId, "tb_wallet_hs.update_dateslip", "tb_wallet_hs", String(id), {
        userid: existing.userid,
        amount: existing.amount,
        new_dateslip: dateslipIso,
      });

      revalidatePath(`/admin/wallet/${id}`);
      revalidatePath("/admin/wallet");

      return { ok: true, data: { id, dateslip: dateslipIso } };
    },
  );
}

// ════════════════════════════════════════════════════════════════
// 2. adminApproveWalletHs — single-row approve (status 1 → 2)
// ════════════════════════════════════════════════════════════════

const approveSchema = z.object({
  id: z.number().int().positive(),
  // UNIT C — optional "หมายเหตุงาน" (internal work note). When present it is
  // APPENDED to tb_wallet_hs.note (never clobbers the [CB:]/[WALLET:] tags).
  note: z.string().trim().max(500).optional(),
  // ชั้น-1 dup gate: when a same-day same-amount twin exists the approve is
  // BLOCKED unless the accountant explicitly confirms it's not a double-pay.
  acknowledgeDuplicate: z.boolean().optional(),
});
export type AdminApproveWalletHsInput = z.infer<typeof approveSchema>;

export async function adminApproveWalletHs(
  input: AdminApproveWalletHsInput,
): Promise<AdminActionResult<{ id: number; new_balance: number }>> {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, note: workNote, acknowledgeDuplicate } = parsed.data;

  return withAdmin<{ id: number; new_balance: number }>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();

      // 1. Read the pending row. Includes typeservice + reforder + dateslip
      //    so we can detect a forwarder-payment (typeservice='2') and trigger
      //    the auto-receipt hook after wallet update succeeds. `wusercredit`
      //    is read too so the fStatus 5→6 flip below can pick the credit vs
      //    non-credit branch (submitForwarderPayment stamps it per row).
      const { data: row, error: rowErr } = await admin
        .from("tb_wallet_hs")
        .select("id, userid, amount, type, status, typeservice, reforder, reforder2, dateslip, note, wusercredit")
        .eq("id", id)
        .maybeSingle<{
          id: number;
          userid: string;
          amount: number;
          type: string | null;
          status: string | null;
          typeservice: string | null;
          reforder: string | null;
          reforder2: string | null;
          dateslip: string | null;
          note: string | null;
          wusercredit: string | null;
        }>();
      if (rowErr) {
        console.error(`[tb_wallet_hs list] failed`, { code: rowErr.code, message: rowErr.message });
        return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
      }
      if (!row) return { ok: false, error: "ไม่พบรายการ" };
      if (row.status !== "1") {
        return { ok: false, error: `รายการนี้ดำเนินการแล้ว (สถานะ ${row.status})` };
      }

      // ชั้น-1 dup gate (legacy w-s-deposit-detail.php) — a SAME-CUSTOMER
      // same-day same-amount pending/approved twin = a likely double-paid slip.
      // Auto-debit rows with no incoming slip short-circuit (dateslip null), so
      // this only fires on rows that carry a real slip. BLOCK unless the
      // accountant confirms it's not a duplicate (acknowledgeDuplicate=true).
      if (!acknowledgeDuplicate) {
        const dups = await findDuplicateSlips(admin, { id: row.id, userid: row.userid, amount: row.amount, dateslip: row.dateslip });
        if (dups.length > 0) {
          return {
            ok: false,
            error: `พบสลิปที่อาจซ้ำ (วันโอนเดียวกัน ยอดเท่ากัน ${dups.length} รายการ) — ตรวจสอบแล้วยืนยันอีกครั้งเพื่ออนุมัติ`,
          };
        }
      }

      const amt = Number(row.amount);

      // Wallet delta via the shared classifier (money-critical · 2026-07-02).
      // DIRECT-CUT: a ฝากนำเข้า direct-slip (type='4' typeservice='2' reforder
      // set · reforder2 empty · no paydeposit link) settled from the bank at
      // CREATE and never credited the wallet (submitForwarderPayment ·
      // forwarder.ts L509-561) → walletDelta 0, so no debit fires here. A
      // cascade/wallet-funded row keeps its legacy delta (credits +amt · debits
      // −amt · else 0). Resolve the paydeposit link defensively (empty for
      // direct slips · set for the topup-and-pay cascade).
      let rowHasPaydepositLink = false;
      {
        const { data: pdLinks, error: pdErr } = await admin
          .from("tb_wallet_paydeposit")
          .select("id")
          .eq("whid", id)
          .limit(1);
        if (pdErr) {
          console.error(`[approve wallet_hs paydeposit link check] failed`, { code: pdErr.code, message: pdErr.message });
          return { ok: false, error: `db_error:${pdErr.code ?? "unknown"}` };
        }
        rowHasPaydepositLink = (pdLinks?.length ?? 0) > 0;
      }
      const delta = classifyWalletHsRow(
        { type: row.type, typeservice: row.typeservice, reforder: row.reforder, reforder2: row.reforder2, amount: row.amount },
        { hasPaydepositLink: rowHasPaydepositLink },
      ).walletDelta;

      // 2. UPDATE tb_wallet_hs status='2'. UNIT C — when a "หมายเหตุงาน" work
      //    note is supplied, append it onto the existing note (preserving the
      //    [CB:]/[WALLET:] tags read above by reference to row.note). The tags
      //    are read BEFORE this update (cashback settle reads row.note, not the
      //    appended value), so appending here is safe + persists the staff note.
      const approvePatch: Record<string, unknown> = {
        status: "2",
        adminid: legacyAdminId,
        adminidupdate: legacyAdminId,
      };
      if (workNote && workNote.length > 0) {
        approvePatch.note = appendWorkNote(row.note, workNote);
      }
      const { error: updHsErr } = await admin
        .from("tb_wallet_hs")
        .update(approvePatch)
        .eq("id", id)
        .eq("status", "1");
      if (updHsErr) {
        console.error(`[tb_wallet_hs mutation] failed`, { code: updHsErr.code, message: updHsErr.message });
        return { ok: false, error: updHsErr.message };
      }

      // 3. Adjust tb_wallet.wallettotal (if applicable).
      let newTotal = delta;
      if (delta !== 0) {
        const { data: wRow, error: wRowErr } = await admin
          .from("tb_wallet")
          .select("userid, wallettotal")
          .eq("userid", row.userid)
          .maybeSingle<{ userid: string; wallettotal: number }>();
        if (wRowErr) {
          console.error(`[tb_wallet list] failed`, { code: wRowErr.code, message: wRowErr.message });
        }
        if (!wRow) {
          const { error: insErr } = await admin
            .from("tb_wallet")
            .insert({ userid: row.userid, wallettotal: delta });
          if (insErr) {
            return {
              ok: false,
              error: `อนุมัติ tb_wallet_hs สำเร็จ (id=${id}) แต่ tb_wallet insert ล้มเหลว: ${insErr.message}`,
            };
          }
        } else {
          newTotal = Number(wRow.wallettotal) + delta;
          const { error: updWErr } = await admin
            .from("tb_wallet")
            .update({ wallettotal: newTotal })
            .eq("userid", row.userid);
          if (updWErr) {
            return {
              ok: false,
              error: `อนุมัติ tb_wallet_hs สำเร็จ (id=${id}) แต่ tb_wallet update ล้มเหลว: ${updWErr.message}`,
            };
          }
        }
      }

      // ADR-0025 — settle any carried cashback ([CB:<amt>] tag stamped by
      // submitForwarderPayment). Mirror of the deposit-cascade settle in
      // wallet-hs.ts: idempotent on cbhrefid, clamped to live balance. The slip
      // `amount` was already reduced by the applied cashback at submit, so this
      // only debits tb_cash_back + logs tb_cash_back_hs (no wallet double-count).
      const cashbackRequested = parseCashbackNoteTag(row.note);
      if (cashbackRequested > 0) {
        try {
          const cbRes = await spendCashbackAtCheckout(admin, {
            userid: row.userid,
            requested: cashbackRequested,
            cbhrefid: cashbackRefId("forwarder", `walleths:${id}`),
            nowIso: new Date().toISOString(),
          });
          logger.info("wallet-trans", "cashback settled on slip approve", {
            wallet_hs_id: id, userid: row.userid, applied: cbRes.applied, alreadySpent: cbRes.alreadySpent,
          });
        } catch (e) {
          logger.warn("wallet-trans", "cashback settle failed (non-fatal · money already moved)", {
            wallet_hs_id: id, userid: row.userid, error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      await logAdminAction(adminId, "tb_wallet_hs.approve", "tb_wallet_hs", String(id), {
        userid: row.userid,
        amount: amt,
        delta,
        new_balance: newTotal,
        ...(workNote && workNote.length > 0 ? { work_note: workNote } : {}),
      });

      // 4. Wave 29: auto-receipt hook (matches legacy grenrateReceiptF
      //    behaviour from functions.php L400-608). Trigger when this is a
      //    forwarder-payment row (typeservice='2') with a forwarder id
      //    pinned in `reforder`. Best-effort — receipt failure does NOT
      //    block the wallet approval (the money already moved).
      if (row.typeservice === "2" && row.reforder) {
        const fid = Number(row.reforder);
        if (Number.isFinite(fid) && fid > 0) {
          // P0 mark-paid symmetry — settle tb_forwarder for the paid row.
          // submitForwarderPayment (actions/forwarder.ts) does NOT flip fstatus
          // at submit (legacy keeps fStatus=5 until staff confirm the slip), so
          // the slip-approve is where the order must settle — otherwise paid
          // forwarders are stuck at "รอชำระเงิน" forever + the AR cockpit never
          // decrements. Mirror the pure-wallet flip in pay-user.ts L574-576
          // (legacy pay-users.php L467/L469):
          //   standard    → fstatus='6' + fdateadminstatus + fdatestatus6
          //                  (guard fstatus='5' → idempotent 5→6 advance)
          //   credit row  → fcredit='' + fdateadminstatus  (NO fstatus/fdatestatus6
          //                  flip — credit rows settle without the 6 stamp; guard
          //                  fcredit='1' → idempotent, a credit row reaches the
          //                  payable set via fCredit='1' and may NOT be at fstatus=5).
          // wusercredit is stamped per row by submitForwarderPayment. Best-effort
          // + logged like the auto-receipt — a flip failure must NOT roll back the
          // wallet leg (the money already moved).
          const nowIso = new Date().toISOString();
          const isCredit = (row.wusercredit ?? "").trim() === "1";
          let flipErrMsg: string | null = null;
          if (isCredit) {
            const { error: flipErr } = await admin
              .from("tb_forwarder")
              .update({ fcredit: "", fdateadminstatus: nowIso })
              .eq("id", fid)
              .eq("userid", row.userid)
              .eq("fcredit", "1");
            flipErrMsg = flipErr?.message ?? null;
          } else {
            const { error: flipErr } = await admin
              .from("tb_forwarder")
              .update({ fstatus: "6", fdateadminstatus: nowIso, fdatestatus6: nowIso })
              .eq("id", fid)
              .eq("userid", row.userid)
              .eq("fstatus", "5");
            flipErrMsg = flipErr?.message ?? null;
          }
          if (flipErrMsg) {
            logger.warn("wallet-trans", "forwarder settle flip failed (non-fatal · money already moved)", {
              wallet_hs_id: id, userid: row.userid, fid, isCredit, error: flipErrMsg,
            });
          }

          // BUG-1 — persist the PCSF เหมาๆ ฿50 onto tb_forwarder.ftransportprice
          // BEFORE the receipt. submitForwarderPayment (self-pay) folds the ฿50
          // into tb_wallet_hs.amount but NEVER writes it back to the forwarder
          // row, so autoIssueReceiptOnPaymentLand (which RE-READS the row) issued
          // a receipt + AR for freight-only while the customer paid freight+50.
          // Mirror the admin pay-on-behalf side-effect (pay-user.ts:615): on a
          // settled forwarder-payment row (typeservice='2' / type='4'), if the
          // forwarder is still fshipby='PCSF' & ftransportprice=0, set it to 50.
          // The `.eq("ftransportprice", 0)` guard keeps this idempotent — a
          // re-approve (or a row already bumped by the admin path) is a 0-row
          // no-op → no double-add. Single-row approve settles exactly ONE fid,
          // so "once per settle" is inherent here. Best-effort + logged: a
          // ftransportprice write failure must NOT roll back the wallet leg.
          //
          // ⚠️ RESIDUAL (audit 2026-06-19): a self-pay submit with N>1 PCSF-zero
          // rows splits the ฿50 across the rows (50/N each in tb_wallet_hs.amount).
          // The BULK approve (tb-bulk.ts) handles this correctly — it bumps the
          // FIRST PCSF row per receipt-batch only. But approving such an order via
          // N separate SINGLE-row approves (one receipt per fid) would bump each to
          // 50 → receipt sum over-states by ฿50×(N−1). N=1 (the dominant case) is
          // exact. Staff should bulk-approve multi-row import payments; the clean
          // fix (honor the settled wallet_hs.amount in autoIssueReceiptOnPaymentLand)
          // is tracked separately (out of this unit's file scope).
          if ((row.typeservice === "2") && (row.type ?? "") === "4") {
            const { error: pcsfErr } = await admin
              .from("tb_forwarder")
              .update({ ftransportprice: MAO_FLAT_FEE })
              .eq("id", fid)
              .eq("userid", row.userid)
              .in("fshipby", ["PCSF", "PRF"])
              .eq("ftransportprice", 0);
            if (pcsfErr) {
              logger.warn("wallet-trans", "PCSF ftransportprice=50 persist failed (non-fatal · money already moved)", {
                wallet_hs_id: id, userid: row.userid, fid, error: pcsfErr.message,
              });
            }
          }

          const dateSlip = row.dateslip ? new Date(row.dateslip) : new Date();
          const r = await autoIssueReceiptOnPaymentLand(admin, {
            userid: row.userid,
            fids: [fid],
            dateSlip,
            source: "wallet_hs.approve.single",
          });
          if (!r.ok && !r.alreadyIssued) {
            logger.warn("wallet-trans", "auto-receipt failed (non-fatal)", {
              wallet_hs_id: id,
              userid:       row.userid,
              fid,
              error:        r.error,
            });
          }
          if (r.ok) {
            revalidatePath(`/admin/accounting/forwarder-invoice/${r.data.receiptId}`);
            revalidatePath("/admin/accounting/forwarder-invoice");
            revalidatePath(`/service-import/${fid}/invoice`);
          }
        }
      }

      // ADR-0028 — shop-order (ฝากสั่งซื้อ) slip-pay settle: type='8' /
      // typeservice='1' → mark the order PAID (hstatus '2'→'3'). delta was 0
      // (type='8' ∉ {1,2,4,7}) so NO wallet balance moved (bank transfer).
      // Best-effort + logged · idempotent via the hstatus='2' guard.
      if (row.typeservice === "1" && row.type === "8" && row.reforder) {
        const shopNow = new Date().toISOString();
        const { error: shopFlipErr } = await admin
          .from("tb_header_order")
          .update({ hstatus: "3", hdate3: shopNow, hdateupdate: shopNow, paydeposit: "1" })
          .eq("hno", row.reforder)
          .eq("userid", row.userid)
          .eq("hstatus", "2");
        if (shopFlipErr) {
          logger.warn("wallet-trans", "shop-order settle flip failed (non-fatal · slip approved)", {
            wallet_hs_id: id, userid: row.userid, hno: row.reforder, error: shopFlipErr.message,
          });
        }
        revalidatePath(`/service-order/${row.reforder}`);
        revalidatePath("/service-order");
      }

      revalidatePath(`/admin/wallet/${id}`);
      revalidatePath("/admin/wallet");
      revalidatePath("/admin");

      return { ok: true, data: { id, new_balance: newTotal } };
    },
  );
}

// ════════════════════════════════════════════════════════════════
// 3. adminRejectWalletHs — single-row reject (status 1 → 3)
// ════════════════════════════════════════════════════════════════

const rejectSchema = z.object({
  id:   z.number().int().positive(),
  // The rejection reason (legacy behaviour — REPLACES the note when no work
  // note is also given, to stay byte-for-byte backward compatible).
  note: z.string().trim().max(1000).optional(),
  // UNIT C — optional "หมายเหตุงาน" (internal work note). When present, the
  // persisted note APPENDS (reason + work note) onto the existing note so the
  // [CB:]/[WALLET:] tags survive — they are read from row.note above before
  // the update, but appending keeps them visible to staff afterwards too.
  workNote: z.string().trim().max(500).optional(),
});
export type AdminRejectWalletHsInput = z.infer<typeof rejectSchema>;

export async function adminRejectWalletHs(
  input: AdminRejectWalletHsInput,
): Promise<AdminActionResult<{ id: number }>> {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, note, workNote } = parsed.data;

  return withAdmin<{ id: number }>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();

      const { data: row, error: rowErr } = await admin
        .from("tb_wallet_hs")
        .select("id, userid, status, note")
        .eq("id", id)
        .maybeSingle<{ id: number; userid: string; status: string | null; note: string | null }>();
      if (rowErr) {
        console.error(`[tb_wallet_hs list] failed`, { code: rowErr.code, message: rowErr.message });
        return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
      }
      if (!row) return { ok: false, error: "ไม่พบรายการ" };
      if (row.status !== "1") {
        return { ok: false, error: `รายการนี้ดำเนินการแล้ว (สถานะ ${row.status})` };
      }

      const patch: Record<string, unknown> = {
        status: "3",
        adminid: legacyAdminId,
        adminidupdate: legacyAdminId,
      };
      // UNIT C — note-write policy:
      //   • work note present → APPEND (existing note + reason + work note) so
      //     the [CB:]/[WALLET:] tags + any prior note survive (no clobber).
      //   • work note absent  → legacy behaviour: replace with the reason only
      //     (byte-for-byte backward compatible).
      if (workNote && workNote.length > 0) {
        const reasonAndWork = [note, workNote].filter((s) => s && s.length > 0).join(" — ");
        patch.note = appendWorkNote(row.note, reasonAndWork);
      } else if (note && note.length > 0) {
        patch.note = note;
      }

      const { error: updErr } = await admin
        .from("tb_wallet_hs")
        .update(patch)
        .eq("id", id)
        .eq("status", "1");
      if (updErr) {
        console.error(`[tb_wallet_hs mutation] failed`, { code: updErr.code, message: updErr.message });
        return { ok: false, error: updErr.message };
      }

      // ADR-0025 — refund any carried cashback if the slip is rejected. Reads
      // the ORIGINAL row.note (the [CB:] tag), not the rejection-reason `note`.
      // refundCashbackOnReject is idempotent + no-ops cleanly if no prior spend
      // landed (reject-before-approve), so it is safe on every reject.
      if (parseCashbackNoteTag(row.note) > 0) {
        try {
          await refundCashbackOnReject(admin, {
            userid: row.userid,
            cbhrefid: cashbackRefId("forwarder", `walleths:${id}`),
            nowIso: new Date().toISOString(),
          });
        } catch (e) {
          logger.warn("wallet-trans", "cashback refund failed (non-fatal)", {
            wallet_hs_id: id, userid: row.userid, error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // ADR-0028 Phase 2 — refund the wallet DISCOUNT when a shop-order slip is
      // rejected. The ORIGINAL row.note carries a [WALLET:<thb>] tag (the amount
      // the customer applied from their wallet at submit, debit-at-submit). The
      // bank payment failed verification → re-credit it. Runs ONCE (the status
      // 1→3 flip above is the gate; a re-reject bounces at the status guard).
      const walletRefund = (() => {
        const m = /\[WALLET:([\d.]+)\]/.exec(row.note ?? "");
        return m ? Math.round(Number(m[1]) * 100) / 100 : 0;
      })();
      if (walletRefund > 0) {
        try {
          const { data: w, error: wRdErr } = await admin.from("tb_wallet").select("wallettotal").eq("userid", row.userid).maybeSingle<{ wallettotal: number | string | null }>();
          if (wRdErr) console.error(`[reject wallet-refund read] failed`, { message: wRdErr.message });
          await admin.from("tb_wallet").update({ wallettotal: Math.round((Number(w?.wallettotal ?? 0) + walletRefund) * 100) / 100 }).eq("userid", row.userid);
          logger.info("wallet-trans", "shop-order wallet-discount refunded on reject", { wallet_hs_id: id, userid: row.userid, amount: walletRefund });
        } catch (e) {
          logger.warn("wallet-trans", "shop-order wallet-discount refund failed (non-fatal)", {
            wallet_hs_id: id, userid: row.userid, amount: walletRefund, error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      await logAdminAction(adminId, "tb_wallet_hs.reject", "tb_wallet_hs", String(id), {
        userid: row.userid,
        note,
        ...(workNote && workNote.length > 0 ? { work_note: workNote } : {}),
      });

      revalidatePath(`/admin/wallet/${id}`);
      revalidatePath("/admin/wallet");
      revalidatePath("/admin");

      return { ok: true, data: { id } };
    },
  );
}
