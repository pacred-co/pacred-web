"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { cartItemSchema, type CartItemInput, type Provider } from "@/lib/validators/cart";
import { assertNotImpersonating } from "@/lib/auth/impersonation";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// LEGACY (D1 / ADR-0017) — calculateCartTotal
// ────────────────────────────────────────────────────────────
//
// Faithful 1:1 transcription of the legacy AJAX endpoint
// `member/include/pages/cart/calculateCart.php` — called by
// `/cart` whenever the user toggles a row checkbox, "เลือกทั้งหมด",
// or the pro2 (3.3) promo. Reads the `tb_*` legacy schema; RLS is
// service_role-locked so reads go through the admin client, but
// `userid === profile.member_code` (the customer's "PR<n>" code)
// enforces ownership in code (mirrors the legacy
// `WHERE userID='$_SESSION[userID]'` predicate at calculateCart.php
// L16).
//
// Inputs:
//   - ids: the comma-separated `ID[]` checkbox values from the cart
//     form (calculateCart.php L13-15 — `$arrID=explode(",",$_POST['ID'])`)
//   - pro: optional pro2 value — when "19", legacy hardcodes
//     `$rsDefault=5.10` (calculateCart.php L10-12)
//
// Outputs (mirrors calculateCart.php L25-29 — `number_format($priceAll, 2)`
// formatted strings, NOT raw numbers):
//   - priceCny:  ¥ subtotal
//   - priceThb:  ฿ subtotal × rsDefault
//   - rate:      rsDefault (the exchange rate the row uses)
//   - count:     selected row count (legacy renders #countID separately
//                via client JS — bundling it server-side is cleaner +
//                avoids a second round-trip from the client)
export type CalculateCartTotalInput = {
  ids: string[];
  pro?: string;
};

export type CalculateCartTotalResult = {
  ok: true;
  priceCny: string;
  priceThb: string;
  rate: string;
  count: number;
} | { ok: false; error: string };

export async function calculateCartTotal(
  input: CalculateCartTotalInput,
): Promise<CalculateCartTotalResult> {
  // Auth — same gate the /cart page uses; no member_code = no read.
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return { ok: false, error: "not_signed_in" };
  const userID = data.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  // calculateCart.php L6-12 — SELECT rsDefault FROM tb_settings WHERE ID=1;
  //                            if pro==19 → 5.10 override.
  const admin = createAdminClient();
  const { data: settingsRow } = await admin
    .from("tb_settings")
    .select("rsdefault")
    .eq("id", 1)
    .maybeSingle<{ rsdefault: number | string | null }>();
  const baseRate = Number(settingsRow?.rsdefault ?? 5.0);
  const rsDefault = input.pro === "19" ? 5.10 : baseRate;

  // calculateCart.php L13-23 — when ID list empty, totals stay 0.00.
  // The legacy guard is `isset($_POST['ID']) && $_POST['ID']!=''` —
  // an empty selection skips the SQL fetch entirely. We mirror that:
  // empty ids → return zeros with the live rsDefault.
  if (input.ids.length === 0) {
    return {
      ok: true,
      priceCny: numberFormat2(0),
      priceThb: numberFormat2(0),
      rate: String(rsDefault),
      count: 0,
    };
  }

  // calculateCart.php L16 — SELECT ID, cAmount, cPrice FROM tb_cart
  //                          WHERE ID IN (selected) AND userID='$userID'
  // RLS on tb_cart is service_role-only; the legacy WHERE userID=…
  // clause is reproduced as a `.eq("userid", userID)` predicate so an
  // attacker that controls `ids` can NOT read rows they don't own.
  const { data: rows } = await admin
    .from("tb_cart")
    .select("id, camount, cprice")
    .in("id", input.ids)
    .eq("userid", userID);
  const priceAll = ((rows ?? []) as {
    camount: number | string | null;
    cprice: number | string | null;
  }[]).reduce(
    (sum, r) => sum + Number(r.camount ?? 0) * Number(r.cprice ?? 0),
    0,
  );

  // calculateCart.php L25-29 — number_format($n, 2) — 2-decimal,
  // comma-separated thousands. The PHP returns these as STRINGS, so
  // the legacy JS at cart.php L890-893 (`$('#cart-subtotal').html(data.price)`)
  // renders the formatted string verbatim. Stay 1:1.
  return {
    ok: true,
    priceCny: numberFormat2(priceAll),
    priceThb: numberFormat2(priceAll * rsDefault),
    rate: String(rsDefault),
    count: rows?.length ?? 0,
  };
}

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ────────────────────────────────────────────────────────────
// LEGACY (D1) — deleteCartItem
// ────────────────────────────────────────────────────────────
// 1:1 of member/include/pages/cart/deleteItem.php (24 lines).
// DELETE FROM tb_cart WHERE ID=$id AND userID=$_SESSION[userID].
// Ownership-gated by member_code so an attacker can't delete other
// customers' rows even via service_role. Image-unlink (legacy L15-17)
// is NOT reproduced — legacy 'images/shops/<file>' lives on the
// legacy disk; Pacred image storage is the Phase-A backfill (separate).
export async function deleteCartItem(input: { id: number }): Promise<ActionResult> {
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return { ok: false, error: "not_signed_in" };
  const userID = data.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };
  if (!Number.isFinite(input.id) || input.id <= 0) {
    return { ok: false, error: "invalid_id" };
  }
  const admin = createAdminClient();
  // Ownership-gated DELETE — both `id` AND `userid` predicates so the
  // service_role bypass of RLS doesn't open the row up to id-guessing.
  const { error } = await admin
    .from("tb_cart")
    .delete()
    .eq("id", input.id)
    .eq("userid", userID);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cart");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// LEGACY (D1) — updateCartItemQuantity
// ────────────────────────────────────────────────────────────
// 1:1 of member/include/pages/cart/updateQuantity.php (12 lines).
// UPDATE tb_cart SET cAmount=$qty WHERE ID=$id AND userID=$userID.
// Ownership-gated by member_code. The legacy doesn't clamp; we floor
// to ≥1 (the cart UI's number input already enforces min=1).
export async function updateCartItemQuantity(input: {
  id: number;
  quantity: number;
}): Promise<ActionResult> {
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return { ok: false, error: "not_signed_in" };
  const userID = data.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };
  if (!Number.isFinite(input.id) || input.id <= 0) {
    return { ok: false, error: "invalid_id" };
  }
  const qty = Math.max(1, Math.floor(Number(input.quantity) || 0));
  const admin = createAdminClient();
  const { error } = await admin
    .from("tb_cart")
    .update({ camount: qty })
    .eq("id", input.id)
    .eq("userid", userID);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cart");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// LEGACY (D1) — submitCartOrder ("สั่งซื้อสินค้า")
// ────────────────────────────────────────────────────────────
// 1:1 of shops.php L7-238 — the `addOrder` POST handler that takes
// selected tb_cart rows + the cart-page form fields and creates an
// order: INSERT tb_header_order + INSERT tb_order (one per cart row) +
// DELETE the selected tb_cart rows + UPDATE tb_users defaults.
//
// FLAGGED — what the legacy does at render time but we don't here:
//   · LINE Notify push (shops.php L223-228) — separate Server Action
//   · saveHS visit-log INSERT — render-time write, NOT reproduced
//   · adminIDIP capture from $_SERVER — we read from headers
//
// PCS warehouse address (when hShipBy='PCS') = the Pacred Nong Khaem
// warehouse, copied verbatim from shops.php L82-91 (same physical
// address; rebrand the company-name string only).
export async function submitCartOrder(input: {
  ids: number[];                          // selected tb_cart row IDs
  hTransportType: string;                 // 1=land / 2=sea / 3=air etc.
  crate: string;                          // 1=ตี / 0=ไม่ตี
  addressID: string;                      // tb_address.addressID or 'PCS' (self-pickup)
  hShipBy?: string | null;                // forwarder picker (custom shipper) — null when PCS
  payMethod?: string | null;              // payment-method picker
  pro?: string | null;                    // 'f' = PCSF promo (+50฿ shipping)
  pro2?: string | null;                   // '77' = 3.3 date-window promo
  hNote?: string | null;                  // free-text note
}): Promise<ActionResult<{ hNo: string }>> {
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return { ok: false, error: "not_signed_in" };
  const userID = data.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  if (!Array.isArray(input.ids) || input.ids.length === 0) {
    return { ok: false, error: "no_items_selected" };
  }
  if (!input.hTransportType || !input.crate || !input.addressID) {
    return { ok: false, error: "missing_required_fields" };
  }
  const admin = createAdminClient();

  // shops.php L3-9 — generate hNo = 'P' + (max(tb_header_order.ID) + 1).
  // The legacy uses a MySQL AUTO_INCREMENT next-value race; here we
  // SELECT the current max + 1. Race-rare for a single customer flow,
  // but a DB-side sequence is the proper long-term fix (flagged).
  const { data: maxRow } = await admin
    .from("tb_header_order")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: number }>();
  const nextID = (Number(maxRow?.id ?? 0) || 0) + 1;
  const hNo = "P" + nextID;

  // shops.php L17-42 — resolve hShipBy: pro='f' → PCSF (+50฿ ship),
  // addressID='PCS' → PCS (self-pickup), else use the customer's pick.
  let fShippingService = 0;
  let hShipBy: string | null = null;
  if (input.pro === "f") {
    fShippingService = 50;
    hShipBy = "PCSF";
  } else if (input.addressID === "PCS") {
    hShipBy = "PCS";
  } else {
    hShipBy = input.hShipBy ?? null;
  }
  if (input.addressID === "PCS") hShipBy = "PCS"; // shops.php L40-42 belt-and-braces

  // shops.php L65-72 — pro2='77' date-window promo → INSERT tb_promotion.
  // The window in legacy is 2026-03-04 → 2026-03-06; reproduce verbatim.
  if (input.pro2 === "77") {
    const now = new Date();
    const open = new Date("2026-03-04T00:00:01");
    const close = new Date("2026-03-06T23:59:59");
    if (now >= open && now <= close) {
      await admin.from("tb_promotion").insert({
        date: now.toISOString(),
        promoid: "77",
        fid: "",
        hno: hNo,
      });
    }
  }

  // shops.php L75-103 — resolve the shipping address. hShipBy='PCS' →
  // hardcoded Pacred warehouse address; else SELECT from tb_address
  // (ownership-gated).
  let addr = {
    addressName: "" as string,
    addressLastname: "" as string,
    addressTel: "" as string,
    addressTel2: "" as string,
    addressNo: "" as string,
    addressSubDistrict: "" as string,
    addressDistrict: "" as string,
    addressProvince: "" as string,
    addressZIPCode: "" as string,
    addressNote: input.hNote ?? "",
  };
  if (hShipBy === "PCS") {
    addr = {
      addressName: "รับที่โกดัง PR กทม",
      addressLastname: "",
      addressTel: "02-444-704",
      addressTel2: "",
      addressNo: "12 ซอย เพชรเกษม 77 แยก 3-6",
      addressSubDistrict: "หนองค้างพลู",
      addressDistrict: "หนองแขม",
      addressProvince: "กรุงเทพมหานคร",
      addressZIPCode: "10160",
      addressNote: input.hNote ?? "",
    };
  } else {
    const { data: addrRow } = await admin
      .from("tb_address")
      .select(
        "addressname, addresslastname, addresstel, addresstel2, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addressnote",
      )
      .eq("addressid", input.addressID)
      .eq("userid", userID)
      .eq("addressstatus", "1")
      .maybeSingle<{
        addressname: string | null;
        addresslastname: string | null;
        addresstel: string | null;
        addresstel2: string | null;
        addressno: string | null;
        addresssubdistrict: string | null;
        addressdistrict: string | null;
        addressprovince: string | null;
        addresszipcode: string | null;
        addressnote: string | null;
      }>();
    if (!addrRow) return { ok: false, error: "address_not_found" };
    addr = {
      addressName: addrRow.addressname ?? "",
      addressLastname: addrRow.addresslastname ?? "",
      addressTel: addrRow.addresstel ?? "",
      addressTel2: addrRow.addresstel2 ?? "",
      addressNo: addrRow.addressno ?? "",
      addressSubDistrict: addrRow.addresssubdistrict ?? "",
      addressDistrict: addrRow.addressdistrict ?? "",
      addressProvince: addrRow.addressprovince ?? "",
      addressZIPCode: addrRow.addresszipcode ?? "",
      addressNote: input.hNote ?? addrRow.addressnote ?? "",
    };
  }

  // shops.php L160-166 — INSERT tb_header_order.
  const { error: insertHeaderErr } = await admin
    .from("tb_header_order")
    .insert({
      adminidip: "customer",
      userid: userID,
      crate: input.crate,
      paymethod: input.payMethod ?? null,
      fshippingservice: fShippingService,
      hno: hNo,
      hdate: new Date().toISOString(),
      hfreeshipping: input.pro === "f" ? "1" : null,
      htransporttype: input.hTransportType,
      hshipby: hShipBy,
      haddressname: addr.addressName,
      haddresslastname: addr.addressLastname,
      haddressno: addr.addressNo,
      haddresssubdistrict: addr.addressSubDistrict,
      haddressdistrict: addr.addressDistrict,
      haddressprovince: addr.addressProvince,
      haddresszipcode: addr.addressZIPCode,
      haddressnote: addr.addressNote,
      haddresstel: addr.addressTel,
      haddresstel2: addr.addressTel2,
      hstatus: "1",
    });
  if (insertHeaderErr) {
    return { ok: false, error: insertHeaderErr.message };
  }

  // shops.php L173-194 — INSERT tb_order rows (one per selected cart
  // row). Read cart rows ownership-gated, then bulk-insert with hno.
  const { data: cartRows } = await admin
    .from("tb_cart")
    .select(
      "id, ctitle, cnameshop, curl, cprovider, cimages, csize, cprice, ccolor, camount, cdetails",
    )
    .in("id", input.ids)
    .eq("userid", userID);
  if (!cartRows || cartRows.length === 0) {
    return { ok: false, error: "cart_rows_not_found" };
  }
  const orderRowsPayload = (cartRows as Array<{
    id: number;
    ctitle: string | null;
    cnameshop: string | null;
    curl: string | null;
    cprovider: string | null;
    cimages: string | null;
    csize: string | null;
    cprice: number | string | null;
    ccolor: string | null;
    camount: number | string | null;
    cdetails: string | null;
  }>).map((r) => ({
    ctitle: r.ctitle ?? "",
    cnameshop: r.cnameshop ?? "",
    curl: r.curl ?? "",
    cprovider: r.cprovider ?? "",
    cimages: r.cimages ?? "",
    csize: r.csize ?? "",
    cprice: Number(r.cprice ?? 0),
    ccolor: r.ccolor ?? "",
    camount: Number(r.camount ?? 0),
    cdetails: r.cdetails ?? "",
    userid: userID,
    hno: hNo,
  }));
  const { error: insertOrderErr } = await admin
    .from("tb_order")
    .insert(orderRowsPayload);
  if (insertOrderErr) {
    return { ok: false, error: insertOrderErr.message };
  }

  // shops.php L203 — UPDATE tb_users defaults (last-used picks).
  await admin
    .from("tb_users")
    .update({
      useraddressid: input.addressID,
      usershipby: hShipBy ?? "",
      userpaymethod: input.payMethod ?? "",
    })
    .eq("userid", userID);

  // shops.php L208-220 — UPDATE tb_header_order with rollup totals
  // (hTotalPriceCHN / hRate / hCount / hTitle / hCover).
  const { data: settingsRow } = await admin
    .from("tb_settings")
    .select("rsdefault")
    .eq("id", 1)
    .maybeSingle<{ rsdefault: number | string | null }>();
  const rsDefault = Number(settingsRow?.rsdefault ?? 5.0);
  const sumTotalCHN = orderRowsPayload.reduce(
    (s, r) => s + r.cprice * r.camount,
    0,
  );
  const hTitle = orderRowsPayload[0].ctitle || "";
  const hCover = orderRowsPayload[0].cimages || "";
  await admin
    .from("tb_header_order")
    .update({
      htotalpricechn: sumTotalCHN,
      hrate: rsDefault,
      hcount: orderRowsPayload.length,
      htitle: hTitle,
      hcover: hCover,
    })
    .eq("hno", hNo);

  // shops.php L231 — DELETE selected tb_cart rows (ownership-gated).
  await admin
    .from("tb_cart")
    .delete()
    .in("id", input.ids)
    .eq("userid", userID);

  revalidatePath("/cart");
  revalidatePath("/service-order");
  return { ok: true, data: { hNo } };
}

export type CartItem = {
  id: string;
  provider:   Provider;
  shop_name:  string;
  url:        string | null;
  title:      string | null;
  image_path: string | null;
  color:      string | null;
  size:       string | null;
  price_cny:  number;
  amount:     number;
  details:    string | null;
  created_at: string;
};

// ────────────────────────────────────────────────────────────
// LIST
// ────────────────────────────────────────────────────────────
export async function listCart(): Promise<ActionResult<CartItem[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data, error } = await supabase
    .from("cart_items")
    .select("id, provider, shop_name, url, title, image_path, color, size, price_cny, amount, details, created_at")
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as CartItem[] };
}

// ────────────────────────────────────────────────────────────
// ADD ONE
// ────────────────────────────────────────────────────────────
export async function addCartItem(
  input: CartItemInput,
): Promise<ActionResult<{ id: string }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = cartItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data: created, error } = await supabase
    .from("cart_items")
    .insert({
      profile_id: user.id,
      provider:   d.provider,
      shop_name:  d.shop_name,
      url:        d.url ?? null,
      title:      d.title ?? null,
      image_path: d.image_path ?? null,
      color:      d.color ?? null,
      size:       d.size ?? null,
      price_cny:  d.price_cny,
      amount:     d.amount,
      details:    d.details ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // 151-cap trigger raises "cart cap reached (151 items)"
    return { ok: false, error: error.message };
  }

  revalidatePath("/service-order/cart");
  revalidatePath("/service-order/add");
  return { ok: true, data: { id: created.id } };
}

// ────────────────────────────────────────────────────────────
// UPDATE QTY / COLOR / SIZE / details
// ────────────────────────────────────────────────────────────
export async function updateCartItem(
  id: string,
  patch: Partial<Pick<CartItemInput, "amount" | "color" | "size" | "details" | "price_cny">>,
): Promise<ActionResult> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Build update object with only provided keys (avoid clobbering with null)
  const update: Record<string, unknown> = {};
  if (patch.amount    != null) update.amount    = patch.amount;
  if (patch.color     != null) update.color     = patch.color;
  if (patch.size      != null) update.size      = patch.size;
  if (patch.details   != null) update.details   = patch.details;
  if (patch.price_cny != null) update.price_cny = patch.price_cny;

  const { error } = await supabase.from("cart_items").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/service-order/cart");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// REMOVE
// ────────────────────────────────────────────────────────────
export async function removeCartItem(id: string): Promise<ActionResult> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { error } = await supabase.from("cart_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/service-order/cart");
  return { ok: true };
}

export async function clearCart(): Promise<ActionResult> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { error } = await supabase
    .from("cart_items")
    .delete()
    .eq("profile_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/service-order/cart");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// ADD MULTIPLE — bulk-insert rows (used by URL-paste variant grid)
// ────────────────────────────────────────────────────────────
export type CartItemBulkRow = CartItemInput & {
  variant_label?: string;
  variant_data?:  Record<string, string>;
  source_product_id?: string;
  stock_available?: number;
};

export async function addCartItemsBulk(rows: CartItemBulkRow[]): Promise<ActionResult<{ count: number }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "empty_rows" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Validate each row
  const validated: Array<CartItemBulkRow & { _ok: true }> = [];
  for (const r of rows) {
    const parsed = cartItemSchema.safeParse(r);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
    }
    validated.push({ ...parsed.data, variant_label: r.variant_label, variant_data: r.variant_data, source_product_id: r.source_product_id, stock_available: r.stock_available, _ok: true });
  }

  const payload = validated.map((d) => ({
    profile_id:        user.id,
    provider:          d.provider,
    shop_name:         d.shop_name,
    url:               d.url ?? null,
    title:             d.title ?? null,
    image_path:        d.image_path ?? null,
    color:             d.color ?? null,
    size:              d.size ?? null,
    price_cny:         d.price_cny,
    amount:            d.amount,
    details:           d.details ?? null,
    variant_label:     d.variant_label ?? null,
    variant_data:      d.variant_data ?? null,
    source_product_id: d.source_product_id ?? null,
    stock_available:   d.stock_available ?? null,
  }));

  const { error, count } = await supabase
    .from("cart_items")
    .insert(payload, { count: "exact" });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/service-order/cart");
  revalidatePath("/service-order/add");
  return { ok: true, data: { count: count ?? payload.length } };
}
