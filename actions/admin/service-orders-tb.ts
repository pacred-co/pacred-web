"use server";

/**
 * Admin > "บันทึกการชำระเงิน — ฝากสั่งซื้อ (tb_header_order)"
 *
 * Tier A2 revenue-leak fix · 2026-05-29 — faithful port of the legacy
 * admin "Mark as Paid" flow against the LEGACY `tb_header_order` table.
 *
 * Why a NEW file (not appended to `actions/admin/service-orders.ts`):
 *   `service-orders.ts` writes to the REBUILT `service_orders` table which
 *   is EMPTY on prod. The real customer data lives in `tb_header_order`
 *   (after the D1 pivot — see CLAUDE.md §0). The existing
 *   `adminMarkServiceOrderPaid` action in that file only debits the wallet
 *   for orders that exist in `service_orders`, so a tb_-only order
 *   silently advances status with **zero wallet debit** — a direct cash leak.
 *
 * Legacy SOT:
 *   - `pcs-admin/pay-users.php` L48-83 — admin-initiated "ลูกค้าจ่ายเงินแล้ว"
 *     (the path with NO additional topup, pure wallet-debit):
 *       1. SELECT wallettotal FROM tb_wallet WHERE userid=...
 *       2. if (wallettotal >= pricePay) {
 *            UPDATE tb_wallet SET wallettotal=wallettotal-pricePay ...
 *            INSERT tb_wallet_hs (date, status='2', amount=pricePay,
 *                                  type='2', userid, refOrder=hNo, adminIDCrate)
 *            UPDATE tb_header_order SET hStatus='3', hDateUpdate=NOW() ...
 *          } else { sweetalert='eWallet' }
 *   - `pcs-admin/pay-users.php` L162-180 — the customer self-pay equivalent
 *     (typenew='3', paydeposit='1', hDate3=NOW). We mirror the admin path
 *     but also stamp hDate3 so the legacy reporting timeline lines up.
 *   - `member/include/function.php` L149-159 (`nameWalletShop`) +
 *     L161-174 (`nameWallet`) — the wallet-history label conventions.
 *     For shop-order debit: `type='2'` reads as "รายการชำระเงิน ฝากสั่งสินค้า".
 *
 * Source-of-truth amount:
 *   `tb_header_order.htotalpriceuser` (set by the legacy update2 flow when
 *   admin moves the order from status 1 → 2 — at which point the order is
 *   priced + the customer is asked to pay). This already accounts for
 *   `((htotalpricechn + hshippingchn) * hrate) + hshippingservice` and any
 *   refund adjustments (the legacy `repayItem.php` UPDATEs htotalpriceuser
 *   when items are returned). Reading the stored column means we charge
 *   the customer the SAME amount they were quoted — no recompute drift.
 *
 * Idempotency:
 *   Pre-INSERT SELECT on `tb_wallet_hs` where
 *     (reforder = hno, type = '2', status = '2')
 *   matches the legacy "already paid" check at update.php L919 (which
 *   gates the customer self-pay path). If a row exists, we ensure the
 *   header status moved past 2 (best-effort nudge) and return
 *   `already_paid: true` — re-clicks from a flaky network or admin
 *   double-click are safe.
 *
 * Overdraw guard:
 *   Default: fail-closed when wallettotal < pricePay (legacy L80
 *   `sweetalert='eWallet'`). When admin confirms cash/external transfer,
 *   passing `allow_overdraw: true` skips the balance check + stamps the
 *   note "(admin override — รับเงินสด/โอนตรง)" — matches Pacred's existing
 *   `service-orders.ts` adminMarkServiceOrderPaid convention.
 *
 * Notification: we do NOT send a "ชำระสำเร็จ" push from here yet — the
 *   legacy admin path (pay-users.php L77 lineNotifyShops) only pushes to
 *   the admin LINE Notify group, NOT the customer. The customer push for
 *   "status flipped to ordered" can be added in a follow-up sprint once
 *   `lib/auth/tb-users-resolver` covers tb_users → profile_id reliably.
 */

import { revalidatePath } from "next/cache";
import { bustAdminChrome } from "@/lib/cache/revalidate-chrome";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { computeShopOrderDebitTotal } from "@/lib/service-order/debit-total";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — same helper as wallet-hs.ts L54 +
// wallet-trans.ts L51 + service-orders-spawn.ts L51 (FOURTH caller —
// lift to actions/admin/common.ts in next refactor task).
// ────────────────────────────────────────────────────────────

async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[supabase.auth.getUser] failed`, {
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
    console.error(`[tb_admin lookup] failed`, {
      code: error.code, message: error.message,
    });
  }
  if (data?.adminID) return data.adminID;
  return (email.split("@")[0] || "system").slice(0, 20); // 2026-06-05 varchar(20)
}

// ────────────────────────────────────────────────────────────
// Input schema
// ────────────────────────────────────────────────────────────

const markPaidTbSchema = z.object({
  hno:            z.string().trim().min(1, "missing hno").max(30),
  allow_overdraw: z.boolean().optional(),
});
export type AdminMarkServiceOrderPaidTbInput = z.infer<typeof markPaidTbSchema>;

type MarkPaidTbData = {
  wallet_hs_id:  number | null;
  already_paid:  boolean;
  debited:       number;
  new_balance:   number;
};

// ────────────────────────────────────────────────────────────
// adminMarkServiceOrderPaidTb
// ────────────────────────────────────────────────────────────

export async function adminMarkServiceOrderPaidTb(
  input: AdminMarkServiceOrderPaidTbInput,
): Promise<AdminActionResult<MarkPaidTbData>> {
  const parsed = markPaidTbSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<MarkPaidTbData>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 20);

      // 1. Load the header row — need userid + status + price columns.
      const { data: header, error: headerErr } = await admin
        .from("tb_header_order")
        .select(
          "id,hno,userid,hstatus,htotalpriceuser,htotalpricechn,hshippingchn,hshippingservice,hrate",
        )
        .eq("hno", d.hno)
        .maybeSingle<{
          id: number;
          hno: string;
          userid: string;
          hstatus: string | null;
          htotalpriceuser: number | string | null;
          htotalpricechn: number | string | null;
          hshippingchn: number | string | null;
          hshippingservice: number | string | null;
          hrate: number | string | null;
        }>();
      if (headerErr) {
        console.error(`[tb_header_order mutation lookup] failed`, {
          code: headerErr.code, message: headerErr.message,
        });
        return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
      }
      if (!header) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ (hno ไม่ตรง)" };

      const status = (header.hstatus ?? "").trim();
      if (status === "6") {
        return { ok: false, error: "ออเดอร์ยกเลิกแล้ว — ไม่สามารถบันทึกชำระได้" };
      }
      if (status === "5") {
        return { ok: false, error: "ออเดอร์เสร็จสมบูรณ์แล้ว — ไม่ต้องบันทึกชำระซ้ำ" };
      }
      // Status 1=pending · 2=awaiting_payment are the only states where
      // "mark paid" is meaningful. 3/4 mean payment already landed.
      if (status !== "1" && status !== "2") {
        return {
          ok: false,
          error: `สถานะ ${status} ไม่ใช่รอชำระเงิน — บันทึกชำระไม่ได้`,
        };
      }

      // 2. Idempotency — has this order already been paid via wallet?
      //    Legacy check (update.php L919): SELECT tb_wallet_hs WHERE
      //    (status='2' OR status='1') AND refOrder=$hno. We narrow to
      //    type='2' (shop-order debit) to avoid false positives from a
      //    refund row (type='5') that also carries refOrder=$hno.
      const { data: existingTx, error: existingTxErr } = await admin
        .from("tb_wallet_hs")
        .select("id")
        .eq("reforder", header.hno)
        .eq("type", "2")
        .eq("status", "2")
        .limit(1)
        .maybeSingle<{ id: number }>();
      if (existingTxErr) {
        console.error(`[tb_wallet_hs idempotency check] failed`, {
          code: existingTxErr.code, message: existingTxErr.message,
        });
        return { ok: false, error: `db_error:${existingTxErr.code ?? "unknown"}` };
      }
      if (existingTx) {
        // Already paid — best-effort nudge header status to 3 if still
        // sitting at 1 or 2 (covers a half-state from a prior partial
        // failure: wallet debit succeeded but header update did not).
        if (status === "1" || status === "2") {
          const nowIso = new Date().toISOString();
          const { error: nudgeErr } = await admin
            .from("tb_header_order")
            .update({
              hstatus: "3",
              hdate3: nowIso,
              hdateupdate: nowIso,
              adminidupdate: legacyAdminId,
            })
            .eq("id", header.id);
          if (nudgeErr) {
            console.error(`[tb_header_order idempotency-nudge] failed`, {
              code: nudgeErr.code, message: nudgeErr.message,
            });
          }
        }
        // Re-read wallet balance for the result.
        const { data: wRow, error: wRowErr } = await admin
          .from("tb_wallet")
          .select("wallettotal")
          .eq("userid", header.userid)
          .maybeSingle<{ wallettotal: number | string | null }>();
        if (wRowErr) {
          console.error(`[tb_wallet idempotency-rebalance lookup] failed`, {
            code: wRowErr.code, message: wRowErr.message,
          });
        }
        const balance = Number(wRow?.wallettotal ?? 0);
        revalidatePath("/admin/service-orders");
        revalidatePath(`/admin/service-orders/${header.hno}`);
        bustAdminChrome();
        return {
          ok: true,
          data: {
            wallet_hs_id: existingTx.id,
            already_paid: true,
            debited: 0,
            new_balance: Number.isFinite(balance) ? balance : 0,
          },
        };
      }

      // 3. Compute the debit amount.
      const pricePay = computeShopOrderDebitTotal(header);
      if (!Number.isFinite(pricePay) || pricePay <= 0) {
        return {
          ok: false,
          error: "ยอดสุทธิของออเดอร์ไม่ถูกต้อง (htotalpriceuser ว่าง/0) — บันทึกชำระไม่ได้",
        };
      }

      // 4. Load + check wallet balance (skip when admin overrides).
      const { data: wRow, error: wRowErr } = await admin
        .from("tb_wallet")
        .select("userid, wallettotal")
        .eq("userid", header.userid)
        .maybeSingle<{ userid: string; wallettotal: number | string | null }>();
      if (wRowErr) {
        console.error(`[tb_wallet lookup] failed`, {
          code: wRowErr.code, message: wRowErr.message,
        });
        return { ok: false, error: `db_error:${wRowErr.code ?? "unknown"}` };
      }
      const balance = Number(wRow?.wallettotal ?? 0);
      const balanceFinite = Number.isFinite(balance) ? balance : 0;

      if (!d.allow_overdraw) {
        if (balanceFinite < pricePay) {
          return {
            ok: false,
            error: `ยอด wallet ไม่พอ (มี ฿${balanceFinite.toLocaleString()} ต้อง ฿${pricePay.toLocaleString()}) — ถ้ารับเงินสด/โอนตรง ให้ติ๊ก override`,
          };
        }
      }

      // 5. Insert tb_wallet_hs debit row.
      //    Matches pay-users.php L64-65 column set, plus the NOT NULL
      //    columns the schema adds (whno · wusercredit · typenew ·
      //    typeservice · adminidcrate — defaults mirror wallet-hs.ts L196-203).
      const nowIso = new Date().toISOString();
      const noteText = d.allow_overdraw
        ? `รายการชำระเงิน ฝากสั่งสินค้า #${header.hno} (admin override — รับเงินสด/โอนตรง)`
        : `รายการชำระเงิน ฝากสั่งสินค้า #${header.hno}`;

      const { data: hsRow, error: hsInsErr } = await admin
        .from("tb_wallet_hs")
        .insert({
          date:            nowIso,
          dateslip:        nowIso,                     // admin = verifier; slip-date = now
          amount:          pricePay,
          status:          "2",                        // approved (admin = verifier · matches pay-users.php L65)
          type:            "2",                        // 2 = รายการชำระเงิน ฝากสั่งสินค้า (legacy L6220)
          typenew:         "3",                        // 3 = ชำระฝากสั่ง (legacy L6227)
          typeservice:     "1",                        // 1 = ฝากสั่งซื้อ (legacy L6234)
          paydeposit:      "0",                        // not a VIP-credit topup
          imagesslip:      "",
          depositnamebank: "WALLET",                   // legacy uses 'PCS' for refund · 'WALLET' here = clearer audit trail
          nameuserbank:    "",
          nouserbank:      "",
          note:            noteText,
          adminid:         legacyAdminId,
          adminidupdate:   legacyAdminId,
          session:         "admin-mark-paid",
          reforder:        header.hno,                 // legacy refOrder = hNo (pay-users.php L65)
          whno:            "",                         // NOT NULL — no warehouse # for shop-order debit
          wusercredit:     "0",                        // NOT NULL — not a VIP-credit topup
          userid:          header.userid,
          adminidcrate:    legacyAdminId,              // NOT NULL — creator
        })
        .select("id")
        .single<{ id: number }>();
      if (hsInsErr || !hsRow) {
        console.error(`[tb_wallet_hs insert] failed`, {
          code: hsInsErr?.code, message: hsInsErr?.message,
        });
        return {
          ok: false,
          error: `บันทึก tb_wallet_hs ล้มเหลว: ${hsInsErr?.message ?? "no row returned"}`,
        };
      }

      // 6. Decrement tb_wallet.wallettotal.
      //    Read-then-update (upsert if missing — matches wallet-hs.ts L210-243).
      //    On failure we surface so accounting reconciles the dangling
      //    tb_wallet_hs row (the cash already moved on the legacy ledger).
      const newBalance = balanceFinite - pricePay;
      if (!wRow) {
        const { error: walletInsErr } = await admin
          .from("tb_wallet")
          .insert({ userid: header.userid, wallettotal: -pricePay });
        if (walletInsErr) {
          return {
            ok: false,
            error: `บันทึก tb_wallet_hs สำเร็จ (id=${hsRow.id}) แต่ tb_wallet insert ล้มเหลว: ${walletInsErr.message}`,
          };
        }
      } else {
        const { error: walletUpdErr } = await admin
          .from("tb_wallet")
          .update({ wallettotal: newBalance })
          .eq("userid", header.userid);
        if (walletUpdErr) {
          return {
            ok: false,
            error: `บันทึก tb_wallet_hs สำเร็จ (id=${hsRow.id}) แต่ tb_wallet update ล้มเหลว: ${walletUpdErr.message}`,
          };
        }
      }

      // 7. Flip header status 2 → 3 + stamp hdate3 + hdateupdate.
      //    Matches pay-users.php L68 (admin path) + L166 (self-pay path).
      //    paydeposit='1' marks the order as "wallet-paid" — same as the
      //    legacy self-pay branch — so admin reports treat it consistently.
      const { error: ordErr } = await admin
        .from("tb_header_order")
        .update({
          hstatus:       "3",
          hdate3:        nowIso,
          hdateupdate:   nowIso,
          paydeposit:    "1",
          adminidupdate: legacyAdminId,
        })
        .eq("id", header.id);
      if (ordErr) {
        // tb_wallet_hs already wrote + tb_wallet already adjusted; don't
        // attempt auto-rollback (would race with downstream readers).
        // Surface so admin reconciles by cancelling the wallet row.
        return {
          ok: false,
          error: `ชำระเงินสำเร็จ แต่อัพเดท tb_header_order ล้มเหลว (wallet ถูกหัก ฿${pricePay} แล้ว · tb_wallet_hs id=${hsRow.id}): ${ordErr.message}`,
        };
      }

      // 8. Audit log.
      await logAdminAction(
        adminId,
        "tb_header_order.mark_paid",
        "tb_header_order",
        header.hno,
        {
          hno:             header.hno,
          userid:          header.userid,
          amount:          pricePay,
          wallet_hs_id:    hsRow.id,
          allow_overdraw:  !!d.allow_overdraw,
          before_balance:  balanceFinite,
          new_balance:     newBalance,
          before_status:   status,
          after_status:    "3",
        },
      );

      revalidatePath("/admin/service-orders");
      revalidatePath(`/admin/service-orders/${header.hno}`);
      revalidatePath("/admin/wallet");
      // Shop order paid from wallet (2→3) → wallet totals + the shop-order
      // queues changed; refresh the admin sidebar/wallet-total badges.
      bustAdminChrome();
      return {
        ok: true,
        data: {
          wallet_hs_id: hsRow.id,
          already_paid: false,
          debited: pricePay,
          new_balance: newBalance,
        },
      };
    },
  );
}
