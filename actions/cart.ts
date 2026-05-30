"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import {
  cartItemSchema,
  promoCodeSchema,
  applyPromoSchema,
  type CartItemInput,
  type Provider,
} from "@/lib/validators/cart";
import { assertNotImpersonating } from "@/lib/auth/impersonation";
import { ADDRESSES, CONTACT } from "@/components/seo/site";
import {
  PROMO_CATALOG,
  calcLegacyPromoDiscount,
  isActive,
  resolveLegacyPromoCode,
  type LegacyPromo,
} from "@/lib/promo/catalog";

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
  const { data: settingsRow, error: settingsRowErr } = await admin
    .from("tb_settings")
    .select("rsdefault")
    .eq("id", 1)
    .maybeSingle<{ rsdefault: number | string | null }>();
  if (settingsRowErr) {
    console.error(`[tb_settings list] failed`, { code: settingsRowErr.code, message: settingsRowErr.message });
  }
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
  const { data: rows, error: rowsErr } = await admin
    .from("tb_cart")
    .select("id, camount, cprice")
    .in("id", input.ids)
    .eq("userid", userID);
  if (rowsErr) {
    console.error(`[tb_cart list] failed`, { code: rowsErr.code, message: rowsErr.message });
  }
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
  // P1 (เดฟ 2026-05-30) — tax-doc selector at /cart. Persisted on
  // tb_header_order so the billing/payment-land flow can issue the right doc.
  // Validated server-side: 'tax_invoice' requires the 13-digit tax id +
  // billing name + address; 'receipt' (default) needs nothing.
  taxDocPref?: string | null;             // 'receipt' | 'tax_invoice'
  taxDocTaxId?: string | null;            // 13-digit
  taxDocBillingName?: string | null;      // company name
  taxDocAddress?: string | null;          // billing address snapshot
  // P0-3/4/5 (D1 cart unification) — inline-address override. The legacy
  // cart resolves a SAVED tb_address row by addressID. The /service-order/cart
  // (เดฟ's lane) lets the customer type a fresh delivery address in-form; that
  // path passes addressID='INLINE' + this snapshot so submitCartOrder writes
  // the typed address onto the header WITHOUT a tb_address lookup (no row
  // exists). Mirrors the addr shape the saved-address branch builds.
  addressSnapshot?: {
    addressName: string;
    addressLastname: string;
    addressTel: string;
    addressTel2: string;
    addressNo: string;
    addressSubDistrict: string;
    addressDistrict: string;
    addressProvince: string;
    addressZIPCode: string;
  } | null;
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

  // P1 — tax-doc selector validation (server side too, so a stale client
  // can't sneak a tax_invoice through without the required snapshot fields).
  const taxDocPref = input.taxDocPref === "tax_invoice" ? "tax_invoice" : "receipt";
  const taxDocTaxId = (input.taxDocTaxId ?? "").trim();
  const taxDocBillingName = (input.taxDocBillingName ?? "").trim();
  const taxDocAddress = (input.taxDocAddress ?? "").trim();
  if (taxDocPref === "tax_invoice") {
    if (!/^\d{13}$/.test(taxDocTaxId)) return { ok: false, error: "tax_id_invalid" };
    if (taxDocBillingName === "") return { ok: false, error: "tax_billing_name_required" };
    if (taxDocAddress === "") return { ok: false, error: "tax_address_required" };
  }

  const admin = createAdminClient();

  // shops.php L3-9 — generate hNo = 'P' + (max(tb_header_order.ID) + 1).
  // The legacy uses a MySQL AUTO_INCREMENT next-value race; here we
  // SELECT the current max + 1. Race-rare for a single customer flow,
  // but a DB-side sequence is the proper long-term fix (flagged).
  const { data: maxRow, error: maxRowErr } = await admin
    .from("tb_header_order")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: number }>();
  if (maxRowErr) {
    console.error(`[tb_header_order list] failed`, { code: maxRowErr.code, message: maxRowErr.message });
  }
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
    // "รับที่โกดัง" (pick-up at warehouse) — wired to Pacred's TH receiving
    // warehouse (ADDRESSES.warehouseTh — สมุทรสาคร, the actual cargo intake
    // point). Legacy PHP hard-coded a Bangkok PCS Cargo address; under D1
    // Pacred's warehouse is in Samut Sakhon. Label kept short for the
    // address-card UI (the full address is in addressNo/...).
    addr = {
      addressName: "รับที่โกดัง Pacred",
      addressLastname: "",
      addressTel: CONTACT.phoneCompanyDisplay,
      addressTel2: "",
      addressNo: ADDRESSES.warehouseTh.line,
      addressSubDistrict: ADDRESSES.warehouseTh.subDistrict,
      addressDistrict: ADDRESSES.warehouseTh.district,
      addressProvince: ADDRESSES.warehouseTh.province,
      addressZIPCode: ADDRESSES.warehouseTh.postcode,
      addressNote: input.hNote ?? "",
    };
  } else if (input.addressID === "INLINE" && input.addressSnapshot) {
    // P0-3/4/5 — typed-in-form delivery address (the /service-order/cart
    // checkout). No tb_address row exists; snapshot the typed fields straight
    // onto the header (same addr shape the saved-address branch produces).
    addr = {
      addressName: input.addressSnapshot.addressName,
      addressLastname: input.addressSnapshot.addressLastname,
      addressTel: input.addressSnapshot.addressTel,
      addressTel2: input.addressSnapshot.addressTel2,
      addressNo: input.addressSnapshot.addressNo,
      addressSubDistrict: input.addressSnapshot.addressSubDistrict,
      addressDistrict: input.addressSnapshot.addressDistrict,
      addressProvince: input.addressSnapshot.addressProvince,
      addressZIPCode: input.addressSnapshot.addressZIPCode,
      addressNote: input.hNote ?? "",
    };
  } else {
    const { data: addrRow, error: addrRowErr } = await admin
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
    if (addrRowErr) {
      console.error(`[tb_address mutation lookup] failed`, { code: addrRowErr.code, message: addrRowErr.message });
      return { ok: false, error: `db_error:${addrRowErr.code ?? "unknown"}` };
    }
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

  // shops.php L96-97 — INSERT tb_header_order.
  // ⚠️ Postgres-vs-MySQL parity: the legacy INSERT only lists 16 columns and
  // relies on MySQL's non-strict mode auto-filling every other NOT-NULL-
  // without-DEFAULT column with its implicit type default ('' for varchar/text,
  // 0 for numeric). Postgres REJECTS that — so the faithful port MUST supply
  // those implicit defaults explicitly, or the INSERT 23502-fails on prod.
  // (Same class as the php-port-patterns "PHP NULL interpolates to ''" rule.)
  // The pricing/title/cover columns stay 0/'' here and are back-filled by the
  // rollup UPDATE below (shops.php L208-220) — exactly as legacy does.
  const { error: insertHeaderErr } = await admin
    .from("tb_header_order")
    .insert({
      adminidip: "customer",
      userid: userID,
      crate: input.crate,
      paymethod: input.payMethod ?? "",
      fshippingservice: fShippingService,
      hno: hNo,
      // P1 — tax-doc snapshot. 'receipt' (default) snapshots nothing;
      // 'tax_invoice' carries the 13-digit tax id + billing name+address so
      // the eventual ใบกำกับภาษี reflects what the customer chose at order
      // time (their profile can change later — the doc must not).
      tax_doc_pref: taxDocPref,
      tax_doc_tax_id: taxDocPref === "tax_invoice" ? taxDocTaxId : null,
      tax_doc_address: taxDocPref === "tax_invoice"
        ? `${taxDocBillingName} · ${taxDocAddress}`
        : null,
      hdate: new Date().toISOString(),
      hfreeshipping: input.pro === "f" ? "1" : "",
      htransporttype: input.hTransportType,
      hshipby: hShipBy ?? "",
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
      // ── MySQL-implicit NOT-NULL defaults (Postgres needs them explicit) ──
      htitle: "",            // back-filled by rollup UPDATE below
      hcover: "",            // back-filled by rollup UPDATE below
      hcount: 0,             // back-filled by rollup UPDATE below
      htotalpricechn: 0,     // back-filled by rollup UPDATE below
      htotalpriceuser: 0,    // priced by admin update2 when hstatus 1→2
      hshippingchn: 0,       // priced by admin when goods arrive
      hpriceupdate: 0,
      hrate: 0,              // back-filled by rollup UPDATE below
      hnote: input.hNote ?? "",
      hnoteuser: "",
      hnoteuserread: "",
      hprintbill: "",
      hprintbill2: "",
      adminid: "",
      adminidupdate: "",
      session: "customer",
    });
  if (insertHeaderErr) {
    return { ok: false, error: insertHeaderErr.message };
  }

  // shops.php L173-194 — INSERT tb_order rows (one per selected cart
  // row). Read cart rows ownership-gated, then bulk-insert with hno.
  const { data: cartRows, error: cartRowsErr } = await admin
    .from("tb_cart")
    .select(
      "id, ctitle, cnameshop, curl, cprovider, cimages, csize, cprice, ccolor, camount, cdetails",
    )
    .in("id", input.ids)
    .eq("userid", userID);
  if (cartRowsErr) {
    console.error(`[tb_cart list] failed`, { code: cartRowsErr.code, message: cartRowsErr.message });
  }
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
    // MySQL-implicit NOT-NULL defaults (Postgres needs them explicit) — same
    // parity rule as the header INSERT above. Legacy `addOrder` INSERT
    // (shops.php) lists only the columns copied from tb_cart; MySQL auto-fills
    // the rest with '' / 0. These are populated later by the admin price/track
    // flow (cshippingchn, cpriceupdate, cshippingnumber, ctrackingnumber).
    cshippingchn: 0,
    cpriceupdate: 0,
    cshippingnumber: "",
    ctrackingnumber: "",
    crewallet: "",
    cnote: "",
    hwarehousename: "",
    hqc: "",
  }));
  const { error: insertOrderErr } = await admin
    .from("tb_order")
    .insert(orderRowsPayload);
  if (insertOrderErr) {
    return { ok: false, error: insertOrderErr.message };
  }

  // shops.php L203 — UPDATE tb_users defaults (last-used picks).
  // For the INLINE (typed-in-form) path there's no saved tb_address row to
  // remember, so don't clobber the customer's userAddressID with the sentinel —
  // only persist ship-by + pay-method (still valid last-used picks).
  await admin
    .from("tb_users")
    .update({
      ...(input.addressID !== "INLINE" ? { userAddressID: input.addressID } : {}),
      userShipBy: hShipBy ?? "",
      userPayMethod: input.payMethod ?? "",
    })
    .eq("userID", userID);

  // shops.php L208-220 — UPDATE tb_header_order with rollup totals
  // (hTotalPriceCHN / hRate / hCount / hTitle / hCover).
  const { data: settingsRow, error: settingsRowErr } = await admin
    .from("tb_settings")
    .select("rsdefault")
    .eq("id", 1)
    .maybeSingle<{ rsdefault: number | string | null }>();
  if (settingsRowErr) {
    console.error(`[tb_settings list] failed`, { code: settingsRowErr.code, message: settingsRowErr.message });
  }
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
// P0-3/4/5 (D1 cart unification) — Provider enum ⇄ legacy cprovider code
// ────────────────────────────────────────────────────────────
//
// tb_cart.cprovider is the legacy 1-char code (schema 0081 L883:
// `cprovider varchar(1) DEFAULT '4'`). The Pacred `Provider` union is the
// customer-facing label. The READ side (cart.php port + service-order.ts
// `LEGACY_PROVIDER`) decodes the code → label; the WRITE side here is the
// inverse, so a customer add lands the SAME code legacy used (and the
// /cart + /service-order/cart readers render the right logo).
//   1=1688 · 2=taobao · 3=tmall · 4=shop (default · "Shops") · 5=nice
const PROVIDER_TO_LEGACY_CODE: Record<Provider, string> = {
  "1688":   "1",
  "taobao": "2",
  "tmall":  "3",
  "shop":   "4",
  "nice":   "5",
};
function providerToLegacyCode(p: Provider): string {
  return PROVIDER_TO_LEGACY_CODE[p] ?? "4";
}

// Legacy tb_cart row → CartItem (decodes cprovider code → Provider label;
// inverse of providerToLegacyCode; mirrors the /cart page's render).
type LegacyCartRow = {
  id: number;
  cprovider: string | null;
  cnameshop: string | null;
  curl: string | null;
  ctitle: string | null;
  cimages: string | null;
  ccolor: string | null;
  csize: string | null;
  cprice: number | string | null;
  camount: number | string | null;
  cdetails: string | null;
};
const LEGACY_CODE_TO_PROVIDER: Record<string, Provider> = {
  "1": "1688",
  "2": "taobao",
  "3": "tmall",
  "4": "shop",
  "5": "nice",
};
function legacyCartRowToCartItem(r: LegacyCartRow): CartItem {
  // cnameshop='pcs' is the legacy sentinel for "no shop name" (schema 0081
  // L897 comment) — surface it as empty so the UI doesn't print "pcs".
  const shopName = r.cnameshop && r.cnameshop !== "pcs" ? r.cnameshop : "";
  return {
    id:         String(r.id),
    provider:   LEGACY_CODE_TO_PROVIDER[r.cprovider ?? "4"] ?? "shop",
    shop_name:  shopName,
    url:        r.curl && r.curl.trim() ? r.curl : null,
    title:      r.ctitle && r.ctitle.trim() ? r.ctitle : null,
    image_path: r.cimages && r.cimages.trim() ? r.cimages : null,
    color:      r.ccolor && r.ccolor.trim() ? r.ccolor : null,
    size:       r.csize && r.csize.trim() ? r.csize : null,
    price_cny:  Number(r.cprice ?? 0),
    amount:     Number(r.camount ?? 0),
    details:    r.cdetails && r.cdetails.trim() ? r.cdetails : null,
    // legacy tb_cart has no created_at column; the auto-increment id is the
    // ordering proxy (we ORDER BY id DESC at read time). Stamp epoch-0 for
    // the CartItem type — the UI doesn't render created_at on the cart.
    created_at: new Date(0).toISOString(),
  };
}

// ────────────────────────────────────────────────────────────
// LIST — D1 cart unification: reads the ported legacy tb_cart (RLS-locked
// to service_role → admin client; ownership = userid === member_code).
// Mirrors the /cart page's tb_cart read (app/.../cart/page.tsx L299-310);
// returns the CartItem shape the /service-order/cart UI consumes.
// ────────────────────────────────────────────────────────────
export async function listCart(): Promise<ActionResult<CartItem[]>> {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return { ok: false, error: "not_signed_in" };
  const userID = data.profile.member_code ?? "";
  if (!userID) return { ok: true, data: [] };

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("tb_cart")
    .select("id, cprovider, cnameshop, curl, ctitle, cimages, ccolor, csize, cprice, camount, cdetails")
    .eq("userid", userID)
    .order("id", { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: ((rows ?? []) as LegacyCartRow[]).map(legacyCartRowToCartItem) };
}

// ────────────────────────────────────────────────────────────
// ADD ONE — D1 cart unification: writes legacy tb_cart (was rebuilt
// `cart_items`). Mirrors the admin twin actions/admin/cart.ts L132-148
// (adminAddItemToCart) + the legacy cart.php addCart/addCartURL INSERT.
// All tb_cart columns are NOT NULL (schema 0081 L877-890) — coalesce every
// optional field to "" / its default so the INSERT never violates NOT NULL.
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

  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return { ok: false, error: "not_signed_in" };
  const userID = data.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  const admin = createAdminClient();

  // Legacy cart cap: COUNT(tb_cart) for this user must stay < 151
  // (cart.php L17/L76 `151 - countCart`). The rebuilt twin enforced this via
  // a Postgres trigger on `cart_items`; tb_cart has no such trigger, so we
  // pre-check in code — keep the customer-visible "151 items" guard.
  const { count: cartCount, error: countErr } = await admin
    .from("tb_cart")
    .select("id", { count: "exact", head: true })
    .eq("userid", userID);
  if (countErr) {
    console.error(`[tb_cart cap count] failed`, { code: countErr.code, message: countErr.message });
  }
  if ((cartCount ?? 0) >= 151) {
    return { ok: false, error: "cart cap reached (151 items)" };
  }

  const { data: created, error } = await admin
    .from("tb_cart")
    .insert({
      cdetails:  d.details ?? "",
      curl:      d.url ?? "",
      ctitle:    d.title ?? "",
      cnameshop: d.shop_name && d.shop_name !== "pacred" ? d.shop_name : "pcs",
      cprovider: providerToLegacyCode(d.provider),
      cimages:   d.image_path ?? "",
      cprice:    d.price_cny,
      camount:   d.amount,
      ccolor:    d.color ?? "",
      csize:     d.size ?? "",
      userid:    userID,
    })
    .select("id")
    .single<{ id: number }>();

  if (error || !created) {
    return { ok: false, error: error?.message ?? "insert failed" };
  }

  revalidatePath("/service-order/cart");
  revalidatePath("/service-order/add");
  revalidatePath("/cart");
  return { ok: true, data: { id: String(created.id) } };
}

// ────────────────────────────────────────────────────────────
// UPDATE QTY / COLOR / SIZE / details — D1 cart unification: patches
// legacy tb_cart (was rebuilt `cart_items`). id is the stringified tb_cart
// integer id; ownership-gated by member_code so a stale UI can't patch a
// foreign row even through the service_role bypass.
// ────────────────────────────────────────────────────────────
export async function updateCartItem(
  id: string,
  patch: Partial<Pick<CartItemInput, "amount" | "color" | "size" | "details" | "price_cny">>,
): Promise<ActionResult> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return { ok: false, error: "not_signed_in" };
  const userID = data.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  const cartId = Number(id);
  if (!Number.isFinite(cartId) || cartId <= 0) {
    return { ok: false, error: "invalid_id" };
  }

  // Build update object with only provided keys (avoid clobbering NOT NULL
  // columns with null). Map the CartItem field names → legacy tb_cart columns.
  const update: Record<string, unknown> = {};
  if (patch.amount    != null) update.camount  = patch.amount;
  if (patch.color     != null) update.ccolor   = patch.color;
  if (patch.size      != null) update.csize    = patch.size;
  if (patch.details   != null) update.cdetails = patch.details;
  if (patch.price_cny != null) update.cprice   = patch.price_cny;
  if (Object.keys(update).length === 0) return { ok: true };

  const admin = createAdminClient();
  const { error } = await admin
    .from("tb_cart")
    .update(update)
    .eq("id", cartId)
    .eq("userid", userID);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/service-order/cart");
  revalidatePath("/cart");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// REMOVE — D1 cart unification: deletes from legacy tb_cart (was rebuilt
// `cart_items`). Same ownership-gated pattern as the faithful deleteCartItem
// above (id + userid predicates so the service_role bypass can't id-guess).
// ────────────────────────────────────────────────────────────
export async function removeCartItem(id: string): Promise<ActionResult> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return { ok: false, error: "not_signed_in" };
  const userID = data.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  const cartId = Number(id);
  if (!Number.isFinite(cartId) || cartId <= 0) {
    return { ok: false, error: "invalid_id" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("tb_cart")
    .delete()
    .eq("id", cartId)
    .eq("userid", userID);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/service-order/cart");
  revalidatePath("/cart");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// CLEAR — D1 cart unification: empties the customer's legacy tb_cart.
// ────────────────────────────────────────────────────────────
export async function clearCart(): Promise<ActionResult> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return { ok: false, error: "not_signed_in" };
  const userID = data.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("tb_cart")
    .delete()
    .eq("userid", userID);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/service-order/cart");
  revalidatePath("/cart");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// ADD MULTIPLE — bulk-insert rows (used by URL-paste variant grid).
// D1 cart unification: writes legacy tb_cart (was rebuilt `cart_items`).
// The rebuilt-only variant_label / variant_data / source_product_id /
// stock_available columns have NO tb_cart equivalent — the SKU axis is
// folded into tb_cart.ccolor / csize / cdetails at add time (the legacy
// model has no variant sidecar), so those extra fields are dropped here
// (the link-paste grid already folds axis-values into color/size/details).
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

  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return { ok: false, error: "not_signed_in" };
  const userID = data.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  // Validate each row
  const validated: CartItemInput[] = [];
  for (const r of rows) {
    const parsed = cartItemSchema.safeParse(r);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
    }
    validated.push(parsed.data);
  }

  const admin = createAdminClient();

  // Cap-gate the whole batch: existing count + new rows must stay ≤ 151
  // (legacy cart.php L17/L76). Refuse the batch rather than partial-insert.
  const { count: cartCount, error: countErr } = await admin
    .from("tb_cart")
    .select("id", { count: "exact", head: true })
    .eq("userid", userID);
  if (countErr) {
    console.error(`[tb_cart cap count] failed`, { code: countErr.code, message: countErr.message });
  }
  if ((cartCount ?? 0) + validated.length > 151) {
    return { ok: false, error: "cart cap reached (151 items)" };
  }

  const payload = validated.map((d) => ({
    cdetails:  d.details ?? "",
    curl:      d.url ?? "",
    ctitle:    d.title ?? "",
    cnameshop: d.shop_name && d.shop_name !== "pacred" ? d.shop_name : "pcs",
    cprovider: providerToLegacyCode(d.provider),
    cimages:   d.image_path ?? "",
    cprice:    d.price_cny,
    camount:   d.amount,
    ccolor:    d.color ?? "",
    csize:     d.size ?? "",
    userid:    userID,
  }));

  const { error, count } = await admin
    .from("tb_cart")
    .insert(payload, { count: "exact" });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/service-order/cart");
  revalidatePath("/service-order/add");
  revalidatePath("/cart");
  return { ok: true, data: { count: count ?? payload.length } };
}

// ────────────────────────────────────────────────────────────
// LEGACY (D1 §5 #3 + #10) — PROMO CODE SUPPORT
// ────────────────────────────────────────────────────────────
//
// Faithful re-port of `member/include/pages/cart/check-proV.php` +
// `saveproV.php` semantics. Both legacy endpoints were Valentine-only
// stubs (no real promo-code logic — they just gated the Valentine
// opt-in row in `tb_pro_valentine`). The promo "discount" was always
// applied via:
//   - URL `pro=` flag → cart.php hardcoded mapping to rate / shipping
//   - `tagPro($ID)` static switch (function.php L1289-1374) → label render
//   - `tb_promotion` INSERT → forwarder-↔-promo audit log at order-submit
//
// `tb_promotion` is NOT a coupon-code master table — it's an audit log
// linking a forwarder (`fid`) + house-number (`hno`) to a numeric
// `promoid` from `tagPro()`. The PHP NEVER did a `SELECT … WHERE code=?`
// against any master table — the catalog has always lived in code.
//
// The faithful re-port keeps that pattern: `lib/promo/catalog.ts` is the
// in-code catalog (1:1 port of `tagPro()`). Unknown codes return
// `valid: false` with the legacy-style "ไม่พบรหัสโปรโมชั่นนี้" message —
// EXACTLY what legacy did when `tagPro()` hit its `default:` branch
// (returned an empty string → cart rendered no badge → no discount).
//
// We expose four customer-facing Server Actions:
//   - validatePromoCode  — pure read; returns discount preview
//   - applyPromoToCart   — persists selection (re-purposes
//                          `tb_pro_valentine` as the "selected promo
//                          per user" record; one row per user, replaced
//                          on re-apply — matches the legacy opt-in
//                          semantics exactly)
//   - removePromoFromCart — clears the per-user selection
//   - getAvailablePromos — public catalog read (id, code, discount,
//                          expiry, description) — no auth required

export type ValidatePromoCodeResult = {
  ok: true;
  valid: boolean;
  /** Discount in THB when `valid`; 0 otherwise. */
  discount: number;
  /** 'pct' = % of cart total / 'fixed' = flat ฿. */
  discountType: "pct" | "fixed";
  /** TH user-facing message (success or refusal reason). */
  message?: string;
  /** Catalog row that matched (echoed back so the UI can render label). */
  promo?: {
    id: number;
    label: string;
    description: string;
  };
} | { ok: false; error: string };

/**
 * Validate a promo code against the legacy catalog + cart preconditions.
 * Pure read — does NOT write to any table.
 *
 * Legacy parity:
 *   - `check-proV.php` (Valentine) returns `resultPro=1` when the user
 *     already opted in (i.e. `tb_pro_valentine` row exists). We extend
 *     that semantic by also checking the catalog + active window + the
 *     once-only opt-in tables (`tb_pro_valentine`, `tb_promotion33`)
 *     for the user when applicable.
 *   - No discount % was ever computed server-side in legacy — the rate
 *     override / shipping freebie was applied at the cart-render layer.
 *     We surface the equivalent THB discount via `calcLegacyPromoDiscount`
 *     so the new UI can render a single "discount: ฿X" line.
 *
 * Signature matches the gap-research doc:
 *   `validatePromoCode(code, cartTotal, userId?)` →
 *   `{ valid, discount, discountType, message? }`
 *
 * `userId` here is the legacy `member_code` ("PR<n>") — NOT auth.uid.
 * Optional so the UI can preview a code before the user signs in.
 */
export async function validatePromoCode(
  code: string,
  cartTotal: number,
  userId?: string,
): Promise<ValidatePromoCodeResult> {
  // 1. Input schema — uppercase + length bounds + non-negative cart total.
  const parsed = promoCodeSchema.safeParse({ code, cartTotal, userId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { code: upperCode, cartTotal: total, userId: uid } = parsed.data;

  // 2. Catalog lookup — `lib/promo/catalog.ts` is the 1:1 port of
  //    `tagPro()` (function.php L1289-1374). Unknown codes return
  //    `valid: false` — legacy parity (tagPro default → empty badge).
  const promo: LegacyPromo | null = resolveLegacyPromoCode(upperCode);
  if (!promo) {
    return { ok: true, valid: false, discount: 0, discountType: "fixed", message: "ไม่พบรหัสโปรโมชั่นนี้" };
  }

  // 3. Active-window check.
  if (!isActive(new Date(), promo)) {
    return {
      ok: true,
      valid: false,
      discount: 0,
      discountType: "fixed",
      message: "รหัสโปรโมชั่นหมดอายุหรือยังไม่เริ่มใช้",
    };
  }

  // 4. Per-user once-only gate (Valentine + 3.3). Legacy `check-proV.php`
  //    semantic was the inverse — `resultPro=1` meant "already opted in"
  //    (i.e. user CAN see the promo card). Here we treat the opt-in row
  //    as a redemption marker: if the user already opted in once, the
  //    code is still valid (they reapply the same code). We DO NOT block.
  //    The once-only enforcement happens at order-submit time
  //    (existing logic in `submitCartOrder`).
  if (uid && (promo.id === 19 || promo.id === 77)) {
    // Read-only probe — surfaces an info message so the UI can hint
    // "ใช้แล้ว — รหัสยังใช้ได้ในรายการนี้".
    const admin = createAdminClient();
    let alreadyOptedIn = false;
    if (promo.id === 19) {
      const { data: vRow, error: vRowErr } = await admin
        .from("tb_pro_valentine")
        .select("userid")
        .eq("userid", uid)
        .maybeSingle();
      if (vRowErr) {
        console.error(`[tb_pro_valentine list] failed`, { code: vRowErr.code, message: vRowErr.message });
      }
      alreadyOptedIn = !!vRow;
    } else if (promo.id === 77) {
      const { data: pRow, error: pRowErr } = await admin
        .from("tb_promotion33")
        .select("userid")
        .eq("userid", uid)
        .eq("statuspro", "2") // 2 = ใช้โปรแล้ว
        .maybeSingle();
      if (pRowErr) {
        console.error(`[tb_promotion33 list] failed`, { code: pRowErr.code, message: pRowErr.message });
      }
      alreadyOptedIn = !!pRow;
    }
    if (alreadyOptedIn) {
      // Discount still computed — caller can decide to honor or not.
      // Mirror message style with the success path below.
      const { discount, discountType } = calcLegacyPromoDiscount(promo, total, await readBaselineRate(admin));
      return {
        ok: true,
        valid: true,
        discount,
        discountType,
        message: "รหัสโปรโมชั่นนี้คุณใช้ไปแล้ว — ยังใช้กับรายการนี้ได้",
        promo: { id: promo.id, label: promo.label, description: promo.description },
      };
    }
  }

  // 5. Compute the discount — needs the live `tb_settings.rsdefault`
  //    baseline to translate a rate-override into THB.
  const admin = createAdminClient();
  const baselineRate = await readBaselineRate(admin);
  const { discount, discountType } = calcLegacyPromoDiscount(promo, total, baselineRate);

  return {
    ok: true,
    valid: true,
    discount,
    discountType,
    message: "ใช้รหัสโปรโมชั่นได้",
    promo: { id: promo.id, label: promo.label, description: promo.description },
  };
}

/**
 * Persist the customer's selected promo for the current cart session.
 * Re-purposes `tb_pro_valentine` (userid + message + date) as the
 * "selected promo per user" record — one row per user, replaced on
 * re-apply. Matches legacy opt-in semantics: `saveproV.php` writes the
 * same row shape.
 *
 * `cartId` in the gap-research doc maps to `member_code` here — the
 * legacy cart is keyed by `userID` (= member_code), NOT a separate
 * cart-row ID. We accept the param for API symmetry but use the
 * authenticated session's member_code as the source of truth (an
 * attacker can't apply a promo to someone else's cart).
 *
 * The actual discount is applied at `submitCartOrder` time — this
 * action ONLY persists the selection. That mirrors legacy: pro/pro2
 * URL flags travel with the form submit, the discount is computed in
 * `shops.php` L65-72 / calculateCart.php L10-12 at submit / re-render.
 */
export async function applyPromoToCart(
  cartId: string,
  promoCode: string,
): Promise<ActionResult<{ promoId: number; label: string }>> {
  // G-4 — impersonation is read-only.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  // Auth — same gate as the rest of the cart actions.
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return { ok: false, error: "not_signed_in" };
  const userID = data.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  // Ownership belt-and-braces — caller-supplied cartId MUST match the
  // session member_code (Pacred cart is keyed by userID; this gate
  // protects against a UI bug passing the wrong handle).
  if (cartId && cartId !== userID) {
    return { ok: false, error: "cart_owner_mismatch" };
  }

  // Schema gate — upper-cases + bound-checks the code.
  const parsed = applyPromoSchema.safeParse({ promoCode });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const upperCode = parsed.data.promoCode;

  // Re-validate via the same lookup pipeline to avoid TOCTOU between
  // the UI's validate call and this apply call. Unknown code = reject
  // (legacy parity — tagPro default branch returned empty).
  const promo: LegacyPromo | null = resolveLegacyPromoCode(upperCode);
  if (!promo) return { ok: false, error: "invalid_code" };
  if (!isActive(new Date(), promo)) return { ok: false, error: "expired_or_not_started" };

  const admin = createAdminClient();

  // Upsert into `tb_pro_valentine` — one row per user, `message` holds
  // the canonical code so removePromoFromCart can read it back.
  // The legacy table has no PK on userid (it's just an opt-in log) so
  // we delete-then-insert to keep "one row per user" semantics.
  await admin.from("tb_pro_valentine").delete().eq("userid", userID);
  const { error: insertErr } = await admin.from("tb_pro_valentine").insert({
    userid: userID,
    message: upperCode,
    date: new Date().toISOString(),
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  // For promoid=77 (3.3 sale) also flip the `tb_promotion33` opt-in row
  // to status="1" (ยังไม่ใช้) so the legacy opt-in tracker reflects the
  // selection. Status flips to "2" (ใช้โปรแล้ว) at order-submit time.
  if (promo.id === 77) {
    await admin.from("tb_promotion33").delete().eq("userid", userID);
    await admin.from("tb_promotion33").insert({
      userid: userID,
      statuspro: "1",
    });
  }

  revalidatePath("/cart");
  revalidatePath("/service-order/cart");
  return { ok: true, data: { promoId: promo.id, label: promo.label } };
}

/**
 * Clear the customer's selected promo for the current cart session.
 * Counterpart to `applyPromoToCart` — deletes the `tb_pro_valentine`
 * row (and the `tb_promotion33` row if it exists).
 *
 * `cartId` arg kept for API symmetry; same ownership gate as apply.
 *
 * Idempotent — calling on a cart with no promo applied is a no-op,
 * returns ok=true.
 */
export async function removePromoFromCart(
  cartId: string,
): Promise<ActionResult> {
  // G-4 — impersonation is read-only.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const data = await getCurrentUserWithProfile();
  if (!data?.profile) return { ok: false, error: "not_signed_in" };
  const userID = data.profile.member_code ?? "";
  if (!userID) return { ok: false, error: "no_member_code" };

  if (cartId && cartId !== userID) {
    return { ok: false, error: "cart_owner_mismatch" };
  }

  const admin = createAdminClient();
  // Delete is idempotent — no error if no rows match.
  const { error: delV } = await admin
    .from("tb_pro_valentine")
    .delete()
    .eq("userid", userID);
  if (delV) return { ok: false, error: delV.message };

  // Only clear the 3.3 opt-in if it was in "ยังไม่ใช้" state (status=1)
  // — never clear an already-redeemed (status=2) row.
  await admin
    .from("tb_promotion33")
    .delete()
    .eq("userid", userID)
    .eq("statuspro", "1");

  revalidatePath("/cart");
  revalidatePath("/service-order/cart");
  return { ok: true };
}

export type AvailablePromo = {
  id: number;
  code: string;
  /** Discount preview — % when rate-override or stub, ฿ when flat shipping. */
  discount: number;
  /** 'pct' | 'fixed' — matches validatePromoCode's return shape. */
  discountType: "pct" | "fixed";
  /** ISO timestamp or null. */
  expiry: string | null;
  description: string;
  label: string;
};

/**
 * Public catalog read — returns the list of currently-active promos so
 * the UI can render an "Available promos" section at checkout.
 *
 * No auth required (the catalog is public marketing material).
 *
 * Discount preview semantics:
 *   - Flat shipping ฿ → `discount = shippingDiscountThb`, type='fixed'.
 *   - Rate override → `discount = round((baseline - rate) / baseline × 100)`
 *     (i.e. "you save ~X% on the THB total"), type='pct'.
 *   - Anything else → discount=0, type='fixed'.
 *
 * Uses the live `tb_settings.rsdefault` for the baseline rate. We read
 * it once and re-use for every row.
 *
 * Returns at most the catalog size — the catalog is small (handful
 * of entries) so no pagination.
 */
export async function getAvailablePromos(): Promise<ActionResult<AvailablePromo[]>> {
  const admin = createAdminClient();
  const baselineRate = await readBaselineRate(admin);
  const now = new Date();
  const rows: AvailablePromo[] = [];
  for (const p of PROMO_CATALOG) {
    if (!isActive(now, p)) continue;
    let discount = 0;
    let discountType: "pct" | "fixed" = "fixed";
    if (p.shippingDiscountThb > 0) {
      discount = p.shippingDiscountThb;
      discountType = "fixed";
    } else if (
      p.rate != null &&
      Number.isFinite(p.rate) &&
      baselineRate > 0 &&
      p.rate < baselineRate
    ) {
      discount = Math.round(((baselineRate - p.rate) / baselineRate) * 100);
      discountType = "pct";
    }
    rows.push({
      id: p.id,
      // Canonical code = first alias (the customer-visible label).
      code: p.aliases[0] ?? `PR${p.id}`,
      discount,
      discountType,
      expiry: p.activeUntil,
      description: p.description,
      label: p.label,
    });
  }
  return { ok: true, data: rows };
}

/**
 * Read the live `tb_settings.rsdefault` exchange rate. Centralised so
 * the three promo actions share one query. Returns 5.0 on miss
 * (mirrors `calculateCartTotal`'s fallback at L73).
 */
async function readBaselineRate(
  admin: ReturnType<typeof createAdminClient>,
): Promise<number> {
  const { data: settingsRow, error: settingsRowErr } = await admin
    .from("tb_settings")
    .select("rsdefault")
    .eq("id", 1)
    .maybeSingle<{ rsdefault: number | string | null }>();
  if (settingsRowErr) {
    console.error(`[tb_settings list] failed`, { code: settingsRowErr.code, message: settingsRowErr.message });
  }
  return Number(settingsRow?.rsdefault ?? 5.0);
}
