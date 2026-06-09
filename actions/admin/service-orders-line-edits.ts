"use server";

/**
 * Admin > "แก้ไขรายการในออเดอร์ฝากสั่งซื้อ — line-level edits"
 *
 * Wave B_line (2026-06-02) — faithful port of the legacy admin per-line
 * edits scattered through `pcs-admin/shops.php`. These three writers
 * mutate the `tb_order` items table (the "cart lines" inside a shop
 * order — confusingly named `tb_order` in legacy, NOT `tb_cart`; the
 * cart-rendering twin `tb_cart` was a rebuilt false trail).
 *
 * Why a NEW file (not appended to `actions/admin/service-orders.ts`):
 *   `service-orders.ts` is the HEADER (`tb_header_order`) lane — status
 *   updates + bill-to override + audit log. The three line-level edits
 *   here all target `tb_order` rows + cascade to `tb_header_order` or
 *   `tb_forwarder`. Co-locating them keeps the per-line cluster
 *   self-contained, easy to audit, and free of the "header lane gets
 *   bigger every wave" problem.
 *
 * Legacy SOT (all in `pcs-admin/shops.php`):
 *
 *   1. `adminUpdateCartItemPriceUpdate` — shops.php L1806-1846
 *        Adjust a single line's CNY waterfall fee `cpriceupdate`
 *        (added after admin sees the real China invoice), then
 *        delta-add/subtract the parent header's `hpriceupdate`.
 *
 *   2. `adminUpdateCartItemCTracking` — shops.php L776-815 + detail.php L260,288
 *        Edit one CN tracking string inside the comma-separated
 *        `ctrackingnumber` bag for a (hno, tracking) tuple, then cascade
 *        the rename into `tb_forwarder.ftrackingchn` (backfilling
 *        `fcover` when the forwarder row has no image yet).
 *
 *   3. `adminUpdateCartItemShippingNumber` — shops.php L1793-1805
 *        Set the China shop order number `cshippingnumber` for every
 *        `tb_order` row sharing the same (hno, cnameshop) tuple.
 *
 * Per AGENTS.md §0a (faithful workflow, Pacred UI) + §0c (verify-deep-
 * flow) + §0e (no rebuilt dead-write twins): every UPDATE here goes to
 * the live legacy `tb_*` tables — never the empty rebuilt `service_orders`
 * / `cart_items`. Per §0 (D1) the logic mirrors legacy faithfully; the
 * "should recompute hpriceupdate from SUM(cpriceupdate)" improvement is
 * a Phase-C candidate, flagged in adminUpdateCartItemPriceUpdate.
 *
 * Idempotency / safety:
 *   - cReWallet='1' (full-refunded) lines are skipped on price/shipping
 *     edits (matches the legacy disabled-state in shops/update/update.php
 *     L98 — the admin form input is greyed out for refunded rows).
 *   - The CN tracking edit uses exact-bag matching with comma boundary
 *     checks instead of legacy's `LIKE '%$old%'` — avoids the silent
 *     false-match between "AB12" and "AB123" that would corrupt a
 *     sibling tracking. Race risk with concurrent edits on the same
 *     order is mitigated by a re-read + bag-equality WHERE clause
 *     (optimistic check).
 *   - The hpriceupdate recompute is the legacy delta arithmetic
 *     (L1825-1830) — faithful first. NOT a SUM-from-scratch (which
 *     would be more robust to historical drift but diverge from PHP).
 *
 * Notification: only `adminUpdateCartItemCTracking` (E3.17) pings the
 * customer (best-effort, in-app + LINE OA + email · matches legacy
 * detail.php L800-810 where a fixed tracking notifies the customer
 * because they trust that number for package tracking). The other two
 * (E3.5 cshippingnumber + E3.14 cpriceupdate) stay silent — legacy
 * doesn't notify, and the customer-visible state doesn't change in a
 * way they'd care to be told. The legacy `saveHistory()` audit-log
 * calls (L1803 for shipping, none for price or tracking) are replaced
 * by `logAdminAction()` — Pacred has a stronger audit primitive
 * (target + payload `before`/`after`).
 *
 * Status gates (Task #228 · 2026-06-09 — was missing pre-task):
 *   - E3.5 / E3.14 → hstatus IN {3,4,5}  (lineEditStatusGate)
 *   - E3.17        → hstatus IN {4,5}    (trackingEditStatusGate)
 *   - Status '6' (cancelled) + '1'/'2' (pre-quote · items still in
 *     ShopItemsEditor) always rejected. Helpers live in
 *     lib/service-order/line-edit-gates.ts (importable by the test
 *     file — "use server" modules can't export non-async functions).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { sendNotification } from "@/lib/notifications";
import { resolveProfileIdsForLegacyUserids } from "@/lib/auth/tb-users-resolver";
import { logger, redactId } from "@/lib/logger";
import {
  lineEditStatusGate,
  trackingEditStatusGate,
} from "@/lib/service-order/line-edit-gates";

// Status-gate helpers live in lib/service-order/line-edit-gates.ts —
// they're pure, exported, and importable by the test file without
// crossing the "use server" boundary (Next 16 forbids non-async
// exports from "use server" modules · AGENTS.md §11).

// ────────────────────────────────────────────────────────────
// resolveLegacyAdminId — local helper (same shape as
// service-orders-tb.ts L79 + service-orders.ts L31 + 8 other admin
// actions). Acting Pacred admin → legacy varchar id used in audit
// columns like `tb_header_order.adminidupdate` (varchar(10)).
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[service-orders-line-edits.resolveLegacyAdminId auth.getUser] failed`, {
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
    console.error(`[service-orders-line-edits.resolveLegacyAdminId tb_admin lookup] failed`, {
      code: error.code, message: error.message,
    });
  }
  if (data?.adminID) return data.adminID;
  return email;
}

// ────────────────────────────────────────────────────────────
// 1. adminUpdateCartItemPriceUpdate
//    Adjust a single tb_order line's `cpriceupdate` (CNY per-line
//    waterfall fee) + delta-recompute the parent header's
//    `hpriceupdate`.
//
//    Legacy: shops.php L1806-1846.
//    Money-critical · faithful delta arithmetic (NOT SUM-from-scratch).
// ────────────────────────────────────────────────────────────

const updatePriceUpdateSchema = z.object({
  tb_order_id:     z.coerce.number().int().positive(),
  c_price_update:  z.coerce.number().nonnegative(),
});
export type AdminUpdateCartItemPriceUpdateInput = z.infer<typeof updatePriceUpdateSchema>;

type UpdatePriceUpdateData = {
  tb_order_id:        number;
  hno:                string;
  before_cpriceupdate: number;
  after_cpriceupdate:  number;
  before_hpriceupdate: number;
  after_hpriceupdate:  number;
};

export async function adminUpdateCartItemPriceUpdate(
  input: AdminUpdateCartItemPriceUpdateInput,
): Promise<AdminActionResult<UpdatePriceUpdateData>> {
  const parsed = updatePriceUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<UpdatePriceUpdateData>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

      // 1. Load the tb_order line — need hno + current cpriceupdate +
      //    refund guard (crewallet='1' is the legacy disabled state).
      const { data: itemRow, error: itemErr } = await admin
        .from("tb_order")
        .select("id, hno, userid, cpriceupdate, crewallet, ctitle")
        .eq("id", d.tb_order_id)
        .maybeSingle<{
          id: number;
          hno: string;
          userid: string;
          cpriceupdate: number | string | null;
          crewallet: string | null;
          ctitle: string | null;
        }>() as unknown as {
          data: {
            id: number;
            hno: string;
            userid: string;
            cpriceupdate: number | string | null;
            crewallet: string | null;
            ctitle: string | null;
          } | null;
          error: { code?: string; message?: string } | null;
        };
      if (itemErr) {
        console.error(`[tb_order mutation lookup] failed`, {
          code: itemErr.code, message: itemErr.message,
        });
        return { ok: false, error: `db_error:${itemErr.code ?? "unknown"}` };
      }
      if (!itemRow) return { ok: false, error: "ไม่พบรายการสินค้านี้ (tb_order.id ไม่ตรง)" };

      // Refund-disabled guard (legacy update.php L98 disabled state).
      if (itemRow.crewallet === "1") {
        return {
          ok: false,
          error: "รายการนี้ถูกคืนเงินเต็มจำนวนแล้ว — ไม่สามารถแก้ไขราคาเพิ่ม/ลด",
        };
      }

      const beforeCpriceupdate = Number(itemRow.cpriceupdate ?? 0);
      const afterCpriceupdate  = Number(d.c_price_update);
      if (!Number.isFinite(beforeCpriceupdate) || !Number.isFinite(afterCpriceupdate)) {
        return { ok: false, error: "ราคาเพิ่ม/ลด ไม่ใช่ตัวเลขที่ถูกต้อง" };
      }

      // Idempotency — no-op if value unchanged.
      if (Math.abs(afterCpriceupdate - beforeCpriceupdate) < 0.005) {
        return {
          ok: true,
          data: {
            tb_order_id:        itemRow.id,
            hno:                itemRow.hno,
            before_cpriceupdate: beforeCpriceupdate,
            after_cpriceupdate:  beforeCpriceupdate,
            before_hpriceupdate: 0,   // sentinel — caller can compare to detect no-op
            after_hpriceupdate:  0,
          },
        };
      }

      // 2. Load parent header — need current hpriceupdate for delta +
      //    hstatus for the gate.
      const { data: header, error: headerErr } = await admin
        .from("tb_header_order")
        .select("id, hno, hstatus, hpriceupdate")
        .eq("hno", itemRow.hno)
        .maybeSingle<{
          id: number;
          hno: string;
          hstatus: string | null;
          hpriceupdate: number | string | null;
        }>() as unknown as {
          data: { id: number; hno: string; hstatus: string | null; hpriceupdate: number | string | null } | null;
          error: { code?: string; message?: string } | null;
        };
      if (headerErr) {
        console.error(`[tb_header_order parent lookup] failed`, {
          code: headerErr.code, message: headerErr.message,
        });
        return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
      }
      if (!header) {
        return { ok: false, error: `ไม่พบใบฝากสั่งซื้อแม่ (hno=${itemRow.hno})` };
      }

      // Status gate (Task #228 spawn brief E3.14) — order must be
      // post-Mark-Ordered (3/4/5). Pre-quote ('1','2') items live in
      // ShopItemsEditor; cancel ('6') refuses all line edits.
      const gate = lineEditStatusGate(header.hstatus);
      if (!gate.ok) return { ok: false, error: gate.error };

      const beforeHpriceupdate = Number(header.hpriceupdate ?? 0);
      const beforeHpriceupdateFinite = Number.isFinite(beforeHpriceupdate)
        ? beforeHpriceupdate : 0;

      // 3. Delta arithmetic — faithful port of shops.php L1825-1830.
      //    NOTE Phase-C improvement candidate: replace this with
      //    SUM(cpriceupdate) recompute for robustness against historic
      //    drift; faithful first per AGENTS.md §0.
      let afterHpriceupdate = beforeHpriceupdateFinite;
      if (beforeCpriceupdate > afterCpriceupdate) {
        // ยอดใหม่น้อยกว่าเดิม → ลด
        afterHpriceupdate = beforeHpriceupdateFinite - (beforeCpriceupdate - afterCpriceupdate);
      } else if (beforeCpriceupdate < afterCpriceupdate) {
        // ยอดใหม่มากกว่าเดิม → เพิ่ม
        afterHpriceupdate = beforeHpriceupdateFinite + (afterCpriceupdate - beforeCpriceupdate);
      }
      // Bounded ≥ 0 — defensive against historic drift turning negative.
      afterHpriceupdate = Math.max(0, Math.round(afterHpriceupdate * 100) / 100);

      // 4. UPDATE tb_order.cpriceupdate (scoped on id + hno per legacy
      //    L1822 to defend against orphan rows). We do NOT re-include
      //    cpriceupdate=beforeCpriceupdate as a WHERE guard (legacy
      //    doesn't either — but it's a known race window if two admins
      //    edit the same line concurrently · Phase-C improvement).
      const { error: itemUpdErr } = await admin
        .from("tb_order")
        .update({ cpriceupdate: afterCpriceupdate })
        .eq("id", itemRow.id)
        .eq("hno", itemRow.hno);
      if (itemUpdErr) {
        console.error(`[tb_order cpriceupdate update] failed`, {
          code: itemUpdErr.code, message: itemUpdErr.message,
        });
        return {
          ok: false,
          error: `บันทึก tb_order.cpriceupdate ล้มเหลว: ${itemUpdErr.message}`,
        };
      }

      // 5. UPDATE tb_header_order.hpriceupdate + stamp adminidupdate.
      //    On failure, surface for ops — the line cpriceupdate is
      //    already committed; auto-rollback would race downstream
      //    readers (same trade-off as service-orders-tb.ts L370).
      const nowIso = new Date().toISOString();
      const { error: headerUpdErr } = await admin
        .from("tb_header_order")
        .update({
          hpriceupdate:  afterHpriceupdate,
          hdateupdate:   nowIso,
          adminidupdate: legacyAdminId,
        })
        .eq("id", header.id);
      if (headerUpdErr) {
        return {
          ok: false,
          error: `tb_order.cpriceupdate บันทึกแล้ว แต่ tb_header_order.hpriceupdate ล้มเหลว (รายการ id=${itemRow.id} ตัวเลขใหม่ ฿${afterCpriceupdate.toFixed(2)} · ฝากบัญชี recompute มือ): ${headerUpdErr.message}`,
        };
      }

      // 6. Audit log.
      await logAdminAction(
        adminId,
        "tb_order.update_cpriceupdate",
        "tb_order",
        String(itemRow.id),
        {
          hno:                  itemRow.hno,
          userid:               itemRow.userid,
          ctitle:               itemRow.ctitle ?? "",
          before_cpriceupdate:  beforeCpriceupdate,
          after_cpriceupdate:   afterCpriceupdate,
          before_hpriceupdate:  beforeHpriceupdateFinite,
          after_hpriceupdate:   afterHpriceupdate,
        },
      );

      revalidatePath("/admin/service-orders");
      revalidatePath(`/admin/service-orders/${itemRow.hno}`);
      return {
        ok: true,
        data: {
          tb_order_id:        itemRow.id,
          hno:                itemRow.hno,
          before_cpriceupdate: beforeCpriceupdate,
          after_cpriceupdate:  afterCpriceupdate,
          before_hpriceupdate: beforeHpriceupdateFinite,
          after_hpriceupdate:  afterHpriceupdate,
        },
      };
    },
  );
}

// ────────────────────────────────────────────────────────────
// 2. adminUpdateCartItemCTracking
//    Edit ONE existing CN tracking string inside the comma-separated
//    `tb_order.ctrackingnumber` bag for a given hno, then CASCADE the
//    rename into `tb_forwarder.ftrackingchn` (+ conditional fcover
//    backfill when the forwarder has no image yet).
//
//    Legacy: shops.php L776-815 (the handler) + detail.php L260,288
//      (the UI fragment that names the inputs).
//    Multi-table cascading edit · WHERE-bag rebuild · NOT a money path
//    but a customer-trust path (wrong tracking = lost package).
// ────────────────────────────────────────────────────────────

const updateCTrackingSchema = z.object({
  h_no:                    z.string().regex(/^P\d+$/, "hno ต้องเป็นรูปแบบ P{digits}").max(30),
  c_tracking_number_old:   z.string().trim().min(1, "ระบุเลข tracking เดิม").max(100),
  c_tracking_number_new:   z.string().trim().min(1, "ระบุเลข tracking ใหม่").max(100),
});
export type AdminUpdateCartItemCTrackingInput = z.infer<typeof updateCTrackingSchema>;

type UpdateCTrackingData = {
  hno:                    string;
  c_tracking_number_old:  string;
  c_tracking_number_new:  string;
  tb_order_rows_touched:    number;
  tb_forwarder_rows_touched: number;
  fcover_backfilled:      boolean;
};

/**
 * Replace exactly-one occurrence of `oldTok` inside a comma-separated
 * bag. Returns null when `oldTok` isn't a clean bag element (avoids
 * the legacy LIKE '%old%' silent false-match between "AB12" and
 * "AB123").
 *
 * Examples:
 *   "AB12"           , "AB12", "XY99" → "XY99"
 *   "AB12,CD34"      , "AB12", "XY99" → "XY99,CD34"
 *   "AB12,CD34,EF56" , "CD34", "ZZ77" → "AB12,ZZ77,EF56"
 *   "AB12,CD34"      , "AB1",  "XY"   → null   (substring not whole token)
 *   "AB123,CD34"     , "AB12", "XY"   → null   (would falsely match AB123)
 */
function replaceTokenInCsvBag(bag: string, oldTok: string, newTok: string): string | null {
  const tokens = bag.split(",").map((t) => t.trim());
  const idx = tokens.indexOf(oldTok);
  if (idx === -1) return null;
  // Preserve original splitting (no trim re-injection — legacy
  // doesn't trim either; we keep the bag byte-shape).
  const original = bag.split(",");
  const rawIdx = original.findIndex((t) => t.trim() === oldTok);
  if (rawIdx === -1) return null;
  original[rawIdx] = newTok;
  return original.join(",");
}

export async function adminUpdateCartItemCTracking(
  input: AdminUpdateCartItemCTrackingInput,
): Promise<AdminActionResult<UpdateCTrackingData>> {
  const parsed = updateCTrackingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  if (d.c_tracking_number_old === d.c_tracking_number_new) {
    return { ok: false, error: "เลข tracking ใหม่เหมือนเดิม — ไม่ต้องบันทึก" };
  }

  return withAdmin<UpdateCTrackingData>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

      // 0. Load parent header for the status gate + customer notify
      //    target (userid → profile_id).
      const { data: header, error: headerErr } = await admin
        .from("tb_header_order")
        .select("id, hno, hstatus, userid")
        .eq("hno", d.h_no)
        .maybeSingle<{
          id: number;
          hno: string;
          hstatus: string | null;
          userid: string;
        }>();
      if (headerErr) {
        console.error(`[tb_header_order header lookup (ctracking)] failed`, {
          code: headerErr.code, message: headerErr.message,
        });
        return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
      }
      if (!header) {
        return { ok: false, error: `ไม่พบใบฝากสั่งซื้อ ${d.h_no}` };
      }

      // Status gate (Task #228 spawn brief E3.17) — only after Mark-Ordered.
      const gate = trackingEditStatusGate(header.hstatus);
      if (!gate.ok) return { ok: false, error: gate.error };

      // 1. Find every tb_order row in this hno whose ctrackingnumber
      //    bag contains the old token. Legacy uses LIKE '%old%' which
      //    over-matches (AB12 hits AB123). We pre-filter by LIKE then
      //    verify the exact bag-element in JS — fewer round-trips than
      //    pulling every row of the order.
      const { data: candidates, error: candErr } = await admin
        .from("tb_order")
        .select("id, hno, ctrackingnumber, cimages")
        .eq("hno", d.h_no)
        .like("ctrackingnumber", `%${d.c_tracking_number_old}%`) as unknown as {
          data: Array<{
            id: number;
            hno: string;
            ctrackingnumber: string;
            cimages: string | null;
          }> | null;
          error: { code?: string; message?: string } | null;
        };
      if (candErr) {
        console.error(`[tb_order tracking-bag lookup] failed`, {
          code: candErr.code, message: candErr.message,
        });
        return { ok: false, error: `db_error:${candErr.code ?? "unknown"}` };
      }
      if (!candidates || candidates.length === 0) {
        return {
          ok: false,
          error: `ไม่พบรายการที่มีเลข tracking "${d.c_tracking_number_old}" ในออเดอร์ ${d.h_no}`,
        };
      }

      // 2. Filter to exact bag-element matches (defends against the
      //    "AB12 vs AB123" silent corruption).
      type Cand = { id: number; hno: string; ctrackingnumber: string; cimages: string | null };
      const exactMatches: Cand[] = [];
      for (const row of candidates) {
        const rebuilt = replaceTokenInCsvBag(
          row.ctrackingnumber ?? "",
          d.c_tracking_number_old,
          d.c_tracking_number_new,
        );
        if (rebuilt !== null) exactMatches.push(row);
      }
      if (exactMatches.length === 0) {
        return {
          ok: false,
          error: `เลข tracking "${d.c_tracking_number_old}" พบเป็น substring ในออเดอร์ แต่ไม่ตรงทั้ง token (อาจปนกับเลขอื่น เช่น "${d.c_tracking_number_old}3") — แก้ไขไม่ได้ ขอให้ตรวจซ้ำ`,
        };
      }

      // 3. UPDATE each matching tb_order row with the rebuilt bag.
      //    Legacy L793 keys on the FULL old bag string for safety;
      //    we mirror that by re-reading the bag inside the loop +
      //    using WHERE id=$id AND ctrackingnumber=$oldBag (catches
      //    a concurrent edit that already mutated the bag).
      let tbOrderRowsTouched = 0;
      let firstCImages: string | null = null;
      for (const row of exactMatches) {
        const oldBag = row.ctrackingnumber;
        const newBag = replaceTokenInCsvBag(
          oldBag,
          d.c_tracking_number_old,
          d.c_tracking_number_new,
        );
        if (newBag === null) continue;            // shouldn't happen — checked above
        if (firstCImages === null && row.cimages) firstCImages = row.cimages;

        const { error: rowUpdErr, count } = await admin
          .from("tb_order")
          .update({ ctrackingnumber: newBag }, { count: "exact" })
          .eq("id", row.id)
          .eq("hno", row.hno)
          .eq("ctrackingnumber", oldBag) as unknown as {
            error: { code?: string; message?: string } | null;
            count: number | null;
          };
        if (rowUpdErr) {
          console.error(`[tb_order ctrackingnumber update] failed`, {
            code: rowUpdErr.code, message: rowUpdErr.message, id: row.id,
          });
          // Surface immediately — partial state is worse than no-op.
          return {
            ok: false,
            error: `อัพเดท tb_order id=${row.id} ล้มเหลว (อาจมี edit ซ้อน): ${rowUpdErr.message}`,
          };
        }
        if (typeof count === "number") tbOrderRowsTouched += count;
        else tbOrderRowsTouched += 1;
      }

      if (tbOrderRowsTouched === 0) {
        return {
          ok: false,
          error: `tb_order 0 row โดน update — อาจมี admin อื่นแก้ไขแล้ว ขอให้ refresh + ลองใหม่`,
        };
      }

      // 4. Cascade into tb_forwarder. Legacy L797-808: SELECT fcover
      //    where ftrackingchn=$old; if fcover is empty AND we have a
      //    cimages, backfill fcover on the UPDATE. We do the SELECT
      //    first so we can audit the backfill decision (and not blindly
      //    overwrite a non-empty fcover with a stale cimages).
      const { data: fwdRows, error: fwdLookupErr } = await admin
        .from("tb_forwarder")
        .select("id, fcover")
        .eq("ftrackingchn", d.c_tracking_number_old) as unknown as {
          data: Array<{ id: number; fcover: string | null }> | null;
          error: { code?: string; message?: string } | null;
        };
      if (fwdLookupErr) {
        console.error(`[tb_forwarder lookup for cascade] failed`, {
          code: fwdLookupErr.code, message: fwdLookupErr.message,
        });
        // Partial state: tb_order is updated, tb_forwarder cascade
        // failed. Surface for ops — they need to fix manually.
        return {
          ok: false,
          error: `tb_order อัพเดท ${tbOrderRowsTouched} row สำเร็จ แต่ตรวจสอบ tb_forwarder ล้มเหลว — ขอให้ ops sync มือ: ${fwdLookupErr.message}`,
        };
      }

      let tbForwarderRowsTouched = 0;
      let fcoverBackfilled = false;
      if (fwdRows && fwdRows.length > 0) {
        // Decide if we should backfill fcover: legacy condition
        // (L805-806) is `fcover==''` + a cimages exists. We test
        // emptiness across the whole result set — if ANY row has empty
        // fcover we do the backfill UPDATE, else just rename.
        const hasEmptyFcover = fwdRows.some((r) => !r.fcover || r.fcover.trim() === "");
        const wantBackfill = hasEmptyFcover && !!firstCImages;

        if (wantBackfill && firstCImages) {
          // Two-step to mimic legacy: rename + conditional cover backfill.
          // Step 2a: rename ALL matching rows.
          const { error: renameErr, count: renameCount } = await admin
            .from("tb_forwarder")
            .update({ ftrackingchn: d.c_tracking_number_new }, { count: "exact" })
            .eq("ftrackingchn", d.c_tracking_number_old) as unknown as {
              error: { code?: string; message?: string } | null;
              count: number | null;
            };
          if (renameErr) {
            console.error(`[tb_forwarder ftrackingchn rename] failed`, {
              code: renameErr.code, message: renameErr.message,
            });
            return {
              ok: false,
              error: `tb_order อัพเดทแล้ว แต่ tb_forwarder rename ล้มเหลว: ${renameErr.message}`,
            };
          }
          if (typeof renameCount === "number") tbForwarderRowsTouched = renameCount;
          else tbForwarderRowsTouched = fwdRows.length;

          // Step 2b: backfill fcover ONLY on the rows that were empty.
          // We re-select by the NEW tracking + empty-fcover predicate
          // to scope the backfill correctly post-rename.
          const { error: backfillErr } = await admin
            .from("tb_forwarder")
            .update({ fcover: firstCImages })
            .eq("ftrackingchn", d.c_tracking_number_new)
            .or("fcover.is.null,fcover.eq.");
          if (backfillErr) {
            console.error(`[tb_forwarder fcover backfill] failed`, {
              code: backfillErr.code, message: backfillErr.message,
            });
            // Non-fatal — tracking is renamed, just cover failed.
            // Don't return error; log the partial state for ops.
            console.warn(
              `[tb_forwarder fcover backfill] tracking renamed OK but cover backfill failed — `
              + `manual fix: UPDATE tb_forwarder SET fcover=$cover WHERE ftrackingchn=$new AND (fcover IS NULL OR fcover='')`,
            );
          } else {
            fcoverBackfilled = true;
          }
        } else {
          // Plain rename, no backfill.
          const { error: renameErr, count: renameCount } = await admin
            .from("tb_forwarder")
            .update({ ftrackingchn: d.c_tracking_number_new }, { count: "exact" })
            .eq("ftrackingchn", d.c_tracking_number_old) as unknown as {
              error: { code?: string; message?: string } | null;
              count: number | null;
            };
          if (renameErr) {
            console.error(`[tb_forwarder ftrackingchn rename, no-backfill] failed`, {
              code: renameErr.code, message: renameErr.message,
            });
            return {
              ok: false,
              error: `tb_order อัพเดทแล้ว แต่ tb_forwarder rename ล้มเหลว: ${renameErr.message}`,
            };
          }
          if (typeof renameCount === "number") tbForwarderRowsTouched = renameCount;
          else tbForwarderRowsTouched = fwdRows.length;
        }
      }

      // 5. Stamp parent header's adminidupdate so reports reflect the
      //    admin who renamed (legacy doesn't do this on tracking edits
      //    but it's a strict-superset audit improvement — keep it).
      const nowIso = new Date().toISOString();
      const { error: hdrStampErr } = await admin
        .from("tb_header_order")
        .update({ hdateupdate: nowIso, adminidupdate: legacyAdminId })
        .eq("hno", d.h_no);
      if (hdrStampErr) {
        // Non-fatal — the data edits succeeded; only the audit stamp failed.
        console.error(`[tb_header_order audit-stamp] failed (non-fatal)`, {
          code: hdrStampErr.code, message: hdrStampErr.message,
        });
      }

      // 6. Audit log.
      await logAdminAction(
        adminId,
        "tb_order.update_ctracking",
        "tb_order",
        d.h_no,
        {
          hno:                       d.h_no,
          c_tracking_number_old:     d.c_tracking_number_old,
          c_tracking_number_new:     d.c_tracking_number_new,
          tb_order_rows_touched:     tbOrderRowsTouched,
          tb_forwarder_rows_touched: tbForwarderRowsTouched,
          fcover_backfilled:         fcoverBackfilled,
        },
      );

      // 7. Customer notify (Task #228 spawn brief — ONLY E3.17 notifies;
      //    legacy detail.php L800-810 also pings the customer when a
      //    tracking is fixed because the customer trusts that number for
      //    package tracking). Best-effort: profileId may be null if the
      //    customer hasn't activated their profile; we log + continue.
      try {
        const map = await resolveProfileIdsForLegacyUserids([header.userid]);
        const profileId = map.get(header.userid) ?? null;
        if (profileId) {
          await sendNotification(profileId, {
            category:       "order",
            severity:       "info",
            title:          `ฝากสั่ง ${d.h_no} — แก้ไขเลข Tracking จีน`,
            body:
              `แอดมินแก้เลข tracking ของออเดอร์ของคุณ\n` +
              `เดิม: ${d.c_tracking_number_old}\n` +
              `ใหม่: ${d.c_tracking_number_new}`,
            link_href:      `/service-order/${d.h_no}`,
            reference_type: "service_order",
            reference_id:   d.h_no,
          });
        } else {
          logger.warn("service-orders-line-edits", "ctracking notify — no profileId for userid", {
            userid: redactId(header.userid), hno: d.h_no,
          });
        }
      } catch (notifyErr) {
        logger.warn("service-orders-line-edits", "ctracking notify dispatch failed (non-fatal)", {
          hno: d.h_no,
          error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        });
      }

      revalidatePath("/admin/service-orders");
      revalidatePath(`/admin/service-orders/${d.h_no}`);
      revalidatePath("/admin/forwarders");
      return {
        ok: true,
        data: {
          hno:                       d.h_no,
          c_tracking_number_old:     d.c_tracking_number_old,
          c_tracking_number_new:     d.c_tracking_number_new,
          tb_order_rows_touched:     tbOrderRowsTouched,
          tb_forwarder_rows_touched: tbForwarderRowsTouched,
          fcover_backfilled:         fcoverBackfilled,
        },
      };
    },
  );
}

// ────────────────────────────────────────────────────────────
// 3. adminUpdateCartItemShippingNumber
//    Set the China shop order number `cshippingnumber` for every
//    tb_order row sharing the (hno, cnameshop) tuple.
//
//    Legacy: shops.php L1793-1805.
//    NOTE composite-key scope — affects ALL lines from the same shop
//    in this order (not per-line). A separate per-line writer exists
//    at shops.php L1075-1080 (bulk step-2 save loop) — if Pacred needs
//    per-line, build a sibling action `adminUpdateCartItemShippingNumberById`.
// ────────────────────────────────────────────────────────────

const updateShippingNumberSchema = z.object({
  h_no:                z.string().regex(/^P\d+$/, "hno ต้องเป็นรูปแบบ P{digits}").max(30),
  c_name_shop:         z.string().trim().min(1, "ระบุชื่อร้านจีน").max(300),
  c_shipping_number:   z.string().trim().max(500),     // empty allowed → clear
});
export type AdminUpdateCartItemShippingNumberInput = z.infer<typeof updateShippingNumberSchema>;

type UpdateShippingNumberData = {
  hno:                  string;
  c_name_shop:          string;
  c_shipping_number:    string;
  rows_touched:         number;
};

export async function adminUpdateCartItemShippingNumber(
  input: AdminUpdateCartItemShippingNumberInput,
): Promise<AdminActionResult<UpdateShippingNumberData>> {
  const parsed = updateShippingNumberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<UpdateShippingNumberData>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 10);

      // 0. Load header for status gate (Task #228 spawn brief E3.5 — must
      //    be post-Mark-Ordered 3/4/5). For status 3 the initial-save path
      //    is `adminMarkShopOrderOrdered`; this action is the typo-fix
      //    path so it's also valid at 4/5.
      const { data: header, error: headerErr } = await admin
        .from("tb_header_order")
        .select("id, hno, hstatus")
        .eq("hno", d.h_no)
        .maybeSingle<{ id: number; hno: string; hstatus: string | null }>();
      if (headerErr) {
        console.error(`[tb_header_order header lookup (cshipping)] failed`, {
          code: headerErr.code, message: headerErr.message,
        });
        return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
      }
      if (!header) return { ok: false, error: `ไม่พบใบฝากสั่งซื้อ ${d.h_no}` };
      const gate = lineEditStatusGate(header.hstatus);
      if (!gate.ok) return { ok: false, error: gate.error };

      // 1. Pre-read for audit (before/after delta + refund guard).
      const { data: before, error: beforeErr } = await admin
        .from("tb_order")
        .select("id, hno, cnameshop, cshippingnumber, crewallet")
        .eq("hno", d.h_no)
        .eq("cnameshop", d.c_name_shop) as unknown as {
          data: Array<{
            id: number;
            hno: string;
            cnameshop: string;
            cshippingnumber: string | null;
            crewallet: string | null;
          }> | null;
          error: { code?: string; message?: string } | null;
        };
      if (beforeErr) {
        console.error(`[tb_order shipping-number pre-read] failed`, {
          code: beforeErr.code, message: beforeErr.message,
        });
        return { ok: false, error: `db_error:${beforeErr.code ?? "unknown"}` };
      }
      if (!before || before.length === 0) {
        return {
          ok: false,
          error: `ไม่พบรายการของร้าน "${d.c_name_shop}" ในออเดอร์ ${d.h_no}`,
        };
      }

      // Skip rows already refunded (legacy update.php L98 disabled).
      const eligible = before.filter((r) => r.crewallet !== "1");
      if (eligible.length === 0) {
        return {
          ok: false,
          error: `รายการของร้าน "${d.c_name_shop}" ถูกคืนเงินทั้งหมดแล้ว — บันทึกเลขออเดอร์ไม่ได้`,
        };
      }

      // 2. Idempotency — no-op if every eligible row already has this value.
      const allMatch = eligible.every(
        (r) => (r.cshippingnumber ?? "") === d.c_shipping_number,
      );
      if (allMatch) {
        return {
          ok: true,
          data: {
            hno:                d.h_no,
            c_name_shop:        d.c_name_shop,
            c_shipping_number:  d.c_shipping_number,
            rows_touched:       0,
          },
        };
      }

      // 3. UPDATE — scoped on (hno, cnameshop) per legacy L1797. We also
      //    exclude refunded rows (crewallet != '1') — legacy doesn't,
      //    but refunded rows shouldn't carry a shop order number anyway.
      const { error: updErr, count } = await admin
        .from("tb_order")
        .update({ cshippingnumber: d.c_shipping_number }, { count: "exact" })
        .eq("hno", d.h_no)
        .eq("cnameshop", d.c_name_shop)
        .neq("crewallet", "1") as unknown as {
          error: { code?: string; message?: string } | null;
          count: number | null;
        };
      if (updErr) {
        console.error(`[tb_order cshippingnumber update] failed`, {
          code: updErr.code, message: updErr.message,
        });
        return {
          ok: false,
          error: `บันทึกเลขออเดอร์ร้านจีนล้มเหลว: ${updErr.message}`,
        };
      }
      const rowsTouched = typeof count === "number" ? count : eligible.length;

      // 4. Stamp parent header audit. Non-fatal on failure.
      const nowIso = new Date().toISOString();
      const { error: hdrStampErr } = await admin
        .from("tb_header_order")
        .update({ hdateupdate: nowIso, adminidupdate: legacyAdminId })
        .eq("hno", d.h_no);
      if (hdrStampErr) {
        console.error(`[tb_header_order audit-stamp (shipping)] failed (non-fatal)`, {
          code: hdrStampErr.code, message: hdrStampErr.message,
        });
      }

      // 5. Audit log.
      await logAdminAction(
        adminId,
        "tb_order.update_cshippingnumber",
        "tb_order",
        d.h_no,
        {
          hno:                d.h_no,
          c_name_shop:        d.c_name_shop,
          before_values:      before.map((r) => ({
            id:               r.id,
            cshippingnumber:  r.cshippingnumber ?? "",
            crewallet:        r.crewallet ?? "",
          })),
          after_value:        d.c_shipping_number,
          rows_touched:       rowsTouched,
        },
      );

      revalidatePath("/admin/service-orders");
      revalidatePath(`/admin/service-orders/${d.h_no}`);
      return {
        ok: true,
        data: {
          hno:                d.h_no,
          c_name_shop:        d.c_name_shop,
          c_shipping_number:  d.c_shipping_number,
          rows_touched:       rowsTouched,
        },
      };
    },
  );
}
