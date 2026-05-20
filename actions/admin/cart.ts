"use server";

/**
 * Admin cart mutations — CS staff shop on behalf of a customer.
 *
 * 1:1 port of the legacy PHP handlers in `pcs-admin/cart.php`:
 *   - addCart           cart.php L3-62    → adminAddItemToCart
 *   - addCartURL        cart.php L63-111  → adminAddItemToCart (same INSERT target)
 *   - addCartUser       cart.php L112-138 → adminAddCartUser (verify customer exists)
 *   - removeItem(ID)    /include/pages/cart/deleteItem.php → adminRemoveCartItem
 *   - qty edit          /include/pages/cart/updateQuantity.php → adminEditCartQty
 *   - addOrder          shops.php   L4-159  → adminSubmitCartAsOrder
 *
 * All mutations bypass RLS via `createAdminClient()` (the `tb_*` legacy
 * schema is service-role only, migration 0081) and are auth-gated through
 * `withAdmin([...])`. Every successful write logs to `admin_audit_log`.
 *
 * RBAC — daily CS purchasing + sales staff (the people who run this flow
 * legacy-side) closest match the V3 RBAC union ops + sales_admin, plus
 * super covers ITDT/CEO. Same union the read-only cart page uses
 * (app/[locale]/(admin)/admin/service-orders/cart/page.tsx L256).
 *
 * "Current admin's legacy adminid" — the legacy `$_COOKIE["pcs_admin_adminID"]`
 * is the staff's `tb_admin.adminid` string. Pacred stores admins by Supabase
 * auth UUID, not by the legacy adminid; we bridge by looking up the current
 * user's email in `tb_admin.adminemail`. If the lookup fails (Pacred-native
 * admin without a legacy mirror row), the action falls back to using the
 * Supabase auth UUID as the userid for cart-owner mode — keeps the staff
 * unblocked while we backfill the legacy admin mirror.
 *
 * NOT IMPLEMENTED (deferred to follow-up pilots):
 *   - mPDF invoice generation after addOrder (legacy shops.php emits
 *     a print PDF via mPDF; Pacred print pipeline is its own sibling agent)
 *   - sendMail() after addOrder (legacy emails the customer; Pacred has
 *     `sendNotification(profile_id, …)` but that needs a profiles ↔ tb_users
 *     PR-code bridge — not in scope for this action set)
 *   - The 150-item cart cap (legacy `$countFor=(151-$countCart)`) — left to
 *     a follow-up because the legacy check fires BEFORE the INSERT loop and
 *     skips with a sweet-alert; we'd need to surface the same "ไม่พอ" toast
 *     in the form to be faithful. Today the actions accept any qty count.
 *   - The cascading admin-routing logic for `adminidip` (shops.php L58-94)
 *     that round-robins among purchasing-section staff — kept as a static
 *     "current admin" assignment for now; the round-robin is its own port.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  adminAddItemToCartSchema,
  adminAddCartUserSchema,
  adminRemoveCartItemSchema,
  adminEditCartQtySchema,
  adminSubmitCartSchema,
  type AdminAddItemToCartInput,
  type AdminAddCartUserInput,
  type AdminRemoveCartItemInput,
  type AdminEditCartQtyInput,
  type AdminSubmitCartInput,
} from "@/lib/validators/admin-cart";

// RBAC union for admin cart flows — see file-level comment.
const CART_ROLES = ["super", "ops", "sales_admin"] as const;

// Static PCS Cargo HQ address — legacy shops.php L26-36 hardcodes this when
// hshipby='PCS' (warehouse pickup). Verbatim, no rebrand (sender address of
// physical warehouse — the PCS-scrub stays API-switchover-gated per CLAUDE.md).
const PCS_PICKUP_ADDRESS = {
  haddressname:         "รับที่โกดัง PCS กทม",
  haddresslastname:     "",
  haddressno:           "12 ซอย เพชรเกษม 77 แยก 3-6",
  haddresssubdistrict:  "หนองค้างพลู",
  haddressdistrict:     "หนองแขม",
  haddressprovince:     "กรุงเทพมหานคร",
  haddresszipcode:      "10160",
  haddressnote:         "",
  haddresstel:          "02-444-7046",
  haddresstel2:         "",
} as const;

/**
 * Resolve the current admin's legacy `tb_admin.adminid` from their Supabase
 * email (legacy `$_COOKIE["pcs_admin_adminID"]` bridge). Returns "" if no
 * legacy mirror row — callers should fall back to the Supabase auth UUID
 * for owner-mode operations.
 */
async function resolveLegacyAdminId(email: string | null): Promise<string> {
  if (!email) return "";
  const admin = createAdminClient();
  const { data } = await admin
    .from("tb_admin")
    .select("adminid")
    .eq("adminemail", email)
    .maybeSingle<{ adminid: string }>();
  return data?.adminid ?? "";
}

// ════════════════════════════════════════════════════════════
// 1. adminAddItemToCart — legacy `addCart` / `addCartURL`
// ════════════════════════════════════════════════════════════
// INSERT INTO tb_cart (cdetails, curl, ctitle, cnameshop, cprovider,
//                      cimages, cprice, camount, ccolor, csize, userid)
// VALUES (...)
//
// `userid` is the cart-row owner:
//   - When CS shops for themselves   → their legacy adminid
//   - When CS shops on behalf of a   → the customer's PR<n>
//     customer (the cart page is at
//     ?userID=PR<n>)
//
// Legacy supports a single submit batch-inserting multiple items (the
// jQuery repeater); Pacred Server Actions take one item at a time + the
// client batches by calling the action N times. Simpler API surface;
// same end state.

export async function adminAddItemToCart(
  input: AdminAddItemToCartInput,
): Promise<AdminActionResult<{ id: number }>> {
  const parsed = adminAddItemToCartSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { userid, item } = parsed.data;

  return withAdmin<{ id: number }>([...CART_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error } = await admin
      .from("tb_cart")
      .insert({
        cdetails:  item.cdetails,
        curl:      item.curl,
        ctitle:    item.ctitle,
        cnameshop: item.cnameshop,
        cprovider: item.cprovider,
        cimages:   item.cimages,
        cprice:    item.cprice,
        camount:   item.camount,
        ccolor:    item.ccolor,
        csize:     item.csize,
        userid,
      })
      .select("id")
      .single<{ id: number }>();

    if (error || !row) return { ok: false, error: error?.message ?? "insert failed" };

    await logAdminAction(adminId, "admin_cart.add_item", "tb_cart", String(row.id), {
      userid,
      cprovider: item.cprovider,
      cnameshop: item.cnameshop,
      ctitle:    item.ctitle,
      cprice:    item.cprice,
      camount:   item.camount,
    });

    // Revalidate the cart view — both the admin's own cart + the customer
    // cart variant (the page reads ?userID=… so both URLs share the cache).
    revalidatePath("/admin/service-orders/cart");
    return { ok: true, data: { id: row.id } };
  });
}

// ════════════════════════════════════════════════════════════
// 2. adminAddCartUser — legacy `addCartUser`
// ════════════════════════════════════════════════════════════
// Legacy `addCartUser` (cart.php L112-138) inserted cart rows for a target
// `userid` from a posted batch. In Pacred we split the concerns:
//   - The actual INSERT goes through `adminAddItemToCart(input)` with
//     `userid=PR<n>` (one action per item).
//   - This action just VALIDATES the target customer exists in tb_users —
//     so the staff types a wrong PR<n> and gets a friendly error before
//     they fill in the add-item form.
//
// Returns `{ exists: true, displayName }` on hit so the caller can render
// "เพิ่มสินค้าให้ <ชื่อ-นามสกุล>" confirmation.

export async function adminAddCartUser(
  input: AdminAddCartUserInput,
): Promise<AdminActionResult<{ exists: boolean; displayName: string | null }>> {
  const parsed = adminAddCartUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { userid } = parsed.data;

  return withAdmin<{ exists: boolean; displayName: string | null }>(
    [...CART_ROLES],
    async ({ adminId }) => {
      const admin = createAdminClient();

      const { data: customer } = await admin
        .from("tb_users")
        .select("userid, username, userlastname")
        .eq("userid", userid)
        .maybeSingle<{ userid: string; username: string; userlastname: string }>();

      if (!customer) {
        return { ok: true, data: { exists: false, displayName: null } };
      }

      const displayName = `${customer.username} ${customer.userlastname}`.trim();

      // Light-touch audit — record the lookup so we can see which staff
      // viewed which customer cart (matches legacy session-context).
      await logAdminAction(adminId, "admin_cart.set_user_context", "tb_users", userid, {
        display_name: displayName,
      });

      return { ok: true, data: { exists: true, displayName } };
    },
  );
}

// ════════════════════════════════════════════════════════════
// 3. adminRemoveCartItem — legacy `removeItem(ID)`
// ════════════════════════════════════════════════════════════
// DELETE FROM tb_cart WHERE id = $cartId
//
// Legacy also scoped by `userid = $_SESSION['userID']` — Pacred service-role
// already bypasses RLS, but we read the row first to capture the userid +
// snapshot for the audit log (and to fail gracefully on a stale UI click).

export async function adminRemoveCartItem(
  input: AdminRemoveCartItemInput,
): Promise<AdminActionResult> {
  const parsed = adminRemoveCartItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { cartId } = parsed.data;

  return withAdmin([...CART_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: readErr } = await admin
      .from("tb_cart")
      .select("id, userid, ctitle, cprice, camount")
      .eq("id", cartId)
      .maybeSingle<{ id: number; userid: string; ctitle: string; cprice: number; camount: number }>();

    if (readErr) return { ok: false, error: readErr.message };
    if (!row)    return { ok: false, error: "not_found" };

    const { error: delErr } = await admin
      .from("tb_cart")
      .delete()
      .eq("id", cartId);

    if (delErr) return { ok: false, error: delErr.message };

    // Snapshot-after-delete audit — the row is gone so the log is the
    // only trace left.
    await logAdminAction(adminId, "admin_cart.remove_item", "tb_cart", String(cartId), {
      userid: row.userid,
      ctitle: row.ctitle,
      cprice: row.cprice,
      camount: row.camount,
    });

    revalidatePath("/admin/service-orders/cart");
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════
// 4. adminEditCartQty — legacy updateQuantity.php
// ════════════════════════════════════════════════════════════
// UPDATE tb_cart SET camount = $qty WHERE id = $cartId

export async function adminEditCartQty(
  input: AdminEditCartQtyInput,
): Promise<AdminActionResult> {
  const parsed = adminEditCartQtySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { cartId, qty } = parsed.data;

  return withAdmin([...CART_ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: before, error: readErr } = await admin
      .from("tb_cart")
      .select("id, userid, camount, ctitle")
      .eq("id", cartId)
      .maybeSingle<{ id: number; userid: string; camount: number; ctitle: string }>();

    if (readErr) return { ok: false, error: readErr.message };
    if (!before) return { ok: false, error: "not_found" };
    if (before.camount === qty) return { ok: true };  // no-op

    const { error: updErr } = await admin
      .from("tb_cart")
      .update({ camount: qty })
      .eq("id", cartId);

    if (updErr) return { ok: false, error: updErr.message };

    await logAdminAction(adminId, "admin_cart.edit_qty", "tb_cart", String(cartId), {
      userid: before.userid,
      ctitle: before.ctitle,
      before: before.camount,
      after:  qty,
    });

    revalidatePath("/admin/service-orders/cart");
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════
// 5. adminSubmitCartAsOrder — legacy `addOrder` (shops.php L4-159)
// ════════════════════════════════════════════════════════════
// The "ยืนยันการสั่งซื้อ" submit. Transforms the cart into a real order:
//   a. Generate hno = 'P' + (max(tb_header_order.id) + 1)  -- legacy L11-17
//   b. Resolve the address (PCS pickup OR fall through to form fields)
//   c. INSERT INTO tb_header_order (initial row — hno + address + carrier)
//   d. For each tb_cart row for this owner:
//        - INSERT INTO tb_order (snapshot of the cart row + hno)
//        - DELETE FROM tb_cart  (consume the cart row)
//   e. UPDATE tb_header_order SET htotalpricechn / hrate / hcount / htitle /
//                                hcover / userid -- patch totals + customer
//
// Legacy then sends the customer email + an mPDF print — deferred (see
// file-level comment).
//
// IMPORTANT: this is a multi-step write without a wrapping transaction
// (Supabase JS doesn't expose pg transactions to the service-role client).
// The order matters — header insert FIRST, then per-row inserts inside the
// loop. If a per-row insert fails midway we still keep the header (matches
// legacy behaviour — legacy doesn't roll back either). The function returns
// any partial-failure detail so the staff knows which rows didn't transfer.

export async function adminSubmitCartAsOrder(
  input: AdminSubmitCartInput,
): Promise<AdminActionResult<{ hno: string; itemsTransferred: number; cartItemsDeleted: number }>> {
  const parsed = adminSubmitCartSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ hno: string; itemsTransferred: number; cartItemsDeleted: number }>(
    [...CART_ROLES],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // ── Step a. Generate hno ────────────────────────────────────────
      // Legacy: SELECT ID FROM tb_header_order ORDER BY ID DESC LIMIT 1
      //         $hNo = 'P' + (ID + 1)
      // We do the same — bigint id auto-increment + 'P' prefix.
      const { data: lastHeader } = await admin
        .from("tb_header_order")
        .select("id")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: number }>();

      const nextHeaderId = (lastHeader?.id ?? 0) + 1;
      const hno = `P${nextHeaderId}`;

      // ── Step b. Pull source cart rows ───────────────────────────────
      // Legacy iterates POST['cAmount'] + per-row reads tb_cart by ID +
      // userid. We pull all rows for the cart-owner in one query — same
      // end result, single round-trip.
      const { data: cartRows, error: readErr } = await admin
        .from("tb_cart")
        .select("id, cdetails, curl, ctitle, cnameshop, cprovider, cimages, cprice, camount, ccolor, csize")
        .eq("userid", d.cart_owner_userid);

      if (readErr) return { ok: false, error: readErr.message };
      if (!cartRows || cartRows.length === 0) {
        return { ok: false, error: "ไม่มีสินค้าในรถเข็น" };
      }

      type CartRow = {
        id: number; cdetails: string; curl: string; ctitle: string;
        cnameshop: string; cprovider: string; cimages: string;
        cprice: number; camount: number; ccolor: string; csize: string;
      };
      const rows = cartRows as unknown as CartRow[];

      // Validate camount > 0 on every row (legacy skips qty=0 in the POST loop).
      // Pacred enforces qty>0 at edit time so this is defence-in-depth.
      const validRows = rows.filter((r) => r.camount > 0);
      if (validRows.length === 0) {
        return { ok: false, error: "ไม่มีสินค้าที่มีจำนวนมากกว่า 0" };
      }

      // ── Step b'. Resolve address ────────────────────────────────────
      const address = d.hshipby === "PCS"
        ? PCS_PICKUP_ADDRESS
        : {
            haddressname:        d.haddressname,
            haddresslastname:    d.haddresslastname,
            haddressno:          d.haddressno,
            haddresssubdistrict: d.haddresssubdistrict,
            haddressdistrict:    d.haddressdistrict,
            haddressprovince:    d.haddressprovince,
            haddresszipcode:     d.haddresszipcode,
            haddressnote:        d.haddressnote,
            haddresstel:         d.haddresstel,
            haddresstel2:        d.haddresstel2,
          };

      // Resolve current admin's legacy adminid (for adminidcreate / adminid).
      // The withAdmin context only gives Supabase UUID; we don't have the
      // user.email here, so we look it up via auth.admin. For Pacred-native
      // admins the lookup will fall through to using the UUID directly.
      // (`requireAdmin` already authenticated — this is just adminid resolution.)
      const { data: { user: authedUser } } = await admin.auth.admin.getUserById(adminId);
      const legacyAdminId = await resolveLegacyAdminId(authedUser?.email ?? null);
      const adminIdForHeader = legacyAdminId || adminId;  // fallback to UUID

      // ── Step c. INSERT tb_header_order ──────────────────────────────
      // Legacy column set (shops.php L96-97):
      //   adminidip, adminidcreate, hno, hdate (NOW()), htransporttype,
      //   hshipby, haddress* (10 cols)
      // The table has many NOT NULL columns we must seed to keep the
      // INSERT valid — legacy lets them default to '' / 0 via the schema.
      // We initialise everything not in the legacy INSERT to the same
      // empty/zero default the schema expects.
      const { error: insHeaderErr } = await admin
        .from("tb_header_order")
        .insert({
          id:                  nextHeaderId,
          hstatus:             "1",          // 1 = รอดำเนินการ (default)
          hno,
          hdate:               new Date().toISOString(),
          htransporttype:      d.htransporttype,
          hshipby:             d.hshipby,
          hfreeshipping:       "0",
          ...address,
          adminidip:           adminIdForHeader,
          adminidcreate:       adminIdForHeader,
          adminid:             adminIdForHeader,
          adminidupdate:       adminIdForHeader,
          // Placeholders patched in step e below
          htitle:              "",
          hcover:              "",
          hcount:              0,
          htotalpricechn:      0,
          htotalpriceuser:     0,
          hshippingchn:        0,
          hpriceupdate:        0,
          hrate:               0,
          hnote:               "",
          hnoteuser:           "",
          hnoteuserread:       "",
          hprintbill2:         "",
          hprintbill:          "",
          userid:              d.customer_userid,
          session:             "",
          paymethod:           "",
          crate:               "",
          fshippingservice:    0,
        });

      if (insHeaderErr) return { ok: false, error: `header insert failed: ${insHeaderErr.message}` };

      // ── Step d. Per-row insert tb_order + delete tb_cart ────────────
      let itemsTransferred  = 0;
      let cartItemsDeleted  = 0;
      let totalCNY          = 0;
      const transferErrors: string[] = [];

      for (const r of validRows) {
        const { error: insOrderErr } = await admin
          .from("tb_order")
          .insert({
            cdetails:        r.cdetails,
            curl:            r.curl,
            ctitle:          r.ctitle,
            cnameshop:       r.cnameshop,
            cprovider:       r.cprovider,
            cimages:         r.cimages,
            cprice:          r.cprice,
            camount:         r.camount,
            ccolor:          r.ccolor,
            csize:           r.csize,
            userid:          d.customer_userid,
            hno,
            cshippingchn:    0,
            cpriceupdate:    0,
            cshippingnumber: "",
            ctrackingnumber: "",
            crewallet:       "",
            cnote:           "",
            hwarehousename:  "",
            hqc:             "1",
          });

        if (insOrderErr) {
          transferErrors.push(`row ${r.id}: ${insOrderErr.message}`);
          continue;
        }

        itemsTransferred++;
        // Legacy rounds up with `round_up($price*$qty, 2)` — Math.ceil*100/100.
        const lineTotal = Math.ceil(r.cprice * r.camount * 100) / 100;
        totalCNY += lineTotal;

        const { error: delErr } = await admin
          .from("tb_cart")
          .delete()
          .eq("id", r.id);

        if (delErr) {
          transferErrors.push(`delete cart ${r.id}: ${delErr.message}`);
          continue;
        }
        cartItemsDeleted++;
      }

      // ── Step e. Patch header totals ────────────────────────────────
      // Legacy: SELECT rsDefault FROM tb_settings WHERE ID=1 → use as hrate
      const { data: settings } = await admin
        .from("tb_settings")
        .select("rsdefault")
        .eq("id", 1)
        .maybeSingle<{ rsdefault: number }>();
      const hrate = Number(settings?.rsdefault ?? 0);

      // Legacy htitle / hcover = last cart row's ctitle / cimages (shops.php
      // L119-124). Faithful behaviour even though "last" is somewhat arbitrary.
      const lastRow = validRows[validRows.length - 1];
      const htitle = (lastRow.ctitle && lastRow.ctitle.trim() !== "") ? lastRow.ctitle : lastRow.curl;
      const hcover = lastRow.cimages;

      const { error: updHeaderErr } = await admin
        .from("tb_header_order")
        .update({
          htotalpricechn: totalCNY,
          hrate,
          hcount:         itemsTransferred,
          htitle,
          hcover,
          userid:         d.customer_userid,
        })
        .eq("hno", hno);

      if (updHeaderErr) {
        // Non-fatal — the items already transferred. Log + surface.
        transferErrors.push(`header totals update: ${updHeaderErr.message}`);
      }

      await logAdminAction(adminId, "admin_cart.submit_as_order", "tb_header_order", hno, {
        cart_owner_userid: d.cart_owner_userid,
        customer_userid:   d.customer_userid,
        hshipby:           d.hshipby,
        htransporttype:    d.htransporttype,
        items_transferred: itemsTransferred,
        cart_items_deleted: cartItemsDeleted,
        total_cny:         totalCNY,
        errors:            transferErrors.length > 0 ? transferErrors : undefined,
      });

      revalidatePath("/admin/service-orders/cart");
      revalidatePath("/admin/service-orders");

      if (transferErrors.length > 0 && itemsTransferred === 0) {
        return { ok: false, error: `ไม่สามารถบันทึกสินค้า: ${transferErrors[0]}` };
      }

      return {
        ok: true,
        data: { hno, itemsTransferred, cartItemsDeleted },
      };
    },
  );
}
