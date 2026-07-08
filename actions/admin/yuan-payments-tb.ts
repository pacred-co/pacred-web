"use server";

/**
 * Admin > "เพิ่มรายการฝากโอนหยวน" — Server Action against the legacy
 * `tb_payment` table (D1 / ADR-0017 Phase-B faithful port).
 *
 * Faithful port of the legacy `pcs-admin/payment-add.php` admin-add flow.
 * Lets accounting create a yuan-payment request on a customer's behalf
 * (CNY amount + recipient details + rate + service fee).
 *
 * Why a NEW file (not appended to `actions/admin/yuan-payments.ts`):
 *   `yuan-payments.ts` writes to the REBUILT `yuan_payments` table which
 *   is empty on prod. Mixing modules would let someone import the wrong
 *   action. Keep them separate until rebuilt schema retires (Phase C+).
 *
 * Schema reference: supabase/migrations/0081_pcs_legacy_schema.sql L3611
 * (tb_payment). Verified-prod columns:
 *   id, paydate, paydeposit, paystatus, paytype, paydetail, payyuan,
 *   payrate, payratecost, paythb, paythbcost, payprofitthb, paydateadmin,
 *   userid, adminid, adminidupdate, payadminidcreator, paylockdate,
 *   session, imagesslip, certifiedtruecopy, imagesslipadmin.
 *
 * Status convention (legacy):
 *   paystatus '1'=pending · '2'=approved · '3'=rejected/failed
 * We insert with paystatus='2' (approved) — admin-initiated means admin
 * has already confirmed the customer's intent + funds.
 *
 * paytype legacy values: '1'=Alipay · '2'=Wechat · '3'=Union · '4'=USDT
 * (per the /admin/yuan-payments/[id]/page.tsx PAYTYPE_LABEL map).
 *
 * THB calculation: paythb = payyuan × payrate. paythbcost / payprofitthb
 * are admin-cost / margin fields (set to 0 + paythb here; admin edits
 * later in the detail page).
 *
 * ── 2026-05-30 — Tier A1 revenue hole FIX (wallet debit) ─────────────
 *
 * Legacy `pcs-admin/payment.php` L11-93 (admin-add branch) ALWAYS debits
 * the customer wallet when admin creates a yuan-payment on their behalf:
 *   1. SELECT walletTotal FROM tb_wallet WHERE userID = $userID
 *   2. Refuse if walletTotal < payTHB ("eWallet" alert)
 *   3. INSERT tb_payment (the yuan-payment row)
 *   4. UPDATE tb_wallet SET walletTotal = walletTotal - payTHB
 *   5. INSERT tb_wallet_hs (date, amount=payTHB, status='1', type='6',
 *      userID, refOrder=tb_payment.id)
 *
 * Pacred was silently SKIPPING steps 1, 2, 4, 5 — admin marked "paid"
 * but the customer's wallet balance was untouched. Pure revenue leak:
 * the customer kept the THB AND received the yuan transfer.
 *
 * This version mirrors the legacy debit-on-create flow exactly:
 *   - Reads tb_wallet.wallettotal BEFORE insert
 *   - Returns `insufficient_balance` if walletTotal < paythb (legacy
 *     "eWallet" — admin sees an alert in the form)
 *   - INSERTs tb_payment (as before)
 *   - INSERTs tb_wallet_hs with type='6', status='2' (approved — same
 *     convention as `actions/admin/wallet-hs.ts` for admin-verified
 *     entries; legacy uses '1' but the Pacred mirror was already
 *     normalized to '2' for admin-add), amount=paythb (positive — the
 *     debit direction is encoded by type='6' per the schema comment at
 *     0081 L6220), refOrder=tb_payment.id
 *   - UPDATEs tb_wallet.wallettotal -= paythb (the source-of-truth
 *     balance shown to customer dashboard + admin views)
 *
 * Partial-failure handling: Supabase JS REST has no true transactions,
 * so if the tb_payment INSERT succeeds but the wallet UPDATE fails, we
 * roll the tb_payment back to avoid the silent-debit risk inverting
 * (admin created the payment but wallet never debited → revenue hole
 * comes back). Same pattern as cnt-payment commit flow.
 */

import { revalidatePath } from "next/cache";
import { bustAdminChrome } from "@/lib/cache/revalidate-chrome";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { uploadToBucket } from "@/lib/storage/upload";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — same helper as wallet-hs.ts + warehouse-history.ts
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
  if (data?.adminID) return data.adminID;
  return (email.split("@")[0] || "system").slice(0, 20); // 2026-06-05 varchar(20)
}

// ────────────────────────────────────────────────────────────
// Input schema
// ────────────────────────────────────────────────────────────

const PAYTYPES = ["1", "2", "3", "4"] as const;        // Alipay / Wechat / Union / USDT

const manualYuanPaymentSchema = z.object({
  userid:      z.string().trim().regex(/^PR\d+$/i, "userid ต้องเป็นรหัส PR####").max(20),
  paytype:     z.enum(PAYTYPES),
  paydetail:   z.string().trim().min(1, "ระบุชื่อ/บัญชีผู้รับ").max(2000),
  payyuan:     z.number().positive("จำนวน CNY ต้องเป็นบวก"),
  payrate:     z.number().positive("rate ต้องเป็นบวก"),
  payratecost: z.number().nonnegative().optional(),     // admin cost rate (defaults 0)
  paydeposit:  z.boolean().optional(),                  // 1=pay-from-wallet · 0=cash
  note:        z.string().trim().max(1000).optional(),
});
export type AdminCreateYuanPaymentManualInput = z.infer<typeof manualYuanPaymentSchema>;

// ────────────────────────────────────────────────────────────
// adminCreateYuanPaymentManual
// ────────────────────────────────────────────────────────────

export async function adminCreateYuanPaymentManual(
  input: AdminCreateYuanPaymentManualInput,
  slipFile?: File | null,
  qrFile?: File | null,          // owner 2026-07-08 — payee 收款码 QR the customer sent
): Promise<AdminActionResult<{ id: number; paythb: number; new_wallet_balance: number }>> {
  const parsed = manualYuanPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ id: number; paythb: number; new_wallet_balance: number }>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();

      // Verify customer.
      const { data: customer, error: customerErr } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName")
        .eq("userID", d.userid.toUpperCase())
        .maybeSingle<{ userID: string; userName: string | null; userLastName: string | null }>();
      if (customerErr) {
        console.error(`[tb_users mutation lookup] failed`, { code: customerErr.code, message: customerErr.message });
        return { ok: false, error: `db_error:${customerErr.code ?? "unknown"}` };
      }
      if (!customer) return { ok: false, error: "ไม่พบสมาชิก (userid ไม่ตรงกับ tb_users)" };

      // Compute THB total.
      const paythb     = Math.round(d.payyuan * d.payrate * 100) / 100;
      const payratecost = d.payratecost ?? d.payrate;       // default cost-rate = sell-rate
      const paythbcost  = Math.round(d.payyuan * payratecost * 100) / 100;
      const payprofitthb = Math.round((paythb - paythbcost) * 100) / 100;

      const nowIso = new Date().toISOString();

      // ── Tier A1 — Wallet pre-check (legacy payment.php L11-33) ─────
      //
      // Read current wallet balance BEFORE the insert; refuse if the
      // customer can't cover the THB total. Mirrors the legacy "eWallet"
      // alert. tb_wallet may not exist yet for a brand-new customer
      // who has never deposited — treat missing row as balance=0 (the
      // refuse path below catches that too).
      const { data: walletBefore, error: walletReadErr } = await admin
        .from("tb_wallet")
        .select("userid, wallettotal")
        .eq("userid", customer.userID)
        .maybeSingle<{ userid: string; wallettotal: number }>();
      if (walletReadErr) {
        console.error(`[tb_wallet read] failed`, { code: walletReadErr.code, message: walletReadErr.message });
        return { ok: false, error: `db_error:${walletReadErr.code ?? "unknown"}` };
      }
      const currentBalance = Number(walletBefore?.wallettotal ?? 0);
      // 2026-07-08 (owner) — ฝากโอนหยวน = DIRECT-CUT by default (the customer paid
      // the company bank directly + attached the slip; admin is RECORDING a settled
      // deal). ONLY the pay-from-wallet path (paydeposit=1) touches the wallet, so
      // the balance pre-check must NOT block a direct-cut record. This mirrors the
      // customer flow (createYuanPayment · tb_payment only, no wallet).
      if (d.paydeposit && currentBalance < paythb) {
        return {
          ok: false,
          error: `insufficient_balance: ยอดกระเป๋าของลูกค้า ฿${currentBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ไม่พอชำระ ฿${paythb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
        };
      }

      // Wave 12-A — upload slip first (if provided) so the filename lands in
      // tb_payment.imagesslipadmin (the "admin attached this" slot · NOT
      // imagesslip which is the customer's slip).
      let slipFilename = "";
      if (slipFile) {
        const up = await uploadToBucket(slipFile, "slips", `admin/yuan-payment/${customer.userID}`);
        if (!up.ok) return { ok: false, error: `อัปโหลดสลิปไม่สำเร็จ: ${up.error}` };
        slipFilename = up.filename;
      }

      // owner 2026-07-08 — the payee 收款码 QR (Alipay/WeChat) the customer sent,
      // so the China operator can scan+pay. Separate slot from the after-transfer
      // slip (imagesslipadmin) → the two never overwrite each other.
      let qrFilename = "";
      if (qrFile) {
        const upQr = await uploadToBucket(qrFile, "slips", `admin/yuan-qr/${customer.userID}`);
        if (!upQr.ok) return { ok: false, error: `อัปโหลดรูป QR ปลายทางไม่สำเร็จ: ${upQr.error}` };
        qrFilename = upQr.filename;
      }

      // INSERT tb_payment — all NOT NULL columns must be populated.
      const { data: row, error: insErr } = await admin
        .from("tb_payment")
        .insert({
          paydate:           nowIso,
          paydeposit:        d.paydeposit ? "1" : "0",
          paystatus:         "2",                  // approved (admin = verifier)
          paytype:           d.paytype,
          paydetail:         d.paydetail,
          payyuan:           d.payyuan,
          payrate:           d.payrate,
          payratecost:       payratecost,
          paythb:            paythb,
          paythbcost:        paythbcost,
          payprofitthb:      payprofitthb,
          paydateadmin:      nowIso,
          userid:            customer.userID,
          adminid:           legacyAdminId,
          adminidupdate:     legacyAdminId,
          payadminidcreator: legacyAdminId,
          session:           "admin-manual",
          imagesslip:        "",                   // customer-supplied slip (empty for admin-add)
          certifiedtruecopy: "",
          imagesslipadmin:   slipFilename,         // Wave 12-A: admin-attached proof-of-payment
          payee_qr_image:    qrFilename,           // owner 2026-07-08: payee 收款码 QR
        })
        .select("id")
        .single<{ id: number }>();
      if (insErr || !row) return { ok: false, error: insErr?.message ?? "insert failed" };

      // ── Tier A1 — Debit customer wallet — ONLY when paid-from-wallet ──
      //
      // 2026-07-08 (owner): a direct-cut record (paydeposit=0 · the default · the
      // customer paid the company bank directly) has NO wallet movement — it just
      // records tb_payment, mirroring the customer createYuanPayment. Only
      // paydeposit=1 (pay-from-wallet) debits the wallet. Pacred has no real DB
      // transactions over REST, so on a wallet write failure AFTER tb_payment we
      // DELETE the tb_payment row to keep books balanced.
      const newBalance = d.paydeposit
        ? Math.round((currentBalance - paythb) * 100) / 100
        : currentBalance;

      if (d.paydeposit) {
      // INSERT tb_wallet_hs — type='6' (ชำระเงินฝากโอน), status='2'
      // (approved; admin = verifier per Pacred convention in
      // actions/admin/wallet-hs.ts), amount=paythb (positive — debit
      // direction is encoded by type='6', not the sign of amount).
      const { error: hsErr } = await admin
        .from("tb_wallet_hs")
        .insert({
          date:            nowIso,
          amount:          paythb,
          status:          "2",
          type:            "6",
          typenew:         "1",
          typeservice:     "1",                              // 1 = cargo (yuan transfer)
          paydeposit:      d.paydeposit ? "1" : "0",
          imagesslip:      slipFilename,
          depositnamebank: "",
          nameuserbank:    "",
          nouserbank:      "",
          note:            d.note ?? "ชำระค่าโอนหยวน (admin-manual)",
          adminid:         legacyAdminId,
          adminidupdate:   legacyAdminId,
          session:         "admin-manual",
          reforder:        String(row.id),                   // refOrder = tb_payment.id
          whno:            "",
          wusercredit:     "0",
          userid:          customer.userID,
          adminidcrate:    legacyAdminId,
        });
      if (hsErr) {
        // Roll the tb_payment back to avoid silent half-state.
        await admin.from("tb_payment").delete().eq("id", row.id);
        return {
          ok: false,
          error: `บันทึก tb_wallet_hs ล้มเหลว · ยกเลิก tb_payment เพื่อรักษาสถานะ: ${hsErr.message}`,
        };
      }

      // UPDATE tb_wallet.wallettotal -= paythb (or INSERT if no row).
      if (!walletBefore) {
        // Customer has no tb_wallet row yet — should be impossible past
        // the balance pre-check (currentBalance would be 0 → refuse),
        // but be defensive.
        const { error: walletInsErr } = await admin
          .from("tb_wallet")
          .insert({ userid: customer.userID, wallettotal: -paythb });
        if (walletInsErr) {
          // tb_payment + tb_wallet_hs already wrote — surface for ops.
          return {
            ok: false,
            error: `tb_payment id=${row.id} + tb_wallet_hs สำเร็จ · แต่ tb_wallet insert ล้มเหลว: ${walletInsErr.message} (ลูกค้าจ่ายแล้วแต่ยอดกระเป๋ายังไม่หัก — ติดต่อ ops)`,
          };
        }
      } else {
        const { error: walletUpdErr } = await admin
          .from("tb_wallet")
          .update({ wallettotal: newBalance })
          .eq("userid", customer.userID);
        if (walletUpdErr) {
          return {
            ok: false,
            error: `tb_payment id=${row.id} + tb_wallet_hs สำเร็จ · แต่ tb_wallet update ล้มเหลว: ${walletUpdErr.message} (ลูกค้าจ่ายแล้วแต่ยอดกระเป๋ายังไม่หัก — ติดต่อ ops)`,
          };
        }
      }
      } // end if (d.paydeposit) — direct-cut records tb_payment only, no wallet

      await logAdminAction(adminId, "tb_payment.manual_create", "tb_payment", String(row.id), {
        userid:           customer.userID,
        paytype:          d.paytype,
        payyuan:          d.payyuan,
        payrate:          d.payrate,
        paythb,
        paydeposit:       d.paydeposit ? "1" : "0",
        wallet_before:    currentBalance,
        wallet_after:     newBalance,
        wallet_hs_type:   "6",
        wallet_hs_status: "2",
        note:             d.note,
      });

      revalidatePath("/admin/yuan-payments");
      revalidatePath(`/admin/yuan-payments/${row.id}`);
      revalidatePath("/admin/wallet");                          // wallet list (balance changed)
      revalidatePath(`/admin/wallet/${customer.userID}`);       // per-customer wallet history
      revalidatePath("/admin");
      // Manual yuan-payment debited the wallet + created a ฝากโอน row → wallet
      // totals + the yuan-payment queue changed; refresh the admin sidebar.
      bustAdminChrome();
      return { ok: true, data: { id: row.id, paythb, new_wallet_balance: newBalance } };
    },
  );
}

// ────────────────────────────────────────────────────────────
// adminSetYuanPayeeQr — attach/replace the payee 收款码 QR on an existing row
//
// Owner 2026-07-08: the customer's Alipay/WeChat receive-QR often arrives AFTER
// the job is created (via LINE), so accounting needs to attach it any time from
// the detail page. Image-only — writes ONLY tb_payment.payee_qr_image, never any
// money/status/rate column.
// ────────────────────────────────────────────────────────────

export async function adminSetYuanPayeeQr(
  id: number,
  qrFile: File | null,
): Promise<AdminActionResult<{ id: number; filename: string }>> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "invalid_id" };
  if (!qrFile) return { ok: false, error: "ไม่ได้เลือกไฟล์รูป QR" };

  return withAdmin<{ id: number; filename: string }>(["accounting"], async () => {
    const admin = createAdminClient();

    // Confirm the row exists + fetch the userid for a tidy storage prefix.
    const { data: rowBefore, error: readErr } = await admin
      .from("tb_payment")
      .select("id, userid")
      .eq("id", id)
      .maybeSingle<{ id: number; userid: string | null }>();
    if (readErr) {
      console.error(`[tb_payment qr read] failed`, { code: readErr.code, message: readErr.message });
      return { ok: false, error: `db_error:${readErr.code ?? "unknown"}` };
    }
    if (!rowBefore) return { ok: false, error: "ไม่พบรายการฝากโอน" };

    const up = await uploadToBucket(qrFile, "slips", `admin/yuan-qr/${rowBefore.userid ?? "unknown"}`);
    if (!up.ok) return { ok: false, error: `อัปโหลดรูป QR ปลายทางไม่สำเร็จ: ${up.error}` };

    const { error: updErr } = await admin
      .from("tb_payment")
      .update({ payee_qr_image: up.filename })
      .eq("id", id);
    if (updErr) {
      console.error(`[tb_payment qr update] failed`, { code: updErr.code, message: updErr.message });
      return { ok: false, error: `db_error:${updErr.code ?? "unknown"}` };
    }

    revalidatePath(`/admin/yuan-payments/${id}`);
    revalidatePath("/admin/yuan-payments");
    return { ok: true, data: { id, filename: up.filename } };
  });
}
