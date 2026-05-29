"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { resolveProfileIdForLegacyUserid } from "@/lib/auth/tb-users-resolver";
import {
  YUAN_STATUSES,
  YUAN_STATUS_LABEL,
  isYuanTransitionAllowed,
  paystatusToPacred,
  pacredToPaystatus,
} from "@/lib/legacy-paystatus-map";

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
});
export type AdminUpdateYuanPaymentInput = z.input<typeof updateSchema>;

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
      .select("id, userid, paystatus, payyuan, paythb, paydeposit")
      .eq("id", d.id)
      .maybeSingle<{
        id: number;
        userid: string;
        paystatus: string;
        payyuan: number;
        paythb: number;
        paydeposit: string | null;
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
    }
    // Cost/profit fields → legacy column names.
    if (d.cost_rate  != null) update.payratecost  = d.cost_rate;
    if (d.cost_thb   != null) update.paythbcost   = d.cost_thb;
    if (d.profit_thb != null) update.payprofitthb = d.profit_thb;

    // ── Single UPDATE on tb_payment.
    const { error: updErr } = await admin
      .from("tb_payment")
      .update(update)
      .eq("id", existing.id);
    if (updErr) return { ok: false, error: updErr.message };

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

    revalidatePath("/admin/yuan-payments");
    revalidatePath(`/admin/yuan-payments/${existing.id}`);
    revalidatePath("/admin");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// T-P3: BULK approve pending yuan_payments (cargo revenue path)
// ────────────────────────────────────────────────────────────
//
// Same pattern as adminBulkApproveDeposits (wallet.ts) — but for
// yuan_payments. Skips already-progressed rows silently.
//
// "Approve" here = transition pending → processing (admin starts
// transferring to the customer's Alipay account). Final 'completed'
// requires per-row context (cost rate, profit, proof URL) so it stays
// single-row.

const yuanBulkSchema = z.object({
  ids:  z.array(z.string().uuid()).min(1, "ต้องเลือกอย่างน้อย 1 รายการ").max(50, "เลือกได้สูงสุด 50 รายการต่อรอบ"),
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

  return withAdmin<YuanBulkResult>(["accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: rows, error: selErr } = await admin
      .from("yuan_payments")
      .select("id, profile_id, status, yuan_amount, thb_amount, paid_via_wallet")
      .in("id", ids);
    if (selErr) return { ok: false, error: selErr.message };

    const result: YuanBulkResult = { approved: 0, skipped: 0, errors: [] };
    type Row = { id: string; profile_id: string; status: string; yuan_amount: number; thb_amount: number; paid_via_wallet: boolean };

    for (const row of (rows ?? []) as Row[]) {
      if (row.status !== "pending") {
        result.skipped++;
        continue;
      }

      const { error: updErr } = await admin
        .from("yuan_payments")
        .update({
          status:          "processing",
          executed_at:     new Date().toISOString(),
          admin_id_update: adminId,
        })
        .eq("id", row.id);

      if (updErr) {
        result.errors.push({ id: row.id, reason: updErr.message });
        continue;
      }

      result.approved++;

      await logAdminAction(adminId, "yuan_payment.bulk_approve", "yuan_payment", row.id, {
        yuan_amount: row.yuan_amount,
        thb_amount:  row.thb_amount,
        before:      { status: "pending" },
        after:       { status: "processing" },
      });

      void sendNotification(row.profile_id, {
        category: "yuan_payment",
        severity: "info",
        title:    `ฝากโอนหยวน — ${STATUS_LABEL.processing}`,
        body:     `¥${Number(row.yuan_amount).toFixed(2)} = ฿${Number(row.thb_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })} — กำลังโอนไป Alipay`,
        link_href: `/service-payment`,
        reference_type: "yuan_payment",
        reference_id:   row.id,
      });
    }

    const seenIds = new Set((rows ?? []).map((r) => r.id));
    for (const id of ids) {
      if (!seenIds.has(id)) {
        result.errors.push({ id, reason: "not_found" });
      }
    }

    revalidatePath("/admin/yuan-payments");
    return { ok: true, data: result };
  });
}

// ────────────────────────────────────────────────────────────
// Phase C QoL #4 (G-5 fix): mark yuan_payment as refunded WITH slip.
// ────────────────────────────────────────────────────────────
//
// Per `docs/research/gap-schema-security.md` G-5 — the legacy
// adminUpdateYuanPayment refund branch lets admins flip status →
// 'refunded' without ANY evidence the money moved back. Migration
// 0074 added refund_slip_path + refunded_at + refunded_by_admin_id.
// This action is the slip-enforcing entry point; the slip storage
// path must be non-empty, both timestamps + admin id get stamped
// atomically, the wallet debit (if paid_via_wallet) gets reversed
// the same way adminUpdateYuanPayment does, and a notification is
// fired to the customer.
//
// Status-transition guard is the SAME allow-list adminUpdateYuanPayment
// uses (only completed → refunded · pending → refunded · processing →
// refunded — never failed→refunded, never refunded→anything).
//
// uploadYuanRefundSlip (below) handles the actual file upload — the
// UI uploads first, then passes the returned path here.

const markRefundedSchema = z.object({
  id:                z.string().uuid(),
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

  return withAdmin<{ refunded_at: string }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: existing, error: existingErr } = await admin
      .from("yuan_payments")
      .select("id, profile_id, status, yuan_amount, thb_amount, paid_via_wallet, refund_slip_path")
      .eq("id", d.id)
      .maybeSingle<{
        id: string; profile_id: string; status: string;
        yuan_amount: number; thb_amount: number;
        paid_via_wallet: boolean; refund_slip_path: string | null;
      }>();
    if (existingErr) {
      console.error(`[yuan_payments mutation lookup] failed`, { code: existingErr.code, message: existingErr.message });
      return { ok: false, error: `db_error:${existingErr.code ?? "unknown"}` };
    }
    if (!existing) return { ok: false, error: "not_found" };

    if (!isYuanTransitionAllowed(existing.status, "refunded")) {
      return {
        ok: false,
        error: `เปลี่ยนสถานะ ${STATUS_LABEL[existing.status] ?? existing.status} → คืนเงินแล้ว ไม่ได้ — สถานะนี้ห้ามคืน (เลือก refund ได้เฉพาะ pending / processing / completed)`,
      };
    }

    const refundedAt = new Date().toISOString();
    const update: Record<string, unknown> = {
      status:               "refunded",
      refund_slip_path:     d.refund_slip_path,
      refunded_at:          refundedAt,
      refunded_by_admin_id: adminId,
      admin_id_update:      adminId,
    };

    const { error: updErr } = await admin
      .from("yuan_payments")
      .update(update)
      .eq("id", existing.id);
    if (updErr) return { ok: false, error: updErr.message };

    // Reverse the wallet debit (same logic as adminUpdateYuanPayment's
    // refund branch — covers both pending + completed debits per H-2).
    if (existing.paid_via_wallet) {
      const { error: reverseErr } = await admin
        .from("wallet_transactions")
        .update({ status: "cancelled", admin_id_update: adminId })
        .eq("reference_type", "yuan_payment")
        .eq("reference_id", existing.id)
        .in("status", ["pending", "completed"]);
      if (reverseErr) {
        return {
          ok: false,
          error: `payment marked refunded but wallet debit reversal failed (debit for ${existing.id} stands): ${reverseErr.message}`,
        };
      }
    }

    await logAdminAction(adminId, "yuan_payment.mark_refunded", "yuan_payment", existing.id, {
      before:              { status: existing.status, refund_slip_path: existing.refund_slip_path },
      after:               { status: "refunded", refund_slip_path: d.refund_slip_path, refunded_at: refundedAt },
      paid_via_wallet:     existing.paid_via_wallet,
      note:                d.note ?? null,
    });

    void sendNotification(existing.profile_id, {
      category:       "yuan_payment",
      severity:       "warning",
      title:          "ฝากโอนหยวน — คืนเงินแล้ว",
      body:           `¥${Number(existing.yuan_amount).toFixed(2)} = ฿${Number(existing.thb_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}${d.note ? ` — ${d.note}` : ""}`,
      link_href:      "/service-payment",
      reference_type: "yuan_payment",
      reference_id:   existing.id,
    });

    revalidatePath("/admin/yuan-payments");
    revalidatePath(`/admin/yuan-payments/${existing.id}`);
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
  if (!yuanPaymentId || typeof yuanPaymentId !== "string") {
    return { ok: false, error: "invalid_input" };
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

  return withAdmin<{ storage_path: string }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("yuan_payments")
      .select("id, status")
      .eq("id", yuanPaymentId)
      .maybeSingle<{ id: string; status: string }>();
    if (rowErr) {
      console.error(`[yuan_payments mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "not_found" };
    // Slip is meaningful for non-final states (we may upload before the
    // actual refund-status flip in the same admin click). Accept any
    // non-failed status — adminMarkYuanPaymentRefunded re-checks the
    // transition allow-list at flip time.
    if (row.status === "failed") {
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

    await logAdminAction(adminId, "yuan_payment.refund_slip_upload", "yuan_payment", row.id, {
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
  id:   z.string().uuid(),
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
      const { data: row, error: rowErr } = await admin
        .from("yuan_payments")
        .select("id, slip_url, id_doc_url, refund_slip_path")
        .eq("id", parsed.data.id)
        .maybeSingle<{ id: string; slip_url: string | null; id_doc_url: string | null; refund_slip_path: string | null }>();
      if (rowErr) {
        console.error(`[yuan_payments mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
        return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
      }
      if (!row) return { ok: false, error: "not_found" };

      const path =
        parsed.data.kind === "refund"   ? row.refund_slip_path :
        parsed.data.kind === "id_doc"   ? row.id_doc_url :
        row.slip_url;
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
  const d = parsed.data;
  let next: string | null = null;
  if (d.slip_transferred_at.length > 0) {
    const dt = new Date(d.slip_transferred_at);
    if (Number.isNaN(dt.getTime())) return { ok: false, error: "slip_transferred_at รูปแบบไม่ถูกต้อง" };
    next = dt.toISOString();
  }

  return withAdmin<{ id: string; slip_transferred_at: string | null }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const { data: before, error: readErr } = await admin
        .from("yuan_payments")
        .select("id, slip_transferred_at")
        .eq("id", d.id)
        .maybeSingle<{ id: string; slip_transferred_at: string | null }>();
      if (readErr) return { ok: false, error: readErr.message };
      if (!before) return { ok: false, error: "not_found" };

      const { error: updErr } = await admin
        .from("yuan_payments")
        .update({ slip_transferred_at: next })
        .eq("id", d.id);
      if (updErr) return { ok: false, error: updErr.message };

      await logAdminAction(adminId, "yuan_payment.set_slip_transferred_at", "yuan_payment", d.id, {
        before: before.slip_transferred_at,
        after:  next,
      });

      revalidatePath("/admin/yuan-payments");
      return { ok: true, data: { id: d.id, slip_transferred_at: next } };
    },
  );
}
