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
 *   type '1' = ชำระเงิน · '3' = ถอนเงิน · '7' = ชำระเงินรอตรวจสอบการเติม
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
import { MAO_FLAT_FEE } from "@/lib/forwarder/mao-fee";
import { findDuplicateSlips } from "@/lib/admin/duplicate-slip-check";
import { bustAdminChrome } from "@/lib/cache/revalidate-chrome";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { uploadToBucket } from "@/lib/storage/upload";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { cashbackRefId, parseCashbackNoteTag } from "@/lib/cashback/note-tag";
import { autoIssueReceiptOnPaymentLand } from "@/lib/admin/auto-issue-receipt";
import { issueShopTaxInvoice } from "@/lib/admin/shop-tax-invoice";
import { isShopYuanTaxInvoiceEnabled } from "@/lib/tax/shop-yuan-flag";
import { modeFromPref } from "@/lib/tax/tax-doc-mode";
import { logger } from "@/lib/logger";

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
  return (email.split("@")[0] || "system").slice(0, 20); // 2026-06-05 varchar(20)
}

// ════════════════════════════════════════════════════════════════
// ADR-0025 — CASHBACK SPEND (the spend side of tb_cash_back).
// ════════════════════════════════════════════════════════════════
//
// Faithful port of the legacy cashback-at-checkout debit (wallet.php
// L580-594 + the `cashBackKey` math in getListPayForwarder.php).
//
// MODEL (ADR-0025 D-1): cashback is a slip-reducing balance. When a
// customer applies `cashBackApplied` to a bill, the spend is recorded
// as a `tb_cash_back_hs (cbhstatus='2'=ชำระเงิน)` row and `tb_cash_back
// .cbtotal` is decremented. `cbhrefid` = the order/forwarder the cashback
// was spent on AND the idempotency anchor.
//
// SOT: `tb_cash_back.cbtotal` = the authority (the current balance);
// `tb_cash_back_hs` = the movement trail (`cbhstatus` strictly
// '1'=earn / '2'=spend per the 0081 schema comment). This ADR builds
// ONLY the spend side — the earn side (signup seed + refund credit)
// already writes these tables and is NOT touched (ADR-0025 D-6).
//
// CASING ⚠️ — tb_cash_back/tb_cash_back_hs are all-lowercase columns:
// `userid`, `cbtotal`, `cbhid` (auto-seq), `cbhdate`, `cbhstatus`,
// `cbhamount`, `cbhrefid` (text, NOT NULL). Quoted exactly (matches the
// existing read in lib/legacy/pcs-chrome.ts + wallet-credit/page.tsx).
//
// MONEY-SAFETY (ADR-0025 D-4):
//   - Idempotent: the spend is gated by the `(userid, cbhrefid,
//     cbhstatus='2')` uniqueness — before INSERT-ing the spend row, we
//     SELECT for an existing one; if present → already settled, skip the
//     debit (a re-submit / re-approve / retry cannot double-debit).
//   - Clamp at write: re-read `cbtotal` and clamp the applied amount to
//     the CURRENT balance (a customer can never spend more cashback than
//     they hold, even if the requested amount was stale / racing).
//   - Rollback: if the `tb_cash_back_hs` INSERT succeeds but the
//     `tb_cash_back` decrement fails, delete the spend row (no real tx in
//     PostgREST — the helper owns the rollback).

type AdminClient = ReturnType<typeof createAdminClient>;

// cashbackRefId + CashbackRefKind moved to lib/cashback/note-tag.ts (a
// "use server" module may only export async fns) — imported above.

export type CashbackSpendResult = {
  applied: number;          // amount actually debited (clamped · ≥ 0)
  alreadySpent: boolean;    // true → idempotent no-op (prior spend on this refid)
  cbhId: number | null;     // tb_cash_back_hs.cbhid of the spend row (null if no-op / nothing applied)
  cbTotalBefore: number;
  cbTotalAfter: number;
};

/**
 * Spend cashback at checkout — the central, idempotent debit (ADR-0025 D-1/D-4).
 *
 * - `requested` ≤ 0 → no-op (applied=0).
 * - Idempotent on `(userid, cbhrefid)`: if a `cbhstatus='2'` row already
 *   exists for this refid, returns alreadySpent=true with the prior amount
 *   (NO second debit).
 * - Clamps `requested` to the current `tb_cash_back.cbtotal` (never negative).
 * - On the rare INSERT-ok-but-UPDATE-fail, deletes the just-written spend
 *   row so the trail matches the (unchanged) balance.
 *
 * Returns `applied` so the caller knows how much of the bill the cashback
 * actually covered (and slips/charges the remainder).
 */
export async function spendCashbackAtCheckout(
  admin: AdminClient,
  args: { userid: string; requested: number; cbhrefid: string; nowIso?: string },
): Promise<CashbackSpendResult> {
  const { userid, cbhrefid } = args;
  const nowIso = args.nowIso ?? new Date().toISOString();

  // Read current balance (the SOT). Missing row → balance 0.
  const { data: cbRow, error: cbReadErr } = await admin
    .from("tb_cash_back")
    .select("userid, cbtotal")
    .eq("userid", userid)
    .maybeSingle<{ userid: string; cbtotal: number | string | null }>();
  if (cbReadErr) {
    console.error(`[tb_cash_back read] failed`, { code: cbReadErr.code, message: cbReadErr.message, userid });
  }
  const cbTotalBefore = Number(cbRow?.cbtotal ?? 0);

  // Clamp the requested amount to [0, cbTotalBefore]; round to 2dp (money).
  const requested = Math.max(0, Number(args.requested) || 0);
  const applied = Math.round(Math.min(requested, cbTotalBefore) * 100) / 100;

  if (applied <= 0) {
    return { applied: 0, alreadySpent: false, cbhId: null, cbTotalBefore, cbTotalAfter: cbTotalBefore };
  }

  // ── Idempotency: prior spend on this refid? (no double-debit) ──
  const { data: prior, error: priorErr } = await admin
    .from("tb_cash_back_hs")
    .select("cbhid, cbhamount")
    .eq("userid", userid)
    .eq("cbhrefid", cbhrefid)
    .eq("cbhstatus", "2")
    .limit(1)
    .maybeSingle<{ cbhid: number; cbhamount: number | string | null }>();
  if (priorErr) {
    console.error(`[tb_cash_back_hs idempotency probe] failed`, {
      code: priorErr.code, message: priorErr.message, userid, cbhrefid,
    });
    // Cannot prove "not yet spent" → refuse to debit (safer than risking a
    // double-spend). applied=0 means the caller treats cashback as unused.
    return { applied: 0, alreadySpent: false, cbhId: null, cbTotalBefore, cbTotalAfter: cbTotalBefore };
  }
  if (prior) {
    return {
      applied: Number(prior.cbhamount ?? 0),
      alreadySpent: true,
      cbhId: prior.cbhid,
      cbTotalBefore,
      cbTotalAfter: cbTotalBefore,
    };
  }

  // ── INSERT the spend row (cbhstatus='2') ──
  const { data: hsRow, error: hsInsErr } = await admin
    .from("tb_cash_back_hs")
    .insert({
      cbhdate:   nowIso,
      cbhstatus: "2",          // ชำระเงิน (spend)
      cbhamount: applied,
      userid,
      cbhrefid,
    })
    .select("cbhid")
    .single<{ cbhid: number }>();
  if (hsInsErr || !hsRow) {
    console.error(`[tb_cash_back_hs spend insert] failed`, {
      code: hsInsErr?.code, message: hsInsErr?.message, userid, cbhrefid, applied,
    });
    return { applied: 0, alreadySpent: false, cbhId: null, cbTotalBefore, cbTotalAfter: cbTotalBefore };
  }

  // ── Decrement tb_cash_back.cbtotal (clamp ≥ 0) ──
  const cbTotalAfter = Math.round(Math.max(0, cbTotalBefore - applied) * 100) / 100;
  let updOk = false;
  if (!cbRow) {
    // No tb_cash_back row — INSERT at the post-spend balance (0). Unusual
    // (a customer with no row has 0 cashback → applied would be 0 above), but
    // defensive against a delete-race.
    const { error: cbInsErr } = await admin
      .from("tb_cash_back")
      .insert({ userid, cbtotal: cbTotalAfter });
    updOk = !cbInsErr;
    if (cbInsErr) console.error(`[tb_cash_back insert post-spend] failed`, { code: cbInsErr.code, message: cbInsErr.message, userid });
  } else {
    const { error: cbUpdErr } = await admin
      .from("tb_cash_back")
      .update({ cbtotal: cbTotalAfter })
      .eq("userid", userid);
    updOk = !cbUpdErr;
    if (cbUpdErr) console.error(`[tb_cash_back decrement] failed`, { code: cbUpdErr.code, message: cbUpdErr.message, userid });
  }

  if (!updOk) {
    // Rollback the spend row — the balance never moved.
    await admin.from("tb_cash_back_hs").delete().eq("cbhid", hsRow.cbhid);
    return { applied: 0, alreadySpent: false, cbhId: null, cbTotalBefore, cbTotalAfter: cbTotalBefore };
  }

  return { applied, alreadySpent: false, cbhId: hsRow.cbhid, cbTotalBefore, cbTotalAfter };
}

export type CashbackRefundResult = {
  refunded: number;
  alreadyRefunded: boolean;
  cbTotalAfter: number;
};

/**
 * Refund a previously-spent cashback (ADR-0025 D-1 reject path).
 *
 * Mirrors the wallet refund on reject. Idempotent + guarded:
 *   - Finds the `cbhstatus='2'` spend row for `(userid, cbhrefid)`.
 *   - If none → nothing was spent → no-op (refunded=0).
 *   - Otherwise credits `tb_cash_back.cbtotal += cbhamount` and writes a
 *     COMPENSATING earn row `cbhstatus='1'` tagged with a `:refund` suffix
 *     (ADR-0025 D-5 #2 recommendation — preserves the full "applied then
 *     refunded" trail rather than deleting the spend row).
 *   - The compensating-row existence is the idempotency guard (a second
 *     reject finds it and no-ops → no double-refund).
 */
export async function refundCashbackOnReject(
  admin: AdminClient,
  args: { userid: string; cbhrefid: string; nowIso?: string },
): Promise<CashbackRefundResult> {
  const { userid, cbhrefid } = args;
  const nowIso = args.nowIso ?? new Date().toISOString();
  const refundRefId = `${cbhrefid}:refund`;

  // Was anything spent on this refid?
  const { data: spend, error: spendErr } = await admin
    .from("tb_cash_back_hs")
    .select("cbhid, cbhamount")
    .eq("userid", userid)
    .eq("cbhrefid", cbhrefid)
    .eq("cbhstatus", "2")
    .limit(1)
    .maybeSingle<{ cbhid: number; cbhamount: number | string | null }>();
  if (spendErr) {
    console.error(`[tb_cash_back_hs refund probe] failed`, { code: spendErr.code, message: spendErr.message, userid, cbhrefid });
    return { refunded: 0, alreadyRefunded: false, cbTotalAfter: NaN };
  }
  const amount = Number(spend?.cbhamount ?? 0);
  if (!spend || amount <= 0) {
    return { refunded: 0, alreadyRefunded: false, cbTotalAfter: NaN };
  }

  // Idempotency: a compensating earn row already written?
  const { data: priorRefund, error: priorRefundErr } = await admin
    .from("tb_cash_back_hs")
    .select("cbhid")
    .eq("userid", userid)
    .eq("cbhrefid", refundRefId)
    .eq("cbhstatus", "1")
    .limit(1)
    .maybeSingle<{ cbhid: number }>();
  if (priorRefundErr) {
    console.error(`[tb_cash_back_hs refund-idempotency probe] failed`, { code: priorRefundErr.code, message: priorRefundErr.message, userid, cbhrefid });
    return { refunded: 0, alreadyRefunded: false, cbTotalAfter: NaN };
  }
  if (priorRefund) {
    return { refunded: 0, alreadyRefunded: true, cbTotalAfter: NaN };
  }

  // Write the compensating earn row FIRST (the idempotency anchor). If a
  // concurrent reject already wrote it we'd hit it on the probe above; the
  // tiny race window is acceptable (worst case the loud refund-fail log).
  const { error: compInsErr } = await admin
    .from("tb_cash_back_hs")
    .insert({
      cbhdate:   nowIso,
      cbhstatus: "1",          // บวกเพิ่ม (earn) — compensating "refunded" row
      cbhamount: amount,
      userid,
      cbhrefid:  refundRefId,
    });
  if (compInsErr) {
    console.error(`[tb_cash_back_hs refund-comp insert] failed`, { code: compInsErr.code, message: compInsErr.message, userid, cbhrefid });
    return { refunded: 0, alreadyRefunded: false, cbTotalAfter: NaN };
  }

  // Credit cbtotal += amount.
  const { data: cbRow, error: cbReadErr } = await admin
    .from("tb_cash_back")
    .select("userid, cbtotal")
    .eq("userid", userid)
    .maybeSingle<{ userid: string; cbtotal: number | string | null }>();
  if (cbReadErr) console.error(`[tb_cash_back read for refund] failed`, { code: cbReadErr.code, message: cbReadErr.message, userid });
  const cbTotalAfter = Math.round((Number(cbRow?.cbtotal ?? 0) + amount) * 100) / 100;
  if (!cbRow) {
    const { error: insErr } = await admin.from("tb_cash_back").insert({ userid, cbtotal: cbTotalAfter });
    if (insErr) console.error(`[tb_cash_back refund insert] FAILED post-comp`, { code: insErr.code, message: insErr.message, userid, cbhrefid, amount });
  } else {
    const { error: updErr } = await admin.from("tb_cash_back").update({ cbtotal: cbTotalAfter }).eq("userid", userid);
    if (updErr) console.error(`[tb_cash_back refund update] FAILED post-comp`, { code: updErr.code, message: updErr.message, userid, cbhrefid, amount });
  }

  return { refunded: amount, alreadyRefunded: false, cbTotalAfter };
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
    if (d.amount <= 0) return { ok: false, error: "ชำระเงิน ต้องเป็นจำนวนบวก" };
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
      // Manual ledger entry moved the system wallet balance → refresh the admin
      // wallet/cashback total cards + sidebar queues instantly.
      bustAdminChrome();
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
  // ชั้น-1 dup gate (owner 2026-06-19): the approve REFUSES when a same-day
  // same-amount slip exists, unless the accountant explicitly acknowledges it
  // (the legacy blocking dup-review Pacred had softened to an advisory banner).
  acknowledgeDuplicate: z.boolean().optional(),
});
export type AdminApproveWalletDepositInput = z.infer<typeof approveDepositSchema>;

type CascadedRow = {
  table: "tb_header_order" | "tb_forwarder" | "tb_wallet_hs" | "tb_credit" | "tb_cash_back";
  id: string;
  fromStatus: string | null;
  toStatus: string | null;
  note?: string;
};

// ADR-0025 D-2a — the applied cashback rides the pending row's `note` as a
// `[CB:<amount>]` tag (free-text, no migration); the approve/reject cascade
// parses it back out via parseCashbackNoteTag (imported from
// lib/cashback/note-tag.ts — pure helpers can't live in a "use server" file).

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
  const { id, acknowledgeDuplicate } = parsed.data;

  return withAdmin<ApproveResult>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = await resolveLegacyAdminId();
      const nowIso = new Date().toISOString();

      // ──────────────────────────────────────────────
      // 1. Read the topup row + idempotency check.
      //    `note` carries the ADR-0025 D-2a `[CB:<amt>]` applied-cashback tag.
      //    P0 mark-paid symmetry: `typeservice` / `reforder` / `wusercredit`
      //    let the DIRECT forwarder-slip branch below (type='4') settle the
      //    forwarder fStatus 5→6 — mirrors the bulk path in tb-bulk.ts.
      // ──────────────────────────────────────────────
      const { data: rowRaw, error: rowErr } = await admin
        .from("tb_wallet_hs")
        .select("id, userid, amount, type, status, note, typeservice, reforder, dateslip, wusercredit")
        .eq("id", id)
        .maybeSingle<{
          id: number;
          userid: string;
          amount: number;
          type: string | null;
          status: string | null;
          note: string | null;
          typeservice: string | null;
          reforder: string | null;
          dateslip: string | null;
          wusercredit: string | null;
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

      // ── ชั้น-1 BLOCKING dup gate (owner 2026-06-19 · the dropped legacy layer).
      //    Refuse the settle when a same-day same-amount slip exists (likely a
      //    double-submitted/double-paid slip) unless the accountant ticked
      //    acknowledgeDuplicate after eyeballing it. Restores the legacy hard
      //    dup-review that Pacred had softened to an advisory red banner.
      if (!acknowledgeDuplicate) {
        const dups = await findDuplicateSlips(admin, { id: rowRaw.id, userid: rowRaw.userid, amount: rowRaw.amount, dateslip: rowRaw.dateslip });
        if (dups.length > 0) {
          return {
            ok: false,
            error: `พบสลิปที่อาจซ้ำ (วันโอนเดียวกัน ยอดเท่ากัน ${dups.length} รายการ) — ตรวจสอบแล้วยืนยันว่าไม่ใช่รายการซ้ำก่อนอนุมัติ`,
          };
        }
      }

      // ──────────────────────────────────────────────
      // 1b. DIRECT forwarder-payment slip (type='4', typeservice='2',
      //     reforder=<tb_forwarder.id>, NO tb_wallet_paydeposit links).
      //
      //     P0 mark-paid symmetry. `submitForwarderPayment` (actions/forwarder.ts
      //     L714-725) inserts the slip as status='1' type='4' typeservice='2'
      //     reforder=<fid> and DELIBERATELY does NOT flip tb_forwarder.fstatus
      //     (legacy keeps fStatus=5 until staff confirm the slip). The detail
      //     page (wallet/[id]/page.tsx:607) routes every non-type-3 row here as
      //     kind="deposit" → so a type='4' slip lands in THIS function. Before
      //     this branch it hit the `type!=='1'` guard and errored out → the
      //     single-row approve never settled the wallet debit NOR advanced the
      //     forwarder, leaving paid orders stuck at "รอชำระเงิน" + the AR cockpit
      //     never decrementing (the #1 CEO bug). The BULK path (tb-bulk.ts
      //     adminBulkApproveWalletHs L150-287) already settles these per-row;
      //     this branch is the single-row mirror of that exact contract:
      //       1. flip the slip status 1→2
      //       2. debit tb_wallet.wallettotal −= amount (type='4' is a debit)
      //       3. settle carried cashback ([CB:] tag · idempotent · best-effort)
      //       4. advance tb_forwarder fStatus 5→6 (or fcredit-clear for credit
      //          rows) — idempotent via the eq-guard; best-effort + logged so a
      //          flip failure never rolls back the wallet leg (money has moved)
      //       5. fire the auto-receipt hook (best-effort)
      //     Direct slips have no paydeposit links, so we short-circuit (the
      //     link-cascade below is for the type='1' topup-and-pay shape only).
      // ──────────────────────────────────────────────
      if (rowRaw.type === "4" && rowRaw.typeservice === "2" && rowRaw.reforder) {
        const amount = Number(rowRaw.amount ?? 0);
        const userid = rowRaw.userid;
        const cascadedRows: CascadedRow[] = [];

        // ── NEGATIVE-WALLET GUARD (owner 2026-06-21) — the legacy "เติม-แล้วจ่าย"
        //    pair (a +topup row + this −pay row) goes NEGATIVE when this debit is
        //    approved before the paired topup credited (prod evidence: PR130 −646
        //    + 4 armed pairs). Refuse BEFORE any mutation (the row stays pending)
        //    so the accountant approves the paired topup first — or, under the new
        //    direct-cut model, the import-pay never debits the wallet at all.
        {
          const { data: wPre, error: wPreErr } = await admin
            .from("tb_wallet").select("wallettotal").eq("userid", userid)
            .maybeSingle<{ wallettotal: number | string | null }>();
          if (wPreErr) {
            console.error(`[approve type=4 wallet pre-check] failed`, { code: wPreErr.code, message: wPreErr.message });
            return { ok: false, error: `db_error:${wPreErr.code ?? "unknown"}` };
          }
          const bal0 = Number(wPre?.wallettotal ?? 0);
          if (bal0 - amount < -0.01) {
            return {
              ok: false,
              error: `ยอดกระเป๋าลูกค้าไม่พอหักรายการนี้ (มี ฿${bal0.toFixed(2)} · ต้องหัก ฿${amount.toFixed(2)}) — ถ้าเป็นการ "เติม-แล้วจ่าย" กรุณาอนุมัติรายการเติมเงินคู่กันก่อน แล้วค่อยอนุมัติรายการจ่ายนี้`,
            };
          }
        }

        // (i) Flip the slip row 1→2 — ATOMIC CLAIM. The `.eq("status","1")` is
        //     folded into the UPDATE and we check the affected row: a 0-row
        //     result means a CONCURRENT path already approved this slip (the
        //     upfront idempotency check at L719 only catches the SEQUENTIAL
        //     re-approve; two requests can both pass it and both reach here).
        //     Without this, the wallet debit below fires twice → double-debit.
        const { data: claimed, error: updHsErr } = await admin
          .from("tb_wallet_hs")
          .update({ status: "2", adminid: legacyAdminId, adminidupdate: legacyAdminId })
          .eq("id", id)
          .eq("status", "1")
          .select("id")
          .maybeSingle();
        if (updHsErr) {
          console.error(`[tb_wallet_hs mutation] failed`, { code: updHsErr.code, message: updHsErr.message });
          return { ok: false, error: updHsErr.message };
        }
        if (!claimed) {
          // Concurrent approve won the claim — return idempotent OK (no debit).
          return {
            ok: true,
            data: {
              ok: true, walletHsId: id, alreadyDone: true,
              customer: { userid, walletTotalBefore: NaN, walletTotalAfter: NaN },
              cascadedRows: [], hadPaydepositLinks: false,
            },
          };
        }
        cascadedRows.push({ table: "tb_wallet_hs", id: String(id), fromStatus: "1", toStatus: "2", note: "direct forwarder-pay (type=4)" });

        // (ii) Debit tb_wallet.wallettotal −= amount (type='4' is a spend;
        //      matches tb-bulk.ts delta rule). Read-then-update, upsert if missing.
        let walletBefore = 0;
        let walletAfter = 0;
        const { data: wRow, error: wRowErr } = await admin
          .from("tb_wallet")
          .select("userid, wallettotal")
          .eq("userid", userid)
          .maybeSingle<{ userid: string; wallettotal: number }>();
        if (wRowErr) {
          console.error(`[tb_wallet list] failed`, { code: wRowErr.code, message: wRowErr.message });
        }
        if (!wRow) {
          walletBefore = 0;
          walletAfter = -amount;
          const { error: walletInsErr } = await admin
            .from("tb_wallet")
            .insert({ userid, wallettotal: walletAfter });
          if (walletInsErr) {
            return { ok: false, error: `อนุมัติ tb_wallet_hs สำเร็จ (id=${id}) แต่ tb_wallet insert ล้มเหลว: ${walletInsErr.message}` };
          }
        } else {
          walletBefore = Number(wRow.wallettotal);
          walletAfter = walletBefore - amount;
          const { error: walletUpdErr } = await admin
            .from("tb_wallet")
            .update({ wallettotal: walletAfter })
            .eq("userid", userid);
          if (walletUpdErr) {
            return { ok: false, error: `อนุมัติ tb_wallet_hs สำเร็จ (id=${id}) แต่ tb_wallet update ล้มเหลว: ${walletUpdErr.message}` };
          }
        }

        // (iii) Settle carried cashback ([CB:] tag). Idempotent on cbhrefid;
        //       best-effort — never fails the row (the money already moved).
        const cbReq = parseCashbackNoteTag(rowRaw.note);
        if (cbReq > 0) {
          try {
            const cbRes = await spendCashbackAtCheckout(admin, {
              userid,
              requested: cbReq,
              cbhrefid: cashbackRefId("forwarder", `walleths:${id}`),
              nowIso,
            });
            cascadedRows.push({
              table: "tb_cash_back",
              id: userid,
              fromStatus: `cbtotal=${cbRes.cbTotalBefore}`,
              toStatus: `cbtotal=${cbRes.cbTotalAfter}`,
              note: cbRes.alreadySpent ? `cashback already spent (idempotent · ฿${cbRes.applied})` : `cashback spent ฿${cbRes.applied} on approve`,
            });
          } catch (e) {
            logger.warn("wallet-hs", "cashback settle failed (non-fatal · money already moved)", {
              wallet_hs_id: id, userid, error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // (iv) P0 mark-paid symmetry — advance the forwarder. MIRROR of
        //      tb-bulk.ts L252-275 + wallet-trans.ts L316-339:
        //        standard   → fstatus='6' + fdateadminstatus + fdatestatus6 (guard fstatus='5')
        //        credit row → fcredit='' + fdateadminstatus (NO fstatus flip · guard fcredit='1')
        //      Idempotent via the eq-guard → if some other path already advanced
        //      this forwarder, the WHERE matches nothing = harmless no-op (NO
        //      double-effect). Best-effort + logged; NEVER throw (money moved).
        const fid = Number(rowRaw.reforder);
        if (Number.isFinite(fid) && fid > 0) {
          const isCredit = (rowRaw.wusercredit ?? "").trim() === "1";
          let flipErrMsg: string | null = null;
          if (isCredit) {
            const { error: flipErr } = await admin
              .from("tb_forwarder")
              .update({ fcredit: "", fdateadminstatus: nowIso })
              .eq("id", fid)
              .eq("userid", userid)
              .eq("fcredit", "1");
            flipErrMsg = flipErr?.message ?? null;
          } else {
            const { error: flipErr } = await admin
              .from("tb_forwarder")
              .update({ fstatus: "6", fdateadminstatus: nowIso, fdatestatus6: nowIso })
              .eq("id", fid)
              .eq("userid", userid)
              .eq("fstatus", "5");
            flipErrMsg = flipErr?.message ?? null;
          }
          if (flipErrMsg) {
            logger.warn("wallet-hs", "forwarder settle flip failed (non-fatal · money already moved)", {
              wallet_hs_id: id, userid, fid, isCredit, error: flipErrMsg,
            });
          }
          cascadedRows.push({
            table: "tb_forwarder",
            id: String(fid),
            fromStatus: isCredit ? "fcredit=1" : "fstatus=5",
            toStatus: isCredit ? "fcredit=" : "fstatus=6",
            note: flipErrMsg ? `settle flip failed: ${flipErrMsg}` : (isCredit ? "approve · credit branch" : "approve · fStatus 5→6"),
          });

          // (v) Auto-receipt hook (best-effort — receipt failure does NOT
          //     roll back the settle; matches tb-bulk.ts / wallet-trans.ts).
          const dateSlip = rowRaw.dateslip ? new Date(rowRaw.dateslip) : new Date();
          const rcpt = await autoIssueReceiptOnPaymentLand(admin, {
            userid,
            fids: [fid],
            dateSlip,
            source: "wallet_hs.approve_deposit.direct",
          });
          if (!rcpt.ok && !rcpt.alreadyIssued) {
            logger.warn("wallet-hs", "auto-receipt failed (non-fatal)", { wallet_hs_id: id, userid, fid, error: rcpt.error });
          }
          if (rcpt.ok) {
            revalidatePath(`/admin/accounting/forwarder-invoice/${rcpt.data.receiptId}`);
            revalidatePath("/admin/accounting/forwarder-invoice");
            revalidatePath(`/service-import/${fid}/invoice`);
          }
        }

        await logAdminAction(adminId, "tb_wallet_hs.approve_deposit", "tb_wallet_hs", String(id), {
          userid,
          amount,
          before: { wallettotal: walletBefore },
          after:  { wallettotal: walletAfter },
          directForwarderSlip: true,
          forwarderId: fid,
          cascade: cascadedRows,
        });

        revalidatePath(`/admin/wallet/${id}`);
        revalidatePath("/admin/wallet");
        revalidatePath("/admin");
        revalidatePath(`/admin/forwarders/${fid}`);
        // Deposit approved → topup queue shrank + wallet balance credited;
        // refresh the admin sidebar/wallet-total badges immediately.
        bustAdminChrome();

        return {
          ok: true,
          data: {
            ok: true,
            walletHsId: id,
            customer: { userid, walletTotalBefore: walletBefore, walletTotalAfter: walletAfter },
            cascadedRows,
            hadPaydepositLinks: false,
          },
        };
      }

      // ──────────────────────────────────────────────
      // 1c. DIRECT shop-order (ฝากสั่งซื้อ) slip-pay (type='8',
      //     typeservice='1', reforder=<tb_header_order.hno>). ADR-0028:
      //     the customer pays the order amount DIRECTLY by bank transfer +
      //     uploads the slip (no more wallet top-up). delta=0 — NO balance
      //     moves; approving the slip just marks the order PAID. The BULK path
      //     (tb-bulk.ts L297-310) already settles these; this is the single-row
      //     mirror of that exact contract. Before this branch a type='8' slip
      //     hit the `type!=='1'` guard below → "ยืนยันทำการ" errored and the
      //     order stayed at "รอชำระเงิน" (the bug the owner reported).
      //       1. flip the slip status 1→2
      //       2. mark tb_header_order paid: hstatus '2'→'3' + hdate3 + paydeposit
      //          (idempotent via the hstatus='2' guard; best-effort + logged —
      //           a flip failure never blocks the slip approval)
      //     NO wallet debit (delta=0 · this is a direct payment, not a spend).
      // ──────────────────────────────────────────────
      if (rowRaw.type === "8" && rowRaw.typeservice === "1" && rowRaw.reforder) {
        const userid = rowRaw.userid;
        const cascadedRows: CascadedRow[] = [];

        // (i) Flip the slip row 1→2.
        const { error: updHsErr } = await admin
          .from("tb_wallet_hs")
          .update({ status: "2", adminid: legacyAdminId, adminidupdate: legacyAdminId })
          .eq("id", id)
          .eq("status", "1");
        if (updHsErr) {
          console.error(`[tb_wallet_hs mutation] failed`, { code: updHsErr.code, message: updHsErr.message });
          return { ok: false, error: updHsErr.message };
        }
        cascadedRows.push({ table: "tb_wallet_hs", id: String(id), fromStatus: "1", toStatus: "2", note: "direct shop-order slip-pay (type=8)" });

        // (ii) Mark the shop order PAID (hstatus '2'→'3'). Idempotent via the
        //      hstatus='2' guard; best-effort (money/slip already settled).
        const { error: shopFlipErr } = await admin
          .from("tb_header_order")
          .update({ hstatus: "3", hdate3: nowIso, hdateupdate: nowIso, paydeposit: "1" })
          .eq("hno", rowRaw.reforder)
          .eq("userid", userid)
          .eq("hstatus", "2");
        if (shopFlipErr) {
          logger.warn("wallet-hs", "shop-order settle flip failed (non-fatal · slip approved)", {
            wallet_hs_id: id, userid, hno: rowRaw.reforder, error: shopFlipErr.message,
          });
        }
        cascadedRows.push({
          table: "tb_header_order",
          id: String(rowRaw.reforder),
          fromStatus: "hstatus=2",
          toStatus: "hstatus=3",
          note: shopFlipErr ? `settle flip failed: ${shopFlipErr.message}` : "approve · shop-order paid (hStatus 2→3)",
        });

        await logAdminAction(adminId, "tb_wallet_hs.approve_deposit", "tb_wallet_hs", String(id), {
          userid,
          amount: Number(rowRaw.amount ?? 0),
          directShopOrderSlip: true,
          hno: rowRaw.reforder,
          walletDelta: 0,
          cascade: cascadedRows,
        });

        revalidatePath(`/admin/wallet/${id}`);
        revalidatePath("/admin/wallet");
        revalidatePath("/admin");
        revalidatePath("/admin/service-orders");
        bustAdminChrome();

        return {
          ok: true,
          data: {
            ok: true,
            walletHsId: id,
            customer: { userid, walletTotalBefore: NaN, walletTotalAfter: NaN },  // delta=0 · wallet untouched
            cascadedRows,
            hadPaydepositLinks: false,
          },
        };
      }

      // The remaining cascade logic (link-driven topup-and-pay) only handles
      // the deposit (type='1') shape — withdraw approve (type='3') is a separate
      // function (adminApproveWithdraw). Reject anything else explicitly.
      if (rowRaw.type !== "1") {
        return { ok: false, error: `ฟังก์ชันนี้รองรับรายการชำระเงิน (type='1'), สลิปฝากนำเข้า (type='4'), สลิปฝากสั่งซื้อ (type='8') · พบ type='${rowRaw.type ?? "null"}'` };
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
      // 3. Flip the topup row to status='2' — ATOMIC CLAIM. Fold the
      //    `.eq("status","1")` into the UPDATE + check the affected row: 0 rows
      //    means a concurrent path already approved this topup → return
      //    idempotent OK WITHOUT crediting the wallet again (the upfront check
      //    at L719 only catches sequential re-approve, not a true race).
      // ──────────────────────────────────────────────
      const { data: claimed, error: updHsErr } = await admin
        .from("tb_wallet_hs")
        .update({ status: "2", adminid: legacyAdminId, adminidupdate: legacyAdminId })
        .eq("id", id)
        .eq("status", "1")
        .select("id")
        .maybeSingle();
      if (updHsErr) {
        console.error(`[tb_wallet_hs mutation] failed`, { code: updHsErr.code, message: updHsErr.message });
        return { ok: false, error: updHsErr.message };
      }
      if (!claimed) {
        return {
          ok: true,
          data: {
            ok: true, walletHsId: id, alreadyDone: true,
            customer: { userid, walletTotalBefore: NaN, walletTotalAfter: NaN },
            cascadedRows: [], hadPaydepositLinks: hasLinks,
          },
        };
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
        // Deposit approved → topup queue shrank + wallet balance credited;
        // refresh the admin sidebar/wallet-total badges immediately.
        bustAdminChrome();

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

      // ──────────────────────────────────────────
      // (iv) ADR-0025 — settle the applied cashback on approve.
      //
      //   If the customer carried an applied-cashback amount (the
      //   `[CB:<amt>]` note tag, ADR-0025 D-2a), debit it now on the SAME
      //   approve transition as the wallet/credit legs. Idempotent on
      //   `cbhrefid` (re-approve cannot double-debit), clamped to the live
      //   balance. cbhrefid anchored on the topup row id so reject (below)
      //   refunds the same key. (Mirror of the tb_credit decrement above.)
      // ──────────────────────────────────────────
      const cashbackRequested = parseCashbackNoteTag(rowRaw.note);
      if (cashbackRequested > 0) {
        const cbRefId = cashbackRefId("forwarder", `walleths:${id}`);
        const cbRes = await spendCashbackAtCheckout(admin, {
          userid,
          requested: cashbackRequested,
          cbhrefid: cbRefId,
          nowIso,
        });
        cascadedRows.push({
          table: "tb_cash_back",
          id: userid,
          fromStatus: `cbtotal=${cbRes.cbTotalBefore}`,
          toStatus: `cbtotal=${cbRes.cbTotalAfter}`,
          note: cbRes.alreadySpent
            ? `cashback already spent (idempotent · ฿${cbRes.applied})`
            : `cashback spent ฿${cbRes.applied} on approve (cbhrefid=${cbRefId})`,
        });
      }

      // No wallet credit on linked-slip approve (legacy L621-633 explicit
      // comment: "ไม่เติมเพิ่ม"). The topup amount was already counted via
      // the type='7' sibling debits.

      // ──────────────────────────────────────────
      // (v) TAX-DOCUMENT BRIDGE for ฝากสั่งซื้อ (shop payment-land · 0152).
      //
      //   When a shop-order slip is approved here, the order is paid → if the
      //   customer chose a VAT document at /cart (tb_header_order.tax_doc_pref =
      //   'tax_invoice' ใบกำกับ / 'customs' ใบขน · migration 0127) we issue one
      //   into the tb_*-native store (migration 0152) via issueShopTaxInvoice.
      //
      //   🔴 GATED behind the default-OFF flag tax_invoice.shop_yuan_enabled —
      //   when the flag is off (default) NO tax document is minted (the feature
      //   ships DORMANT · deploying changes nothing until the owner flips it).
      //
      //   BEST-EFFORT — a tax-doc failure NEVER undoes the wallet/parent legs
      //   (the money already moved · the tax document is a follow-on). Idempotent
      //   on hno inside the issuer (no double-mint). 'receipt'/NULL (ไม่รับเอกสาร)
      //   rows are skipped.
      // ──────────────────────────────────────────
      try {
        const shopHnos = links
          .filter((l) => classifyHnoParent(l.hno) === "shop_order")
          .map((l) => l.hno);
        if (shopHnos.length > 0 && (await isShopYuanTaxInvoiceEnabled())) {
          for (const shopHno of shopHnos) {
            // Read this order's chosen tax-doc mode.
            const { data: hoTax, error: hoTaxErr } = await admin
              .from("tb_header_order")
              .select("tax_doc_pref")
              .eq("hno", shopHno)
              .eq("userid", userid)
              .maybeSingle<{ tax_doc_pref: string | null }>();
            if (hoTaxErr) {
              logger.warn("wallet-hs", "shop tax-doc pref read failed (non-fatal)", {
                wallet_hs_id: id, userid, hno: shopHno, error: hoTaxErr.message,
              });
              continue;
            }
            const docMode = modeFromPref(hoTax?.tax_doc_pref);
            if (docMode === "none") continue; // ไม่รับเอกสาร → no VAT document
            const taxRes = await issueShopTaxInvoice(admin, {
              userid,
              hno: shopHno,
              issuedBy: "system-auto",
              mode: docMode,
            });
            if (!taxRes.ok && !taxRes.alreadyIssued) {
              logger.warn("wallet-hs", "shop tax-invoice bridge failed (non-fatal · payment stands)", {
                wallet_hs_id: id, userid, hno: shopHno, mode: docMode, error: taxRes.error,
              });
            }
          }
        }
      } catch (e) {
        logger.warn("wallet-hs", "shop tax-invoice bridge threw (non-fatal)", {
          wallet_hs_id: id, userid, error: e instanceof Error ? e.message : String(e),
        });
      }

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
      // Deposit + cascaded pay landed → topup queue + the paid parents' queues
      // + wallet totals all changed; refresh the admin chrome immediately.
      bustAdminChrome();

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
      //    `note` carries the ADR-0025 D-2a `[CB:<amt>]` applied-cashback tag.
      // ──────────────────────────────────────────
      const { data: rowRaw, error: rowErr } = await admin
        .from("tb_wallet_hs")
        .select("id, userid, amount, type, status, note")
        .eq("id", id)
        .maybeSingle<{
          id: number;
          userid: string;
          amount: number;
          type: string | null;
          status: string | null;
          note: string | null;
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
        return { ok: false, error: `ฟังก์ชันนี้รองรับเฉพาะรายการชำระเงิน (type='1') · พบ type='${rowRaw.type ?? "null"}'` };
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
              .in("fshipby", ["PCSF", "PRF"])
              .eq("ftransportprice", MAO_FLAT_FEE)
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

        // ADR-0025 — refund the applied cashback on reject (mirror of the
        // wallet refund above). Idempotent: only refunds if a cashback spend
        // was actually settled on the matching `cbhrefid` (and not already
        // refunded). The spend lands at approve, but a slip may be rejected
        // without a prior approve — `refundCashbackOnReject` no-ops cleanly
        // when nothing was spent.
        if (parseCashbackNoteTag(rowRaw.note) > 0) {
          const cbRefId = cashbackRefId("forwarder", `walleths:${id}`);
          const cbRefund = await refundCashbackOnReject(admin, { userid, cbhrefid: cbRefId, nowIso: new Date().toISOString() });
          if (cbRefund.refunded > 0 || cbRefund.alreadyRefunded) {
            cascadedRows.push({
              table: "tb_cash_back",
              id: userid,
              fromStatus: null,
              toStatus: cbRefund.alreadyRefunded ? "already-refunded" : `cbtotal=${cbRefund.cbTotalAfter}`,
              note: cbRefund.alreadyRefunded
                ? "cashback refund idempotent no-op"
                : `cashback refunded ฿${cbRefund.refunded} on reject (cbhrefid=${cbRefId})`,
            });
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
        // Deposit rejected + cascade reversed → topup queue + reversed parents'
        // queues + wallet totals changed; refresh the admin chrome immediately.
        bustAdminChrome();

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
      // Deposit row moved 1→3 (rejected) → the topup pending-queue badge shrank;
      // refresh the admin sidebar immediately.
      bustAdminChrome();

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
  // Bulk deposit-approve moved the topup queue + wallet totals (each inner
  // approve also busts; this covers the batch as a whole).
  bustAdminChrome();

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
      // Withdraw approved (1→2) → the withdraw pending-queue badge shrank;
      // refresh the admin sidebar immediately.
      bustAdminChrome();

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
      // Withdraw rejected (1→3) + held money refunded → withdraw queue + wallet
      // totals changed; refresh the admin chrome immediately.
      bustAdminChrome();

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
