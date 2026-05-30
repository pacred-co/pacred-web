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
 * Type convention (legacy schema comment 0081 L6220 + L6227 — VERIFIED):
 *   type '1' = เติมเงิน · '3' = ถอนเงิน · '7' = ชำระเงินรอตรวจสอบการเติม
 *   typenew '1' = deposit · '2' = refund · '3..7' = various pay
 *
 * P1-25 (ADR-0018 · 2026-05-30) — type='7' fix for the WITHDRAW kind:
 *   The previous mapping used type='7' for a manual withdraw. That is WRONG:
 *   the schema enum says '7' = "ชำระเงินรอตรวจสอบการเติม" (a top-up-pending-pay
 *   sibling — used by the deposit-approve cascade in adminApproveWalletDeposit
 *   at the `reforder=topup.id AND type='7'` flip), NOT a withdraw. ถอนเงิน is
 *   type='3' (same as the customer withdraw flow in actions/wallet-tb.ts) and
 *   the customer history "ถอนเงิน" tab filters `WHERE type=3`
 *   (load_wallet_hs_withdraw.php). Verified vs legacy: the legacy admin
 *   manual-add (wallet.php?page=add L40-42) only ever inserted type='1'
 *   (deposit) — admin-manual-WITHDRAW is a Pacred addition, so it must use the
 *   correct schema value '3', else (a) it's invisible in the customer withdraw
 *   tab and (b) it collides with the type='7' deposit-cascade. NO existing
 *   prod rows are rewritten — this only fixes the value for NEW manual
 *   withdraws.
 *
 * For a manual admin-add we use:
 *   deposit    → type='1'  · typenew='1'  · positive amount → credit balance
 *   withdraw   → type='3'  · typenew='2'  · positive amount → debit balance
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
import { uploadToBucket } from "@/lib/storage/upload";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — same helper as actions/admin/warehouse-history.ts
// + combine-bill.ts (third caller — runbook "lift on the third repeat"
// is satisfied, but extraction is a separate refactor task).
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
  slipFile?: File | null,
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
    signedAmount = d.amount;          // tb_wallet_hs.amount stays positive — `type='3'` (ถอนเงิน) signals withdraw
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

      // Upload slip first (if provided) — we want the filename in the
      // tb_wallet_hs INSERT. On upload failure abort (no half-state).
      let slipFilename = "";
      if (slipFile) {
        const up = await uploadToBucket(slipFile, "slips", `admin/wallet-hs/${customer.userID}`);
        if (!up.ok) return { ok: false, error: `อัปโหลดสลิปไม่สำเร็จ: ${up.error}` };
        slipFilename = up.filename;
      }

      // INSERT tb_wallet_hs — match the column set the existing
      // bulk-approve action expects (id is auto-sequence; whno + wusercredit
      // + typenew + typeservice + userid + adminidcrate are NOT NULL per
      // the schema; pass safe defaults for any blank).
      //
      // Wave 29: admin-manual entries do NOT trigger the auto-receipt hook.
      // This form creates wallet deposits/withdraws/adjustments, NOT a
      // forwarder-payment land — `reforder` stays empty so there's no
      // tb_forwarder.id to link a receipt to. If accounting needs a receipt
      // for a specific job, they use /admin/accounting/forwarder-invoice/
      // add?mode=manual (the override queue).
      const { data: row, error: insErr } = await admin
        .from("tb_wallet_hs")
        .insert({
          date:            nowIso,
          dateslip:        slipDateIso,
          amount:          signedAmount,
          status:          "2",                              // approved (admin = verifier; manual entry is final)
          type:            d.kind === "withdraw" ? "3" : "1", // P1-25: ถอน=3 (was wrongly 7 · see docblock)
          typenew:         d.kind === "withdraw" ? "2" : "1", // withdraw bucket=2 · deposit/adjust=1
          typeservice:     d.typeservice ?? "1",             // default 1 = cargo
          paydeposit:      d.paydeposit ? "1" : "0",
          imagesslip:      slipFilename,                     // Wave 12-A: slip path in `slips` bucket (empty if no slip)
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
          userid:          customer.userID,                  // canonical-case from tb_users
          adminidcrate:    legacyAdminId,                    // creator (NOT NULL)
        })
        .select("id")
        .single<{ id: number }>();
      if (insErr || !row) return { ok: false, error: insErr?.message ?? "insert failed" };

      // Adjust tb_wallet.wallettotal — read-then-update (upsert if missing).
      let newTotal = delta;
      if (delta !== 0) {
        const { data: wRow, error: wRowErr } = await admin
          .from("tb_wallet")
          .select("userid, wallettotal")
          .eq("userid", customer.userID)
          .maybeSingle<{ userid: string; wallettotal: number }>();
        if (wRowErr) {
          console.error(`[tb_wallet list] failed`, { code: wRowErr.code, message: wRowErr.message });
        }
        if (!wRow) {
          const { error: walletInsErr } = await admin
            .from("tb_wallet")
            .insert({ userid: customer.userID, wallettotal: delta });
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
            .eq("userid", customer.userID);
          if (walletUpdErr) {
            return {
              ok: false,
              error: `บันทึก tb_wallet_hs สำเร็จ (id=${row.id}) แต่ tb_wallet update ล้มเหลว: ${walletUpdErr.message}`,
            };
          }
        }
      }

      await logAdminAction(adminId, "tb_wallet_hs.manual_create", "tb_wallet_hs", String(row.id), {
        userid: customer.userID,
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

// ════════════════════════════════════════════════════════════════
// P0-9 / MS-1 — Admin top-up slip approval per ADR-0018 D-2 rule 3.
// ════════════════════════════════════════════════════════════════
//
// Faithful port of the legacy `pcs-admin/wallet.php` $_GET['page']='deposit'
// approve/reject branch (L420-700 — read end-to-end before patching).
//
// The legacy contract has THREE shapes:
//
//   (A) "Bare" deposit slip (NO tb_wallet_paydeposit links).
//       Approve → tb_wallet_hs.status='2' · tb_wallet.wallettotal += amount.
//       Reject  → tb_wallet_hs.status='3' · NO tb_wallet change.
//
//   (B) "Topup-and-pay" deposit slip (HAS tb_wallet_paydeposit links).
//       Customer uploaded one slip that funded N parent records (shop
//       orders OR forwarders OR mix). The topup row exists at type='1'
//       and each link records (whid=topup.id, hno=<parent>) — plus
//       sibling tb_wallet_hs rows: type='2' for shop-pay (parent =
//       tb_header_order), type='4' for forwarder-pay (parent =
//       tb_forwarder), AND type='7' rows tracking the "pending-pay-
//       from-this-topup" amount on each parent.
//
//       Approve → flip status of: topup row · type='2'/type='4'
//                 sibling-pay rows · type='7' sibling-pending rows.
//                 For each linked parent, clear `paydeposit=''`
//                 (shop orders) or `paydeposit=''` + `fdatestatus6=NOW()`
//                 (forwarders, non-credit branch) or `paydeposit=''`
//                 + `fcredit=''` + `tb_credit.creditvalue -= fPrice`
//                 (forwarders, wUserCredit='1' branch).
//                 **NO wallettotal credit** — the topup amount was
//                 already counted via the type='7' sibling debits;
//                 net credit = 0.
//
//       Reject  → flip status of: topup · sibling pay rows · sibling
//                 type='7' rows to '3'. For each parent, revert state:
//                   shop_order: paydeposit='' · hstatus='2' · hdatepayment=NOW()+5d
//                   forwarder:  paydeposit='' · fstatus='5'
//                               (PCSF-50 special: ALSO ftransportprice=0
//                                · fusercompany='')
//                   (wUserCredit branch keeps fcredit='1' on reject — the
//                    customer's credit line was already extended; reject
//                    just means the slip was bad, the credit still applies)
//                 DELETE the tb_wallet_paydeposit link rows for this whid.
//                 **REFUND wallet:** wallettotal += SUM(amount) of
//                 type='7' siblings (give the money back · legacy L607-614).
//
//   (C) Idempotency: terminal status (2 or 3) returns {ok:true,
//       alreadyDone:true}, no rows touched.
//
// Dispatch rule (verified against legacy wallet.php L444-568):
//   SELECT hno FROM tb_wallet_paydeposit WHERE whid=$id
//   For each hno, legacy uses PHP `strpos($hno, "X") !== FALSE` — substring
//   contains. In real prod data the hno is always the order/forwarder id
//   starting with the prefix; we use startsWith() which matches legacy intent.
//     ONS<*>  → shop order (tb_header_order)
//     N<*>    → shop order
//     A<*>    → shop order
//     P<*>    → shop order
//     <else>  → forwarder (tb_forwarder, ID = numeric hno)
//
// Failure rollback: PostgREST has no real transaction. The action owns
// the rollback path — if the topup status flip succeeds but a parent
// update fails, we DO NOT auto-revert (the legacy doesn't either).
// Errors are surfaced in the result so accounting reconciles manually.

type PaydepositLink = { id: number; whid: number; hno: string };
type ParentClass = "shop_order" | "forwarder";

function classifyHnoParent(hno: string): ParentClass {
  // Legacy `strpos` checks ONS first (longest prefix), then N/A/P single-char.
  // We use startsWith() which matches legacy intent in real prod data.
  if (hno.startsWith("ONS")) return "shop_order";
  if (hno.startsWith("N"))   return "shop_order";
  if (hno.startsWith("A"))   return "shop_order";
  if (hno.startsWith("P"))   return "shop_order";
  return "forwarder";
}

const approveDepositSchema = z.object({
  id: z.number().int().positive(),
});
export type AdminApproveWalletDepositInput = z.infer<typeof approveDepositSchema>;

type CascadedRow = {
  table: "tb_header_order" | "tb_forwarder" | "tb_wallet_hs" | "tb_credit";
  id: string;
  fromStatus: string | null;
  toStatus: string | null;
  note?: string;
};

type ApproveResult = {
  ok: true;
  walletHsId: number;
  alreadyDone?: boolean;
  customer: {
    userid: string;
    walletTotalBefore: number;
    walletTotalAfter: number;
  };
  cascadedRows: CascadedRow[];
  hadPaydepositLinks: boolean;
};

/**
 * Approve a customer top-up slip (status `1`→`2`).
 *
 * Implements ADR-0018 D-2 rule 3:
 *   - Idempotent (terminal status returns alreadyDone)
 *   - Bare slip → credit wallet
 *   - Linked slip → cascade to N parents (shop_order / forwarder),
 *     flip type='2'/'4'/'7' sibling wallet_hs rows, NO wallet credit
 *
 * Requires `tb_wallet_hs WHERE id=walletHsId AND status='1' AND type='1'`.
 * (Withdraw approve = different function · scope out — ADR-0018 D-2 rule 3
 *  paragraph 3 will be a follow-up — task explicitly limits us to type='1'.)
 */
export async function adminApproveWalletDeposit(
  input: AdminApproveWalletDepositInput,
): Promise<AdminActionResult<ApproveResult>> {
  const parsed = approveDepositSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id } = parsed.data;

  return withAdmin<ApproveResult>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();
      const nowIso = new Date().toISOString();

      // ──────────────────────────────────────────────
      // 1. Read the topup row + idempotency check.
      // ──────────────────────────────────────────────
      const { data: rowRaw, error: rowErr } = await admin
        .from("tb_wallet_hs")
        .select("id, userid, amount, type, status")
        .eq("id", id)
        .maybeSingle<{
          id: number;
          userid: string;
          amount: number;
          type: string | null;
          status: string | null;
        }>();
      if (rowErr) {
        console.error(`[tb_wallet_hs list] failed`, { code: rowErr.code, message: rowErr.message });
        return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
      }
      if (!rowRaw) return { ok: false, error: "ไม่พบรายการ" };

      // Idempotency — already-terminal returns OK with alreadyDone.
      if (rowRaw.status === "2" || rowRaw.status === "3") {
        return {
          ok: true,
          data: {
            ok: true,
            walletHsId: id,
            alreadyDone: true,
            customer: {
              userid: rowRaw.userid,
              walletTotalBefore: NaN,  // not read
              walletTotalAfter:  NaN,
            },
            cascadedRows: [],
            hadPaydepositLinks: false,
          },
        };
      }
      if (rowRaw.status !== "1") {
        return { ok: false, error: `รายการนี้สถานะไม่ใช่ 'รอตรวจสอบ' (status=${rowRaw.status ?? "null"})` };
      }
      // Per task: only handle deposit (type='1') — withdraw approve is a
      // separate function (rule 3 paragraph 3) and out of scope here.
      if (rowRaw.type !== "1") {
        return { ok: false, error: `ฟังก์ชันนี้รองรับเฉพาะรายการเติมเงิน (type='1') · พบ type='${rowRaw.type ?? "null"}'` };
      }

      const amount = Number(rowRaw.amount ?? 0);
      const userid = rowRaw.userid;

      // ──────────────────────────────────────────────
      // 2. Read paydeposit links + classify into parents.
      // ──────────────────────────────────────────────
      const { data: linksRaw, error: linksErr } = await admin
        .from("tb_wallet_paydeposit")
        .select("id, whid, hno")
        .eq("whid", id);
      if (linksErr) {
        console.error(`[tb_wallet_paydeposit list] failed`, {
          code: linksErr.code,
          message: linksErr.message,
        });
        return { ok: false, error: `db_error:${linksErr.code ?? "unknown"}` };
      }
      const links = (linksRaw ?? []) as PaydepositLink[];
      const hasLinks = links.length > 0;

      const cascadedRows: CascadedRow[] = [];

      // ──────────────────────────────────────────────
      // 3. Flip the topup row to status='2'.
      // ──────────────────────────────────────────────
      const { error: updHsErr } = await admin
        .from("tb_wallet_hs")
        .update({ status: "2", adminid: legacyAdminId, adminidupdate: legacyAdminId })
        .eq("id", id)
        .eq("status", "1");
      if (updHsErr) {
        console.error(`[tb_wallet_hs mutation] failed`, { code: updHsErr.code, message: updHsErr.message });
        return { ok: false, error: updHsErr.message };
      }
      cascadedRows.push({
        table: "tb_wallet_hs",
        id: String(id),
        fromStatus: "1",
        toStatus: "2",
        note: "topup",
      });

      // ──────────────────────────────────────────────
      // 4a. BARE slip path — no links → plain wallet credit.
      // ──────────────────────────────────────────────
      let walletBefore = 0;
      let walletAfter = 0;
      if (!hasLinks) {
        const { data: wRow, error: wRowErr } = await admin
          .from("tb_wallet")
          .select("userid, wallettotal")
          .eq("userid", userid)
          .maybeSingle<{ userid: string; wallettotal: number }>();
        if (wRowErr) {
          console.error(`[tb_wallet list] failed`, { code: wRowErr.code, message: wRowErr.message });
        }
        if (!wRow) {
          const { error: walletInsErr } = await admin
            .from("tb_wallet")
            .insert({ userid: userid, wallettotal: amount });
          if (walletInsErr) {
            return {
              ok: false,
              error: `อนุมัติ tb_wallet_hs สำเร็จ (id=${id}) แต่ tb_wallet insert ล้มเหลว: ${walletInsErr.message}`,
            };
          }
          walletBefore = 0;
          walletAfter = amount;
        } else {
          walletBefore = Number(wRow.wallettotal);
          walletAfter = walletBefore + amount;
          const { error: walletUpdErr } = await admin
            .from("tb_wallet")
            .update({ wallettotal: walletAfter })
            .eq("userid", userid);
          if (walletUpdErr) {
            return {
              ok: false,
              error: `อนุมัติ tb_wallet_hs สำเร็จ (id=${id}) แต่ tb_wallet update ล้มเหลว: ${walletUpdErr.message}`,
            };
          }
        }

        await logAdminAction(adminId, "tb_wallet_hs.approve_deposit", "tb_wallet_hs", String(id), {
          userid,
          amount,
          before: { wallettotal: walletBefore },
          after:  { wallettotal: walletAfter },
          hadPaydepositLinks: false,
          cascade: cascadedRows,
        });

        revalidatePath(`/admin/wallet/${id}`);
        revalidatePath("/admin/wallet");
        revalidatePath("/admin");

        return {
          ok: true,
          data: {
            ok: true,
            walletHsId: id,
            customer: {
              userid,
              walletTotalBefore: walletBefore,
              walletTotalAfter:  walletAfter,
            },
            cascadedRows,
            hadPaydepositLinks: false,
          },
        };
      }

      // ──────────────────────────────────────────────
      // 4b. LINKED slip path — cascade to parents + siblings.
      //
      //   Per legacy L598-619: when paydeposit links exist, the topup
      //   amount is NOT credited to wallettotal (it was already counted
      //   via the type='7' sibling debits). Net wallet change = 0 on
      //   approve. Wallet credit only happens on REJECT (refund path).
      // ──────────────────────────────────────────────

      // Pre-read current wallet balance for the result payload (no mutation).
      const { data: wDispRow, error: wDispErr } = await admin
        .from("tb_wallet")
        .select("wallettotal")
        .eq("userid", userid)
        .maybeSingle<{ wallettotal: number }>();
      if (wDispErr) {
        console.error(`[tb_wallet display read] failed`, { code: wDispErr.code, message: wDispErr.message });
      }
      walletBefore = Number(wDispRow?.wallettotal ?? 0);
      walletAfter = walletBefore;  // no change on approve when linked

      // For each linked parent, dispatch by hno prefix.
      for (const link of links) {
        const klass = classifyHnoParent(link.hno);

        // ──────────────────────────────────────────
        // (i) Flip the sibling pay row (type='2' for shop, type='4' for
        //     forwarder; refOrder=hno · refOrder2=topup.id · status='1').
        //     Legacy L450-467.
        // ──────────────────────────────────────────
        const siblingType = klass === "shop_order" ? "2" : "4";
        const { error: sibUpdErr } = await admin
          .from("tb_wallet_hs")
          .update({ status: "2", adminid: legacyAdminId, adminidupdate: legacyAdminId })
          .eq("reforder", link.hno)
          .eq("type", siblingType)
          .eq("status", "1")
          .eq("reforder2", id);
        if (sibUpdErr) {
          console.error(`[tb_wallet_hs sibling pay flip] failed`, {
            code: sibUpdErr.code,
            message: sibUpdErr.message,
            hno: link.hno,
          });
          // continue — legacy doesn't abort on sub-update failure either
        }
        cascadedRows.push({
          table: "tb_wallet_hs",
          id: `reforder=${link.hno}&type=${siblingType}&reforder2=${id}`,
          fromStatus: "1",
          toStatus: "2",
          note: `sibling-pay (${klass})`,
        });

        // ──────────────────────────────────────────
        // (ii) Update the parent row (shop_order or forwarder).
        //      Legacy L499-513 (shop), L554-566 (forwarder).
        // ──────────────────────────────────────────
        if (klass === "shop_order") {
          const { data: hoBefore, error: hoBeforeErr } = await admin
            .from("tb_header_order")
            .select("hno, paydeposit, hstatus")
            .eq("hno", link.hno)
            .maybeSingle<{ hno: string; paydeposit: string | null; hstatus: string | null }>();
          if (hoBeforeErr) {
            console.error(`[tb_header_order read] failed`, {
              code: hoBeforeErr.code,
              message: hoBeforeErr.message,
              hno: link.hno,
            });
            cascadedRows.push({
              table: "tb_header_order",
              id: link.hno,
              fromStatus: null,
              toStatus: null,
              note: `read-failed: ${hoBeforeErr.message}`,
            });
            continue;
          }
          if (!hoBefore) {
            cascadedRows.push({
              table: "tb_header_order",
              id: link.hno,
              fromStatus: null,
              toStatus: null,
              note: "parent not found",
            });
            continue;
          }
          const { error: hoUpdErr } = await admin
            .from("tb_header_order")
            .update({ paydeposit: "", adminidupdate: legacyAdminId })
            .eq("hno", link.hno);
          if (hoUpdErr) {
            console.error(`[tb_header_order mutation] failed`, {
              code: hoUpdErr.code,
              message: hoUpdErr.message,
              hno: link.hno,
            });
            cascadedRows.push({
              table: "tb_header_order",
              id: link.hno,
              fromStatus: hoBefore.paydeposit,
              toStatus: hoBefore.paydeposit,
              note: `update-failed: ${hoUpdErr.message}`,
            });
            continue;
          }
          cascadedRows.push({
            table: "tb_header_order",
            id: link.hno,
            fromStatus: `paydeposit=${hoBefore.paydeposit ?? ""}`,
            toStatus: "paydeposit=",
            note: "approve · clear paydeposit",
          });
        } else {
          // forwarder branch
          const fwdId = Number(link.hno);
          if (!Number.isFinite(fwdId) || fwdId <= 0) {
            cascadedRows.push({
              table: "tb_forwarder",
              id: link.hno,
              fromStatus: null,
              toStatus: null,
              note: "non-numeric hno · skipped",
            });
            continue;
          }
          // Need wusercredit from the SIBLING pay row (type='4') to decide
          // credit vs non-credit branch. Legacy reads from the sibling
          // tb_wallet_hs row's wusercredit column (NOT tb_forwarder's).
          const { data: sibRow, error: sibReadErr } = await admin
            .from("tb_wallet_hs")
            .select("wusercredit, amount")
            .eq("reforder", link.hno)
            .eq("type", "4")
            .eq("reforder2", id)
            .maybeSingle<{ wusercredit: string | null; amount: number }>();
          if (sibReadErr) {
            console.error(`[tb_wallet_hs sibling read for fwd] failed`, {
              code: sibReadErr.code,
              message: sibReadErr.message,
              hno: link.hno,
            });
          }
          const isCreditPay = sibRow?.wusercredit === "1";
          const sibAmount = Number(sibRow?.amount ?? 0);

          const { data: fwdBefore, error: fwdBeforeErr } = await admin
            .from("tb_forwarder")
            .select("id, paydeposit, fstatus, fcredit")
            .eq("id", fwdId)
            .maybeSingle<{ id: number; paydeposit: string | null; fstatus: string | null; fcredit: string | null }>();
          if (fwdBeforeErr) {
            console.error(`[tb_forwarder read] failed`, {
              code: fwdBeforeErr.code,
              message: fwdBeforeErr.message,
              id: fwdId,
            });
            cascadedRows.push({
              table: "tb_forwarder",
              id: String(fwdId),
              fromStatus: null,
              toStatus: null,
              note: `read-failed: ${fwdBeforeErr.message}`,
            });
            continue;
          }
          if (!fwdBefore) {
            cascadedRows.push({
              table: "tb_forwarder",
              id: String(fwdId),
              fromStatus: null,
              toStatus: null,
              note: "parent not found",
            });
            continue;
          }
          if (isCreditPay) {
            // wUserCredit branch: clear paydeposit + fcredit + set
            // fdatestatus6 + decrement tb_credit.creditvalue by sibling
            // amount. Legacy L555-560.
            const { error: fwdUpdErr } = await admin
              .from("tb_forwarder")
              .update({
                paydeposit:    "",
                fcredit:       "",
                fdatestatus6:  nowIso,
                adminidupdate: legacyAdminId,
              })
              .eq("id", fwdId);
            if (fwdUpdErr) {
              cascadedRows.push({
                table: "tb_forwarder",
                id: String(fwdId),
                fromStatus: `paydeposit=${fwdBefore.paydeposit ?? ""}|fcredit=${fwdBefore.fcredit ?? ""}`,
                toStatus: `paydeposit=${fwdBefore.paydeposit ?? ""}|fcredit=${fwdBefore.fcredit ?? ""}`,
                note: `update-failed: ${fwdUpdErr.message}`,
              });
              continue;
            }
            // Decrement tb_credit.creditvalue. Legacy L559: `creditValue = creditValue - $fPrice`.
            const { data: credRow, error: credReadErr } = await admin
              .from("tb_credit")
              .select("userid, creditvalue")
              .eq("userid", userid)
              .maybeSingle<{ userid: string; creditvalue: number }>();
            if (credReadErr) {
              console.error(`[tb_credit read] failed`, { code: credReadErr.code, message: credReadErr.message });
            }
            if (credRow) {
              const newCredit = Number(credRow.creditvalue) - sibAmount;
              const { error: credUpdErr } = await admin
                .from("tb_credit")
                .update({ creditvalue: newCredit })
                .eq("userid", userid);
              if (credUpdErr) {
                console.error(`[tb_credit mutation] failed`, { code: credUpdErr.code, message: credUpdErr.message });
              } else {
                cascadedRows.push({
                  table: "tb_credit",
                  id: userid,
                  fromStatus: `creditvalue=${credRow.creditvalue}`,
                  toStatus: `creditvalue=${newCredit}`,
                  note: "decrement on credit-pay approve",
                });
              }
            }
            cascadedRows.push({
              table: "tb_forwarder",
              id: String(fwdId),
              fromStatus: `paydeposit=${fwdBefore.paydeposit ?? ""}|fcredit=${fwdBefore.fcredit ?? ""}`,
              toStatus: `paydeposit=|fcredit=|fdatestatus6=${nowIso}`,
              note: "approve · wUserCredit branch",
            });
          } else {
            // Non-credit branch: clear paydeposit + set fdatestatus6.
            // Legacy L562.
            const { error: fwdUpdErr } = await admin
              .from("tb_forwarder")
              .update({
                paydeposit:    "",
                fdatestatus6:  nowIso,
                adminidupdate: legacyAdminId,
              })
              .eq("id", fwdId);
            if (fwdUpdErr) {
              cascadedRows.push({
                table: "tb_forwarder",
                id: String(fwdId),
                fromStatus: `paydeposit=${fwdBefore.paydeposit ?? ""}`,
                toStatus: `paydeposit=${fwdBefore.paydeposit ?? ""}`,
                note: `update-failed: ${fwdUpdErr.message}`,
              });
              continue;
            }
            cascadedRows.push({
              table: "tb_forwarder",
              id: String(fwdId),
              fromStatus: `paydeposit=${fwdBefore.paydeposit ?? ""}`,
              toStatus: `paydeposit=|fdatestatus6=${nowIso}`,
              note: "approve · non-credit branch",
            });
          }
        }
      }

      // ──────────────────────────────────────────
      // (iii) Flip type='7' sibling pending-pay rows linked by refOrder=topup.id.
      //       Legacy L598-599 (always runs · regardless of approve/reject).
      // ──────────────────────────────────────────
      const { error: type7UpdErr } = await admin
        .from("tb_wallet_hs")
        .update({ status: "2", adminid: legacyAdminId, adminidupdate: legacyAdminId })
        .eq("reforder", String(id))
        .eq("type", "7");
      if (type7UpdErr) {
        console.error(`[tb_wallet_hs type-7 sibling flip] failed`, {
          code: type7UpdErr.code,
          message: type7UpdErr.message,
        });
      } else {
        cascadedRows.push({
          table: "tb_wallet_hs",
          id: `reforder=${id}&type=7`,
          fromStatus: "1",
          toStatus: "2",
          note: "sibling type=7 pending-pay rows",
        });
      }

      // No wallet credit on linked-slip approve (legacy L621-633 explicit
      // comment: "ไม่เติมเพิ่ม"). The topup amount was already counted via
      // the type='7' sibling debits.

      await logAdminAction(adminId, "tb_wallet_hs.approve_deposit", "tb_wallet_hs", String(id), {
        userid,
        amount,
        hadPaydepositLinks: true,
        linkCount: links.length,
        before: { wallettotal: walletBefore },
        after:  { wallettotal: walletAfter },
        cascade: cascadedRows,
      });

      revalidatePath(`/admin/wallet/${id}`);
      revalidatePath("/admin/wallet");
      revalidatePath("/admin");
      // Revalidate every parent we touched.
      for (const link of links) {
        if (classifyHnoParent(link.hno) === "shop_order") {
          revalidatePath(`/admin/service-orders/${link.hno}`);
        } else {
          revalidatePath(`/admin/forwarders/${link.hno}`);
        }
      }

      return {
        ok: true,
        data: {
          ok: true,
          walletHsId: id,
          customer: {
            userid,
            walletTotalBefore: walletBefore,
            walletTotalAfter:  walletAfter,
          },
          cascadedRows,
          hadPaydepositLinks: true,
        },
      };
    },
  );
}

// ────────────────────────────────────────────────────────────

const rejectDepositSchema = z.object({
  id:     z.number().int().positive(),
  reason: z.string().trim().max(1000).optional(),
});
export type AdminRejectWalletDepositInput = z.infer<typeof rejectDepositSchema>;

type RejectResult = {
  ok: true;
  walletHsId: number;
  alreadyDone?: boolean;
  customer: {
    userid: string;
    walletTotalBefore: number;
    walletTotalAfter: number;
  };
  refundedAmount: number;
  cascadedRows: CascadedRow[];
  hadPaydepositLinks: boolean;
};

/**
 * Reject a customer top-up slip (status `1`→`3`).
 *
 * Implements ADR-0018 D-2 rule 3:
 *   - Bare slip → status='3' · NO tb_wallet change · no cascade.
 *   - Linked slip → cascade flips parents back to pre-pay state, DELETEs
 *     paydeposit links, AND REFUNDS the wallet by SUM(type='7' amounts)
 *     (legacy L607-614 cash-back path).
 */
export async function adminRejectWalletDeposit(
  input: AdminRejectWalletDepositInput,
): Promise<AdminActionResult<RejectResult>> {
  const parsed = rejectDepositSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, reason } = parsed.data;

  return withAdmin<RejectResult>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();

      // ──────────────────────────────────────────
      // 1. Read topup row + idempotency.
      // ──────────────────────────────────────────
      const { data: rowRaw, error: rowErr } = await admin
        .from("tb_wallet_hs")
        .select("id, userid, amount, type, status")
        .eq("id", id)
        .maybeSingle<{
          id: number;
          userid: string;
          amount: number;
          type: string | null;
          status: string | null;
        }>();
      if (rowErr) {
        console.error(`[tb_wallet_hs list] failed`, { code: rowErr.code, message: rowErr.message });
        return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
      }
      if (!rowRaw) return { ok: false, error: "ไม่พบรายการ" };

      if (rowRaw.status === "2" || rowRaw.status === "3") {
        return {
          ok: true,
          data: {
            ok: true,
            walletHsId: id,
            alreadyDone: true,
            customer: {
              userid: rowRaw.userid,
              walletTotalBefore: NaN,
              walletTotalAfter:  NaN,
            },
            refundedAmount: 0,
            cascadedRows: [],
            hadPaydepositLinks: false,
          },
        };
      }
      if (rowRaw.status !== "1") {
        return { ok: false, error: `รายการนี้สถานะไม่ใช่ 'รอตรวจสอบ' (status=${rowRaw.status ?? "null"})` };
      }
      if (rowRaw.type !== "1") {
        return { ok: false, error: `ฟังก์ชันนี้รองรับเฉพาะรายการเติมเงิน (type='1') · พบ type='${rowRaw.type ?? "null"}'` };
      }

      const userid = rowRaw.userid;
      const cascadedRows: CascadedRow[] = [];

      // ──────────────────────────────────────────
      // 2. Read paydeposit links.
      // ──────────────────────────────────────────
      const { data: linksRaw, error: linksErr } = await admin
        .from("tb_wallet_paydeposit")
        .select("id, whid, hno")
        .eq("whid", id);
      if (linksErr) {
        console.error(`[tb_wallet_paydeposit list] failed`, {
          code: linksErr.code,
          message: linksErr.message,
        });
        return { ok: false, error: `db_error:${linksErr.code ?? "unknown"}` };
      }
      const links = (linksRaw ?? []) as PaydepositLink[];
      const hasLinks = links.length > 0;

      // ──────────────────────────────────────────
      // 3. Flip topup row to status='3' (with optional note).
      // ──────────────────────────────────────────
      const patch: Record<string, unknown> = {
        status:        "3",
        adminid:       legacyAdminId,
        adminidupdate: legacyAdminId,
      };
      if (reason && reason.length > 0) patch.note = reason;
      const { error: updHsErr } = await admin
        .from("tb_wallet_hs")
        .update(patch)
        .eq("id", id)
        .eq("status", "1");
      if (updHsErr) {
        console.error(`[tb_wallet_hs mutation] failed`, { code: updHsErr.code, message: updHsErr.message });
        return { ok: false, error: updHsErr.message };
      }
      cascadedRows.push({
        table: "tb_wallet_hs",
        id: String(id),
        fromStatus: "1",
        toStatus: "3",
        note: "topup-rejected",
      });

      // ──────────────────────────────────────────
      // 4. Cascade to parents + sibling rows.
      // ──────────────────────────────────────────
      if (hasLinks) {
        const future = new Date();
        future.setDate(future.getDate() + 5);
        const hDatePaymentIso = future.toISOString();

        for (const link of links) {
          const klass = classifyHnoParent(link.hno);

          // Flip sibling pay row to status='3'.
          const siblingType = klass === "shop_order" ? "2" : "4";
          const { error: sibUpdErr } = await admin
            .from("tb_wallet_hs")
            .update({ status: "3", adminid: legacyAdminId, adminidupdate: legacyAdminId })
            .eq("reforder", link.hno)
            .eq("type", siblingType)
            .eq("status", "1")
            .eq("reforder2", id);
          if (sibUpdErr) {
            console.error(`[tb_wallet_hs sibling pay flip · reject] failed`, {
              code: sibUpdErr.code,
              message: sibUpdErr.message,
              hno: link.hno,
            });
          }
          cascadedRows.push({
            table: "tb_wallet_hs",
            id: `reforder=${link.hno}&type=${siblingType}&reforder2=${id}`,
            fromStatus: "1",
            toStatus: "3",
            note: `sibling-pay reject (${klass})`,
          });

          // Update parent row.
          if (klass === "shop_order") {
            // legacy L494-498: paydeposit='' · hstatus='2' · hdatepayment=NOW()+5d
            const { data: hoBefore, error: hoBeforeReadErr } = await admin
              .from("tb_header_order")
              .select("paydeposit, hstatus")
              .eq("hno", link.hno)
              .maybeSingle<{ paydeposit: string | null; hstatus: string | null }>();
            if (hoBeforeReadErr) {
              console.error(`[tb_header_order before-read · reject] failed`, {
                code: hoBeforeReadErr.code,
                message: hoBeforeReadErr.message,
                hno: link.hno,
              });
            }
            const { error: hoUpdErr } = await admin
              .from("tb_header_order")
              .update({
                paydeposit:    "",
                hstatus:       "2",
                hdatepayment:  hDatePaymentIso,
                adminidupdate: legacyAdminId,
              })
              .eq("hno", link.hno);
            if (hoUpdErr) {
              cascadedRows.push({
                table: "tb_header_order",
                id: link.hno,
                fromStatus: hoBefore ? `paydeposit=${hoBefore.paydeposit}|hstatus=${hoBefore.hstatus}` : null,
                toStatus: null,
                note: `update-failed: ${hoUpdErr.message}`,
              });
            } else {
              cascadedRows.push({
                table: "tb_header_order",
                id: link.hno,
                fromStatus: hoBefore ? `paydeposit=${hoBefore.paydeposit ?? ""}|hstatus=${hoBefore.hstatus ?? ""}` : null,
                toStatus: `paydeposit=|hstatus=2|hdatepayment=${hDatePaymentIso}`,
                note: "reject · revert to awaiting-payment + 5d",
              });
            }
          } else {
            // forwarder branch. Legacy L536-552.
            const fwdId = Number(link.hno);
            if (!Number.isFinite(fwdId) || fwdId <= 0) {
              cascadedRows.push({
                table: "tb_forwarder",
                id: link.hno,
                fromStatus: null,
                toStatus: null,
                note: "non-numeric hno · skipped",
              });
              continue;
            }
            // PCSF-50 special case: ALSO reset ftransportprice + fusercompany.
            const { data: pcsf50Row, error: pcsf50Err } = await admin
              .from("tb_forwarder")
              .select("id")
              .eq("id", fwdId)
              .eq("fshipby", "PCSF")
              .eq("ftransportprice", 50)
              .maybeSingle<{ id: number }>();
            if (pcsf50Err) {
              console.error(`[tb_forwarder PCSF-50 probe] failed`, { code: pcsf50Err.code, message: pcsf50Err.message });
            }
            const isPCSF50 = pcsf50Row != null;

            // Read wusercredit sibling to know whether to wipe fCredit too.
            const { data: sibRow, error: sibReadErr } = await admin
              .from("tb_wallet_hs")
              .select("wusercredit")
              .eq("reforder", link.hno)
              .eq("type", "4")
              .eq("reforder2", id)
              .maybeSingle<{ wusercredit: string | null }>();
            if (sibReadErr) {
              console.error(`[tb_wallet_hs sibling read for fwd · reject] failed`, {
                code: sibReadErr.code,
                message: sibReadErr.message,
                hno: link.hno,
              });
            }
            const isCreditPay = sibRow?.wusercredit === "1";

            const { data: fwdBefore, error: fwdBeforeReadErr } = await admin
              .from("tb_forwarder")
              .select("paydeposit, fstatus, fcredit, ftransportprice, fusercompany")
              .eq("id", fwdId)
              .maybeSingle<{
                paydeposit: string | null;
                fstatus: string | null;
                fcredit: string | null;
                ftransportprice: number | null;
                fusercompany: string | null;
              }>();
            if (fwdBeforeReadErr) {
              console.error(`[tb_forwarder before-read · reject] failed`, {
                code: fwdBeforeReadErr.code,
                message: fwdBeforeReadErr.message,
                id: fwdId,
              });
            }

            // Legacy reject path:
            //   wUserCredit branch (L539-541): paydeposit='' · fCredit='1' (keep) — the only
            //     change is paydeposit; fStatus stays whatever it was, fCredit was already '1'.
            //     Verified L540: `UPDATE tb_forwarder SET paydeposit='', adminIDUpdate, fCredit='1'`.
            //   Non-credit branch (L542): paydeposit='' · fstatus='5' · adminIDUpdate.
            //   PCSF-50 (L547): + ftransportprice=0 · fusercompany=''.
            let fwdPatch: Record<string, unknown>;
            if (isCreditPay) {
              fwdPatch = {
                paydeposit:    "",
                fcredit:       "1",
                adminidupdate: legacyAdminId,
              };
            } else if (isPCSF50) {
              fwdPatch = {
                paydeposit:      "",
                fstatus:         "5",
                ftransportprice: 0,
                fusercompany:    "",
                adminidupdate:   legacyAdminId,
              };
            } else {
              fwdPatch = {
                paydeposit:    "",
                fstatus:       "5",
                adminidupdate: legacyAdminId,
              };
            }
            const { error: fwdUpdErr } = await admin
              .from("tb_forwarder")
              .update(fwdPatch)
              .eq("id", fwdId);
            if (fwdUpdErr) {
              cascadedRows.push({
                table: "tb_forwarder",
                id: String(fwdId),
                fromStatus: fwdBefore ? `paydeposit=${fwdBefore.paydeposit ?? ""}|fstatus=${fwdBefore.fstatus ?? ""}` : null,
                toStatus: null,
                note: `update-failed: ${fwdUpdErr.message}`,
              });
            } else {
              cascadedRows.push({
                table: "tb_forwarder",
                id: String(fwdId),
                fromStatus: fwdBefore ? `paydeposit=${fwdBefore.paydeposit ?? ""}|fstatus=${fwdBefore.fstatus ?? ""}|fcredit=${fwdBefore.fcredit ?? ""}` : null,
                toStatus: isCreditPay
                  ? "paydeposit=|fcredit=1"
                  : (isPCSF50 ? "paydeposit=|fstatus=5|ftransportprice=0|fusercompany=" : "paydeposit=|fstatus=5"),
                note: isCreditPay ? "reject · credit-pay branch" : (isPCSF50 ? "reject · PCSF-50 branch" : "reject · standard branch"),
              });
            }
          }
        }

        // Flip type='7' sibling rows to status='3'. Read their amounts FIRST
        // for the refund calculation.
        const { data: type7RowsRaw, error: type7ReadErr } = await admin
          .from("tb_wallet_hs")
          .select("id, amount")
          .eq("reforder", String(id))
          .eq("type", "7");
        if (type7ReadErr) {
          console.error(`[tb_wallet_hs type-7 read] failed`, { code: type7ReadErr.code, message: type7ReadErr.message });
        }
        const type7Rows = (type7RowsRaw ?? []) as Array<{ id: number; amount: number }>;
        const refundAmount = type7Rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

        const { error: type7UpdErr } = await admin
          .from("tb_wallet_hs")
          .update({ status: "3", adminid: legacyAdminId, adminidupdate: legacyAdminId })
          .eq("reforder", String(id))
          .eq("type", "7");
        if (type7UpdErr) {
          console.error(`[tb_wallet_hs type-7 flip] failed`, { code: type7UpdErr.code, message: type7UpdErr.message });
        } else {
          cascadedRows.push({
            table: "tb_wallet_hs",
            id: `reforder=${id}&type=7`,
            fromStatus: "1",
            toStatus: "3",
            note: `sibling type=7 rows · refund=${refundAmount}`,
          });
        }

        // DELETE paydeposit link rows. Legacy L616: only on status='3'.
        const { error: pdDelErr } = await admin
          .from("tb_wallet_paydeposit")
          .delete()
          .eq("whid", id);
        if (pdDelErr) {
          console.error(`[tb_wallet_paydeposit delete] failed`, { code: pdDelErr.code, message: pdDelErr.message });
        }

        // REFUND the wallet (legacy L607-614).
        const { data: wRow, error: wRowErr } = await admin
          .from("tb_wallet")
          .select("userid, wallettotal")
          .eq("userid", userid)
          .maybeSingle<{ userid: string; wallettotal: number }>();
        if (wRowErr) {
          console.error(`[tb_wallet read for refund] failed`, { code: wRowErr.code, message: wRowErr.message });
        }
        const walletBefore = Number(wRow?.wallettotal ?? 0);
        const walletAfter = walletBefore + refundAmount;

        if (refundAmount !== 0) {
          if (!wRow) {
            const { error: walletInsErr } = await admin
              .from("tb_wallet")
              .insert({ userid, wallettotal: refundAmount });
            if (walletInsErr) {
              console.error(`[tb_wallet refund insert] failed`, {
                code: walletInsErr.code,
                message: walletInsErr.message,
              });
            }
          } else {
            const { error: walletUpdErr } = await admin
              .from("tb_wallet")
              .update({ wallettotal: walletAfter })
              .eq("userid", userid);
            if (walletUpdErr) {
              console.error(`[tb_wallet refund update] failed`, {
                code: walletUpdErr.code,
                message: walletUpdErr.message,
              });
            }
          }
        }

        await logAdminAction(adminId, "tb_wallet_hs.reject_deposit", "tb_wallet_hs", String(id), {
          userid,
          reason,
          hadPaydepositLinks: true,
          linkCount: links.length,
          refundedAmount: refundAmount,
          before: { wallettotal: walletBefore },
          after:  { wallettotal: walletAfter },
          cascade: cascadedRows,
        });

        revalidatePath(`/admin/wallet/${id}`);
        revalidatePath("/admin/wallet");
        revalidatePath("/admin");
        for (const link of links) {
          if (classifyHnoParent(link.hno) === "shop_order") {
            revalidatePath(`/admin/service-orders/${link.hno}`);
          } else {
            revalidatePath(`/admin/forwarders/${link.hno}`);
          }
        }

        return {
          ok: true,
          data: {
            ok: true,
            walletHsId: id,
            customer: {
              userid,
              walletTotalBefore: walletBefore,
              walletTotalAfter:  walletAfter,
            },
            refundedAmount: refundAmount,
            cascadedRows,
            hadPaydepositLinks: true,
          },
        };
      }

      // ──────────────────────────────────────────
      // Bare-reject path: no cascade, no wallet change.
      // ──────────────────────────────────────────
      await logAdminAction(adminId, "tb_wallet_hs.reject_deposit", "tb_wallet_hs", String(id), {
        userid,
        reason,
        hadPaydepositLinks: false,
        refundedAmount: 0,
        cascade: cascadedRows,
      });

      revalidatePath(`/admin/wallet/${id}`);
      revalidatePath("/admin/wallet");
      revalidatePath("/admin");

      return {
        ok: true,
        data: {
          ok: true,
          walletHsId: id,
          customer: {
            userid,
            walletTotalBefore: NaN,
            walletTotalAfter:  NaN,
          },
          refundedAmount: 0,
          cascadedRows,
          hadPaydepositLinks: false,
        },
      };
    },
  );
}

// ────────────────────────────────────────────────────────────

const bulkApproveDepositSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, "ต้องเลือกอย่างน้อย 1 รายการ").max(50, "เลือกได้สูงสุด 50 รายการต่อรอบ"),
});
export type AdminBulkApproveWalletDepositsInput = z.infer<typeof bulkApproveDepositSchema>;

type BulkApproveResult = {
  results: Array<
    | { id: number; ok: true; alreadyDone?: boolean; cascadeRowCount: number }
    | { id: number; ok: false; error: string }
  >;
  summary: { approved: number; alreadyDone: number; failed: number };
};

/**
 * Bulk-approve N top-up slips. Per-row failure does NOT abort the batch
 * (mirrors `tb-bulk.ts adminBulkApproveWalletHs`).
 */
export async function adminBulkApproveWalletDeposits(
  input: AdminBulkApproveWalletDepositsInput,
): Promise<AdminActionResult<BulkApproveResult>> {
  const parsed = bulkApproveDepositSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { ids } = parsed.data;

  const results: BulkApproveResult["results"] = [];
  let approved = 0;
  let alreadyDone = 0;
  let failed = 0;

  // Sequential — keeps per-row audit log + revalidatePath behaviour intact.
  // This is also legacy semantics (the legacy UI approves one at a time;
  // this skill just runs the loop server-side).
  for (const id of ids) {
    const res = await adminApproveWalletDeposit({ id });
    if (res.ok && res.data) {
      if (res.data.alreadyDone) {
        alreadyDone++;
        results.push({ id, ok: true, alreadyDone: true, cascadeRowCount: 0 });
      } else {
        approved++;
        results.push({ id, ok: true, cascadeRowCount: res.data.cascadedRows.length });
      }
    } else {
      failed++;
      results.push({ id, ok: false, error: res.ok ? "unknown" : res.error });
    }
  }

  revalidatePath("/admin/wallet");
  revalidatePath("/admin");

  return {
    ok: true,
    data: {
      results,
      summary: { approved, alreadyDone, failed },
    },
  };
}

// ════════════════════════════════════════════════════════════════
// P1-25/26 — Admin customer-WITHDRAW approve/reject per ADR-0018
// D-2 rule 1 STATUS sub-case + rule 3 paragraphs 3-4.
// ════════════════════════════════════════════════════════════════
//
// Faithful port of the legacy `pcs-admin/wallet.php` $_GET['page']='withdraw'
// approve/reject branch (L744-819 — read end-to-end before patching).
//
// The customer withdraw flow is "debit-hold": submitWithdrawRequest
// (actions/wallet-tb.ts) ALREADY debited tb_wallet.wallettotal at submit
// and left a pending tb_wallet_hs row (type='3' status='1'). So:
//
//   APPROVE (status 1→2): flip status + stamp admin. **NO tb_wallet change**
//     — the debit happened at submit; approve = "confirm the bank payout".
//     Legacy L754-792 (status='2' branch) flips status + records the payout
//     slip; it does NOT touch tb_wallet. We make the slip optional (the ADR
//     contract is "approve to pay out"; the bank-transfer proof is a nice-to-
//     have, not a gate — accounting often approves first, attaches later).
//
//   REJECT (status 1→3): flip status + stamp admin + **REFUND**
//     tb_wallet.wallettotal += amount (give the held money back). Legacy
//     L794-818 (status='3' branch) reads walletTotal then writes
//     walletTotal+amount — a **balance-bump on the SAME tb_wallet row**, NOT
//     a new type='5' row. (The ADR rule-3 floated a type='5' row, but the
//     legacy code is the authority and it bumps the balance — we mirror
//     legacy exactly. The rejected row itself stays type='3' status='3'; the
//     customer history tab renders it "ไม่สำเร็จ".)
//
//   Idempotency: terminal status (2 or 3) → {ok:true, alreadyDone:true},
//     no rows touched, no double-refund.
//
// Failure rollback: PostgREST has no real transaction. On REJECT, the
// status flip happens first; if the tb_wallet refund then fails we surface
// a LOUD error including the tb_wallet_hs.id so accounting reconciles (we do
// NOT auto-revert the status flip — the legacy doesn't either, and leaving
// the row rejected-but-not-refunded is safer than a flapping status).
//
// Scope guard: these functions handle ONLY type='3' (customer withdraw).
// type='7' (admin-manual withdraw) is a different flow inserted with
// status='2' directly by adminCreateWalletHsManual — it never reaches a
// status='1' queue, so it is not in scope here.

// ────────────────────────────────────────────────────────────

const approveWithdrawSchema = z.object({
  id: z.number().int().positive(),
});
export type AdminApproveWithdrawInput = z.infer<typeof approveWithdrawSchema>;

type WithdrawResult = {
  ok: true;
  walletHsId: number;
  alreadyDone?: boolean;
  customer: {
    userid: string;
    walletTotalBefore: number;
    walletTotalAfter: number;
  };
  refundedAmount: number;
};

/**
 * Approve a customer withdraw request (status `1`→`2`).
 *
 * Per ADR-0018 D-2 rule 3 paragraph 3: flip status + stamp admin,
 * **NO tb_wallet change** (the debit already happened at submit — this is
 * "approve to pay out", the bank-transfer is the side-effect).
 *
 * Idempotent (terminal status returns alreadyDone). Requires
 * `tb_wallet_hs WHERE id=walletHsId AND status='1' AND type='3'`.
 */
export async function adminApproveWithdraw(
  input: AdminApproveWithdrawInput,
): Promise<AdminActionResult<WithdrawResult>> {
  const parsed = approveWithdrawSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id } = parsed.data;

  return withAdmin<WithdrawResult>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();

      // 1. Read the withdraw row + idempotency check.
      const { data: rowRaw, error: rowErr } = await admin
        .from("tb_wallet_hs")
        .select("id, userid, amount, type, status")
        .eq("id", id)
        .maybeSingle<{
          id: number;
          userid: string;
          amount: number;
          type: string | null;
          status: string | null;
        }>();
      if (rowErr) {
        console.error(`[tb_wallet_hs list] failed`, { code: rowErr.code, message: rowErr.message });
        return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
      }
      if (!rowRaw) return { ok: false, error: "ไม่พบรายการ" };

      // Idempotency — already-terminal returns OK with alreadyDone.
      if (rowRaw.status === "2" || rowRaw.status === "3") {
        return {
          ok: true,
          data: {
            ok: true,
            walletHsId: id,
            alreadyDone: true,
            customer: { userid: rowRaw.userid, walletTotalBefore: NaN, walletTotalAfter: NaN },
            refundedAmount: 0,
          },
        };
      }
      if (rowRaw.status !== "1") {
        return { ok: false, error: `รายการนี้สถานะไม่ใช่ 'รอตรวจสอบ' (status=${rowRaw.status ?? "null"})` };
      }
      // Only customer withdraw (type='3'). type='7' admin-manual is a
      // different flow (inserted status='2' directly — never queued here).
      if (rowRaw.type !== "3") {
        return { ok: false, error: `ฟังก์ชันนี้รองรับเฉพาะรายการถอนเงินของลูกค้า (type='3') · พบ type='${rowRaw.type ?? "null"}'` };
      }

      const userid = rowRaw.userid;

      // 2. Flip status='2' + stamp admin. NO tb_wallet change (rule 3 ¶3).
      const { error: updErr } = await admin
        .from("tb_wallet_hs")
        .update({ status: "2", adminid: legacyAdminId, adminidupdate: legacyAdminId })
        .eq("id", id)
        .eq("status", "1");  // race-guard
      if (updErr) {
        console.error(`[tb_wallet_hs withdraw approve] failed`, { code: updErr.code, message: updErr.message });
        return { ok: false, error: updErr.message };
      }

      // Read current balance only for the result payload (no mutation).
      const { data: wRow, error: wErr } = await admin
        .from("tb_wallet")
        .select("wallettotal")
        .eq("userid", userid)
        .maybeSingle<{ wallettotal: number }>();
      if (wErr) {
        console.error(`[tb_wallet display read] failed`, { code: wErr.code, message: wErr.message });
      }
      const walletBalance = Number(wRow?.wallettotal ?? 0);

      await logAdminAction(adminId, "tb_wallet_hs.approve_withdraw", "tb_wallet_hs", String(id), {
        userid,
        amount: Number(rowRaw.amount ?? 0),
        walletUnchanged: true,
        note: "approve to pay out — debit already happened at submit",
      });

      revalidatePath(`/admin/wallet/${id}`);
      revalidatePath("/admin/wallet");
      revalidatePath("/admin/wallet/withdrawals");
      revalidatePath("/admin");

      return {
        ok: true,
        data: {
          ok: true,
          walletHsId: id,
          customer: { userid, walletTotalBefore: walletBalance, walletTotalAfter: walletBalance },
          refundedAmount: 0,
        },
      };
    },
  );
}

// ────────────────────────────────────────────────────────────

const rejectWithdrawSchema = z.object({
  id:     z.number().int().positive(),
  reason: z.string().trim().max(1000).optional(),
});
export type AdminRejectWithdrawInput = z.infer<typeof rejectWithdrawSchema>;

/**
 * Reject a customer withdraw request (status `1`→`3`) + REFUND the hold.
 *
 * Per ADR-0018 D-2 rule 3 paragraph 4 + legacy wallet.php L794-818: flip
 * status + stamp admin + **tb_wallet.wallettotal += amount** (balance-bump
 * on the same row — NOT a new type='5' row, per the legacy code). Gives the
 * held money back since the withdraw is cancelled.
 *
 * Idempotent (terminal status returns alreadyDone — no double-refund).
 */
export async function adminRejectWithdraw(
  input: AdminRejectWithdrawInput,
): Promise<AdminActionResult<WithdrawResult>> {
  const parsed = rejectWithdrawSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, reason } = parsed.data;

  return withAdmin<WithdrawResult>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();

      // 1. Read the withdraw row + idempotency check.
      const { data: rowRaw, error: rowErr } = await admin
        .from("tb_wallet_hs")
        .select("id, userid, amount, type, status")
        .eq("id", id)
        .maybeSingle<{
          id: number;
          userid: string;
          amount: number;
          type: string | null;
          status: string | null;
        }>();
      if (rowErr) {
        console.error(`[tb_wallet_hs list] failed`, { code: rowErr.code, message: rowErr.message });
        return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
      }
      if (!rowRaw) return { ok: false, error: "ไม่พบรายการ" };

      // Idempotency — already-terminal returns OK with alreadyDone (NO refund
      // re-applied — critical: a second reject must not double-refund).
      if (rowRaw.status === "2" || rowRaw.status === "3") {
        return {
          ok: true,
          data: {
            ok: true,
            walletHsId: id,
            alreadyDone: true,
            customer: { userid: rowRaw.userid, walletTotalBefore: NaN, walletTotalAfter: NaN },
            refundedAmount: 0,
          },
        };
      }
      if (rowRaw.status !== "1") {
        return { ok: false, error: `รายการนี้สถานะไม่ใช่ 'รอตรวจสอบ' (status=${rowRaw.status ?? "null"})` };
      }
      if (rowRaw.type !== "3") {
        return { ok: false, error: `ฟังก์ชันนี้รองรับเฉพาะรายการถอนเงินของลูกค้า (type='3') · พบ type='${rowRaw.type ?? "null"}'` };
      }

      const userid = rowRaw.userid;
      const amount = Number(rowRaw.amount ?? 0);

      // 2. Flip status='3' + stamp admin (+ optional reason → note).
      //    Legacy L802: UPDATE tb_wallet_hs SET status='3', adminID, adminIDUpdate.
      const patch: Record<string, unknown> = {
        status:        "3",
        adminid:       legacyAdminId,
        adminidupdate: legacyAdminId,
      };
      if (reason && reason.length > 0) patch.note = reason;
      // .select() so we can tell whether THIS call actually flipped the row.
      // Under a concurrent double-reject, the loser's UPDATE matches 0 rows
      // (status already '3') — Supabase returns no error but an empty array.
      // We MUST NOT refund in that case (it would be a double-refund). Only
      // the winner (whose UPDATE returns the row) proceeds to refund.
      const { data: flipped, error: updErr } = await admin
        .from("tb_wallet_hs")
        .update(patch)
        .eq("id", id)
        .eq("status", "1")  // race-guard: someone else must not have just acted
        .select("id");
      if (updErr) {
        console.error(`[tb_wallet_hs withdraw reject] failed`, { code: updErr.code, message: updErr.message });
        return { ok: false, error: updErr.message };
      }
      if (!flipped || flipped.length === 0) {
        // Lost the race — another reject already flipped + refunded. Treat as
        // idempotent success (NO second refund).
        return {
          ok: true,
          data: {
            ok: true,
            walletHsId: id,
            alreadyDone: true,
            customer: { userid, walletTotalBefore: NaN, walletTotalAfter: NaN },
            refundedAmount: 0,
          },
        };
      }

      // 3. REFUND tb_wallet.wallettotal += amount (legacy L807-814 balance-bump).
      const { data: wRow, error: wErr } = await admin
        .from("tb_wallet")
        .select("userid, wallettotal")
        .eq("userid", userid)
        .maybeSingle<{ userid: string; wallettotal: number }>();
      if (wErr) {
        console.error(`[tb_wallet read for refund] failed`, { code: wErr.code, message: wErr.message });
      }
      const walletBefore = Number(wRow?.wallettotal ?? 0);
      const walletAfter = walletBefore + amount;

      if (!wRow) {
        // No tb_wallet row (would be unusual for a customer who withdrew) —
        // insert with the refund amount so the money isn't lost.
        const { error: insErr } = await admin
          .from("tb_wallet")
          .insert({ userid, wallettotal: amount });
        if (insErr) {
          // Status already flipped to '3'. Surface LOUD so accounting refunds
          // manually — we don't auto-revert the status (legacy doesn't either).
          console.error(`[tb_wallet refund insert] FAILED post-reject`, {
            tb_wallet_hs_id: id, userid, amount, message: insErr.message,
          });
          return {
            ok: false,
            error: `ปฏิเสธรายการสำเร็จ (id=${id}) แต่คืนเงินเข้ากระเป๋าล้มเหลว: ${insErr.message} (ยังไม่คืนเงิน — ติดต่อ ops)`,
          };
        }
      } else {
        const { error: updWErr } = await admin
          .from("tb_wallet")
          .update({ wallettotal: walletAfter })
          .eq("userid", userid);
        if (updWErr) {
          console.error(`[tb_wallet refund update] FAILED post-reject`, {
            tb_wallet_hs_id: id, userid, amount, before: walletBefore, target: walletAfter, message: updWErr.message,
          });
          return {
            ok: false,
            error: `ปฏิเสธรายการสำเร็จ (id=${id}) แต่คืนเงินเข้ากระเป๋าล้มเหลว: ${updWErr.message} (ยังไม่คืนเงิน — ติดต่อ ops)`,
          };
        }
      }

      await logAdminAction(adminId, "tb_wallet_hs.reject_withdraw", "tb_wallet_hs", String(id), {
        userid,
        reason,
        refundedAmount: amount,
        before: { wallettotal: walletBefore },
        after:  { wallettotal: walletAfter },
      });

      revalidatePath(`/admin/wallet/${id}`);
      revalidatePath("/admin/wallet");
      revalidatePath("/admin/wallet/withdrawals");
      revalidatePath("/admin");

      return {
        ok: true,
        data: {
          ok: true,
          walletHsId: id,
          customer: { userid, walletTotalBefore: walletBefore, walletTotalAfter: walletAfter },
          refundedAmount: amount,
        },
      };
    },
  );
}

// ════════════════════════════════════════════════════════════════
// TOMBSTONE SHIMS — repoint targets for the orphan UI files in
// app/[locale]/(admin)/admin/wallet/{slip-review-modal,actions-cell,
// bulk-approve-bar}.tsx + components/admin/slip-transferred-at-cell.tsx.
//
// These re-export the legacy-faithful-named "rebuilt" signatures so any
// repointed import still type-checks, but runtime-fail-loud with an
// error message pointing at the canonical surface. Per ADR-0018 D-3 #2
// the rebuilt-era components are scheduled for deletion when the last
// reader retires; until then, this is the "no more dead-writes" gate.
// ════════════════════════════════════════════════════════════════

/**
 * @deprecated Tombstoned per ADR-0018 D-3 #2. The rebuilt-schema
 * `wallet_transactions` table is empty on prod; this shape uses UUID ids
 * that don't exist on the legacy `tb_wallet_hs`. Use
 * {@link adminApproveWalletDeposit} / {@link adminRejectWalletDeposit}
 * with the numeric tb_wallet_hs.id instead.
 */
export async function adminUpdateWalletTransaction(
  _input: { id: string; status: string; note?: string },
): Promise<AdminActionResult> {
  console.warn(
    "[wallet-hs] adminUpdateWalletTransaction is TOMBSTONED (ADR-0018 D-3 #2). " +
    "The rebuilt wallet_transactions table is empty on prod — UUID-shaped " +
    "ids are not portable. Use adminApproveWalletDeposit / " +
    "adminRejectWalletDeposit (tb_wallet_hs.id : number) instead.",
  );
  return {
    ok: false,
    error: "TOMBSTONED: adminUpdateWalletTransaction — use adminApproveWalletDeposit per ADR-0018",
  };
}

/**
 * @deprecated Tombstoned per ADR-0018 D-3 #2.
 * Use {@link adminBulkApproveWalletDeposits} (numeric ids) instead.
 */
export async function adminBulkApproveDeposits(
  _input: { ids: string[]; note?: string },
): Promise<AdminActionResult<{ approved: number; skipped: number; errors: Array<{ id: string; reason: string }> }>> {
  console.warn(
    "[wallet-hs] adminBulkApproveDeposits is TOMBSTONED (ADR-0018 D-3 #2). " +
    "Use adminBulkApproveWalletDeposits (numeric ids · cascade-aware) instead.",
  );
  return {
    ok: false,
    error: "TOMBSTONED: adminBulkApproveDeposits — use adminBulkApproveWalletDeposits per ADR-0018",
  };
}

/**
 * @deprecated Tombstoned per ADR-0018 D-3 #2. Slip URLs for tb_wallet_hs
 * are resolved by `lib/storage/legacy-resolver.ts:resolveLegacyUrl()`
 * directly on the server (see `/admin/wallet/[id]/page.tsx`), not via
 * a UUID-keyed action.
 */
export async function adminGetWalletTxSlipSignedUrl(
  _input: { id: string },
): Promise<AdminActionResult<{ url: string | null; mime: string | null }>> {
  console.warn(
    "[wallet-hs] adminGetWalletTxSlipSignedUrl is TOMBSTONED (ADR-0018 D-3 #2). " +
    "Use `resolveLegacyUrl(filename, 'slip')` from lib/storage/legacy-resolver " +
    "with tb_wallet_hs.imagesslip instead.",
  );
  return {
    ok: false,
    error: "TOMBSTONED: adminGetWalletTxSlipSignedUrl — use resolveLegacyUrl per ADR-0018",
  };
}

/**
 * @deprecated Tombstoned per ADR-0018 D-3 #2. The `slip_transferred_at`
 * column lived on rebuilt `wallet_transactions`; on `tb_wallet_hs` the
 * equivalent is `dateslip` (set via `adminUpdateWalletHsDateSlip` in
 * `actions/admin/wallet-trans.ts`).
 */
export async function adminSetWalletTxSlipTransferredAt(
  _input: { id: string; slip_transferred_at: string },
): Promise<AdminActionResult<{ id: string; slip_transferred_at: string | null }>> {
  console.warn(
    "[wallet-hs] adminSetWalletTxSlipTransferredAt is TOMBSTONED (ADR-0018 D-3 #2). " +
    "Use adminUpdateWalletHsDateSlip from actions/admin/wallet-trans.ts " +
    "(numeric tb_wallet_hs.id · column = dateslip) instead.",
  );
  return {
    ok: false,
    error: "TOMBSTONED: adminSetWalletTxSlipTransferredAt — use adminUpdateWalletHsDateSlip per ADR-0018",
  };
}
