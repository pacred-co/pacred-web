"use server";

import { revalidatePath } from "next/cache";
import { bustAdminChrome } from "@/lib/cache/revalidate-chrome";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { resolveProfileIdForLegacyUserid } from "@/lib/auth/tb-users-resolver";
import { issueYuanTaxInvoice } from "@/lib/admin/yuan-tax-invoice";
import { isShopYuanTaxInvoiceEnabled } from "@/lib/tax/shop-yuan-flag";
import { findDuplicateYuanSlips } from "@/lib/admin/duplicate-slip-check";
import { modeFromPref } from "@/lib/tax/tax-doc-mode";
import { logger } from "@/lib/logger";
import {
  YUAN_STATUSES,
  YUAN_STATUS_LABEL,
  isYuanTransitionAllowed,
  paystatusToPacred,
  pacredToPaystatus,
} from "@/lib/legacy-paystatus-map";
// Tier-A "silent dead-write" fix: delegate the bulk-approve path to the
// canonical TB action (tb-bulk.ts). Same-module-style delegation keeps the
// function shape backward-compatible for any stray caller still on the
// rebuilt-string API contract.
import { adminBulkApproveYuanPaymentsTb } from "./tb-bulk";

// Local aliases — the function body below reads `STATUSES` (for the Zod
// enum) and `STATUS_LABEL` (for Thai error messages). Keep the names so
// the body diff against the pre-A5 version stays minimal.
const STATUSES = YUAN_STATUSES;
const STATUS_LABEL = YUAN_STATUS_LABEL;

// ── resolveLegacyAdminId — same helper as wallet-hs.ts + yuan-payments-tb.ts ──
// `withAdmin({ adminId })` returns the Supabase auth UUID (36 chars). The
// legacy `tb_payment.adminid` / `adminidupdate` columns are varchar(10);
// writing the UUID throws 22001 "value too long for character varying(10)".
// Resolve the legacy slug from tb_admin instead. Falls back to "system".
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[yuan-payments auth getUser] failed`, { code: authErr.code, message: authErr.message });
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
    console.error(`[yuan-payments tb_admin lookup] failed`, { code: error.code, message: error.message });
  }
  if (data?.adminID) return data.adminID;
  return email.split("@")[0].slice(0, 10);
}

const updateSchema = z.object({
  // Tier A5: id accepts string OR number (the live caller — actions-cell.tsx —
  // passes the tb_payment.id as a string from the page row key, but tb_payment.id
  // is bigint; coerce numerically and reject non-numeric input).
  id: z.union([
    z.string().regex(/^\d+$/, "id ต้องเป็นตัวเลข"),
    z.number().int().positive(),
  ]).transform((v) => (typeof v === "number" ? v : Number(v))),
  status:           z.enum(STATUSES).optional(),
  cost_rate:        z.number().positive().optional(),  // → payratecost (admin's internal cost rate)
  cost_thb:         z.number().nonnegative().optional(), // → paythbcost
  profit_thb:       z.number().optional(),             // → payprofitthb
  // admin_proof_url kept on the schema (back-compat with rebuilt-shape callers)
  // but NOT written to tb_payment — that lane uses tb_payment.imagesslipadmin
  // (varchar(250) — a Supabase Storage filename, NOT a URL). A future detail-page
  // mutation can wire imagesslipadmin via a separate slipFile + uploadToBucket
  // flow (see actions/admin/yuan-payments-tb.ts:130 for the create-side pattern).
  admin_proof_url:  z.string().max(500).optional(),
  note:             z.string().trim().max(1000).optional(),
  // A5 (owner 2026-06-21) — ชั้น-1 dup-gate override: when a same-customer/same-day/
  // same-amount yuan slip already exists, the approve is BLOCKED until the accountant
  // eyeballs it + re-submits with this flag (mirrors the wallet dup-gate).
  acknowledgeDuplicate: z.boolean().optional(),
});
export type AdminUpdateYuanPaymentInput = z.input<typeof updateSchema>;

// A4 (owner 2026-06-21) — ROUND-1 yuan-slip review. Stamps reviewed_at +
// reviewed_by_admin_id on a pending (paystatus='1') tb_payment row so the
// approve (round-2) may settle. No money/status change. Same admin may do both.
export async function adminReviewYuanRound1(
  input: { id: number | string },
): Promise<AdminActionResult> {
  const idNum = Number(input?.id);
  if (!Number.isFinite(idNum) || idNum <= 0) return { ok: false, error: "invalid_id" };
  return withAdmin(["accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = await resolveLegacyAdminId();
    const { data: claimed, error: updErr } = await admin
      .from("tb_payment")
      .update({ reviewed_at: new Date().toISOString(), reviewed_by_admin_id: legacyAdminId })
      .eq("id", idNum)
      .eq("paystatus", "1")
      .select("id")
      .maybeSingle();
    if (updErr) {
      console.error("[adminReviewYuanRound1] failed", { code: updErr.code, message: updErr.message, id: idNum });
      return { ok: false, error: updErr.message };
    }
    if (!claimed) return { ok: false, error: "ตรวจรอบ 1 ไม่ได้ — รายการไม่ได้อยู่สถานะ 'รอตรวจสอบ' แล้ว" };
    await logAdminAction(adminId, "tb_payment.review_round1", "tb_payment", String(idNum), {});
    revalidatePath("/admin/yuan-payments");
    revalidatePath("/admin");
    return { ok: true };
  });
}

export async function adminUpdateYuanPayment(input: AdminUpdateYuanPaymentInput): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = await resolveLegacyAdminId();

    // ── Read the existing tb_payment row.
    const { data: existing, error: existingErr } = await admin
      .from("tb_payment")
      .select("id, userid, paystatus, payyuan, paythb, paydeposit, tax_doc_pref, paydate, reviewed_at")
      .eq("id", d.id)
      .maybeSingle<{
        id: number;
        userid: string;
        paystatus: string;
        payyuan: number;
        paythb: number;
        paydeposit: string | null;
        tax_doc_pref: string | null;
        paydate: string | null;
        reviewed_at: string | null;
      }>();
    if (existingErr) {
      console.error(`[tb_payment mutation lookup] failed`, { code: existingErr.code, message: existingErr.message });
      return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
    }
    if (!existing) return { ok: false, error: "not_found" };

    // ── Check whether an earlier refund already exists, so we can correctly
    // collapse paystatus='3' to either `refunded` or `failed`. Legacy refund
    // pattern (payment.php L678-680): INSERT tb_wallet_hs (type='5', reforder=ID).
    const { data: refundRow, error: refundErr } = await admin
      .from("tb_wallet_hs")
      .select("id")
      .eq("type", "5")
      .eq("reforder", String(existing.id))
      .eq("userid", existing.userid)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (refundErr) {
      console.error(`[tb_wallet_hs refund lookup] failed`, { code: refundErr.code, message: refundErr.message });
    }
    const existingStatus = paystatusToPacred(existing.paystatus, Boolean(refundRow?.id));
    const paidViaWallet = existing.paydeposit === "1";

    const update: Record<string, unknown> = { adminidupdate: legacyAdminId };
    let statusChanged = false;

    if (d.status && d.status !== existingStatus) {
      // W-3 / revenue-flow H-1 — reject any transition that is not on the
      // allow-list. Most importantly this blocks refunded→completed (and
      // failed→completed), which would re-stamp the payment completed
      // without re-debiting the wallet → customer keeps money + goods.
      if (!isYuanTransitionAllowed(existingStatus, d.status)) {
        return {
          ok: false,
          error: `เปลี่ยนสถานะ ${STATUS_LABEL[existingStatus] ?? existingStatus} → ${STATUS_LABEL[d.status] ?? d.status} ไม่ได้ (ไม่อนุญาต) — สถานะนี้ห้ามย้อน/ข้าม เพราะจะทำให้ยอด wallet ไม่ตรง`,
        };
      }
      statusChanged = true;
      const newPaystatus = pacredToPaystatus(d.status);
      if (newPaystatus !== null) {
        update.paystatus = newPaystatus;
        // Stamp paydateadmin on every legacy state-flip (matches payment.php
        // L644 + L659 — set on both approve '2' and reject '3').
        update.paydateadmin = new Date().toISOString();
        update.adminid = legacyAdminId;
      }

      // ── A4 (owner 2026-06-21) — TWO-ROUND verify: the yuan approve (round-2)
      //    refuses to settle until round-1 (adminReviewYuanRound1) stamped
      //    reviewed_at. Same admin may do both rounds (D2).
      if (newPaystatus === "2" && !existing.reviewed_at) {
        return { ok: false, error: "ต้องตรวจสลิป รอบ 1 ก่อน แล้วจึงอนุมัติ + ตัดจ่าย (รอบ 2)" };
      }

      // ── A5 (owner 2026-06-21) — ชั้น-1 BLOCKING dup-gate on the yuan APPROVE.
      //    Yuan slips live in tb_payment (not tb_wallet_hs), so the wallet dup-gate
      //    never covered them. Block settle when a same-customer/same-day/same-amount
      //    yuan slip already exists unless the accountant ticked acknowledgeDuplicate.
      if (newPaystatus === "2" && !d.acknowledgeDuplicate) {
        const dups = await findDuplicateYuanSlips(admin, {
          id: existing.id, userid: existing.userid, paythb: existing.paythb, paydate: existing.paydate,
        });
        if (dups.length > 0) {
          return {
            ok: false,
            error: `พบสลิปโอนหยวนที่อาจซ้ำ (ลูกค้าเดียวกัน วันเดียวกัน ยอดเท่ากัน ${dups.length} รายการ) — ตรวจสอบแล้วยืนยันว่าไม่ใช่รายการซ้ำก่อนอนุมัติ`,
          };
        }
      }
    }

    // ── Legacy cost/profit capture on APPROVE (payment.php L613-625, L644) ──
    // Faithful port: when an admin approves a yuan transfer (→ paystatus '2'),
    // legacy captures payRateCost — defaulting to tb_settings.hRateCostDefault
    // when the row carries none (payment.php L864-871) — and computes
    //   payTHBCost   = payYuan × payRateCost
    //   payProfitTHB = payTHB  − payTHBCost
    // The approve UI never collected a rate, so paythbcost/payprofitthb stayed
    // 0 → every acc-payment + yuan-profit report showed cost 0 / overstated
    // profit. Auto-fill ONLY when the caller passed no explicit cost_rate (the
    // [id] edit form can still override via d.cost_rate). "ค่อยพัฒนาต่อ": this
    // mirrors legacy exactly; a per-row cost override stays available.
    if (statusChanged && update.paystatus === "2" && d.cost_rate == null) {
      const { data: settingsRow, error: settingsErr } = await admin
        .from("tb_settings")
        .select("hratecostdefault")
        .eq("id", 1)
        .maybeSingle<{ hratecostdefault: number | string | null }>();
      if (settingsErr) {
        console.error(`[yuan approve cost] tb_settings.hratecostdefault read failed`, { code: settingsErr.code, message: settingsErr.message });
      }
      // Legacy fallback when the setting is unreadable/0 is $hRateCostDefault=0.
      const payRateCost  = Number(settingsRow?.hratecostdefault ?? 0) || 0;
      const payThbCost   = Math.round(Number(existing.payyuan) * payRateCost * 100) / 100;
      const payProfitThb = Math.round((Number(existing.paythb) - payThbCost) * 100) / 100;
      update.payratecost  = payRateCost;
      update.paythbcost   = payThbCost;
      update.payprofitthb = payProfitThb;
    }

    // Cost/profit fields → legacy column names. owner 2026-06-25 (YUAN cost-editable
    // ALL statuses · [[cost-editable-sell-locked]]): editing the real cost RATE
    // re-derives paythbcost (= payyuan × rate) + payprofitthb (= paythb − cost)
    // server-side so the breakdown stays consistent — unless an explicit cost_thb/
    // profit_thb override is also sent. This update path has NO status gate (a
    // cost-only edit keeps the unconditional UPDATE), so cost is correctable at any
    // status incl. completed/refunded. SELL (paythb/payrate/payyuan) is NOT in the
    // schema → never editable here = cost-editable, sell-locked.
    if (d.cost_rate != null) {
      update.payratecost = d.cost_rate;
      if (d.cost_thb == null) {
        update.paythbcost = Math.round(Number(existing.payyuan) * d.cost_rate * 100) / 100;
      }
    }
    if (d.cost_thb != null) update.paythbcost = d.cost_thb;
    if (d.profit_thb != null) {
      update.payprofitthb = d.profit_thb;
    } else if ((d.cost_rate != null || d.cost_thb != null) && update.paythbcost != null) {
      update.payprofitthb =
        Math.round((Number(existing.paythb) - Number(update.paythbcost)) * 100) / 100;
    }

    // ── Single UPDATE on tb_payment.
    //
    // 💰 OPTIMISTIC CONCURRENCY GUARD (double-refund lock · 2026-06-14).
    //   The refund branch below credits the wallet (tb_wallet_hs type='5').
    //   Its `!refundRow?.id` idempotency check is read-at-load — a TOCTOU:
    //   two admins (or a double-click) that both read paystatus before
    //   either writes would BOTH pass the check and BOTH credit the wallet =
    //   double-refund. We close the window by making the status flip
    //   conditional on the row STILL being in the paystatus we read; a
    //   0-row result means a concurrent admin already processed it → abort
    //   BEFORE the wallet write. Cost/profit-only edits (statusChanged
    //   false) keep the unconditional update so a concurrent status flip
    //   doesn't reject a harmless field edit.
    let updateQ = admin.from("tb_payment").update(update).eq("id", existing.id);
    if (statusChanged) updateQ = updateQ.eq("paystatus", existing.paystatus);
    const { data: updatedRows, error: updErr } = await updateQ.select("id");
    if (updErr) return { ok: false, error: updErr.message };
    if (statusChanged && (!updatedRows || updatedRows.length === 0)) {
      return {
        ok: false,
        error: "รายการนี้ถูกดำเนินการไปแล้ว (สถานะถูกเปลี่ยนโดยแอดมินคนอื่นหรือกดซ้ำ) — โปรดรีเฟรชหน้าแล้วลองใหม่",
      };
    }

    // ── Wallet refund side-effect (paystatus → '3' refunded path).
    //
    // Mirrors legacy payment.php L666-682:
    //   INSERT tb_wallet_hs (type='5', status='2', amount=paythb, refOrder=ID, ...)
    //   UPDATE tb_wallet SET walletTotal = walletTotal + paythb
    //
    // Fires ONLY when:
    //   - the new Pacred status is `refunded` (not `failed` — legacy reject
    //     without wallet-paid never moved money)
    //   - the original payment was paid_via_wallet (paydeposit='1')
    //   - we haven't already written a type='5' refund row for this id
    //     (idempotent — re-running the refund must not double-credit)
    if (statusChanged && d.status === "refunded" && paidViaWallet && !refundRow?.id) {
      const nowIso = new Date().toISOString();
      const refundAmount = Number(existing.paythb);

      const { error: hsErr } = await admin
        .from("tb_wallet_hs")
        .insert({
          date:            nowIso,
          dateslip:        nowIso,
          amount:          refundAmount,
          status:          "2",
          type:            "5",                          // 5 = refund (legacy)
          typenew:         "1",
          typeservice:     "1",
          paydeposit:      "0",
          imagesslip:      "",
          depositnamebank: "",
          nameuserbank:    "",
          nouserbank:      "",
          note:            d.note ?? "ระบบคืนเงินอัตโนมัติ (ยกเลิกฝากโอนหยวน)",
          adminid:         legacyAdminId,
          adminidupdate:   legacyAdminId,
          session:         "admin-refund",
          reforder:        String(existing.id),         // varchar(30) — id stringified
          whno:            "",
          wusercredit:     "0",
          userid:          existing.userid,
          adminidcrate:    legacyAdminId,
        });
      if (hsErr) {
        // tb_payment status is already flipped to '3'; surface so accounting
        // reconciles the still-standing debit rather than silently leaving
        // the customer charged for a refunded transfer.
        return {
          ok: false,
          error: `เปลี่ยนสถานะเป็น "คืนเงินแล้ว" สำเร็จ แต่บันทึก tb_wallet_hs ล้มเหลว: ${hsErr.message}`,
        };
      }

      // Update tb_wallet.wallettotal (legacy adjusts the per-customer balance row).
      const { data: wRow, error: wRowErr } = await admin
        .from("tb_wallet")
        .select("userid, wallettotal")
        .eq("userid", existing.userid)
        .maybeSingle<{ userid: string; wallettotal: number }>();
      if (wRowErr) {
        console.error(`[tb_wallet refund lookup] failed`, { code: wRowErr.code, message: wRowErr.message });
      }
      if (!wRow) {
        const { error: walletInsErr } = await admin
          .from("tb_wallet")
          .insert({ userid: existing.userid, wallettotal: refundAmount });
        if (walletInsErr) {
          return {
            ok: false,
            error: `คืนเงินสำเร็จ (tb_wallet_hs) แต่ tb_wallet insert ล้มเหลว: ${walletInsErr.message}`,
          };
        }
      } else {
        const newTotal = Number(wRow.wallettotal) + refundAmount;
        const { error: walletUpdErr } = await admin
          .from("tb_wallet")
          .update({ wallettotal: newTotal })
          .eq("userid", existing.userid);
        if (walletUpdErr) {
          return {
            ok: false,
            error: `คืนเงินสำเร็จ (tb_wallet_hs) แต่ tb_wallet update ล้มเหลว: ${walletUpdErr.message}`,
          };
        }
      }
    }

    await logAdminAction(adminId, "tb_payment.update", "tb_payment", String(existing.id), {
      before: { paystatus: existing.paystatus, status: existingStatus },
      after:  update,
      pacred_status: d.status,
    });

    // ── LINE/in-app notify (matches legacy payment.php L651-655 + L684-688
    // sendLine pattern). Resolve the legacy userid to a Supabase profile uuid
    // so `sendNotification` can deliver via LINE + in-app inbox.
    if (statusChanged && d.status) {
      const profileId = await resolveProfileIdForLegacyUserid(existing.userid);
      if (profileId) {
        const isSuccess = d.status === "completed";
        void sendNotification(profileId, {
          category: "yuan_payment",
          severity: isSuccess
            ? "success"
            : (d.status === "refunded" || d.status === "failed")
              ? "warning"
              : "info",
          title:    `ฝากโอนหยวน — ${STATUS_LABEL[d.status]}`,
          body:     d.note ?? `¥${Number(existing.payyuan).toFixed(2)} = ฿${Number(existing.paythb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
          link_href:      `/service-payment`,
          reference_type: "yuan_payment",
          reference_id:   String(existing.id),
        });
      }
    }

    // ── TAX-DOCUMENT BRIDGE for ฝากโอน (yuan-approve · migration 0152) ──
    //
    //   When this transition COMPLETES the transfer (Pacred-status 'completed'
    //   → paystatus='2') and the customer chose a VAT document at order time
    //   (tb_payment.tax_doc_pref · migration 0140), issue a ใบกำกับ/ใบขน into
    //   the tb_*-native store (migration 0152). The "ฝากโอนกับเราเท่านั้น" gate
    //   is enforced inside issueYuanTaxInvoice (requires paystatus='2').
    //
    //   🔴 GATED behind the default-OFF flag tax_invoice.shop_yuan_enabled — off
    //   (default) = NO document minted (feature ships DORMANT). BEST-EFFORT —
    //   a tax-doc failure never undoes the status flip (idempotent on payment id).
    if (statusChanged && d.status === "completed") {
      try {
        if (await isShopYuanTaxInvoiceEnabled()) {
          const docMode = modeFromPref(existing.tax_doc_pref);
          if (docMode !== "none") {
            const taxRes = await issueYuanTaxInvoice(admin, {
              paymentId: existing.id,
              userid:    existing.userid,
              issuedBy:  "system-auto",
              mode:      docMode,
            });
            if (!taxRes.ok && !taxRes.alreadyIssued) {
              logger.warn("yuan-payments", "yuan tax-invoice bridge failed (non-fatal · approval stands)", {
                payment_id: existing.id, userid: existing.userid, mode: docMode, error: taxRes.error,
              });
            }
          }
        }
      } catch (e) {
        logger.warn("yuan-payments", "yuan tax-invoice bridge threw (non-fatal)", {
          payment_id: existing.id, userid: existing.userid, error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    revalidatePath("/admin/yuan-payments");
    revalidatePath(`/admin/yuan-payments/${existing.id}`);
    revalidatePath("/admin");
    // Yuan-payment status changed (+ any wallet refund) → the yuan-payment queue
    // + wallet totals may have changed; refresh the admin sidebar.
    bustAdminChrome();
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// T-P3: BULK approve pending yuan_payments (cargo revenue path)
// ────────────────────────────────────────────────────────────
//
// 🚨 Tier-A "silent dead-write" fix (2026-06-02 · master-fidelity #1 pattern):
//   Prior implementation read + wrote `.from("yuan_payments")` — the REBUILT
//   UUID table, EMPTY on prod. Every bulk-approve press silently no-op'd
//   because the rebuilt table has 0 rows; the real ~1,460 yuan transfers
//   live in `tb_payment`.
//
// Fix: delegate to `adminBulkApproveYuanPaymentsTb` (actions/admin/tb-bulk.ts
//   L356) — the canonical faithful action that writes `tb_payment.paystatus`,
//   stamps `paydateadmin`, resolves the legacy admin slug for `adminid`
//   (varchar(10) — same Wave 23 P0 5254f8d constraint).
//
// Schema bridge: the old input shape took `ids: string[]` (UUIDs from the
//   rebuilt table). The faithful TB action takes `ids: number[]` (bigint
//   tb_payment.id). We accept either-shape strings and coerce numerically;
//   non-numeric entries (legacy UUID format) get rejected per-row in the
//   result envelope rather than aborting the whole batch (preserves the
//   pre-tombstone caller contract for the orphaned bulk-approve-bar).
//   The active UI (`/admin/yuan-payments` → tb-bulk-bar.tsx) calls
//   `adminBulkApproveYuanPaymentsTb` directly with numeric ids; this
//   wrapper is here for any stray caller still on the rebuilt-shape API.

const yuanBulkSchema = z.object({
  // Relaxed from .uuid() — accept any non-empty string, coerce to bigint
  // below. Rebuilt-UUID-shape strings will fail numeric coercion and be
  // surfaced as per-row errors rather than aborting the whole batch.
  ids:  z.array(z.string().min(1)).min(1, "ต้องเลือกอย่างน้อย 1 รายการ").max(50, "เลือกได้สูงสุด 50 รายการต่อรอบ"),
  note: z.string().trim().max(500).optional(),
});
export type AdminBulkApproveYuanPaymentsInput = z.infer<typeof yuanBulkSchema>;

type YuanBulkResult = { approved: number; skipped: number; errors: Array<{ id: string; reason: string }> };

export async function adminBulkApproveYuanPayments(
  input: AdminBulkApproveYuanPaymentsInput,
): Promise<AdminActionResult<YuanBulkResult>> {
  const parsed = yuanBulkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { ids } = parsed.data;

  // Parse stringified bigints; non-numeric entries (rebuilt UUIDs) fail
  // per-row with a clear error so the UI can highlight them.
  const result: YuanBulkResult = { approved: 0, skipped: 0, errors: [] };
  const numericIds: number[] = [];
  for (const raw of ids) {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      result.errors.push({
        id: raw,
        reason: "legacy_uuid_id: ใช้ tb-bulk-bar (tb_payment.id เป็น bigint ไม่ใช่ UUID)",
      });
      continue;
    }
    numericIds.push(n);
  }

  if (numericIds.length === 0) {
    return { ok: true, data: result };
  }

  // Delegate to the faithful TB action — same module so no extra round-trip.
  const tbRes = await adminBulkApproveYuanPaymentsTb({ ids: numericIds });
  if (!tbRes.ok) {
    return { ok: false, error: tbRes.error };
  }

  // The TB action returns { processed, failed, errors[] }; reshape to the
  // pre-tombstone { approved, skipped, errors[] } contract.
  result.approved = tbRes.data?.processed ?? 0;
  // The TB action's "didn't match paystatus='1'" rows are silently dropped
  // (no error row · matches legacy "WHERE paystatus='1'" idempotency).
  // Approximate skipped = numericIds.length - approved (excluding rows
  // that were genuinely missing).
  result.skipped = Math.max(0, numericIds.length - result.approved);
  for (const errMsg of tbRes.data?.errors ?? []) {
    result.errors.push({ id: "tb-bulk", reason: errMsg });
  }
  return { ok: true, data: result };
}

// ────────────────────────────────────────────────────────────
// P1-13 (2026-05-30 sitting-F · re-pointed to tb_payment) — mark
// tb_payment row as refunded WITH slip + cascade wallet refund.
// ────────────────────────────────────────────────────────────
//
// History: this used to write the REBUILT (empty) yuan_payments +
// wallet_transactions tables. With P0-11 mounting YuanPaymentActions
// on the legacy /admin/yuan-payments/[id] detail page, the refund
// modal became reachable and would have errored "not_found" on every
// legacy row. This pass pivots to tb_payment + the legacy
// tb_wallet_hs / tb_wallet refund pattern (same shape as
// adminUpdateYuanPayment's refund branch above — ADR-0018 D-2 rule 3).
//
// Slip handling: tb_payment.imagesslipadmin (varchar(250) per 0081)
// is the legacy "admin-attached proof" column; we stamp the storage
// path there at the same time as the status flip.
//
// Status-transition guard is the SAME allow-list adminUpdateYuanPayment
// uses (only completed → refunded · pending → refunded · processing →
// refunded — never failed→refunded, never refunded→anything).
//
// uploadYuanRefundSlip (below) handles the actual file upload — the
// UI uploads first, then passes the returned path here.

const markRefundedSchema = z.object({
  id:                z.string().regex(/^\d+$/, "id ต้องเป็นเลขใบ tb_payment (จำนวนเต็มบวก)"),
  refund_slip_path:  z.string().trim().min(1, "ต้องแนบสลิปการคืนเงิน").max(500),
  note:              z.string().trim().max(1000).optional(),
});
export type AdminMarkYuanPaymentRefundedInput = z.infer<typeof markRefundedSchema>;

export async function adminMarkYuanPaymentRefunded(
  input: AdminMarkYuanPaymentRefundedInput,
): Promise<AdminActionResult<{ refunded_at: string }>> {
  const parsed = markRefundedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const idNum = Number(d.id);

  return withAdmin<{ refunded_at: string }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const legacyAdminId = await resolveLegacyAdminId();

    const { data: existing, error: existingErr } = await admin
      .from("tb_payment")
      .select("id, userid, paystatus, payyuan, paythb, paydeposit, imagesslipadmin")
      .eq("id", idNum)
      .maybeSingle<{
        id: number; userid: string; paystatus: string;
        payyuan: number; paythb: number;
        paydeposit: string | null; imagesslipadmin: string | null;
      }>();
    if (existingErr) {
      console.error(`[tb_payment mutation lookup] failed`, { code: existingErr.code, message: existingErr.message });
      return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
    }
    if (!existing) return { ok: false, error: "not_found" };

    // Probe for an existing wallet refund row so we can map the legacy
    // paystatus to the right Pacred-string status — and so we don't
    // double-credit on re-run.
    const { data: existingRefund, error: refundProbeErr } = await admin
      .from("tb_wallet_hs")
      .select("id")
      .eq("type", "5")
      .eq("reforder", String(existing.id))
      .eq("userid", existing.userid)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (refundProbeErr) {
      console.error(`[tb_wallet_hs refund probe] failed`, { code: refundProbeErr.code, message: refundProbeErr.message });
    }
    const existingStatus = paystatusToPacred(existing.paystatus, Boolean(existingRefund?.id));
    const paidViaWallet  = existing.paydeposit === "1";

    if (!isYuanTransitionAllowed(existingStatus, "refunded")) {
      return {
        ok: false,
        error: `เปลี่ยนสถานะ ${STATUS_LABEL[existingStatus] ?? existingStatus} → คืนเงินแล้ว ไม่ได้ — สถานะนี้ห้ามคืน (เลือก refund ได้เฉพาะ pending / processing / completed)`,
      };
    }

    const refundedAt = new Date().toISOString();

    // ── Step 1: UPDATE tb_payment.paystatus → '3' + stamp slip ──────
    // Legacy: paystatus='3' covers both refund + failed; the wallet
    // refund row (type='5') is what distinguishes them.
    //
    // 💰 OPTIMISTIC CONCURRENCY GUARD (double-refund lock · 2026-06-14).
    //   Step 2 credits the wallet. Gate the flip on the row STILL being in
    //   the paystatus we read so two concurrent refunds can't both reach
    //   the wallet write: the loser matches 0 rows and aborts before any
    //   money moves. Backstops the read-at-load `!existingRefund?.id`
    //   idempotency check, which alone is a TOCTOU.
    const { data: flippedRows, error: updErr } = await admin
      .from("tb_payment")
      .update({
        paystatus:       "3",
        paydateadmin:    refundedAt,
        adminid:         legacyAdminId,
        adminidupdate:   legacyAdminId,
        imagesslipadmin: d.refund_slip_path,
      })
      .eq("id", existing.id)
      .eq("paystatus", existing.paystatus)
      .select("id");
    if (updErr) return { ok: false, error: updErr.message };
    if (!flippedRows || flippedRows.length === 0) {
      return {
        ok: false,
        error: "รายการนี้ถูกดำเนินการไปแล้ว (สถานะถูกเปลี่ยนโดยแอดมินคนอื่นหรือกดซ้ำ) — โปรดรีเฟรชหน้าแล้วลองใหม่",
      };
    }

    // ── Step 2: cascade refund to wallet (only if paid from wallet) ──
    // Idempotency: skip if a type='5' row already exists for this id.
    if (paidViaWallet && !existingRefund?.id) {
      const refundAmount = Number(existing.paythb);

      const { error: hsErr } = await admin
        .from("tb_wallet_hs")
        .insert({
          date:            refundedAt,
          dateslip:        refundedAt,
          amount:          refundAmount,
          status:          "2",
          type:            "5",                          // 5 = refund (legacy)
          typenew:         "1",
          typeservice:     "1",
          paydeposit:      "0",
          imagesslip:      d.refund_slip_path,
          depositnamebank: "",
          nameuserbank:    "",
          nouserbank:      "",
          note:            d.note ?? "คืนเงินฝากโอนหยวน + สลิปแนบ",
          adminid:         legacyAdminId,
          adminidupdate:   legacyAdminId,
          session:         "admin-refund-with-slip",
          reforder:        String(existing.id),
          whno:            "",
          wusercredit:     "0",
          userid:          existing.userid,
          adminidcrate:    legacyAdminId,
        });
      if (hsErr) {
        return {
          ok: false,
          error: `tb_payment คืนสถานะแล้ว แต่บันทึก tb_wallet_hs ล้มเหลว: ${hsErr.message}`,
        };
      }

      // Balance-bump tb_wallet (ADR-0018 D-2 rule 3 refund pattern).
      const { data: wRow, error: wRowErr } = await admin
        .from("tb_wallet")
        .select("userid, wallettotal")
        .eq("userid", existing.userid)
        .maybeSingle<{ userid: string; wallettotal: number }>();
      if (wRowErr) {
        console.error(`[tb_wallet refund lookup] failed`, { code: wRowErr.code, message: wRowErr.message });
      }
      if (!wRow) {
        const { error: walletInsErr } = await admin
          .from("tb_wallet")
          .insert({ userid: existing.userid, wallettotal: refundAmount });
        if (walletInsErr) {
          return {
            ok: false,
            error: `คืนเงินสำเร็จ (tb_wallet_hs) แต่ tb_wallet insert ล้มเหลว: ${walletInsErr.message}`,
          };
        }
      } else {
        const newTotal = Number(wRow.wallettotal) + refundAmount;
        const { error: walletUpdErr } = await admin
          .from("tb_wallet")
          .update({ wallettotal: newTotal })
          .eq("userid", existing.userid);
        if (walletUpdErr) {
          return {
            ok: false,
            error: `คืนเงินสำเร็จ (tb_wallet_hs) แต่ tb_wallet update ล้มเหลว: ${walletUpdErr.message}`,
          };
        }
      }
    }
    // If !paidViaWallet — no wallet bump needed (refund is "yuan return"
    // from the customer's already-confirmed payment, the THB side never
    // moved). Legacy reports treat both cases as paystatus='3'; the
    // type='5' wallet_hs row is what distinguishes the wallet-credit
    // sub-case.

    // ── Step 3: audit + notify ─────────────────────────────────────
    await logAdminAction(adminId, "tb_payment.mark_refunded", "tb_payment", String(existing.id), {
      before:           { paystatus: existing.paystatus, imagesslipadmin: existing.imagesslipadmin },
      after:            { paystatus: "3", imagesslipadmin: d.refund_slip_path, refunded_at: refundedAt },
      paid_via_wallet:  paidViaWallet,
      already_refunded: Boolean(existingRefund?.id),
      note:             d.note ?? null,
    });

    const profileId = await resolveProfileIdForLegacyUserid(existing.userid);
    if (profileId) {
      void sendNotification(profileId, {
        category:       "yuan_payment",
        severity:       "warning",
        title:          "ฝากโอนหยวน — คืนเงินแล้ว",
        body:           `¥${Number(existing.payyuan).toFixed(2)} = ฿${Number(existing.paythb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}${d.note ? ` — ${d.note}` : ""}`,
        link_href:      "/service-payment",
        reference_type: "yuan_payment",
        reference_id:   String(existing.id),
      });
    }

    revalidatePath("/admin/yuan-payments");
    revalidatePath(`/admin/yuan-payments/${existing.id}`);
    revalidatePath("/admin");
    // Yuan-payment refunded (paystatus→3 + wallet credit) → the yuan-payment
    // queue + wallet totals changed; refresh the admin sidebar.
    bustAdminChrome();
    return { ok: true, data: { refunded_at: refundedAt } };
  });
}

// ────────────────────────────────────────────────────────────
// Upload helper for the refund slip — mirrors uploadCommissionSlip.
// ────────────────────────────────────────────────────────────
// Caller passes a File from the admin form. Writes to 'slips' bucket
// under yuan-refunds/{yuan_payment_id}/{timestamp}.{ext}, then returns
// the path so the caller passes it to adminMarkYuanPaymentRefunded.
// Audit-logged on success.

export async function uploadYuanRefundSlip(
  yuanPaymentId: string,
  file: File,
): Promise<AdminActionResult<{ storage_path: string }>> {
  if (!yuanPaymentId || typeof yuanPaymentId !== "string" || !/^\d+$/.test(yuanPaymentId)) {
    return { ok: false, error: "invalid_input: id ต้องเป็นเลขใบ tb_payment" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "no_file" };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "file_too_large" };
  }
  const mime = (file.type ?? "").toLowerCase();
  const validMimes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
  if (mime && !validMimes.includes(mime)) {
    return { ok: false, error: "invalid_mime_type" };
  }

  const idNum = Number(yuanPaymentId);

  return withAdmin<{ storage_path: string }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // P1-13 — read tb_payment (legacy), not rebuilt yuan_payments.
    const { data: row, error: rowErr } = await admin
      .from("tb_payment")
      .select("id, paystatus")
      .eq("id", idNum)
      .maybeSingle<{ id: number; paystatus: string }>();
    if (rowErr) {
      console.error(`[tb_payment mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "not_found" };
    // Slip is meaningful for non-failed states (we may upload before the
    // actual refund-status flip in the same admin click). Legacy
    // paystatus='3' covers BOTH refund + failed; if there's no wallet
    // refund row, it's failed (can't refund again).
    const { data: refundProbe, error: refundProbeErr } = await admin
      .from("tb_wallet_hs")
      .select("id")
      .eq("type", "5")
      .eq("reforder", String(row.id))
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (refundProbeErr) {
      console.error(`[tb_wallet_hs refund probe] failed`, { code: refundProbeErr.code, message: refundProbeErr.message });
    }
    if (row.paystatus === "3" && !refundProbe?.id) {
      return { ok: false, error: "ห้ามอัพโหลดสลิป refund บนรายการที่ failed (ไม่มีเงินที่ต้องคืน)" };
    }

    const ext   = inferExtension(file);
    const stamp = String(Date.now());
    const path  = `yuan-refunds/${row.id}/${stamp}${ext}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadErr } = await admin.storage
      .from("slips")
      .upload(path, bytes, {
        contentType: mime || "application/octet-stream",
        upsert:      false,
      });
    if (uploadErr) {
      return { ok: false, error: `upload_failed: ${uploadErr.message}` };
    }

    await logAdminAction(adminId, "tb_payment.refund_slip_upload", "tb_payment", String(row.id), {
      storage_path: path,
      filename:     file.name,
      size_bytes:   file.size,
    });

    return { ok: true, data: { storage_path: path } };
  });
}

function inferExtension(file: File): string {
  const name = (file.name ?? "").toLowerCase();
  if (name.endsWith(".pdf"))                            return ".pdf";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg"))  return ".jpg";
  if (name.endsWith(".png"))                            return ".png";
  const t = (file.type ?? "").toLowerCase();
  if (t.includes("pdf"))                                return ".pdf";
  if (t.includes("jpeg") || t.includes("jpg"))          return ".jpg";
  if (t.includes("png"))                                return ".png";
  return ".bin";
}

// ────────────────────────────────────────────────────────────
// Signed-URL helper for any yuan_payment slip (customer slip OR
// refund slip OR id-doc). Used by the refund-button UI to preview
// the slip the admin just uploaded.
// ────────────────────────────────────────────────────────────

const yuanSlipSignedSchema = z.object({
  id:   z.string().regex(/^\d+$/, "id ต้องเป็นเลขใบ tb_payment"),
  kind: z.enum(["customer", "id_doc", "refund"]),
});

export async function adminGetYuanPaymentSlipSignedUrl(
  input: z.infer<typeof yuanSlipSignedSchema>,
): Promise<AdminActionResult<{ url: string | null; mime: string | null }>> {
  const parsed = yuanSlipSignedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin<{ url: string | null; mime: string | null }>(
    ["super", "accounting"],
    async () => {
      const admin = createAdminClient();
      // P1-13 — pivot to tb_payment. Legacy has 2 slip columns:
      // imagesslip = customer slip, imagesslipadmin = admin slip
      // (also where the refund slip lands per the refund flow).
      // certifiedtruecopy is the id_doc equivalent.
      const idNum = Number(parsed.data.id);
      const { data: row, error: rowErr } = await admin
        .from("tb_payment")
        .select("id, imagesslip, imagesslipadmin, certifiedtruecopy")
        .eq("id", idNum)
        .maybeSingle<{
          id: number;
          imagesslip: string | null;
          imagesslipadmin: string | null;
          certifiedtruecopy: string | null;
        }>();
      if (rowErr) {
        console.error(`[tb_payment mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
        return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
      }
      if (!row) return { ok: false, error: "not_found" };

      const path =
        parsed.data.kind === "refund"   ? row.imagesslipadmin :
        parsed.data.kind === "id_doc"   ? row.certifiedtruecopy :
        row.imagesslip;
      if (!path) return { ok: true, data: { url: null, mime: null } };

      const { data: signed, error: sErr } = await admin.storage
        .from("slips")
        .createSignedUrl(path, 60 * 60);
      if (sErr) return { ok: false, error: sErr.message };

      const ext = (path.split(".").pop() ?? "").toLowerCase();
      const mimeType = ext === "pdf" ? "application/pdf"
                     : ext === "png" ? "image/png"
                     : (ext === "jpg" || ext === "jpeg") ? "image/jpeg"
                     : null;
      return { ok: true, data: { url: signed?.signedUrl ?? null, mime: mimeType } };
    },
  );
}

// ────────────────────────────────────────────────────────────
// V-A1: set yuan_payments.slip_transferred_at (admin edit)
// ────────────────────────────────────────────────────────────
//
// 🚨 Tier-A "silent dead-write" fix (2026-06-02 · master-fidelity #1 pattern):
//   Prior implementation read + wrote `.from("yuan_payments")` (REBUILT,
//   EMPTY on prod). The only inbound caller — `SlipTransferredAtCell` in
//   `components/admin/slip-transferred-at-cell.tsx` L4 — has been TOMBSTONED
//   itself ("ORPHAN component · zero inbound callers · runtime calls fail
//   loudly"). The wallet-side equivalent already pivoted to `tb_wallet_hs.dateslip`
//   via `actions/admin/wallet-trans.ts::adminUpdateWalletHsDateSlip`.
//
//   `tb_payment` has NO direct analog to "slip_transferred_at" (the bank-side
//   timestamp on the customer's slip — distinct from `paydate` which is the
//   row-create timestamp and `paydateadmin` which is the approve-flip
//   timestamp). Adding the column requires a migration (e.g. `paydateslip
//   timestamp without time zone`), which is forbidden by the 2026-06-02 Tier-A
//   scope.
//
// Tombstoned: returns a clear error rather than silently writing into an
//   empty rebuilt table. Replace with the real tb_payment.paydateslip writer
//   once the migration lands (author = ภูม / accounting lane).

const setYuanSlipTransferredAtSchema = z.object({
  id:                  z.string().uuid(),
  slip_transferred_at: z.string().trim().max(40),    // "" → clear
});
export type SetYuanSlipTransferredAtInput = z.infer<typeof setYuanSlipTransferredAtSchema>;

export async function adminSetYuanSlipTransferredAt(
  input: SetYuanSlipTransferredAtInput,
): Promise<AdminActionResult<{ id: string; slip_transferred_at: string | null }>> {
  const parsed = setYuanSlipTransferredAtSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  void parsed.data;

  console.warn(
    "[yuan-payments] adminSetYuanSlipTransferredAt called — tombstoned. "
    + "The only caller (SlipTransferredAtCell) is also an orphan. "
    + "Add migration `ALTER TABLE tb_payment ADD COLUMN paydateslip timestamp without time zone` "
    + "+ restore the live body when this field is needed on the live yuan-payments UI.",
  );
  return {
    ok: false,
    error: "feature_pending_migration: slip_transferred_at รอเพิ่มคอลัมน์ paydateslip บน tb_payment — ตอนนี้ยังใช้ไม่ได้",
  };
}
