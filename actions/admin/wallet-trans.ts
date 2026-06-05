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
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { autoIssueReceiptOnPaymentLand } from "@/lib/admin/auto-issue-receipt";
import { logger } from "@/lib/logger";
import { spendCashbackAtCheckout, refundCashbackOnReject } from "./wallet-hs";
import { cashbackRefId, parseCashbackNoteTag } from "@/lib/cashback/note-tag";

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
});
export type AdminApproveWalletHsInput = z.infer<typeof approveSchema>;

export async function adminApproveWalletHs(
  input: AdminApproveWalletHsInput,
): Promise<AdminActionResult<{ id: number; new_balance: number }>> {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id } = parsed.data;

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
        .select("id, userid, amount, type, status, typeservice, reforder, dateslip, note, wusercredit")
        .eq("id", id)
        .maybeSingle<{
          id: number;
          userid: string;
          amount: number;
          type: string | null;
          status: string | null;
          typeservice: string | null;
          reforder: string | null;
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

      const amt = Number(row.amount);
      const t = row.type ?? "1";
      const delta = (t === "1" || t === "2") ? amt
                  : (t === "4" || t === "7") ? -amt
                  : 0;

      // 2. UPDATE tb_wallet_hs status='2'.
      const { error: updHsErr } = await admin
        .from("tb_wallet_hs")
        .update({ status: "2", adminid: legacyAdminId, adminidupdate: legacyAdminId })
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
  note: z.string().trim().max(1000).optional(),
});
export type AdminRejectWalletHsInput = z.infer<typeof rejectSchema>;

export async function adminRejectWalletHs(
  input: AdminRejectWalletHsInput,
): Promise<AdminActionResult<{ id: number }>> {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, note } = parsed.data;

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
      if (note && note.length > 0) patch.note = note;

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

      await logAdminAction(adminId, "tb_wallet_hs.reject", "tb_wallet_hs", String(id), {
        userid: row.userid,
        note,
      });

      revalidatePath(`/admin/wallet/${id}`);
      revalidatePath("/admin/wallet");
      revalidatePath("/admin");

      return { ok: true, data: { id } };
    },
  );
}
