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
 * SCOPE: shop orders only. The forwarder leg (`paymentForwarderNew`,
 * fStatus 5→6) + the insufficient-balance slip-top-up path are flagged as
 * Phase-2 follow-ups (see FLAG comments below) — not silently dropped.
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

export type PayUserContext = {
  user: { userid: string; name: string; tel: string | null };
  wallet_balance: number;
  orders: PayUserUnpaidOrder[];
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
