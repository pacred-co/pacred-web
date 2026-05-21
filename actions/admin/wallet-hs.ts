"use server";

/**
 * Admin > "เพิ่มรายการ Wallet ด้วยมือ" — Server Action against the
 * legacy `tb_wallet_hs` table (D1 / ADR-0017 Phase-B faithful port).
 *
 * Faithful port of the `pcs-admin/wallet.php?page=add` admin branch.
 * The legacy flow lets accounting record a wallet entry the auto-verify
 * couldn't post — typically a customer slip that didn't match any
 * pending row, or a manual balance adjustment.
 *
 * Why a NEW file (not appended to `actions/admin/wallet.ts`):
 *   `wallet.ts` writes to the REBUILT `wallet_transactions` table which
 *   is empty on prod. Mixing the two would let someone import the wrong
 *   action from the same module. Keep them in separate files until the
 *   rebuilt schema retires (Phase C+) — then `wallet.ts` deletes cleanly.
 *
 * Schema reference: supabase/migrations/0081_pcs_legacy_schema.sql L6159
 * (tb_wallet_hs) + L6135 (tb_wallet · the per-customer balance row).
 *
 * Status convention (legacy comment L6213):
 *   status '1'=pending · '2'=approved · '3'=rejected
 * We insert with status='2' (approved) because admin is the verifier
 * for a manual-entry — same convention as the existing /admin/wallet
 * bulk-approve flow in tb-bulk.ts.
 *
 * Type convention (legacy comment L6220 + L6227):
 *   type '1' = deposit (เติมเงิน) · '7' = withdraw (ถอนเงิน)
 *   typenew '1' = deposit · '2' = refund · '3..7' = various pay
 * For a manual admin-add we use the simplest mapping:
 *   deposit    → type='1'  · typenew='1'  · positive amount → credit balance
 *   withdraw   → type='7'  · typenew='1'  · positive amount → debit balance
 *   adjustment → type='1'  · typenew='1'  · admin-typed signed amount
 *
 * Wallet-balance side effect: tb_wallet.wallettotal is the source-of-truth
 * for the current balance shown to the customer + dashboard. After every
 * approved wallet_hs row we READ the current balance, ADD the delta, and
 * UPDATE (or INSERT if the customer has no tb_wallet row yet — matches
 * the upsert pattern in actions/admin/tb-bulk.ts adminBulkApproveWalletHs).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — same helper as actions/admin/warehouse-history.ts
// + combine-bill.ts (third caller — runbook "lift on the third repeat"
// is satisfied, but extraction is a separate refactor task).
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data } = await admin
    .from("tb_admin")
    .select("adminid")
    .eq("adminemail", email)
    .maybeSingle<{ adminid: string | null }>();
  if (data?.adminid) return data.adminid;
  return email.slice(0, 30);
}

// ────────────────────────────────────────────────────────────
// Input schema
// ────────────────────────────────────────────────────────────

const KINDS = ["deposit", "withdraw", "adjustment"] as const;

const manualWalletHsSchema = z.object({
  userid:           z.string().trim().regex(/^PR\d+$/i, "userid ต้องเป็นรหัส PR####").max(20),
  kind:             z.enum(KINDS),
  amount:           z.number().refine((n) => n !== 0, { message: "จำนวนต้องไม่เท่ากับ 0" }),
  deposit_namebank: z.string().trim().max(100).optional(),    // ธนาคารปลายทาง
  nameuserbank:     z.string().trim().max(200).optional(),    // ชื่อบัญชี
  nouserbank:       z.string().trim().max(200).optional(),    // เลขที่บัญชี
  dateslip:         z.string().trim().optional(),             // YYYY-MM-DD (สลิป) — empty ok
  paydeposit:       z.boolean().optional(),                   // VIP credit flag
  typeservice:      z.enum(["1", "2", "3"]).optional(),       // 1=cargo · 2=freight · 3=transfer · default '1'
  note:             z.string().trim().max(1000).optional(),
});
export type AdminCreateWalletHsManualInput = z.infer<typeof manualWalletHsSchema>;

// ────────────────────────────────────────────────────────────
// adminCreateWalletHsManual
// ────────────────────────────────────────────────────────────

export async function adminCreateWalletHsManual(
  input: AdminCreateWalletHsManualInput,
): Promise<AdminActionResult<{ id: number; new_balance: number }>> {
  const parsed = manualWalletHsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // Sign sanity: for deposit/withdraw the admin types a positive number; we
  // record the canonical signed amount on tb_wallet_hs.amount and compute the
  // wallet delta (deposit = +amount · withdraw = −amount). adjustment lets the
  // admin pass a signed number directly.
  let signedAmount: number;
  let delta: number;
  if (d.kind === "deposit") {
    if (d.amount <= 0) return { ok: false, error: "เติมเงิน ต้องเป็นจำนวนบวก" };
    signedAmount = d.amount;
    delta = d.amount;
  } else if (d.kind === "withdraw") {
    if (d.amount <= 0) return { ok: false, error: "ถอนเงิน ต้องใส่จำนวนบวก (ระบบจะหักให้)" };
    signedAmount = d.amount;          // tb_wallet_hs.amount stays positive — `type='7'` already signals withdraw
    delta = -d.amount;
  } else {
    // adjustment — admin types signed (e.g. -250 to deduct)
    signedAmount = d.amount;
    delta = d.amount;
  }

  return withAdmin<{ id: number; new_balance: number }>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();

      // Verify the target customer exists in tb_users.
      const { data: customer } = await admin
        .from("tb_users")
        .select("userid, username, userlastname")
        .eq("userid", d.userid.toUpperCase())
        .maybeSingle<{ userid: string; username: string | null; userlastname: string | null }>();
      if (!customer) return { ok: false, error: "ไม่พบสมาชิก (userid ไม่ตรงกับ tb_users)" };

      // Parse slip date if provided.
      let slipDateIso: string | null = null;
      if (d.dateslip && d.dateslip.trim()) {
        const dt = new Date(d.dateslip);
        if (Number.isNaN(dt.getTime())) {
          return { ok: false, error: "วันที่สลิปไม่ถูกต้อง" };
        }
        slipDateIso = dt.toISOString();
      }

      const nowIso = new Date().toISOString();

      // INSERT tb_wallet_hs — match the column set the existing
      // bulk-approve action expects (id is auto-sequence; whno + wusercredit
      // + typenew + typeservice + userid + adminidcrate are NOT NULL per
      // the schema; pass safe defaults for any blank).
      const { data: row, error: insErr } = await admin
        .from("tb_wallet_hs")
        .insert({
          date:            nowIso,
          dateslip:        slipDateIso,
          amount:          signedAmount,
          status:          "2",                              // approved (admin = verifier)
          type:            d.kind === "withdraw" ? "7" : "1",
          typenew:         "1",                              // 1 = เติมเงิน (admin-add legacy default)
          typeservice:     d.typeservice ?? "1",             // default 1 = cargo
          paydeposit:      d.paydeposit ? "1" : "0",
          imagesslip:      "",                               // slip-upload is a stretch goal
          depositnamebank: d.deposit_namebank ?? "",
          nameuserbank:    d.nameuserbank ?? "",
          nouserbank:      d.nouserbank ?? "",
          note:            d.note ?? "",
          adminid:         legacyAdminId,
          adminidupdate:   legacyAdminId,
          session:         "admin-manual",
          reforder:        "",
          whno:            "",                               // NOT NULL — admin-manual has no warehouse #
          wusercredit:     "0",                              // 0 = not a VIP-credit topup by default
          userid:          customer.userid,                  // canonical-case from tb_users
          adminidcrate:    legacyAdminId,                    // creator (NOT NULL)
        })
        .select("id")
        .single<{ id: number }>();
      if (insErr || !row) return { ok: false, error: insErr?.message ?? "insert failed" };

      // Adjust tb_wallet.wallettotal — read-then-update (upsert if missing).
      let newTotal = delta;
      if (delta !== 0) {
        const { data: wRow } = await admin
          .from("tb_wallet")
          .select("userid, wallettotal")
          .eq("userid", customer.userid)
          .maybeSingle<{ userid: string; wallettotal: number }>();
        if (!wRow) {
          const { error: walletInsErr } = await admin
            .from("tb_wallet")
            .insert({ userid: customer.userid, wallettotal: delta });
          if (walletInsErr) {
            // tb_wallet_hs already wrote; surface so accounting reconciles.
            return {
              ok: false,
              error: `บันทึก tb_wallet_hs สำเร็จ (id=${row.id}) แต่ tb_wallet insert ล้มเหลว: ${walletInsErr.message}`,
            };
          }
        } else {
          newTotal = Number(wRow.wallettotal) + delta;
          const { error: walletUpdErr } = await admin
            .from("tb_wallet")
            .update({ wallettotal: newTotal })
            .eq("userid", customer.userid);
          if (walletUpdErr) {
            return {
              ok: false,
              error: `บันทึก tb_wallet_hs สำเร็จ (id=${row.id}) แต่ tb_wallet update ล้มเหลว: ${walletUpdErr.message}`,
            };
          }
        }
      }

      await logAdminAction(adminId, "tb_wallet_hs.manual_create", "tb_wallet_hs", String(row.id), {
        userid: customer.userid,
        kind: d.kind,
        amount: signedAmount,
        delta,
        new_balance: newTotal,
        note: d.note,
      });

      revalidatePath("/admin/wallet");
      revalidatePath(`/admin/wallet/${row.id}`);
      revalidatePath("/admin");
      return { ok: true, data: { id: row.id, new_balance: newTotal } };
    },
  );
}
