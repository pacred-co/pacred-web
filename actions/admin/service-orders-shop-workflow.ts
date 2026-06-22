"use server";

/**
 * Admin 5-tab shop UPDATE workflow — the 3 state-transition handlers that
 * close the middle of the legacy ฝากสั่งซื้อ state-machine for the 21,950
 * real `tb_header_order` rows on prod.
 *
 * D1 Tier D / P0-13 · 2026-05-30 — closes the gap documented in
 *   docs/research/legacy-gap-2026-05-30/adm-10-shop-ops.md S12 / S13 / S14
 *
 * Before this file existed, the legacy-view page rendered only:
 *   - mark-paid (2→3) via `adminMarkServiceOrderPaidTb` (service-orders-tb.ts)
 *   - per-tracking spawn (Tab-4) via `spawnForwardersFromShopOrder`
 *     (service-orders-spawn.ts)
 * So an order could not be QUOTED (1→2) nor ORDERED (3→4) nor
 * AUTO-SPAWNED + FLIPPED-TO-COMPLETED (4→5) without falling back to legacy PHP.
 *
 * Why a NEW file (not appended to service-orders.ts):
 *   service-orders.ts already has 1× state-transition (general update +
 *   rebuilt-path mark-paid). The 3 new state-transitions are a tight
 *   logical cluster — keep them co-located + the existing file under the
 *   2000-line cap (CLAUDE.md docs §13 cap applies in spirit to .ts too).
 *
 * Legacy SOTs (per legacy-gap doc):
 *   - update2 (quote)        — pcs-admin/shops.php L916-1070
 *   - update3 (ordered)      — pcs-admin/shops.php L1071-1185
 *   - 4→5 + tb_promotion carry — pcs-admin/shops.php L1514-1523 + L1675-1721
 *
 * Column-citation map for tb_header_order (per 0081_pcs_legacy_schema.sql):
 *   L2508  hstatus            varchar(1)   — '1'..'6'
 *   L2511  hno                varchar(30)  — natural key
 *   L2521  hdatepayment       timestamp    — quote deadline ("กรุณาชำระก่อน X")
 *   L2516-2519 hdate2..hdate5 timestamp    — per-status stamp
 *   L2520  hdateupdate        timestamp    — every update touches this
 *   L2524  htotalpriceuser    numeric(10,2)— THB total customer is charged
 *   L2523  htotalpricechn     numeric(10,2)— CNY subtotal (pre-rate)
 *   L2525  hshippingservice   numeric(10,2)— service fee
 *   L2526  hshippingchn       numeric(10,2)— CN-internal shipping
 *   L2528  hrate              numeric(10,2)— CNY→THB rate at quote-time
 *   L2530  hcostall           numeric(10,2)
 *   L2531  hcostallth         numeric(10,2)
 *   L2532  hnote              text NOT NULL — admin note (used to record cShippingNumber too)
 *   L2535  hnotedate          timestamp
 *   L2551  userid             varchar(30)  — legacy member code (PR<n>)
 *   L2555  adminidupdate      varchar(10)  — clip via safeLegacyAdminId
 *
 * Column-citation map for tb_order (per 0081_pcs_legacy_schema.sql):
 *   L3097  id                 integer NOT NULL
 *   L3110  userid             varchar(10)
 *   L3111  hno                varchar(30)  — FK to header
 *   L3112  cshippingnumber    varchar(500) — comma-sep per-shop shop order #
 *   L3113  ctrackingnumber    varchar(200) — comma-sep per-shop tracking #
 *   L3107  camount            integer
 *   L3104  cprice             numeric(10,2)
 *   L3105  cshippingchn       numeric(10,2)
 *
 * Column-citation map for tb_forwarder (per 0081_pcs_legacy_schema.sql):
 *   L1601  fstatus            varchar(2)   — '1' = in-warehouse-CN
 *   L1628  ftrackingchn       varchar(50)  — natural key with reforder
 *   L1684  userid             varchar(10)  — copied from tb_header_order.userid
 *   L1691  reforder           varchar(30)  — FK back to tb_header_order.hno
 *   (full column list in service-orders-spawn.ts L213-300; this file
 *   delegates spawn-row construction to that file's `spawnForwardersFromShopOrder`.)
 *
 * Column-citation map for tb_promotion (per 0081_pcs_legacy_schema.sql):
 *   L3849  id                 bigint NOT NULL
 *   L3850  date               timestamp
 *   L3851  promoid            bigint
 *   L3852  fid                bigint       — when written for a forwarder: the new fNo
 *   L3853  hno                varchar(30)  — link back to original shop order
 *
 *   (NB: there is NO `tb_promotion_use` link table; tb_promotion IS the
 *    audit-log link table. Legacy carries by INSERTing a new tb_promotion
 *    row per (promoid found for hno) with fid=newFno, hno=origHno.)
 *
 * Column-citation map for tb_users (per 0081_pcs_legacy_schema.sql):
 *   L5830  userid             varchar(10)  — primary lookup
 *   L5831  usertel            varchar(13)  — SMS target
 *   L5837  useremail          varchar(100)
 *
 * Notification channels (per legacy gap doc P1-6):
 *   - update2 (quote)   : email + SMS + LINE Notify + LINE OA (4 channels)
 *   - update3 (ordered) : email + LINE Notify + LINE OA (3 channels)
 *   - 4→5 (completed)   : email + LINE Notify (2 channels)
 *
 *   Pacred's `sendNotification` (lib/notifications/index.ts L42) covers
 *   in-app notification row + LINE OA push + email fallback in ONE call.
 *   LINE Notify is EOL Apr 2025 (CLAUDE.md 2026-05-30 night #2) — superseded
 *   by LINE OA push, so 4-CH legacy folds to (in-app + LINE OA + email + SMS).
 *   SMS is wired via lib/sms/gateway.ts sendSms(phone, message) for the
 *   quote handler (4-CH); ordered + completed do 2-3 CH and skip SMS.
 */

import { revalidatePath } from "next/cache";
import { bustAdminChrome } from "@/lib/cache/revalidate-chrome";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { sendSms } from "@/lib/sms/gateway";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { resolveProfileIdsForLegacyUserids } from "@/lib/auth/tb-users-resolver";
import { spawnForwardersFromShopOrder } from "./service-orders-spawn";
import { roundUp } from "@/lib/admin/shop-disbursement-calc";
import { logger, redactId } from "@/lib/logger";

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — same shape as service-orders.ts L29
// (SEVENTH caller — pending #178 lift to common.ts).
// ────────────────────────────────────────────────────────────

async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[service-orders-shop-workflow.resolveLegacyAdminId auth.getUser] failed`, {
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
    console.error(`[service-orders-shop-workflow.tb_admin lookup] failed`, {
      code: error.code, message: error.message,
    });
  }
  if (data?.adminID) return data.adminID;
  return email;
}

// ────────────────────────────────────────────────────────────
// Pure helpers — exported for unit tests (see
// actions/admin/service-orders-shop-workflow.test.ts).
// ────────────────────────────────────────────────────────────

/**
 * Status-transition guard. Each handler accepts ONE specific from-status:
 *   quote   accepts only '1'  (pending → quoted)
 *   ordered accepts only '3'  (paid    → ordered)
 *   spawn   accepts only '4'  (ordered → completed)
 *
 * Terminal/cancelled = explicit error so admin doesn't double-fire.
 */
// Pure helpers below — NOT exported. Next 16 `"use server"` files reject
// any non-async-function value export (CLAUDE_TECHNICAL.md / build error
// "Server Actions must be async functions"). The test file
// (service-orders-shop-workflow.test.ts) keeps its own private copy of
// each guard + the deadline helper for assertion-level unit tests.
function quoteGuard(status: string | null | undefined): { ok: true } | { ok: false; error: string } {
  const s = (status ?? "").trim();
  if (s === "6") return { ok: false, error: "ออเดอร์ยกเลิกแล้ว — ตั้งราคาไม่ได้" };
  if (s === "5") return { ok: false, error: "ออเดอร์เสร็จสมบูรณ์แล้ว — ตั้งราคาไม่ได้" };
  if (s !== "1") return { ok: false, error: `สถานะ ${s || "?"} ไม่ใช่รอดำเนินการ — ตั้งราคาไม่ได้` };
  return { ok: true };
}
function orderedGuard(status: string | null | undefined): { ok: true } | { ok: false; error: string } {
  const s = (status ?? "").trim();
  if (s === "6") return { ok: false, error: "ออเดอร์ยกเลิกแล้ว — บันทึกการสั่งซื้อไม่ได้" };
  if (s === "5") return { ok: false, error: "ออเดอร์เสร็จสมบูรณ์แล้ว — บันทึกซ้ำไม่ได้" };
  if (s === "4") return { ok: false, error: "ออเดอร์บันทึกสั่งซื้อแล้ว — ไม่ต้องบันทึกซ้ำ" };
  if (s !== "3") return { ok: false, error: `สถานะ ${s || "?"} ต้องเป็น "สั่งสินค้าแล้ว" (3) ก่อนจึงบันทึก tracking ได้` };
  return { ok: true };
}
function spawnGuard(status: string | null | undefined): { ok: true } | { ok: false; error: string } {
  const s = (status ?? "").trim();
  if (s === "6") return { ok: false, error: "ออเดอร์ยกเลิกแล้ว — ส่งเข้าโกดังไม่ได้" };
  if (s === "5") return { ok: false, error: "ออเดอร์เสร็จสมบูรณ์แล้ว — ไม่ต้องส่งเข้าโกดังซ้ำ" };
  if (s !== "4") return { ok: false, error: `สถานะ ${s || "?"} ต้องเป็น "รอจีนจัดส่ง" (4) ก่อนจึงส่งเข้าโกดังได้` };
  return { ok: true };
}

/**
 * Quote-deadline default — NOW + 5 days (legacy shops.php update2 sets
 * hDatePayment = NOW + INTERVAL 5 DAY · "กรุณาชำระก่อนวันที่ X").
 */
function defaultQuoteDeadline(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 5);
  return d;
}

// ────────────────────────────────────────────────────────────
// 1. adminQuoteShopOrder — 1 → 2 (quote handler)
// ────────────────────────────────────────────────────────────

const quoteSchema = z.object({
  hNo:             z.string().trim().min(1, "missing hNo").max(30),
  htotalpriceuser: z.number().positive("ยอด THB ต้อง > 0").max(99_999_999),
  hshippingservice: z.number().nonnegative().max(99_999_999).optional(),
  hcostallth:      z.number().nonnegative().max(99_999_999).optional(),
  hnote:           z.string().trim().max(2000).optional(),
});
export type AdminQuoteShopOrderInput = z.infer<typeof quoteSchema>;

type QuoteData = { hno: string; htotalpriceuser: number; hdatepayment: string };

export async function adminQuoteShopOrder(
  input: AdminQuoteShopOrderInput,
): Promise<AdminActionResult<QuoteData>> {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<QuoteData>(["super", "ops", "sales_admin"], async ({ adminId }) => {
    const admin         = createAdminClient();
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

    // 1. Load + guard.
    const { data: header, error: headerErr } = await admin
      .from("tb_header_order")
      .select("id, hno, userid, hstatus")
      .eq("hno", d.hNo)
      .maybeSingle<{ id: number; hno: string; userid: string; hstatus: string | null }>();
    if (headerErr) {
      console.error(`[tb_header_order quote lookup] failed`, {
        code: headerErr.code, message: headerErr.message,
      });
      return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
    }
    if (!header) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ (hNo ไม่ตรง)" };

    const guard = quoteGuard(header.hstatus);
    if (!guard.ok) return { ok: false, error: guard.error };

    // 2. UPDATE tb_header_order with the quote.
    const nowIso       = new Date().toISOString();
    const deadline     = defaultQuoteDeadline();
    const deadlineIso  = deadline.toISOString();

    const update: Record<string, unknown> = {
      hstatus:         "2",
      htotalpriceuser: d.htotalpriceuser,
      hdatepayment:    deadlineIso,
      hdate2:          nowIso,
      hdateupdate:     nowIso,
      adminidupdate:   legacyAdminId,
    };
    if (d.hshippingservice !== undefined) update.hshippingservice = d.hshippingservice;
    if (d.hcostallth !== undefined)        update.hcostallth      = d.hcostallth;
    if (d.hnote !== undefined && d.hnote.length > 0) {
      update.hnote     = d.hnote;
      update.hnotedate = nowIso;
    }

    const { error: updErr } = await admin
      .from("tb_header_order")
      .update(update)
      .eq("id", header.id);
    if (updErr) {
      console.error(`[tb_header_order quote update] failed`, {
        code: updErr.code, message: updErr.message, hint: updErr.hint,
        hNo: d.hNo,
      });
      return { ok: false, error: updErr.message };
    }

    // 3. Audit.
    await logAdminAction(
      adminId,
      "service_order.quote",
      "tb_header_order",
      header.hno,
      {
        hno:             header.hno,
        userid:          header.userid,
        htotalpriceuser: d.htotalpriceuser,
        hshippingservice: d.hshippingservice ?? null,
        hcostallth:       d.hcostallth ?? null,
        hdatepayment:    deadlineIso,
        before_status:   header.hstatus,
        after_status:    "2",
      },
    );

    // 4. Notify (4 channels — in-app + LINE OA + email + SMS).
    void notifyShopOrderQuoted(admin, header.userid, header.hno, d.htotalpriceuser, deadline);

    revalidatePath("/admin/service-orders");
    revalidatePath(`/admin/service-orders/${header.hno}`);
    revalidatePath(`/service-order/${header.hno}`);
    // Shop order quoted (hStatus→2 รอชำระเงิน) → the shop-order queue badges
    // changed; refresh the admin sidebar.
    bustAdminChrome();

    return {
      ok: true,
      data: { hno: header.hno, htotalpriceuser: d.htotalpriceuser, hdatepayment: deadlineIso },
    };
  });
}

// ────────────────────────────────────────────────────────────
// 1b. adminSaveShopOrderItemsAndQuote — 1/2 → 2 (the legacy `update2`)
//     The MISSING CORE: per-item price entry + quote in ONE save.
//
//     Faithful port of pcs-admin/shops.php L916-1069 (update2 handler).
//     The CS/interpreter staff key per-item cAmount/cPrice/cShippingCHN
//     + the cost-side hRateCost/hCostAll, then press "บันทึก + เปลี่ยน
//     เป็นรอชำระเงิน". This:
//       0. GUARD (L919): refuse if any tb_wallet_hs row with
//          (status='1' OR '2') AND refOrder=hNo exists → customer already
//          paid; re-quoting would mis-state a settled order.
//       1. (L942-953) UPDATE each tb_order row (cAmount/cPrice/cShippingCHN)
//          WHERE cAmount>0; accumulate
//            hTotalPriceCHN  = Σ round_up(cPrice × cAmount, 2)
//            hShippingCHN    = Σ cShippingCHN
//       2. (L954-955) UPDATE tb_header_order SET hRateCost, hCostAll,
//          hCostAllTH(=hCostAll×hRateCost), hDate2=now, hStatus='2',
//          hCount=#items, hDatePayment=NOW+5d, hTotalPriceCHN,
//          hShippingCHN, hDateUpdate=now, adminIDUpdate.
//       3. (L978-981) recompute + UPDATE hTotalPriceUser =
//          round_up(((hTotalPriceCHN + hShippingCHN) × hRate) +
//          hShippingService, 2).
//       4. notify customer (reuse notifyShopOrderQuoted · 4-CH).
//
//     hStatus accepted: '1' (รอดำเนินการ) AND '2' (รอชำระเงิน · re-save
//     before customer pays) AND '6' (legacy `update.php` switch routes
//     '6' → update1.php too, so a cancelled-then-reopened order can be
//     re-quoted). Already-paid (3/4/5) blocked by the wallet_hs guard.
// ────────────────────────────────────────────────────────────

const saveItemSchema = z.object({
  id:           z.coerce.number().int().positive(),
  cAmount:      z.coerce.number().int().nonnegative(),
  cPrice:       z.coerce.number().nonnegative(),
  cShippingCHN: z.coerce.number().nonnegative(),
});

const saveItemsAndQuoteSchema = z.object({
  hNo:       z.string().trim().min(1, "missing hNo").max(30),
  items:     z.array(saveItemSchema).min(1, "ต้องมีรายการสินค้าอย่างน้อย 1 รายการ").max(500),
  hRateCost: z.coerce.number().nonnegative().max(99_999),
  hCostAll:  z.coerce.number().nonnegative().max(99_999_999),
});
export type AdminSaveShopOrderItemsAndQuoteInput = z.infer<typeof saveItemsAndQuoteSchema>;

type SaveItemsAndQuoteData = {
  hno:             string;
  rows_updated:    number;
  htotalpricechn:  number;
  hshippingchn:    number;
  htotalpriceuser: number;
  hdatepayment:    string;
};

export async function adminSaveShopOrderItemsAndQuote(
  input: AdminSaveShopOrderItemsAndQuoteInput,
): Promise<AdminActionResult<SaveItemsAndQuoteData>> {
  const parsed = saveItemsAndQuoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<SaveItemsAndQuoteData>(["super", "ops", "sales_admin"], async ({ adminId }) => {
    const admin         = createAdminClient();
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

    // 1. Load + guard the header.
    const { data: header, error: headerErr } = await admin
      .from("tb_header_order")
      .select("id, hno, userid, hstatus, hrate, hshippingservice")
      .eq("hno", d.hNo)
      .maybeSingle<{
        id: number; hno: string; userid: string; hstatus: string | null;
        hrate: number | string | null; hshippingservice: number | string | null;
      }>();
    if (headerErr) {
      console.error(`[tb_header_order save-items lookup] failed`, {
        code: headerErr.code, message: headerErr.message,
      });
      return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
    }
    if (!header) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ (hNo ไม่ตรง)" };

    const status = (header.hstatus ?? "").trim();
    if (status !== "1" && status !== "2" && status !== "6") {
      return {
        ok: false,
        error: `สถานะ ${status || "?"} ไม่สามารถแก้ราคา/ตั้งราคาได้ (อนุญาตเฉพาะ รอดำเนินการ/รอชำระเงิน)`,
      };
    }

    // 0. Already-paid guard — legacy shops.php L919: any tb_wallet_hs with
    //    (status='1' OR '2') AND refOrder=hNo means the customer has a
    //    pending/settled payment → re-quoting would mis-state money.
    const { data: paidRows, error: paidErr } = await admin
      .from("tb_wallet_hs")
      .select("id")
      .eq("reforder", d.hNo)
      .in("status", ["1", "2"])
      .limit(1);
    if (paidErr) {
      console.error(`[tb_wallet_hs already-paid guard] failed`, {
        code: paidErr.code, message: paidErr.message,
      });
      return { ok: false, error: `db_error:${paidErr.code ?? "unknown"}` };
    }
    if (paidRows && paidRows.length > 0) {
      return { ok: false, error: "ลูกค้าชำระเงินมาแล้ว — แก้ราคา/ตั้งราคาไม่ได้" };
    }

    // 2. UPDATE each tb_order line + accumulate the CN totals.
    //    Legacy L942-953: only rows with cAmount>0 are updated; the running
    //    hTotalPriceCHN = Σ round_up(cPrice × cAmount, 2) (per-line round_up)
    //    and hShippingCHN = Σ cShippingCHN.
    let rowsUpdated      = 0;
    let sumTotalChnAll   = 0;
    let sumShippingChnAll = 0;
    for (const it of d.items) {
      if (it.cAmount <= 0) continue;
      const { error: itemUpdErr } = await admin
        .from("tb_order")
        .update({
          camount:      it.cAmount,
          cprice:       it.cPrice,
          cshippingchn: it.cShippingCHN,
        })
        .eq("id", it.id)
        .eq("hno", d.hNo); // belt-and-suspenders — scope to this order
      if (itemUpdErr) {
        console.error(`[tb_order save-item update] failed`, {
          code: itemUpdErr.code, message: itemUpdErr.message, id: it.id,
        });
        return {
          ok: false,
          error: `บันทึกรายการสินค้า id=${it.id} ล้มเหลว: ${itemUpdErr.message}`,
        };
      }
      rowsUpdated += 1;
      sumTotalChnAll   = roundUp(sumTotalChnAll + roundUp(it.cPrice * it.cAmount, 2), 2);
      sumShippingChnAll = roundUp(sumShippingChnAll + it.cShippingCHN, 2);
    }

    if (rowsUpdated === 0) {
      return { ok: false, error: "ไม่มีรายการที่มีจำนวน > 0 — กรอกจำนวนสินค้าก่อนบันทึก" };
    }

    // 3. Recompute money + flip header to '2'.
    const hRate            = Number(header.hrate ?? 0);
    const hShippingService = Number(header.hshippingservice ?? 0);
    const hCostAllTh       = roundUp(d.hCostAll * d.hRateCost, 2);
    // Legacy L978-979: hTotalPriceUser = round_up(((CHN+shipCHN)×rate)+svc, 2).
    const htotalpriceuser  = roundUp(
      (sumTotalChnAll + sumShippingChnAll) * hRate + hShippingService,
      2,
    );

    const nowIso      = new Date().toISOString();
    const deadline    = defaultQuoteDeadline();
    const deadlineIso = deadline.toISOString();

    const { error: hdrErr } = await admin
      .from("tb_header_order")
      .update({
        hcostallth:      hCostAllTh,
        hcostall:        d.hCostAll,
        hratecost:       d.hRateCost,
        hdate2:          nowIso,
        htotalpricechn:  sumTotalChnAll,
        hshippingchn:    sumShippingChnAll,
        hdateupdate:     nowIso,
        hstatus:         "2",
        // Legacy L954: hCount = the loop counter over ALL POSTed items (it
        // increments per for-iteration regardless of cAmount), i.e. the total
        // number of item rows in the order — NOT just the cAmount>0 ones.
        hcount:          d.items.length,
        hdatepayment:    deadlineIso,
        htotalpriceuser: htotalpriceuser,
        adminidupdate:   legacyAdminId,
      })
      .eq("id", header.id);
    if (hdrErr) {
      console.error(`[tb_header_order save-items header update] failed`, {
        code: hdrErr.code, message: hdrErr.message, hNo: d.hNo,
      });
      return {
        ok: false,
        error: `บันทึกรายการสินค้าสำเร็จ (${rowsUpdated} แถว) แต่อัพเดท header ล้มเหลว: ${hdrErr.message}`,
      };
    }

    // 4. Audit.
    await logAdminAction(
      adminId,
      "service_order.save_items_and_quote",
      "tb_header_order",
      header.hno,
      {
        hno:             header.hno,
        userid:          header.userid,
        rows_updated:    rowsUpdated,
        htotalpricechn:  sumTotalChnAll,
        hshippingchn:    sumShippingChnAll,
        hratecost:       d.hRateCost,
        hcostall:        d.hCostAll,
        hcostallth:      hCostAllTh,
        htotalpriceuser: htotalpriceuser,
        hdatepayment:    deadlineIso,
        before_status:   status,
        after_status:    "2",
      },
    );

    // 5. Notify (4 channels — in-app + LINE OA + email + SMS).
    void notifyShopOrderQuoted(admin, header.userid, header.hno, htotalpriceuser, deadline);

    revalidatePath("/admin/service-orders");
    revalidatePath(`/admin/service-orders/${header.hno}`);
    revalidatePath(`/service-order/${header.hno}`);
    // Shop order priced + quoted (hStatus→2 รอชำระเงิน) → the shop-order queue
    // badges changed; refresh the admin sidebar.
    bustAdminChrome();

    return {
      ok: true,
      data: {
        hno:             header.hno,
        rows_updated:    rowsUpdated,
        htotalpricechn:  sumTotalChnAll,
        hshippingchn:    sumShippingChnAll,
        htotalpriceuser: htotalpriceuser,
        hdatepayment:    deadlineIso,
      },
    };
  });
}

// ────────────────────────────────────────────────────────────
// 2. adminMarkShopOrderOrdered — 3 → 4 (ordered handler)
// ────────────────────────────────────────────────────────────

// 2026-06-04 (ภูม flag #4) — schema now accepts EITHER:
//   - `shops`: per-shop [{cnameshop, cshippingnumber}] (faithful to legacy
//     update3.php · loops cNameShop[] from $_POST and writes WHERE
//     hNo+cNameShop), OR
//   - legacy single `cshippingnumber` scalar — kept for backward-compat
//     with the OLD AdminMarkShopOrderOrderedForm callers (it's still
//     callable but will write the same value to ALL shops — same as
//     the pre-flag behaviour).
//
// At least ONE form must be provided. When BOTH are provided the
// per-shop array wins (the new code path).
const orderedSchema = z.object({
  hNo:             z.string().trim().min(1, "missing hNo").max(30),
  cshippingnumber: z.string().trim().max(500).optional(),
  shops:           z.array(
    z.object({
      cnameshop:       z.string().trim().min(1).max(300),
      cshippingnumber: z.string().trim().min(1, "เลขออเดอร์ร้านจีนห้ามว่าง").max(500),
    }),
  ).optional(),
  hnotechn:        z.string().trim().max(500).optional(),
}).refine(
  (v) => (v.shops && v.shops.length > 0) || (v.cshippingnumber && v.cshippingnumber.length > 0),
  { message: "ต้องระบุเลขออเดอร์ร้านจีน (อย่างน้อย 1 ร้าน)" },
);
export type AdminMarkShopOrderOrderedInput = z.infer<typeof orderedSchema>;

type OrderedData = {
  hno: string;
  rows_updated: number;
  tracking_summary: string;
  shops_updated: number;
};

export async function adminMarkShopOrderOrdered(
  input: AdminMarkShopOrderOrderedInput,
): Promise<AdminActionResult<OrderedData>> {
  const parsed = orderedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<OrderedData>(["super", "ops", "sales_admin"], async ({ adminId }) => {
    const admin         = createAdminClient();
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

    // 1. Load + guard.
    const { data: header, error: headerErr } = await admin
      .from("tb_header_order")
      .select("id, hno, userid, hstatus, hnote")
      .eq("hno", d.hNo)
      .maybeSingle<{
        id: number; hno: string; userid: string; hstatus: string | null; hnote: string | null;
      }>();
    if (headerErr) {
      console.error(`[tb_header_order ordered lookup] failed`, {
        code: headerErr.code, message: headerErr.message,
      });
      return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
    }
    if (!header) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ (hNo ไม่ตรง)" };

    const guard = orderedGuard(header.hstatus);
    if (!guard.ok) return { ok: false, error: guard.error };

    // 2. Stamp `cshippingnumber` per-shop on tb_order (legacy update3.php
    //    L1075-1080 · for($count) { UPDATE tb_order ... WHERE hNo + cNameShop }).
    //    Two paths:
    //      - NEW (preferred): per-shop array — admin filled the per-shop UI
    //      - LEGACY/fallback: single scalar applied to ALL rows for hNo
    let rowsUpdated = 0;
    let shopsUpdated = 0;
    let trackingSummary = "";

    if (d.shops && d.shops.length > 0) {
      // Per-shop update: loop the array · WHERE hno + cnameshop
      for (const sh of d.shops) {
        const { error: shErr, count } = await admin
          .from("tb_order")
          .update({ cshippingnumber: sh.cshippingnumber }, { count: "exact" })
          .eq("hno", header.hno)
          .eq("cnameshop", sh.cnameshop);
        if (shErr) {
          console.error(`[tb_order per-shop ordered update] failed`, {
            code: shErr.code, message: shErr.message, shop: sh.cnameshop,
          });
          return { ok: false, error: `db_error:${shErr.code ?? "unknown"}` };
        }
        if ((count ?? 0) > 0) {
          rowsUpdated += count ?? 0;
          shopsUpdated += 1;
        }
      }
      trackingSummary = d.shops.map((s) => `${s.cnameshop}: ${s.cshippingnumber}`).join(" · ");
    } else if (d.cshippingnumber) {
      // Legacy single-value fallback — same as pre-2026-06-04 behaviour.
      const { data: items, error: itemsErr } = await admin
        .from("tb_order")
        .select("id, cnameshop")
        .eq("hno", header.hno)
        .limit(500);
      if (itemsErr) {
        console.error(`[tb_order ordered list] failed`, {
          code: itemsErr.code, message: itemsErr.message,
        });
        return { ok: false, error: `db_error:${itemsErr.code ?? "unknown"}` };
      }
      const itemIds = (items ?? []).map((r) => r.id);
      const distinctShops = new Set((items ?? []).map((r) => r.cnameshop));
      if (itemIds.length > 0) {
        const { error: itemUpdErr, count } = await admin
          .from("tb_order")
          .update({ cshippingnumber: d.cshippingnumber }, { count: "exact" })
          .in("id", itemIds);
        if (itemUpdErr) {
          console.error(`[tb_order ordered update] failed`, {
            code: itemUpdErr.code, message: itemUpdErr.message,
          });
          return { ok: false, error: itemUpdErr.message };
        }
        rowsUpdated = count ?? itemIds.length;
        shopsUpdated = distinctShops.size;
      }
      trackingSummary = d.cshippingnumber;
    }

    // 3. Header flip 3 → 4 + stamp hdate4.
    //    Legacy stamps the China-side note (hnotechn) into hnote when the
    //    admin enters one. Per-line cShippingNumber is the per-shop value,
    //    so we also append a short pointer in hnote so future audits see
    //    "ordered with tracking XYZ" without joining to tb_order.
    const nowIso   = new Date().toISOString();
    const trackingTag = `[ORDERED] cshippingnumber=${trackingSummary}`;
    const headerNote =
      d.hnotechn && d.hnotechn.length > 0
        ? `${trackingTag} · ${d.hnotechn}`
        : trackingTag;

    const { error: hdrErr } = await admin
      .from("tb_header_order")
      .update({
        hstatus:       "4",
        hdate4:        nowIso,
        hdateupdate:   nowIso,
        adminidupdate: legacyAdminId,
        hnote:         (header.hnote ? `${header.hnote}\n` : "") + headerNote,
        hnotedate:     nowIso,
      })
      .eq("id", header.id);
    if (hdrErr) {
      console.error(`[tb_header_order ordered header update] failed`, {
        code: hdrErr.code, message: hdrErr.message,
      });
      return {
        ok: false,
        error: `อัพเดทรายการ tb_order สำเร็จ (${rowsUpdated} แถว) แต่ flip header status ล้มเหลว: ${hdrErr.message}`,
      };
    }

    // 4. Audit.
    await logAdminAction(
      adminId,
      "service_order.ordered",
      "tb_header_order",
      header.hno,
      {
        hno:              header.hno,
        userid:           header.userid,
        cshippingnumber:  trackingSummary,
        shops_updated:    shopsUpdated,
        rows_updated:     rowsUpdated,
        before_status:    header.hstatus,
        after_status:     "4",
        hnotechn:         d.hnotechn ?? null,
        per_shop:         d.shops ?? null,
      },
    );

    // 5. Notify (3 channels per legacy — in-app + LINE OA + email).
    void notifyShopOrderOrdered(admin, header.userid, header.hno, trackingSummary);

    revalidatePath("/admin/service-orders");
    revalidatePath(`/admin/service-orders/${header.hno}`);
    revalidatePath(`/service-order/${header.hno}`);
    // Shop order moved to สั่งสินค้า (hStatus→3) → the shop-order queue badges
    // changed; refresh the admin sidebar.
    bustAdminChrome();

    return {
      ok: true,
      data: {
        hno:              header.hno,
        rows_updated:     rowsUpdated,
        shops_updated:    shopsUpdated,
        tracking_summary: trackingSummary,
      },
    };
  });
}

// ────────────────────────────────────────────────────────────
// 2b. adminUpdateShopTracking — status 4 per-shop ctrackingnumber input
//     (faithful to legacy update4.php where each shop has its own
//     cTrackingNumber that admin fills BEFORE spawning forwarders)
// ────────────────────────────────────────────────────────────

const trackingSchema = z.object({
  hNo:   z.string().trim().min(1, "missing hNo").max(30),
  shops: z.array(
    z.object({
      cnameshop:       z.string().trim().min(1).max(300),
      ctrackingnumber: z.string().trim().max(200),  // empty allowed = clear
    }),
  ).min(1, "ต้องระบุอย่างน้อย 1 ร้าน"),
});
export type AdminUpdateShopTrackingInput = z.infer<typeof trackingSchema>;

type ShopTrackingData = {
  hno: string;
  rows_updated: number;
  shops_updated: number;
};

/**
 * Per-shop `cTrackingNumber` update on tb_order (legacy update4.php
 * L1366-1371). Used at hstatus=4 (รอร้านจีนจัดส่ง) — admin types the
 * tracking the seller gave them, per shop. NOT a status flip — that
 * happens later via `adminSpawnForwarderFromShopOrder` (4→5).
 *
 * Allowed at hstatus = '4'. Empty tracking clears the field (legacy
 * accepts that too — used when retyping).
 */
export async function adminUpdateShopTracking(
  input: AdminUpdateShopTrackingInput,
): Promise<AdminActionResult<ShopTrackingData>> {
  const parsed = trackingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<ShopTrackingData>(["super", "ops", "sales_admin"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: header, error: headerErr } = await admin
      .from("tb_header_order")
      .select("id, hno, userid, hstatus")
      .eq("hno", d.hNo)
      .maybeSingle<{ id: number; hno: string; userid: string; hstatus: string | null }>();
    if (headerErr) {
      console.error(`[tb_header_order tracking lookup] failed`, {
        code: headerErr.code, message: headerErr.message,
      });
      return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
    }
    if (!header) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ (hNo ไม่ตรง)" };
    if (header.hstatus !== "4") {
      return { ok: false, error: `กรอกเลข Tracking ได้เฉพาะออเดอร์สถานะ "รอร้านจีนจัดส่ง" (4) เท่านั้น · สถานะปัจจุบัน = ${header.hstatus}` };
    }

    let rowsUpdated = 0;
    let shopsUpdated = 0;
    for (const sh of d.shops) {
      const { error: shErr, count } = await admin
        .from("tb_order")
        .update({ ctrackingnumber: sh.ctrackingnumber }, { count: "exact" })
        .eq("hno", header.hno)
        .eq("cnameshop", sh.cnameshop);
      if (shErr) {
        console.error(`[tb_order per-shop tracking update] failed`, {
          code: shErr.code, message: shErr.message, shop: sh.cnameshop,
        });
        return { ok: false, error: `db_error:${shErr.code ?? "unknown"}` };
      }
      if ((count ?? 0) > 0) {
        rowsUpdated += count ?? 0;
        shopsUpdated += 1;
      }
    }

    await logAdminAction(
      adminId,
      "service_order.shop_tracking_updated",
      "tb_header_order",
      header.hno,
      {
        hno:            header.hno,
        userid:         header.userid,
        shops_updated:  shopsUpdated,
        rows_updated:   rowsUpdated,
        per_shop:       d.shops,
      },
    );

    revalidatePath(`/admin/service-orders/${header.hno}`);
    revalidatePath(`/admin/service-orders/${header.hno}/edit`);

    return {
      ok: true,
      data: {
        hno:           header.hno,
        rows_updated:  rowsUpdated,
        shops_updated: shopsUpdated,
      },
    };
  });
}

// ────────────────────────────────────────────────────────────
// 3. adminSpawnForwarderFromShopOrder — 4 → 5 + spawn tb_forwarder + carry promo
// ────────────────────────────────────────────────────────────

const spawnAllSchema = z.object({
  hNo: z.string().trim().min(1, "missing hNo").max(30),
});
export type AdminSpawnForwarderFromShopOrderInput = z.infer<typeof spawnAllSchema>;

type SpawnAllData = {
  hno:             string;
  spawned_fnos:    number[];
  created:         number;
  skipped:         number;
  promo_rows_carried: number;
  status_flipped:  boolean;
};

export async function adminSpawnForwarderFromShopOrder(
  input: AdminSpawnForwarderFromShopOrderInput,
): Promise<AdminActionResult<SpawnAllData>> {
  const parsed = spawnAllSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<SpawnAllData>(["super", "ops", "sales_admin"], async ({ adminId }) => {
    const admin         = createAdminClient();
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

    // 1. Load + guard.
    const { data: header, error: headerErr } = await admin
      .from("tb_header_order")
      .select("id, hno, userid, hstatus")
      .eq("hno", d.hNo)
      .maybeSingle<{ id: number; hno: string; userid: string; hstatus: string | null }>();
    if (headerErr) {
      console.error(`[tb_header_order spawn-all lookup] failed`, {
        code: headerErr.code, message: headerErr.message,
      });
      return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
    }
    if (!header) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ (hNo ไม่ตรง)" };

    const guard = spawnGuard(header.hstatus);
    if (!guard.ok) return { ok: false, error: guard.error };

    // 2. Build the tracking list from tb_order — legacy expands per-line
    //    (cnameshop, cshippingnumber, ctrackingnumber). We delegate spawn-row
    //    INSERT to `spawnForwardersFromShopOrder` (service-orders-spawn.ts)
    //    so the tb_forwarder column shape stays in ONE place — single SOT.
    const { data: orderItems, error: itemsErr } = await admin
      .from("tb_order")
      .select("cnameshop, cshippingnumber, ctrackingnumber")
      .eq("hno", header.hno)
      .limit(500);
    if (itemsErr) {
      console.error(`[tb_order spawn-all list] failed`, {
        code: itemsErr.code, message: itemsErr.message,
      });
      return { ok: false, error: `db_error:${itemsErr.code ?? "unknown"}` };
    }

    // Expand multi-shop / multi-tracking rows. The shape `tb_order` stores is
    // (per row): cshippingnumber + ctrackingnumber are comma-sep when one
    // shop has multiple parcels. We expand parallel lists per index.
    const trackings: { cTrackingNumber: string; cShippingNumber: string }[] = [];
    const seen = new Set<string>();
    for (const r of (orderItems ?? [])) {
      const ships = (r.cshippingnumber ?? "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      const tracks = (r.ctrackingnumber ?? "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      const max = Math.max(tracks.length, 1);
      for (let i = 0; i < max; i++) {
        const tracking = tracks[i] ?? "";
        if (!tracking) continue;        // skip blank rows (admin hasn't filled tracking)
        if (seen.has(tracking)) continue; // dedup by tracking
        seen.add(tracking);
        trackings.push({
          cTrackingNumber: tracking,
          cShippingNumber: ships[i] ?? ships[0] ?? "",
        });
      }
    }

    if (trackings.length === 0) {
      return {
        ok: false,
        error: "ไม่มี cTrackingNumber บน tb_order — บันทึก tracking ก่อนแล้วค่อยส่งเข้าโกดัง",
      };
    }

    // 3. Delegate to spawnForwardersFromShopOrder — same SOT as the per-row
    //    spawn form. Idempotent: re-spawned trackings return existing fNo.
    const spawnResult = await spawnForwardersFromShopOrder({
      hNo: header.hno,
      trackings,
    });
    if (!spawnResult.ok) {
      return { ok: false, error: `spawn failed: ${spawnResult.error}` };
    }
    const { spawnedFNos, created, skipped } = spawnResult.data ?? {
      spawnedFNos: [], created: 0, skipped: 0,
    };

    // 4. tb_promotion carry — for every existing tb_promotion row pointing
    //    at this hNo, INSERT a new row per spawned fNo (legacy shops.php
    //    L1514-1523: "carry the promo into every freshly-spawned tb_forwarder
    //    by writing a new tb_promotion row with fid=newFno, hno=origHno").
    //    Idempotent: pre-SELECT (promoid, fid, hno) before re-insert.
    let promoRowsCarried = 0;
    const { data: existingPromos, error: promoErr } = await admin
      .from("tb_promotion")
      .select("promoid")
      .eq("hno", header.hno);
    if (promoErr) {
      console.error(`[tb_promotion carry SELECT] failed`, {
        code: promoErr.code, message: promoErr.message,
      });
    }
    if (existingPromos && existingPromos.length > 0 && spawnedFNos.length > 0) {
      const nowIso = new Date().toISOString();
      for (const p of existingPromos) {
        const promoid = p.promoid;
        for (const fid of spawnedFNos) {
          // Idempotency check — already carried for this (promoid, fid, hno)?
          const { data: dup, error: dupErr } = await admin
            .from("tb_promotion")
            .select("id")
            .eq("promoid", promoid)
            .eq("fid", fid)
            .eq("hno", header.hno)
            .limit(1)
            .maybeSingle<{ id: number }>();
          if (dupErr) {
            console.error(`[tb_promotion idempotency check] failed`, {
              code: dupErr.code, message: dupErr.message,
            });
            continue;
          }
          if (dup) continue;
          const { error: insErr } = await admin
            .from("tb_promotion")
            .insert({
              date:    nowIso,
              promoid,
              fid,
              hno:     header.hno,
            });
          if (insErr) {
            console.error(`[tb_promotion carry insert] failed`, {
              code: insErr.code, message: insErr.message, promoid, fid, hno: header.hno,
            });
            continue;
          }
          promoRowsCarried++;
        }
      }
    }

    // 5. Flip header status 4 → 5 + stamp hdate5.
    const nowIso = new Date().toISOString();
    let statusFlipped = false;
    const { error: flipErr } = await admin
      .from("tb_header_order")
      .update({
        hstatus:       "5",
        hdate5:        nowIso,
        hdateupdate:   nowIso,
        adminidupdate: legacyAdminId,
      })
      .eq("id", header.id);
    if (flipErr) {
      // Non-fatal: spawn already succeeded. Surface in result for admin to
      // re-click the action (idempotent — re-spawn returns 0 created + 0
      // promo_rows_carried, then re-flips status).
      console.error(`[tb_header_order 4→5 flip] failed`, {
        code: flipErr.code, message: flipErr.message,
      });
      return {
        ok: false,
        error: `spawn สำเร็จ (${created} ใหม่ · ${skipped} ข้าม) แต่ flip status 4→5 ล้มเหลว: ${flipErr.message}`,
      };
    }
    statusFlipped = true;

    // 6. Audit.
    await logAdminAction(
      adminId,
      "service_order.spawn_to_completed",
      "tb_header_order",
      header.hno,
      {
        hno:                 header.hno,
        userid:              header.userid,
        spawned_fnos:        spawnedFNos,
        created,
        skipped,
        promo_rows_carried:  promoRowsCarried,
        before_status:       header.hstatus,
        after_status:        "5",
      },
    );

    // 7. Notify (legacy fires email + LINE Notify; Pacred fires in-app +
    //    LINE OA + email via sendNotification — 2 wired channels, SMS+legacy
    //    LINE Notify skipped per AGENTS.md 2026-05-30 night #2: LINE Notify
    //    EOL · SMS not required by legacy at this transition).
    void notifyShopOrderCompleted(admin, header.userid, header.hno, spawnedFNos);

    revalidatePath("/admin/service-orders");
    revalidatePath(`/admin/service-orders/${header.hno}`);
    revalidatePath(`/service-order/${header.hno}`);
    revalidatePath("/admin/forwarders");
    // Forwarder(s) spawned + the shop order moved on → both the shop-order and
    // forwarder queue badges changed; refresh the admin sidebar.
    bustAdminChrome();

    return {
      ok: true,
      data: {
        hno:                header.hno,
        spawned_fnos:       spawnedFNos,
        created,
        skipped,
        promo_rows_carried: promoRowsCarried,
        status_flipped:     statusFlipped,
      },
    };
  });
}

// ────────────────────────────────────────────────────────────
// Notification helpers — wrapped so the action body stays readable.
// All three send IN-APP + LINE OA push (via sendNotification's combined
// pipeline) + add SMS via sendSms() for the QUOTE handler ONLY (4-channel).
// ────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>;

async function lookupUserContact(
  admin: AdminClient,
  userid: string,
): Promise<{ profileId: string | null; tel: string | null; email: string | null }> {
  let profileId: string | null = null;
  try {
    const map = await resolveProfileIdsForLegacyUserids([userid]);
    profileId = map.get(userid) ?? null;
  } catch (err) {
    logger.warn("service-orders-shop-workflow", "resolveProfileIdsForLegacyUserids failed", {
      userid: redactId(userid),
      error: err instanceof Error ? err.message : String(err),
    });
  }
  const { data: u, error } = await admin
    .from("tb_users")
    // tb_users columns are camelCase on prod+dev; alias to keep the read site + type.
    .select("usertel:userTel, useremail:userEmail")
    .eq("userID", userid)
    .maybeSingle<{ usertel: string | null; useremail: string | null }>();
  if (error) {
    console.error(`[tb_users contact lookup] failed`, {
      code: error.code, message: error.message,
    });
  }
  return {
    profileId,
    tel:   u?.usertel ?? null,
    email: u?.useremail ?? null,
  };
}

async function notifyShopOrderQuoted(
  admin: AdminClient,
  userid: string,
  hno: string,
  totalThb: number,
  deadline: Date,
): Promise<void> {
  try {
    const c = await lookupUserContact(admin, userid);
    const deadlineLabel = deadline.toLocaleDateString("th-TH", {
      year: "numeric", month: "long", day: "numeric",
    });
    const title = `ฝากสั่ง ${hno} — กรุณาชำระเงิน`;
    const body  =
      `ยอดที่ต้องชำระ: ฿${totalThb.toLocaleString()}\n` +
      `กำหนดชำระภายใน: ${deadlineLabel}`;

    // Channel 1 + 2 + 3 (in-app + LINE OA push + email — via sendNotification)
    if (c.profileId) {
      await sendNotification(c.profileId, {
        category:       "order",
        severity:       "info",
        title,
        body,
        link_href:      `/service-order/${hno}`,
        reference_type: "service_order",
        reference_id:   hno,
      });
    } else {
      logger.warn("service-orders-shop-workflow", "quote notify — no profileId for userid", {
        userid: redactId(userid), hno,
      });
    }

    // Channel 4 — SMS (legacy update2 fires payment-link SMS via ThaiBulkSMS).
    if (c.tel && c.tel.trim().length > 0) {
      const smsText =
        `Pacred: ฝากสั่ง ${hno} ยอด ${totalThb.toLocaleString()} บาท ` +
        `กรุณาชำระภายใน ${deadlineLabel}`;
      void sendSms(c.tel, smsText);
    }
  } catch (err) {
    logger.warn("service-orders-shop-workflow", "quote notify dispatch failed", {
      hno, error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function notifyShopOrderOrdered(
  admin: AdminClient,
  userid: string,
  hno: string,
  cshippingnumber: string,
): Promise<void> {
  try {
    const c = await lookupUserContact(admin, userid);
    const title = `ฝากสั่ง ${hno} — สั่งสินค้าแล้ว รอจีนจัดส่ง`;
    const body  =
      `บันทึกหมายเลขสั่งซื้อจากร้านจีน: ${cshippingnumber}\n` +
      `สถานะ: รอจีนจัดส่ง`;

    // 3-channel per legacy (email + LINE Notify + LINE OA); Pacred maps to
    // in-app + LINE OA + email via single sendNotification dispatch.
    if (c.profileId) {
      await sendNotification(c.profileId, {
        category:       "order",
        severity:       "info",
        title,
        body,
        link_href:      `/service-order/${hno}`,
        reference_type: "service_order",
        reference_id:   hno,
      });
    } else {
      logger.warn("service-orders-shop-workflow", "ordered notify — no profileId for userid", {
        userid: redactId(userid), hno,
      });
    }
  } catch (err) {
    logger.warn("service-orders-shop-workflow", "ordered notify dispatch failed", {
      hno, error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function notifyShopOrderCompleted(
  admin: AdminClient,
  userid: string,
  hno: string,
  spawnedFnos: number[],
): Promise<void> {
  try {
    const c = await lookupUserContact(admin, userid);
    const fnoList = spawnedFnos.length > 0 ? spawnedFnos.map((id) => `#${id}`).join(", ") : "-";
    const title = `ฝากสั่ง ${hno} — สำเร็จ + เปิดใบฝากนำเข้าแล้ว`;
    const body  =
      `สินค้าถึงโกดังจีนแล้ว · เลขฝากนำเข้า: ${fnoList}\n` +
      `ติดตามความคืบหน้าได้ที่หน้าฝากนำเข้า`;

    if (c.profileId) {
      await sendNotification(c.profileId, {
        category:       "order",
        severity:       "success",
        title,
        body,
        link_href:      `/service-import`,
        reference_type: "service_order",
        reference_id:   hno,
      });
    } else {
      logger.warn("service-orders-shop-workflow", "completed notify — no profileId for userid", {
        userid: redactId(userid), hno,
      });
    }
  } catch (err) {
    logger.warn("service-orders-shop-workflow", "completed notify dispatch failed", {
      hno, error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ────────────────────────────────────────────────────────────
// Phase 2 — header-edit handlers (3 high-leverage)
// ────────────────────────────────────────────────────────────
// Each is a thin UPDATE on tb_header_order with audit + revalidate.
// Scope intentionally narrow: pick the legacy POSTs that real staff
// run most (address fix · transport flip · note add). Other header
// edits (cost · rate · IPC reassign · COD toggle) deferred to a
// follow-up commit — they require additional schema work / role gates.
//

// ── (a) address change ──

const updateAddrSchema = z.object({
  hNo:                  z.string().trim().min(1).max(30),
  haddressname:         z.string().trim().min(1).max(200),
  haddresslastname:     z.string().trim().max(200).optional(),
  haddressno:           z.string().trim().max(255).optional(),
  haddresssubdistrict:  z.string().trim().max(255).optional(),
  haddressdistrict:     z.string().trim().max(255).optional(),
  haddressprovince:     z.string().trim().max(255).optional(),
  haddresszipcode:      z.string().trim().max(5).optional(),
  haddressnote:         z.string().trim().max(2000).optional(),
  haddresstel:          z.string().trim().max(10).optional(),
});
export type AdminUpdateOrderAddressInput = z.infer<typeof updateAddrSchema>;

export async function adminUpdateOrderAddress(
  input: AdminUpdateOrderAddressInput,
): Promise<AdminActionResult<{ hno: string }>> {
  const parsed = updateAddrSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ hno: string }>(["super", "ops", "sales_admin"], async ({ adminId }) => {
    const admin         = createAdminClient();
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

    const { data: header, error: headerErr } = await admin
      .from("tb_header_order")
      .select("id, hno, hstatus")
      .eq("hno", d.hNo)
      .maybeSingle<{ id: number; hno: string; hstatus: string | null }>();
    if (headerErr) {
      return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
    }
    if (!header) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ" };
    if (header.hstatus === "5" || header.hstatus === "6") {
      return { ok: false, error: "ออเดอร์ปิดแล้ว — แก้ที่อยู่ไม่ได้" };
    }

    const nowIso = new Date().toISOString();
    const update: Record<string, unknown> = {
      haddressname:         d.haddressname,
      hdateupdate:          nowIso,
      adminidupdate:        legacyAdminId,
    };
    if (d.haddresslastname    !== undefined) update.haddresslastname    = d.haddresslastname;
    if (d.haddressno          !== undefined) update.haddressno          = d.haddressno;
    if (d.haddresssubdistrict !== undefined) update.haddresssubdistrict = d.haddresssubdistrict;
    if (d.haddressdistrict    !== undefined) update.haddressdistrict    = d.haddressdistrict;
    if (d.haddressprovince    !== undefined) update.haddressprovince    = d.haddressprovince;
    if (d.haddresszipcode     !== undefined) update.haddresszipcode     = d.haddresszipcode;
    if (d.haddressnote        !== undefined) update.haddressnote        = d.haddressnote;
    if (d.haddresstel         !== undefined) update.haddresstel         = d.haddresstel;

    const { error: updErr } = await admin
      .from("tb_header_order")
      .update(update)
      .eq("id", header.id);
    if (updErr) {
      console.error(`[tb_header_order address update] failed`, {
        code: updErr.code, message: updErr.message,
      });
      return { ok: false, error: updErr.message };
    }

    await logAdminAction(adminId, "service_order.update_address", "tb_header_order", header.hno, {
      hno: header.hno,
      address: update,
    });

    revalidatePath("/admin/service-orders");
    revalidatePath(`/admin/service-orders/${header.hno}`);
    revalidatePath(`/service-order/${header.hno}`);

    return { ok: true, data: { hno: header.hno } };
  });
}

// ── (b) transport-type flip (รถ / เรือ / เครื่องบิน) ──

const TRANSPORT_TYPES = ["1", "2", "3"] as const;

const switchTransportSchema = z.object({
  hNo:            z.string().trim().min(1).max(30),
  htransporttype: z.enum(TRANSPORT_TYPES),
});
export type AdminSwitchOrderTransportInput = z.infer<typeof switchTransportSchema>;

export async function adminSwitchOrderTransport(
  input: AdminSwitchOrderTransportInput,
): Promise<AdminActionResult<{ hno: string; htransporttype: string }>> {
  const parsed = switchTransportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ hno: string; htransporttype: string }>(
    ["super", "ops", "sales_admin"],
    async ({ adminId }) => {
      const admin         = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

      const { data: header, error: headerErr } = await admin
        .from("tb_header_order")
        .select("id, hno, hstatus, htransporttype")
        .eq("hno", d.hNo)
        .maybeSingle<{
          id: number; hno: string; hstatus: string | null; htransporttype: string | null;
        }>();
      if (headerErr) {
        return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
      }
      if (!header) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ" };
      if (header.hstatus === "5" || header.hstatus === "6") {
        return { ok: false, error: "ออเดอร์ปิดแล้ว — เปลี่ยนรูปแบบขนส่งไม่ได้" };
      }

      const nowIso = new Date().toISOString();
      const { error: updErr } = await admin
        .from("tb_header_order")
        .update({
          htransporttype: d.htransporttype,
          hdateupdate:    nowIso,
          adminidupdate:  legacyAdminId,
        })
        .eq("id", header.id);
      if (updErr) {
        console.error(`[tb_header_order transport update] failed`, {
          code: updErr.code, message: updErr.message,
        });
        return { ok: false, error: updErr.message };
      }

      await logAdminAction(adminId, "service_order.switch_transport", "tb_header_order", header.hno, {
        hno:    header.hno,
        before: header.htransporttype,
        after:  d.htransporttype,
      });

      revalidatePath("/admin/service-orders");
      revalidatePath(`/admin/service-orders/${header.hno}`);
      revalidatePath(`/service-order/${header.hno}`);

      return { ok: true, data: { hno: header.hno, htransporttype: d.htransporttype } };
    },
  );
}

// ── (c) note add (3 distinct channels: hnote · hnoteuser-flag) ──
// Legacy `tb_header_order` has only 2 actual note columns:
//   `hnote` (admin-visible)        — the staff/admin note
//   `hnoteuser` (varchar(1))       — visibility flag for the customer-facing note
//   plus `hnoteuserread` + `hnotedate` — read-receipt + stamp
// The third "note channel" the task brief mentions is actually the flag-driven
// visibility of `hnote` to the customer (legacy saveNote in shops.php L725).

const addNoteSchema = z.object({
  hNo:           z.string().trim().min(1).max(30),
  hnote:         z.string().trim().max(2000),  // empty = clear
  hnoteuser:     z.enum(["0", "1"]).optional(), // 1 = visible to customer
});
export type AdminAddOrderNoteInput = z.infer<typeof addNoteSchema>;

export async function adminAddOrderNote(
  input: AdminAddOrderNoteInput,
): Promise<AdminActionResult<{ hno: string }>> {
  const parsed = addNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ hno: string }>(["super", "ops", "sales_admin"], async ({ adminId }) => {
    const admin         = createAdminClient();
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

    const { data: header, error: headerErr } = await admin
      .from("tb_header_order")
      .select("id, hno, hstatus, hnote")
      .eq("hno", d.hNo)
      .maybeSingle<{ id: number; hno: string; hstatus: string | null; hnote: string | null }>();
    if (headerErr) {
      return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
    }
    if (!header) return { ok: false, error: "ไม่พบออเดอร์ฝากสั่งซื้อ" };

    const nowIso = new Date().toISOString();
    const update: Record<string, unknown> = {
      // Sitting-G bug fix: tb_header_order.hnote is NOT NULL (legacy
      // schema 0081 — every row needs a real string, default ''). The
      // prior empty→null mapping crashed prod with "null value in
      // column 'hnote' violates not-null constraint" (browser-verified
      // on P22305 via adminUpdateServiceOrder · same pattern here).
      // Empty string is the legacy "no note" marker.
      hnote:         d.hnote.length > 0 ? d.hnote : "",
      hnotedate:     nowIso,
      hdateupdate:   nowIso,
      adminidupdate: legacyAdminId,
    };
    if (d.hnoteuser !== undefined) {
      update.hnoteuser     = d.hnoteuser;
      update.hnoteuserread = "0"; // reset read-receipt when visibility flips
    }

    const { error: updErr } = await admin
      .from("tb_header_order")
      .update(update)
      .eq("id", header.id);
    if (updErr) {
      console.error(`[tb_header_order note update] failed`, {
        code: updErr.code, message: updErr.message,
      });
      return { ok: false, error: updErr.message };
    }

    await logAdminAction(adminId, "service_order.add_note", "tb_header_order", header.hno, {
      hno:    header.hno,
      before: header.hnote,
      after:  d.hnote,
      hnoteuser: d.hnoteuser ?? null,
    });

    revalidatePath("/admin/service-orders");
    revalidatePath(`/admin/service-orders/${header.hno}`);
    revalidatePath(`/service-order/${header.hno}`);
    // Order note changed → the "หมายเหตุฝากสั่ง" note-queue badge (counts
    // hnote <> '') changed; refresh the admin sidebar.
    bustAdminChrome();

    return { ok: true, data: { hno: header.hno } };
  });
}
