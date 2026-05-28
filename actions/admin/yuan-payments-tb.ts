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
 */

import { revalidatePath } from "next/cache";
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
  return email.slice(0, 30);
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
): Promise<AdminActionResult<{ id: number; paythb: number }>> {
  const parsed = manualYuanPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ id: number; paythb: number }>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();

      // Verify customer.
      const { data: customer, error: customerErr } = await admin
        .from("tb_users")
        .select("userid, username, userlastname")
        .eq("userid", d.userid.toUpperCase())
        .maybeSingle<{ userid: string; username: string | null; userlastname: string | null }>();
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

      // Wave 12-A — upload slip first (if provided) so the filename lands in
      // tb_payment.imagesslipadmin (the "admin attached this" slot · NOT
      // imagesslip which is the customer's slip).
      let slipFilename = "";
      if (slipFile) {
        const up = await uploadToBucket(slipFile, "slips", `admin/yuan-payment/${customer.userid}`);
        if (!up.ok) return { ok: false, error: `อัปโหลดสลิปไม่สำเร็จ: ${up.error}` };
        slipFilename = up.filename;
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
          userid:            customer.userid,
          adminid:           legacyAdminId,
          adminidupdate:     legacyAdminId,
          payadminidcreator: legacyAdminId,
          session:           "admin-manual",
          imagesslip:        "",                   // customer-supplied slip (empty for admin-add)
          certifiedtruecopy: "",
          imagesslipadmin:   slipFilename,         // Wave 12-A: admin-attached proof-of-payment
        })
        .select("id")
        .single<{ id: number }>();
      if (insErr || !row) return { ok: false, error: insErr?.message ?? "insert failed" };

      await logAdminAction(adminId, "tb_payment.manual_create", "tb_payment", String(row.id), {
        userid: customer.userid,
        paytype: d.paytype,
        payyuan: d.payyuan,
        payrate: d.payrate,
        paythb,
        paydeposit: d.paydeposit ? "1" : "0",
        note: d.note,
      });

      revalidatePath("/admin/yuan-payments");
      revalidatePath(`/admin/yuan-payments/${row.id}`);
      revalidatePath("/admin");
      return { ok: true, data: { id: row.id, paythb } };
    },
  );
}
