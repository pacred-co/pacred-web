"use server";

/**
 * P0-19 — Admin pay-on-behalf (จ่ายแทนลูกค้า) — shop-order leg.
 *
 * Faithful port of the sufficient-balance branch of legacy
 * `pcs-admin/pay-users.php` `paymentOrder` handler (L4-200). A staff member
 * takes a phone/LINE customer's wallet payment for their unpaid ฝากสั่ง
 * orders: debit `tb_wallet`, write the `tb_wallet_hs` settled ledger row
 * (type='2'), flip `tb_header_order.hStatus` 2→3, notify the customer.
 *
 * This is the ADMIN twin of the customer-self `payServiceOrderFromWallet`
 * (actions/service-order.ts) — SAME ADR-0018 wallet contract + SAME price
 * helper (`computeShopOrderDebitTotal`), so a given order debits the exact
 * same THB whether the customer self-pays or staff pays on their behalf.
 * The only differences: any customer (no member_code self-pin), multi-order
 * loop, and `adminid`/`adminidcrate` = the acting staff's legacy slug
 * (legacy pay-users.php L65 wrote `adminIDCrate=$adminID`).
 *
 * SCHEMA CASING (verified): `tb_users` + `tb_admin` = camelCase (userID /
 * userName / adminID / adminEmail); `tb_wallet` / `tb_wallet_hs` /
 * `tb_header_order` = lowercase (userid / wallettotal / hno / hstatus).
 *
 * SCOPE (Phase 1 — shop orders): `adminPayOrdersOnBehalf` ports the shop
 * `paymentOrder` leg (hStatus 2→3).
 *
 * SCOPE (Phase 2 — forwarder leg, THIS extension): `adminPayForwardersOnBehalf`
 * ports the sufficient-balance branch of the `paymentForwarderNew` handler
 * (pay-users.php L202-500), debiting `tb_wallet` for unpaid ฝากนำเข้า rows
 * (fStatus='5' OR fCredit='1') and flipping `tb_forwarder.fStatus` 5→6. SAME
 * debit/idempotency/rollback pattern as the shop leg; the pricing (incl. PCSF
 * เหมาๆ ฿50 + corporate 1%) is factored into the pure helper
 * `lib/forwarder/forwarder-debit-total.ts` so the money math is tested.
 *
 * The insufficient-balance slip-top-up path (pay-users.php L342 / L561) is
 * Phase 3 — flagged, not silently dropped.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { resolveProfileIdsForLegacyUserids } from "@/lib/auth/tb-users-resolver";
import { computeShopOrderDebitTotal } from "@/lib/service-order/debit-total";
import {
  computeForwarderDebitBatch,
  type ForwarderDebitRow,
} from "@/lib/forwarder/forwarder-debit-total";

// The exact tb_forwarder pricing columns the debit helper reads (lowercase =
// PostgREST casing, verified against actions/admin/forwarders-bulk.ts +
// lib/forwarder/outstanding.ts). Kept as one constant so the SELECT and the
// helper stay in lock-step.
const FORWARDER_PRICE_COLS =
  "id, fshipby, ftotalprice, ftransportprice, fpriceupdate, fshippingservice, pricecrate, ftransportpricechnthb, priceother, fdiscount" as const;

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — local copy (same pattern as service-orders.ts L29
// + 8 other admin actions; the dup is a known consolidation TODO). Maps the
// acting Pacred admin's auth email → legacy `tb_admin.adminID` for the
// audit columns (adminid / adminidcrate). Fallback: raw email → "system".
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[pay-user.resolveLegacyAdminId auth.getUser] failed`, {
      code: authErr.code, message: authErr.message,
    });
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
    console.error(`[pay-user.resolveLegacyAdminId tb_admin lookup] failed`, {
      code: error.code, message: error.message,
    });
  }
  return data?.adminID ?? email;
}

// ════════════════════════════════════════════════════════════
// CONTEXT LOADER — customer + wallet balance + unpaid shop orders
// (mirrors pay-users.php getUserID.php + getWallet.php + getListPay.php)
// ════════════════════════════════════════════════════════════

export type PayUserUnpaidOrder = {
  hno: string;
  price_thb: number;
  hdatepayment: string | null;
};

export type PayUserForwarder = {
  fid: string;
  price_thb: number;
  ftracking: string | null;
  fstatus: string | null;
  /** true if this row reached the list via fCredit='1' (not fStatus='5'). */
  is_credit: boolean;
};

export type PayUserContext = {
  user: { userid: string; name: string; tel: string | null };
  wallet_balance: number;
  orders: PayUserUnpaidOrder[];
  /** Phase 2 — unpaid ฝากนำเข้า rows (fStatus='5' OR fCredit='1'). */
  forwarders: PayUserForwarder[];
  /** true if a tb_corporate row exists (drives the 1% allowance preview). */
  is_corporate: boolean;
};

export async function getPayUserContext(
  userCode: string,
): Promise<AdminActionResult<PayUserContext>> {
  return withAdmin(undefined, async () => {
    const code = (userCode ?? "").trim().toUpperCase();
    if (!code) return { ok: false, error: "กรุณากรอกรหัสลูกค้า" };

    const admin = createAdminClient();

    // 1. customer (tb_users — camelCase)
    const { data: u, error: uErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel")
      .eq("userID", code)
      .maybeSingle<{
        userID: string;
        userName: string | null;
        userLastName: string | null;
        userTel: string | null;
      }>();
    if (uErr) {
      console.error(`[getPayUserContext tb_users] failed`, { code: uErr.code, message: uErr.message, userid: code });
      return { ok: false, error: `db_error:${uErr.code ?? "unknown"}` };
    }
    if (!u) return { ok: false, error: `ไม่พบลูกค้า ${code}` };

    // 2. wallet (tb_wallet — lowercase)
    const { data: w, error: wErr } = await admin
      .from("tb_wallet")
      .select("wallettotal")
      .eq("userid", code)
      .maybeSingle<{ wallettotal: number | string | null }>();
    if (wErr) {
      console.error(`[getPayUserContext tb_wallet] failed`, { code: wErr.code, message: wErr.message, userid: code });
      return { ok: false, error: `db_error:${wErr.code ?? "unknown"}` };
    }

    // 3. unpaid shop orders (tb_header_order hstatus='2' AND hdatepayment>now —
    //    legacy pay-users.php getListPay.php L16; expired-quote orders excluded).
    const nowIso = new Date().toISOString();
    const { data: rows, error: oErr } = await admin
      .from("tb_header_order")
      .select("hno, hstatus, htotalpriceuser, htotalpricechn, hshippingchn, hshippingservice, hrate, hdatepayment")
      .eq("userid", code)
      .eq("hstatus", "2")
      .gt("hdatepayment", nowIso)
      .order("hdatepayment", { ascending: true })
      .limit(200);
    if (oErr) {
      console.error(`[getPayUserContext tb_header_order] failed`, { code: oErr.code, message: oErr.message, userid: code });
      return { ok: false, error: `db_error:${oErr.code ?? "unknown"}` };
    }

    const orders: PayUserUnpaidOrder[] = (rows ?? [])
      .map((r) => ({
        hno: String((r as { hno: string }).hno),
        price_thb: computeShopOrderDebitTotal(r as Parameters<typeof computeShopOrderDebitTotal>[0]),
        hdatepayment: (r as { hdatepayment: string | null }).hdatepayment,
      }))
      .filter((o) => Number.isFinite(o.price_thb) && o.price_thb > 0);

    // 4. corporate flag (tb_corporate — lowercase) — drives the 1% allowance.
    //    Legacy pay-users.php L255: corporate=1 if a tb_corporate row exists.
    const { data: corpRow, error: corpErr } = await admin
      .from("tb_corporate")
      .select("id")
      .eq("userid", code)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (corpErr) {
      console.error(`[getPayUserContext tb_corporate] failed`, { code: corpErr.code, message: corpErr.message, userid: code });
      return { ok: false, error: `db_error:${corpErr.code ?? "unknown"}` };
    }
    const isCorporate = corpRow != null;

    // 5. unpaid forwarders (tb_forwarder fStatus='5' OR fCredit='1' —
    //    legacy pay-users.php L316). We fetch the eligibility set (status 5 +
    //    credit 1) then compute the batch debit prices via the pure helper so
    //    the displayed amount == the amount adminPayForwardersOnBehalf debits.
    const { data: fRows, error: fErr } = await admin
      .from("tb_forwarder")
      .select(`${FORWARDER_PRICE_COLS}, ftrackingchn, fstatus, fcredit`)
      .eq("userid", code)
      .or("fstatus.eq.5,fcredit.eq.1")
      .order("id", { ascending: true })
      .limit(300);
    if (fErr) {
      console.error(`[getPayUserContext tb_forwarder] failed`, { code: fErr.code, message: fErr.message, userid: code });
      return { ok: false, error: `db_error:${fErr.code ?? "unknown"}` };
    }

    const fEligible = (fRows ?? []) as Array<
      ForwarderDebitRow & { ftrackingchn: string | null; fstatus: string | null; fcredit: string | null }
    >;
    const fBatch = computeForwarderDebitBatch(fEligible, { userId: code, isCorporate });
    const priceById = new Map(fBatch.lines.map((l) => [l.id, l.price_thb]));

    const forwarders: PayUserForwarder[] = fEligible
      .map((r) => ({
        fid: String(r.id),
        price_thb: priceById.get(String(r.id)) ?? NaN,
        ftracking: r.ftrackingchn,
        fstatus: r.fstatus,
        is_credit: (r.fcredit ?? "").trim() === "1",
      }))
      .filter((f) => Number.isFinite(f.price_thb) && f.price_thb > 0);

    return {
      ok: true,
      data: {
        user: {
          userid: u.userID,
          name: [u.userName, u.userLastName].filter(Boolean).join(" ").trim() || u.userID,
          tel: u.userTel,
        },
        wallet_balance: Number(w?.wallettotal ?? 0),
        orders,
        forwarders,
        is_corporate: isCorporate,
      },
    };
  });
}

// ════════════════════════════════════════════════════════════
// PAY ACTION — debit wallet for the selected orders, on behalf
// ════════════════════════════════════════════════════════════

const paySchema = z.object({
  userId: z.string().trim().min(1).max(20),
  hNos: z.array(z.string().trim().min(1).max(100)).min(1).max(100),
});

export type PayOnBehalfResult = {
  paid: string[];
  skipped: { hno: string; reason: string }[];
  total_debited: number;
};

export async function adminPayOrdersOnBehalf(
  input: unknown,
): Promise<AdminActionResult<PayOnBehalfResult>> {
  return withAdmin(undefined, async () => {
    const parsed = paySchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
    }
    const userId = parsed.data.userId.toUpperCase();
    const hNos = Array.from(new Set(parsed.data.hNos)); // de-dup
    const admin = createAdminClient();
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

    // best-effort profile_id for customer notify (legacy fired lineNotifyShops)
    let profileId: string | null = null;
    try {
      const map = await resolveProfileIdsForLegacyUserids([userId]);
      profileId = map.get(userId) ?? null;
    } catch (e) {
      console.error(`[adminPayOrdersOnBehalf resolveProfileId] failed`, { userId, e: String(e) });
    }

    const paid: string[] = [];
    const skipped: { hno: string; reason: string }[] = [];
    let totalDebited = 0;

    // Per-order loop — balance re-read each iteration (legacy L51) so a
    // multi-order batch stops cleanly when the wallet runs dry.
    for (const hno of hNos) {
      const nowIso = new Date().toISOString();

      // 1. load order (ownership-gated to userId)
      const { data: header, error: hErr } = await admin
        .from("tb_header_order")
        .select("id, hno, hstatus, htotalpriceuser, htotalpricechn, hshippingchn, hshippingservice, hrate")
        .eq("userid", userId)
        .eq("hno", hno)
        .maybeSingle<{
          id: number;
          hno: string;
          hstatus: string | null;
          htotalpriceuser: number | string | null;
          htotalpricechn: number | string | null;
          hshippingchn: number | string | null;
          hshippingservice: number | string | null;
          hrate: number | string | null;
        }>();
      if (hErr) { skipped.push({ hno, reason: `db_error:${hErr.code ?? "unknown"}` }); continue; }
      if (!header) { skipped.push({ hno, reason: "ไม่พบออเดอร์ของลูกค้ารายนี้" }); continue; }

      const st = (header.hstatus ?? "").trim();
      if (st === "3" || st === "4" || st === "5") { skipped.push({ hno, reason: "ชำระเงินแล้ว" }); continue; }
      if (st !== "2") { skipped.push({ hno, reason: "ออเดอร์ยังไม่พร้อมชำระ (ต้องอยู่สถานะ รอชำระเงิน)" }); continue; }

      const price = computeShopOrderDebitTotal(header);
      if (!Number.isFinite(price) || price <= 0) { skipped.push({ hno, reason: "ราคาออเดอร์ไม่ถูกต้อง" }); continue; }

      // 2. idempotency probe (legacy pay-users.php L13 double-pay guard)
      const { data: existHs, error: exErr } = await admin
        .from("tb_wallet_hs")
        .select("id")
        .eq("userid", userId)
        .eq("type", "2")
        .eq("reforder", hno)
        .eq("status", "2")
        .limit(1)
        .maybeSingle<{ id: number }>();
      if (exErr) { skipped.push({ hno, reason: `db_error:${exErr.code ?? "unknown"}` }); continue; }
      if (existHs) {
        // already debited — nudge header forward if it stalled at 2
        await admin
          .from("tb_header_order")
          .update({ hstatus: "3", hdate3: nowIso, hdateupdate: nowIso, paydeposit: "1" })
          .eq("id", header.id)
          .eq("hstatus", "2");
        skipped.push({ hno, reason: "ชำระไปแล้วก่อนหน้า (idempotent)" });
        continue;
      }

      // 3. balance pre-check (re-read per order)
      const { data: wallet, error: wErr } = await admin
        .from("tb_wallet")
        .select("wallettotal")
        .eq("userid", userId)
        .maybeSingle<{ wallettotal: number | string | null }>();
      if (wErr) { skipped.push({ hno, reason: `db_error:${wErr.code ?? "unknown"}` }); continue; }
      const balance = Number(wallet?.wallettotal ?? 0);
      if (!(balance >= price)) {
        skipped.push({ hno, reason: `ยอดเงินไม่พอ (มี ฿${balance.toFixed(2)} ต้อง ฿${price.toFixed(2)})` });
        continue; // FLAG (Phase 2): legacy offers a slip-top-up path here
      }

      // 4. INSERT tb_wallet_hs (admin twin of A1 — adminid/adminidcrate = staff slug)
      const { data: hsRow, error: hsErr } = await admin
        .from("tb_wallet_hs")
        .insert({
          date:            nowIso,
          amount:          price,
          status:          "2",                 // settled (admin debit is final)
          type:            "2",                 // ชำระเงินฝากสั่ง
          typenew:         "3",
          typeservice:     "1",
          paydeposit:      "1",
          imagesslip:      "",
          depositnamebank: "WALLET",
          nameuserbank:    "",
          nouserbank:      "",
          note:            `ชำระเงินฝากสั่ง #${hno} (เจ้าหน้าที่ตัดจากกระเป๋าเงินแทนลูกค้า)`,
          adminid:         legacyAdminId,
          adminidupdate:   legacyAdminId,
          session:         "admin-pay-onbehalf",
          reforder:        hno,
          whno:            "",
          wusercredit:     "0",
          userid:          userId,
          adminidcrate:    legacyAdminId,       // legacy pay-users.php L65
        })
        .select("id")
        .single<{ id: number }>();
      if (hsErr || !hsRow) {
        skipped.push({ hno, reason: `บันทึก tb_wallet_hs ล้มเหลว: ${hsErr?.message ?? "no row"}` });
        continue;
      }

      // 5. debit tb_wallet (rollback the hs row on failure — keep books balanced)
      const newBalance = Math.round((balance - price) * 100) / 100;
      const { error: wuErr } = await admin
        .from("tb_wallet")
        .update({ wallettotal: newBalance })
        .eq("userid", userId);
      if (wuErr) {
        await admin.from("tb_wallet_hs").delete().eq("id", hsRow.id);
        skipped.push({ hno, reason: `หักยอดกระเป๋าล้มเหลว · ยกเลิกรายการ: ${wuErr.message}` });
        continue;
      }

      // 6. flip header 2 → 3 (post-debit failure surfaces LOUD; no auto-rollback)
      const { error: oErr } = await admin
        .from("tb_header_order")
        .update({ hstatus: "3", hdate3: nowIso, hdateupdate: nowIso, paydeposit: "1" })
        .eq("id", header.id);
      if (oErr) {
        console.error(`[adminPayOrdersOnBehalf status flip FAILED post-debit]`, {
          code: oErr.code, message: oErr.message, hno, userId, tb_wallet_hs_id: hsRow.id, amount: price,
        });
        skipped.push({ hno, reason: `หักเงินสำเร็จแต่อัพเดทสถานะล้มเหลว (กระเป๋าถูกหัก ฿${price} · tb_wallet_hs=${hsRow.id}) — ติดต่อทีมงาน` });
        continue;
      }

      paid.push(hno);
      totalDebited += price;

      if (profileId) {
        void sendNotification(profileId, {
          category:       "order",
          severity:       "success",
          title:          `ชำระค่าฝากสั่งสำเร็จ ${hno}`,
          body:           `฿${price.toLocaleString("th-TH", { minimumFractionDigits: 2 })} · เจ้าหน้าที่ตัดจากกระเป๋าเงินให้`,
          link_href:      `/service-order/${hno}`,
          reference_type: "service_order",
          reference_id:   String(header.id),
        });
      }
    }

    revalidatePath("/admin/wallet/pay-user");
    revalidatePath("/admin/service-orders");

    if (paid.length === 0) {
      return {
        ok: false,
        error: skipped.length ? skipped.map((s) => `${s.hno}: ${s.reason}`).join(" · ") : "ไม่มีรายการที่ชำระได้",
      };
    }
    return { ok: true, data: { paid, skipped, total_debited: Math.round(totalDebited * 100) / 100 } };
  });
}

// ════════════════════════════════════════════════════════════
// PAY ACTION (Phase 2) — debit wallet for the selected ฝากนำเข้า
// (forwarder) rows, on behalf. Faithful port of the sufficient-balance
// branch of pay-users.php `paymentForwarderNew` (L202-500).
// ════════════════════════════════════════════════════════════

const payForwarderSchema = z.object({
  userId: z.string().trim().min(1).max(20),
  fIds: z.array(z.string().trim().min(1).max(20)).min(1).max(100),
});

export type PayForwardersOnBehalfResult = {
  paid: string[];
  skipped: { fid: string; reason: string }[];
  total_debited: number;
};

export async function adminPayForwardersOnBehalf(
  input: unknown,
): Promise<AdminActionResult<PayForwardersOnBehalfResult>> {
  return withAdmin(undefined, async () => {
    const parsed = payForwarderSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
    }
    const userId = parsed.data.userId.toUpperCase();
    // de-dup + drop non-numeric (tb_forwarder.id is bigint; legacy keys IN(ids))
    const fIds = Array.from(new Set(parsed.data.fIds)).filter((x) => /^\d+$/.test(x));
    if (fIds.length === 0) return { ok: false, error: "ไม่มีรายการฝากนำเข้าที่ถูกต้อง" };

    const admin = createAdminClient();
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

    // best-effort profile_id for customer notify (legacy fired lineNotifyForwarder)
    let profileId: string | null = null;
    try {
      const map = await resolveProfileIdsForLegacyUserids([userId]);
      profileId = map.get(userId) ?? null;
    } catch (e) {
      console.error(`[adminPayForwardersOnBehalf resolveProfileId] failed`, { userId, e: String(e) });
    }

    // corporate flag (legacy L255) — gates the per-row 1% allowance.
    const { data: corpRow, error: corpErr } = await admin
      .from("tb_corporate")
      .select("id")
      .eq("userid", userId)
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (corpErr) {
      console.error(`[adminPayForwardersOnBehalf tb_corporate] failed`, { code: corpErr.code, message: corpErr.message, userId });
      return { ok: false, error: `db_error:${corpErr.code ?? "unknown"}` };
    }
    const isCorporate = corpRow != null;

    // ── AUTHORITATIVE batch — compute prices on EXACTLY the selected rows
    // (legacy `WHERE … AND ID IN ('$ids')`, L316). Pricing depends on the
    // selection (corporate ≥฿1000 gate + PCSF-first ฿50), so this is the
    // source of truth — NOT the context-loader's full-set preview. Order by
    // id ASC so the "first PCSF" row is deterministic + matches legacy DB order.
    const { data: eligibleRaw, error: eligErr } = await admin
      .from("tb_forwarder")
      .select(`${FORWARDER_PRICE_COLS}, fcredit`)
      .eq("userid", userId)
      .in("id", fIds.map(Number))
      .or("fstatus.eq.5,fcredit.eq.1")
      .order("id", { ascending: true });
    if (eligErr) {
      console.error(`[adminPayForwardersOnBehalf eligibility] failed`, { code: eligErr.code, message: eligErr.message, userId });
      return { ok: false, error: `db_error:${eligErr.code ?? "unknown"}` };
    }
    const eligible = (eligibleRaw ?? []) as Array<ForwarderDebitRow & { fcredit: string | null }>;
    if (eligible.length === 0) return { ok: false, error: "ไม่พบรายการฝากนำเข้าที่พร้อมชำระของลูกค้ารายนี้" };

    const batch = computeForwarderDebitBatch(eligible, { userId, isCorporate });
    const priceById = new Map(batch.lines.map((l) => [l.id, l.price_thb]));
    const creditById = new Map(eligible.map((r) => [String(r.id), (r.fcredit ?? "").trim() === "1"]));
    // legacy stamps fUserCompany='1' on EVERY settled row when the batch
    // corporate discount fired, else '' (L399/L401/L457/L459).
    const fUserCompanyValue = batch.applyCorporateDiscount ? "1" : "";

    const paid: string[] = [];
    const skipped: { fid: string; reason: string }[] = [];
    let totalDebited = 0;

    // Per-row loop — balance re-read each iteration (legacy re-reads walletTotal
    // L478 before each debit) so a multi-row batch stops cleanly when dry.
    for (const fid of fIds) {
      const nowIso = new Date().toISOString();

      const price = priceById.get(fid);
      const isCredit = creditById.get(fid) ?? false;
      const isPcsfFix = batch.pcsfTransportFixId === fid;

      // row not in the eligible/priced set → not payable
      if (price === undefined) { skipped.push({ fid, reason: "ไม่อยู่สถานะพร้อมชำระ (ต้อง fStatus=5 หรือ fCredit=1)" }); continue; }
      if (!Number.isFinite(price) || price <= 0) { skipped.push({ fid, reason: "ราคารายการไม่ถูกต้อง" }); continue; }

      // 1. idempotency probe — legacy L212 dup-guard:
      //    tb_wallet_hs WHERE userID AND (typeNew='5' OR typeNew='6')
      //    AND status=2 AND refOrder IN (ids). We probe per-row by reforder.
      const { data: existHs, error: exErr } = await admin
        .from("tb_wallet_hs")
        .select("id")
        .eq("userid", userId)
        .in("typenew", ["5", "6"])
        .eq("status", "2")
        .eq("reforder", fid)
        .limit(1)
        .maybeSingle<{ id: number }>();
      if (exErr) { skipped.push({ fid, reason: `db_error:${exErr.code ?? "unknown"}` }); continue; }
      if (existHs) {
        // already debited — nudge forwarder forward if it stalled at 5.
        // Match the pure-wallet flip (legacy L467/L469) — no paydeposit
        // (path #2 creates no tb_wallet_paydeposit link row).
        const fwdPatch: Record<string, unknown> = isCredit
          ? { fcredit: "", fdateadminstatus: nowIso }
          : { fstatus: "6", fdateadminstatus: nowIso, fdatestatus6: nowIso };
        await admin.from("tb_forwarder").update(fwdPatch).eq("id", Number(fid)).eq("userid", userId);
        skipped.push({ fid, reason: "ชำระไปแล้วก่อนหน้า (idempotent)" });
        continue;
      }

      // 2. balance pre-check (re-read per row)
      const { data: wallet, error: wErr } = await admin
        .from("tb_wallet")
        .select("wallettotal")
        .eq("userid", userId)
        .maybeSingle<{ wallettotal: number | string | null }>();
      if (wErr) { skipped.push({ fid, reason: `db_error:${wErr.code ?? "unknown"}` }); continue; }
      const balance = Number(wallet?.wallettotal ?? 0);
      if (!(balance >= price)) {
        skipped.push({ fid, reason: `ยอดเงินไม่พอ (มี ฿${balance.toFixed(2)} ต้อง ฿${price.toFixed(2)})` });
        continue; // FLAG (Phase 3): legacy offers a slip-top-up path here
      }

      // 3. PCSF first-item — mutate tb_forwarder.fTransportPrice=50 BEFORE the
      //    ledger/status writes (faithful L388/L446). This is a side-effect the
      //    legacy commits inside the pay path; the reject path in wallet-hs.ts
      //    (isPCSF50 branch) reverses it, so the contract expects it here.
      if (isPcsfFix) {
        const { error: pcsfErr } = await admin
          .from("tb_forwarder")
          .update({ ftransportprice: 50 })
          .eq("id", Number(fid))
          .eq("userid", userId);
        if (pcsfErr) {
          console.error(`[adminPayForwardersOnBehalf PCSF ftransportprice=50] failed`, { code: pcsfErr.code, message: pcsfErr.message, fid });
          skipped.push({ fid, reason: `ตั้งค่าค่าขนส่ง PCSF ล้มเหลว: ${pcsfErr.message}` });
          continue;
        }
      }

      // 4. INSERT tb_wallet_hs — legacy L463-464:
      //    type='4' · status='2' (settled) · typeNew='6' · typeService='2' ·
      //    refOrder=fID · adminIDCrate=$adminID.
      const { data: hsRow, error: hsErr } = await admin
        .from("tb_wallet_hs")
        .insert({
          date:            nowIso,
          amount:          price,
          status:          "2",                 // settled (admin debit is final)
          type:            "4",                 // ชำระเงินฝากนำเข้า
          typenew:         "6",
          typeservice:     "2",                 // 2 = forwarder/freight
          paydeposit:      "1",
          imagesslip:      "",
          depositnamebank: "WALLET",
          nameuserbank:    "",
          nouserbank:      "",
          note:            `ชำระค่าฝากนำเข้า #${fid} (เจ้าหน้าที่ตัดจากกระเป๋าเงินแทนลูกค้า)`,
          adminid:         legacyAdminId,
          adminidupdate:   legacyAdminId,
          session:         "admin-pay-onbehalf",
          reforder:        fid,
          whno:            "",
          wusercredit:     isCredit ? "1" : "0",
          userid:          userId,
          adminidcrate:    legacyAdminId,       // legacy L464/L405
        })
        .select("id")
        .single<{ id: number }>();
      if (hsErr || !hsRow) {
        skipped.push({ fid, reason: `บันทึก tb_wallet_hs ล้มเหลว: ${hsErr?.message ?? "no row"}` });
        continue;
      }

      // 5. debit tb_wallet (rollback the hs row on failure — keep books balanced)
      const newBalance = Math.round((balance - price) * 100) / 100;
      const { error: wuErr } = await admin
        .from("tb_wallet")
        .update({ wallettotal: newBalance })
        .eq("userid", userId);
      if (wuErr) {
        await admin.from("tb_wallet_hs").delete().eq("id", hsRow.id);
        skipped.push({ fid, reason: `หักยอดกระเป๋าล้มเหลว · ยกเลิกรายการ: ${wuErr.message}` });
        continue;
      }

      // 6. flip tb_forwarder 5 → 6 (or credit variant) — the pure-wallet
      //    sufficient-balance branch. Legacy L467/L469 (path #2):
      //    standard: fStatus='6', fDateAdminStatus, fDateStatus6, fUserCompany.
      //    credit:   fCredit='', fDateAdminStatus, fUserCompany (NO fStatus flip,
      //              NO fDateStatus6 — credit rows settle without the 6 stamp).
      //    NOTE: path #2 does NOT set paydeposit (only the slip-top-up paths
      //    #1/#3 do, L408/L633, because they create a tb_wallet_paydeposit
      //    link row — which path #2 does not). We match that faithfully.
      const fwdPatch: Record<string, unknown> = isCredit
        ? { fcredit: "", fdateadminstatus: nowIso, fusercompany: fUserCompanyValue }
        : { fstatus: "6", fdateadminstatus: nowIso, fdatestatus6: nowIso, fusercompany: fUserCompanyValue };
      const { error: fErr2 } = await admin
        .from("tb_forwarder")
        .update(fwdPatch)
        .eq("id", Number(fid));
      if (fErr2) {
        console.error(`[adminPayForwardersOnBehalf status flip FAILED post-debit]`, {
          code: fErr2.code, message: fErr2.message, fid, userId, tb_wallet_hs_id: hsRow.id, amount: price,
        });
        skipped.push({ fid, reason: `หักเงินสำเร็จแต่อัพเดทสถานะล้มเหลว (กระเป๋าถูกหัก ฿${price} · tb_wallet_hs=${hsRow.id}) — ติดต่อทีมงาน` });
        continue;
      }

      paid.push(fid);
      totalDebited += price;

      if (profileId) {
        void sendNotification(profileId, {
          category:       "forwarder",
          severity:       "success",
          title:          `ชำระค่าฝากนำเข้าสำเร็จ #${fid}`,
          body:           `฿${price.toLocaleString("th-TH", { minimumFractionDigits: 2 })} · เจ้าหน้าที่ตัดจากกระเป๋าเงินให้`,
          link_href:      `/shipments`,
          reference_type: "forwarder",
          reference_id:   fid,
        });
      }
    }

    revalidatePath("/admin/wallet/pay-user");
    revalidatePath("/admin/forwarders");

    if (paid.length === 0) {
      return {
        ok: false,
        error: skipped.length ? skipped.map((s) => `${s.fid}: ${s.reason}`).join(" · ") : "ไม่มีรายการที่ชำระได้",
      };
    }
    return { ok: true, data: { paid, skipped, total_debited: Math.round(totalDebited * 100) / 100 } };
  });
}
