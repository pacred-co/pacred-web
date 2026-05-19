"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOwnedProfileId } from "@/lib/auth/owned-write";
import { placeOrderSchema, type PlaceOrderInput, type Provider } from "@/lib/validators/cart";
import { isFreeShippingZip } from "@/lib/bkk-zip";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import { getWalletAvailableBalance } from "@/lib/wallet/balance";
import { assertNotImpersonating } from "@/lib/auth/impersonation";
import { type LegacyOrderCode } from "@/lib/legacy-status-map";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Customer shop-order status — the legacy PCS `tb_header_order.hstatus`
 * single-char code ('1'-'6'). D1 Phase-B Wave 2 (B-0/B-2): the customer
 * order-flow reads the ported `tb_*` schema directly, so the status flows
 * through the UI as the legacy code; render Thai via `legacyOrderStatusThai`.
 */
export type OrderStatus = LegacyOrderCode;

export type ServiceOrderSummary = {
  id: string;
  h_no: string | null;
  status: OrderStatus;
  title: string | null;
  cover_image_path: string | null;
  item_count: number;
  warehouse_china: "guangzhou" | "yiwu" | null;
  transport_type: string;
  ship_by: string | null;
  yuan_rate_locked: number | null;
  subtotal_cny: number;
  total_thb: number;
  payment_due_at: string | null;
  date_completed: string | null;
  created_at: string;
};

export type ServiceOrderDetail = ServiceOrderSummary & {
  pay_method: "origin" | "destination";
  free_shipping: boolean;
  crate: boolean;
  service_fee: number;
  domestic_china_cny: number;
  ship_first_name: string | null;
  ship_last_name: string | null;
  ship_phone: string | null;
  ship_phone2: string | null;
  ship_address_line: string | null;
  ship_sub_district: string | null;
  ship_district: string | null;
  ship_province: string | null;
  ship_postal_code: string | null;
  ship_note: string | null;
  note_user: string | null;
  acknowledged_at:   string | null;            // U4-3a
  acknowledged_note: string | null;            // U4-3a
  items: Array<{
    id: string;
    provider: Provider;
    shop_name: string;
    title: string | null;
    url: string | null;
    image_path: string | null;
    color: string | null;
    size: string | null;
    price_cny: number;
    amount: number;
    details: string | null;
    tracking_number: string | null;
  }>;
};

// ── Legacy tb_header_order row shape (the columns the customer list needs) ──
type LegacyHeaderRow = {
  id: number;
  hno: string | null;
  hstatus: string;
  htitle: string | null;
  hcover: string | null;
  hcount: number | null;
  hwarehousechina: string | null;
  htransporttype: string | null;
  hshipby: string | null;
  hrate: number | null;
  htotalpriceuser: number | null;
  htotalpricechn: number | null;
  hdatepayment: string | null;
  hdate5: string | null;
  hdate: string | null;
};

const LEGACY_HEADER_COLS =
  "id, hno, hstatus, htitle, hcover, hcount, hwarehousechina, htransporttype, hshipby, hrate, htotalpriceuser, htotalpricechn, hdatepayment, hdate5, hdate";

/** tb_header_order.hwarehousechina: '1'=อี้อู, '2'=กวางโจว (legacy comment). */
function legacyWarehouseToCity(code: string | null): "guangzhou" | "yiwu" | null {
  if (code === "1") return "yiwu";
  if (code === "2") return "guangzhou";
  return null;
}

/** Map a legacy tb_header_order row → the ServiceOrderSummary shape the UI consumes. */
function headerRowToSummary(r: LegacyHeaderRow): ServiceOrderSummary {
  return {
    id: String(r.id),
    h_no: r.hno,
    status: (r.hstatus as OrderStatus) ?? "1",
    title: r.htitle,
    cover_image_path: r.hcover && r.hcover.trim() ? r.hcover : null,
    item_count: Number(r.hcount ?? 0),
    warehouse_china: legacyWarehouseToCity(r.hwarehousechina),
    transport_type: r.htransporttype ?? "",
    ship_by: r.hshipby && r.hshipby.trim() ? r.hshipby : null,
    yuan_rate_locked: r.hrate != null ? Number(r.hrate) : null,
    subtotal_cny: 0, // legacy stores THB totals on the header, not a CNY subtotal
    total_thb: Number(r.htotalpriceuser ?? 0),
    payment_due_at: r.hdatepayment,
    date_completed: r.hdate5,
    created_at: r.hdate ?? new Date(0).toISOString(),
  };
}

// ────────────────────────────────────────────────────────────
// LIST — D1 Phase-B Wave 2 (B-0): reads the ported legacy PCS schema
// (tb_header_order). tb_* is RLS-locked to service_role, so the read goes
// through the admin client; the join key is tb_header_order.userid ===
// profile.member_code. Ownership is enforced by that member_code filter
// (a logged-in customer can only ever query their own PR<n> rows).
// ────────────────────────────────────────────────────────────
export async function listServiceOrders(opts?: {
  status?: OrderStatus[];
  limit?: number;
}): Promise<ActionResult<ServiceOrderSummary[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Resolve the customer's legacy member code (the tb_* join key).
  const { data: profile } = await supabase
    .from("profiles")
    .select("member_code")
    .eq("id", user.id)
    .maybeSingle<{ member_code: string | null }>();
  const memberCode = profile?.member_code ?? "";
  if (!memberCode) return { ok: true, data: [] };

  const admin = createAdminClient();
  let q = admin
    .from("tb_header_order")
    .select(LEGACY_HEADER_COLS)
    .eq("userid", memberCode)
    .order("hdate", { ascending: false })
    .limit(opts?.limit ?? 100);

  if (opts?.status && opts.status.length) q = q.in("hstatus", opts.status);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: ((data ?? []) as LegacyHeaderRow[]).map(headerRowToSummary),
  };
}

// ── Legacy tb_order line-item row shape ──
type LegacyOrderItemRow = {
  id: number;
  cprovider: string | null;
  cnameshop: string | null;
  ctitle: string | null;
  curl: string | null;
  cimages: string | null;
  ccolor: string | null;
  csize: string | null;
  cprice: number | null;
  camount: number | null;
  cdetails: string | null;
  ctrackingnumber: string | null;
  cshippingnumber: string | null;
  cshippingchn: string | null;
  cpriceupdate: string | null;
  crewallet: string | null;
};

/** Legacy tb_order/tb_cart cprovider code → the Pacred Provider enum.
 *  Legacy default is '4'. The shop-order Provider union is the source of
 *  truth for the UI labels; map the known China-source codes onto it. */
const LEGACY_PROVIDER: Record<string, Provider> = {
  "1": "1688",
  "2": "taobao",
  "3": "tmall",
  "4": "shop",
};
function legacyProvider(code: string | null): Provider {
  return LEGACY_PROVIDER[code ?? "4"] ?? "shop";
}

/** Map a legacy tb_order row → a ServiceOrderDetail item. */
function orderItemRow(r: LegacyOrderItemRow): ServiceOrderDetail["items"][number] {
  return {
    id: String(r.id),
    provider: legacyProvider(r.cprovider),
    shop_name: r.cnameshop && r.cnameshop !== "pcs" ? r.cnameshop : "",
    title: r.ctitle,
    url: r.curl && r.curl.trim() ? r.curl : null,
    image_path: r.cimages && r.cimages.trim() ? r.cimages : null,
    color: r.ccolor && r.ccolor.trim() ? r.ccolor : null,
    size: r.csize && r.csize.trim() ? r.csize : null,
    price_cny: Number(r.cprice ?? 0),
    amount: Number(r.camount ?? 0),
    details: r.cdetails && r.cdetails.trim() ? r.cdetails : null,
    tracking_number: r.ctrackingnumber && r.ctrackingnumber.trim() ? r.ctrackingnumber : null,
  };
}

// ────────────────────────────────────────────────────────────
// READ ONE (with items) — D1 Phase-B Wave 2 (B-0): reads tb_header_order
// + tb_order via the admin client. Ownership is verified by matching the
// legacy userid against the signed-in customer's member_code.
// ────────────────────────────────────────────────────────────
export async function getServiceOrder(hNo: string): Promise<ActionResult<ServiceOrderDetail>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("member_code")
    .eq("id", user.id)
    .maybeSingle<{ member_code: string | null }>();
  const memberCode = profile?.member_code ?? "";
  if (!memberCode) return { ok: false, error: "not_found" };

  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("tb_header_order")
    .select(
      `${LEGACY_HEADER_COLS}, hshippingchn, hshippingservice, paymethod, crate, hfreeshipping,
       haddressname, haddresslastname, haddresstel, haddresstel2, haddressno,
       haddresssubdistrict, haddressdistrict, haddressprovince, haddresszipcode, haddressnote,
       hnote`,
    )
    .eq("hno", hNo)
    .eq("userid", memberCode)            // ownership gate
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!order) return { ok: false, error: "not_found" };

  const h = order as unknown as LegacyHeaderRow & {
    hshippingchn: number | null;
    hshippingservice: number | null;
    paymethod: string | null;
    crate: string | null;
    hfreeshipping: string | null;
    haddressname: string | null;
    haddresslastname: string | null;
    haddresstel: string | null;
    haddresstel2: string | null;
    haddressno: string | null;
    haddresssubdistrict: string | null;
    haddressdistrict: string | null;
    haddressprovince: string | null;
    haddresszipcode: string | null;
    haddressnote: string | null;
    hnote: string | null;
  };

  const { data: items } = await admin
    .from("tb_order")
    .select(
      "id, cprovider, cnameshop, ctitle, curl, cimages, ccolor, csize, cprice, camount, cdetails, ctrackingnumber, cshippingnumber, cshippingchn, cpriceupdate, crewallet",
    )
    .eq("hno", hNo)
    .order("id", { ascending: true });

  const detail: ServiceOrderDetail = {
    ...headerRowToSummary(h),
    pay_method: h.paymethod === "2" ? "destination" : "origin",
    free_shipping: h.hfreeshipping === "1",
    crate: h.crate === "1",
    service_fee: Number(h.hshippingservice ?? 0),
    domestic_china_cny: Number(h.hshippingchn ?? 0),
    ship_first_name: h.haddressname && h.haddressname.trim() ? h.haddressname : null,
    ship_last_name: h.haddresslastname && h.haddresslastname.trim() ? h.haddresslastname : null,
    ship_phone: h.haddresstel && h.haddresstel.trim() ? h.haddresstel : null,
    ship_phone2: h.haddresstel2 && h.haddresstel2.trim() ? h.haddresstel2 : null,
    ship_address_line: h.haddressno && h.haddressno.trim() ? h.haddressno : null,
    ship_sub_district: h.haddresssubdistrict && h.haddresssubdistrict.trim() ? h.haddresssubdistrict : null,
    ship_district: h.haddressdistrict && h.haddressdistrict.trim() ? h.haddressdistrict : null,
    ship_province: h.haddressprovince && h.haddressprovince.trim() ? h.haddressprovince : null,
    ship_postal_code: h.haddresszipcode && h.haddresszipcode.trim() ? h.haddresszipcode : null,
    ship_note: h.haddressnote && h.haddressnote.trim() ? h.haddressnote : null,
    note_user: h.hnote && h.hnote.trim() ? h.hnote : null,
    acknowledged_at: null,             // not modelled in legacy tb_header_order
    acknowledged_note: null,
    items: ((items ?? []) as LegacyOrderItemRow[]).map(orderItemRow),
  };

  return { ok: true, data: detail };
}

// ────────────────────────────────────────────────────────────
// READ ONE for PDF receipt (full data: profile + corporate + items with per-item china shipping)
// ────────────────────────────────────────────────────────────
export type ShopOrderReceiptData = {
  // header
  h_no:                  string | null;
  status:                OrderStatus;
  created_at:            string;
  date_awaiting_payment: string | null;
  payment_due_at:        string | null;
  date_completed:        string | null;

  // pricing (snapshotted at submit)
  yuan_rate_locked:      number | null;
  subtotal_cny:          number;
  domestic_china_cny:    number;
  service_fee:           number;
  total_thb:             number;
  free_shipping:         boolean;
  crate:                 boolean;

  // shipment
  warehouse_china:       "guangzhou" | "yiwu" | null;
  transport_type:        string;

  // V-C2: optional staff-set override for the bill-header name
  bill_to_name_override: string | null;

  // shipping address snapshot
  ship_first_name:       string | null;
  ship_last_name:        string | null;
  ship_phone:            string | null;
  ship_phone2:           string | null;
  ship_address_line:     string | null;
  ship_sub_district:     string | null;
  ship_district:         string | null;
  ship_province:         string | null;
  ship_postal_code:      string | null;

  // customer
  customer: {
    member_code:  string | null;
    first_name:   string | null;
    last_name:    string | null;
    email:        string | null;
    phone:        string | null;
    account_type: "personal" | "juristic" | null;
    company_name: string | null;
    tax_id:       string | null;
    company_address: string | null;
  };

  // items (grouped by provider → shop on the PDF side)
  items: Array<{
    id:                  string;
    provider:            Provider;
    shop_name:           string;
    title:               string | null;
    color:               string | null;
    size:                string | null;
    price_cny:           number;          // per unit
    amount:              number;
    domestic_china_cny:  number;          // per-item china domestic shipping (CNY)
    shipping_number:     string | null;   // เลขออเดอร์ร้านจีน
    tracking_number:     string | null;
  }>;
};

export async function getServiceOrderForReceipt(
  hNo: string,
): Promise<ActionResult<ShopOrderReceiptData>> {
  // D1 Phase-B Wave 2 (B-0): receipt header + items read the ported legacy
  // PCS schema (tb_header_order + tb_order) so a migrated customer's receipt
  // resolves instead of 404-ing. tb_* is RLS-locked to service_role → admin
  // client; ownership is verified by matching tb_header_order.userid against
  // the signed-in customer's member_code.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data: ownProfile } = await supabase
    .from("profiles")
    .select("member_code")
    .eq("id", user.id)
    .maybeSingle<{ member_code: string | null }>();
  const memberCode = ownProfile?.member_code ?? "";
  if (!memberCode) return { ok: false, error: "not_found" };

  const admin = createAdminClient();

  // 1. Header — ownership-gated by member_code
  const { data: order, error: orderErr } = await admin
    .from("tb_header_order")
    .select(
      `id, hno, hstatus, hdate, hdate2, hdatepayment, hdate5,
       hrate, htotalpriceuser, hshippingchn, hshippingservice, htotalpricechn,
       hfreeshipping, crate, hwarehousechina, htransporttype,
       haddressname, haddresslastname, haddresstel, haddresstel2, haddressno,
       haddresssubdistrict, haddressdistrict, haddressprovince, haddresszipcode`,
    )
    .eq("hno", hNo)
    .eq("userid", memberCode)
    .maybeSingle();

  if (orderErr) return { ok: false, error: orderErr.message };
  if (!order)   return { ok: false, error: "not_found" };

  const o = order as unknown as {
    id: number;
    hno: string | null;
    hstatus: string;
    hdate: string | null;
    hdate2: string | null;
    hdatepayment: string | null;
    hdate5: string | null;
    hrate: number | null;
    htotalpriceuser: number | null;
    hshippingchn: number | null;
    hshippingservice: number | null;
    htotalpricechn: number | null;
    hfreeshipping: string | null;
    crate: string | null;
    hwarehousechina: string | null;
    htransporttype: string | null;
    haddressname: string | null;
    haddresslastname: string | null;
    haddresstel: string | null;
    haddresstel2: string | null;
    haddressno: string | null;
    haddresssubdistrict: string | null;
    haddressdistrict: string | null;
    haddressprovince: string | null;
    haddresszipcode: string | null;
  };

  const status = (o.hstatus as OrderStatus) ?? "1";

  // Legacy PHP refused to print receipts on cancelled orders + on pending
  // (hStatus=1) — we adopt the same rule. hStatus 2..5 only.
  if (status === "1" || status === "6") {
    return { ok: false, error: "receipt_not_available" };
  }

  // 2. Customer — the signed-in customer's own legacy row (tb_users).
  const { data: legacyUser } = await admin
    .from("tb_users")
    .select("userid, username, userlastname, useremail, usertel, usercompany")
    .eq("userid", memberCode)
    .maybeSingle<{
      userid:      string | null;
      username:    string | null;
      userlastname: string | null;
      useremail:   string | null;
      usertel:     string | null;
      usercompany: string | null;
    }>();

  const accountType: "personal" | "juristic" =
    legacyUser?.usercompany === "1" ? "juristic" : "personal";

  // Corporate detail (company name / tax id) is a Pacred-native enrichment —
  // best-effort lookup; the receipt + tax-invoice panel degrade gracefully
  // when it isn't present for a migrated customer.
  let company_name: string | null    = null;
  let tax_id:       string | null    = null;
  let company_address: string | null = null;
  if (accountType === "juristic") {
    const { data: corp } = await supabase
      .from("corporate")
      .select("company_name, tax_id, company_address")
      .eq("profile_id", user.id)
      .maybeSingle<{
        company_name:    string | null;
        tax_id:          string | null;
        company_address: string | null;
      }>();
    company_name    = corp?.company_name    ?? null;
    tax_id          = corp?.tax_id          ?? null;
    company_address = corp?.company_address ?? null;
  }

  // 3. Items — exclude refunded lines (legacy crewallet flag = PHP cReWallet).
  const { data: items } = await admin
    .from("tb_order")
    .select(
      "id, cprovider, cnameshop, ctitle, curl, cimages, ccolor, csize, cprice, camount, cdetails, ctrackingnumber, cshippingnumber, cshippingchn, cpriceupdate, crewallet",
    )
    .eq("hno", hNo)
    .order("id", { ascending: true });

  const visibleItems = ((items ?? []) as LegacyOrderItemRow[]).filter(
    (it) => it.crewallet !== "1",
  );

  const rate = o.hrate != null ? Number(o.hrate) : 0;
  // The legacy header carries THB totals; derive the CNY subtotal back out
  // via the locked rate so the receipt's CNY breakdown still renders.
  const subtotalCny = visibleItems.reduce(
    (s, it) => s + Number(it.cprice ?? 0) * Number(it.camount ?? 0),
    0,
  );
  const domesticChnCny =
    rate > 0 ? Number(o.hshippingchn ?? 0) / rate : 0;

  return {
    ok: true,
    data: {
      h_no:                  o.hno,
      status,
      created_at:            o.hdate ?? new Date(0).toISOString(),
      date_awaiting_payment: o.hdate2,
      payment_due_at:        o.hdatepayment,
      date_completed:        o.hdate5,
      yuan_rate_locked:      rate > 0 ? rate : null,
      subtotal_cny:          subtotalCny,
      domestic_china_cny:    domesticChnCny,
      service_fee:           Number(o.hshippingservice ?? 0),
      total_thb:             Number(o.htotalpriceuser ?? 0),
      free_shipping:         o.hfreeshipping === "1",
      crate:                 o.crate === "1",
      warehouse_china:       legacyWarehouseToCity(o.hwarehousechina),
      transport_type:        o.htransporttype ?? "",
      bill_to_name_override: null,                            // not in legacy schema
      ship_first_name:       o.haddressname && o.haddressname.trim() ? o.haddressname : null,
      ship_last_name:        o.haddresslastname && o.haddresslastname.trim() ? o.haddresslastname : null,
      ship_phone:            o.haddresstel && o.haddresstel.trim() ? o.haddresstel : null,
      ship_phone2:           o.haddresstel2 && o.haddresstel2.trim() ? o.haddresstel2 : null,
      ship_address_line:     o.haddressno && o.haddressno.trim() ? o.haddressno : null,
      ship_sub_district:     o.haddresssubdistrict && o.haddresssubdistrict.trim() ? o.haddresssubdistrict : null,
      ship_district:         o.haddressdistrict && o.haddressdistrict.trim() ? o.haddressdistrict : null,
      ship_province:         o.haddressprovince && o.haddressprovince.trim() ? o.haddressprovince : null,
      ship_postal_code:      o.haddresszipcode && o.haddresszipcode.trim() ? o.haddresszipcode : null,
      customer: {
        member_code:  legacyUser?.userid       ?? memberCode,
        first_name:   legacyUser?.username      ?? null,
        last_name:    legacyUser?.userlastname  ?? null,
        email:        legacyUser?.useremail     ?? null,
        phone:        legacyUser?.usertel       ?? null,
        account_type: accountType,
        company_name,
        tax_id,
        company_address,
      },
      items: visibleItems.map((it) => ({
        id:                 String(it.id),
        provider:           legacyProvider(it.cprovider),
        shop_name:          it.cnameshop && it.cnameshop !== "pcs" ? it.cnameshop : "",
        title:              it.ctitle,
        color:              it.ccolor && it.ccolor.trim() ? it.ccolor : null,
        size:               it.csize && it.csize.trim() ? it.csize : null,
        price_cny:          Number(it.cprice ?? 0),
        amount:             Number(it.camount ?? 0),
        domestic_china_cny: Number(it.cshippingchn ?? 0),
        shipping_number:    it.cshippingnumber && it.cshippingnumber.trim() ? it.cshippingnumber : null,
        tracking_number:    it.ctrackingnumber && it.ctrackingnumber.trim() ? it.ctrackingnumber : null,
      })),
    },
  };
}

// ────────────────────────────────────────────────────────────
// PLACE ORDER from cart
// ────────────────────────────────────────────────────────────
const PAYMENT_DUE_HOURS = 24;       // legacy hDatePayment timer (24h)

export async function placeServiceOrder(
  input: PlaceOrderInput,
): Promise<ActionResult<{ id: string; h_no: string; total_thb: number; payment_due_at: string }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Load the cart items (RLS ensures we only get our own)
  const { data: cartRows, error: cartErr } = await supabase
    .from("cart_items")
    .select("id, provider, shop_name, url, title, image_path, color, size, price_cny, amount, details")
    .in("id", d.cart_item_ids);

  if (cartErr) return { ok: false, error: cartErr.message };
  if (!cartRows || cartRows.length === 0) {
    return { ok: false, error: "cart_empty" };
  }
  if (cartRows.length !== d.cart_item_ids.length) {
    return { ok: false, error: "some_cart_items_missing" };
  }

  // Fetch current yuan rate from settings
  const { data: settings } = await supabase
    .from("settings")
    .select("yuan_rate, service_fee")
    .eq("id", 1)
    .maybeSingle<{ yuan_rate: number; service_fee: number }>();
  const yuan_rate   = Number(settings?.yuan_rate ?? 5);
  const service_fee = Number(settings?.service_fee ?? 50);

  // Compute subtotal (CNY) and total (THB)
  const subtotal_cny = cartRows.reduce(
    (sum, r) => sum + Number(r.price_cny) * Number(r.amount),
    0,
  );
  const free_shipping = isFreeShippingZip(d.ship_postal_code);
  const total_thb     = Math.round((subtotal_cny * yuan_rate + service_fee) * 100) / 100;

  // Build cover from first item with image
  const firstWithImage = cartRows.find((r) => r.image_path);
  const cover_image_path = firstWithImage?.image_path ?? null;
  const title = cartRows[0]?.title ?? cartRows[0]?.shop_name ?? "ออเดอร์";

  const now = new Date();
  const due = new Date(now.getTime() + PAYMENT_DUE_HOURS * 3600_000);

  // Insert header
  const { data: created, error: hdrErr } = await supabase
    .from("service_orders")
    .insert({
      profile_id:        user.id,
      status:            "awaiting_payment",
      title,
      cover_image_path,
      item_count:        cartRows.length,
      warehouse_china:   d.warehouse_china,
      transport_type:    d.transport_type,
      // 'PACRED_FREE' for orders eligible for free shipping in the
      // BKK + 5 metro zones (replaces legacy PCSF code).
      ship_by:           free_shipping ? "PACRED_FREE" : (d.ship_by ?? null),
      pay_method:        d.pay_method,
      crate:             d.crate,
      free_shipping,
      yuan_rate_locked:  yuan_rate,
      subtotal_cny,
      service_fee,
      total_thb,
      ship_first_name:    d.ship_first_name,
      ship_last_name:     d.ship_last_name,
      ship_phone:         d.ship_phone,
      ship_phone2:        d.ship_phone2 ?? null,
      ship_address_line:  d.ship_address_line,
      ship_sub_district:  d.ship_sub_district,
      ship_district:      d.ship_district,
      ship_province:      d.ship_province,
      ship_postal_code:   d.ship_postal_code,
      ship_note:          d.ship_note ?? null,
      note_user:          d.note_user ?? null,
      date_awaiting_payment: now.toISOString(),
      payment_due_at:        due.toISOString(),
    })
    .select("id, h_no")
    .single<{ id: string; h_no: string }>();

  if (hdrErr) return { ok: false, error: hdrErr.message };

  // Snapshot cart rows → service_order_items
  const itemRows = cartRows.map((r) => ({
    service_order_id: created.id,
    provider:         r.provider,
    shop_name:        r.shop_name,
    url:              r.url,
    title:            r.title,
    image_path:       r.image_path,
    color:            r.color,
    size:             r.size,
    price_cny:        r.price_cny,
    amount:           r.amount,
    details:          r.details,
  }));
  const { error: itemsErr } = await supabase.from("service_order_items").insert(itemRows);
  if (itemsErr) {
    // best-effort: rollback header (RLS allows owner deletion via update,
    // not delete; we instead mark cancelled so the row doesn't dangle)
    await supabase.from("service_orders").update({ status: "cancelled" }).eq("id", created.id);
    return { ok: false, error: `items_insert_failed: ${itemsErr.message}` };
  }

  // Clear placed items out of the cart
  await supabase.from("cart_items").delete().in("id", d.cart_item_ids);

  revalidatePath("/service-order");
  revalidatePath("/service-order/cart");
  revalidatePath("/service-order/pending");

  // Notification (fire and forget — don't block the action result)
  void sendNotification(user.id, notify.serviceOrderPlaced({
    hNo:       created.h_no,
    orderId:   created.id,
    itemCount: d.cart_item_ids.length,
    totalThb:  total_thb,
  }));

  return {
    ok: true,
    data: {
      id: created.id,
      h_no: created.h_no,
      total_thb,
      payment_due_at: due.toISOString(),
    },
  };
}

// ────────────────────────────────────────────────────────────
// SELF-CANCEL (only while pending or awaiting_payment)
// ────────────────────────────────────────────────────────────
export async function cancelServiceOrder(hNo: string): Promise<ActionResult> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { error } = await supabase
    .from("service_orders")
    .update({ status: "cancelled" })
    .eq("h_no", hNo)
    .eq("profile_id", user.id)
    .in("status", ["pending", "awaiting_payment"]);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/service-order");
  revalidatePath("/service-order/pending");
  return { ok: true };
}

// ────────────────────────────────────────────────────────────
// PAY FROM WALLET — customer self-service (closes cargo loop)
// ────────────────────────────────────────────────────────────
//
// Without this, every order requires admin to manually call
// adminMarkServiceOrderPaid → admin bottleneck per order.  With this,
// the customer self-pays once they have wallet balance ≥ total.
//
// Mirror of adminMarkServiceOrderPaid but customer-initiated:
//   - status MUST be 'awaiting_payment' (no super flow like admin)
//   - no allow_overdraw (customer must have sufficient main bucket)
//   - no admin_id (null on wallet_tx; customer-initiated)
//   - ownership re-verified via RLS-protected fetch BEFORE admin client mutations
//
// Idempotent: re-click returns existing tx without double-debit.
export async function payServiceOrderFromWallet(
  hNo: string,
): Promise<ActionResult<{ tx_id: string; already_paid: boolean }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // 1. Verify ownership + status + total via RLS-protected fetch
  const { data: order } = await supabase
    .from("service_orders")
    .select("id, h_no, status, total_thb")
    .eq("h_no", hNo)
    .maybeSingle<{ id: string; h_no: string; status: string; total_thb: number }>();
  if (!order)                                  return { ok: false, error: "not_found" };
  if (order.status !== "awaiting_payment")     return { ok: false, error: "order_not_payable" };
  const totalThb = Number(order.total_thb);
  if (!(totalThb > 0))                         return { ok: false, error: "total_thb_invalid" };

  // 2. Idempotency: existing completed payment tx for this order?
  const { data: existingTx } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("reference_type", "order_header")
    .eq("reference_id", order.h_no)
    .eq("kind", "order_payment")
    .eq("status", "completed")
    .maybeSingle<{ id: string }>();
  if (existingTx) {
    // Status mismatch shouldn't happen, but return success — let UI refresh.
    return { ok: true, data: { tx_id: existingTx.id, already_paid: true } };
  }

  // 3. Balance check — PENDING-AWARE available balance. The raw
  //    wallet.balance (0007 trigger) sums only completed rows, so it
  //    ignores this customer's other not-yet-approved withdraw / yuan
  //    debits (gap-customer.md §H-1). RLS scopes the read to own wallet.
  const available = await getWalletAvailableBalance(supabase, user.id);
  if (available === null) {
    return { ok: false, error: "wallet_balance_unavailable — ตรวจสอบยอดเงินไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
  if (available < totalThb) {
    return {
      ok: false,
      error: `wallet_insufficient — มี ฿${available.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ต้อง ฿${totalThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })} เติมเงินก่อนชำระ`,
    };
  }

  // 4. Debit + status flip — admin client (gated by ownership check above)
  const admin = createAdminClient();

  // F-11 / G9 — wrap INSERT to catch the partial-unique violation from
  // migration 0049 (wallet_tx_order_payment_uniq). Under concurrent
  // submits (2 tabs / back-button), the check-then-act SELECT above
  // may miss a still-committing peer INSERT — the DB-level guard
  // raises 23505, we re-SELECT, and return as if we were the second
  // arrival in normal idempotent flow.
  // W-1/S-2: assertOwnedProfileId makes the ownership check un-skippable
  // — if a future edit sets profile_id from an untrusted input, this
  // throws instead of writing a cross-customer wallet debit.
  const { data: insertedTx, error: txErr } = await admin
    .from("wallet_transactions")
    .insert(assertOwnedProfileId(user.id, {
      profile_id:     user.id,
      bucket:         "main",
      amount:         -totalThb,
      kind:           "order_payment",
      status:         "completed",
      reference_type: "order_header",
      reference_id:   order.h_no,
      admin_id:       null,
      note:           `ชำระค่าฝากสั่ง ${order.h_no} (ตัดจาก wallet โดยลูกค้า)`,
    }))
    .select("id")
    .maybeSingle<{ id: string }>();

  if (txErr && (txErr.code === "23505" || /duplicate|unique/i.test(txErr.message))) {
    // Concurrent peer beat us — re-SELECT the canonical row.
    const { data: peerTx } = await admin
      .from("wallet_transactions")
      .select("id")
      .eq("reference_type", "order_header")
      .eq("reference_id", order.h_no)
      .eq("kind", "order_payment")
      .eq("status", "completed")
      .maybeSingle<{ id: string }>();
    if (!peerTx) {
      // 23505 fired but no row visible — partial-index predicate mismatch
      // or unexpected race. Surface so admin can investigate.
      return { ok: false, error: `wallet insert race: 23505 but no peer tx found for ${order.h_no}` };
    }
    revalidatePath(`/service-order/${order.h_no}`);
    revalidatePath("/service-order");
    return { ok: true, data: { tx_id: peerTx.id, already_paid: true } };
  }
  if (txErr || !insertedTx) {
    return { ok: false, error: `wallet insert: ${txErr?.message ?? "no row"}` };
  }
  const tx = insertedTx;

  const { error: ordErr } = await admin
    .from("service_orders")
    .update({
      status:       "ordered",
      date_ordered: new Date().toISOString(),
    })
    .eq("id", order.id);
  if (ordErr) {
    // Don't roll back the wallet tx — preserve audit trail (mirror of
    // adminMarkServiceOrderPaid behavior). Admin can reconcile from
    // /admin/service-orders/<hNo>.
    return {
      ok: false,
      error: `order update failed AFTER wallet debit (tx ${tx.id} stays): ${ordErr.message}`,
    };
  }

  // 5. Notify customer (self-action confirmation)
  void sendNotification(user.id, notify.walletTxStatusChanged({
    kind:   "order_payment",
    status: "completed",
    amount: -totalThb,
    note:   `ออเดอร์ ${order.h_no}`,
    txId:   tx.id,
  }));

  revalidatePath(`/service-order/${order.h_no}`);
  revalidatePath("/service-order");
  revalidatePath("/service-order/pending");
  revalidatePath("/wallet");
  revalidatePath("/wallet/history");

  return { ok: true, data: { tx_id: tx.id, already_paid: false } };
}

// ────────────────────────────────────────────────────────────
// U4-3a · DELIVERY ACKNOWLEDGEMENT (customer-self-serve)
// ────────────────────────────────────────────────────────────
//
// Mirror of customerAcknowledgeForwarderDelivery for the ฝากสั่ง side.
// For service_orders the terminal "delivered" status is `completed`
// (legacy PHP status 5 — order finished, customer received). We allow
// customer to stamp acknowledged_at + optional note exactly once.

const ackOrderSchema = z.object({
  h_no: z.string().trim().min(1).max(100),
  note: z.string().trim().max(500).optional(),
});
export type AckOrderInput = z.infer<typeof ackOrderSchema>;

export async function customerAcknowledgeServiceOrderDelivery(
  input: AckOrderInput,
): Promise<ActionResult<{ acknowledged_at: string; already_acked: boolean }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const parsed = ackOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // 1. Verify ownership + status + ack-state via RLS-protected fetch
  const { data: order } = await supabase
    .from("service_orders")
    .select("id, h_no, status, acknowledged_at")
    .eq("h_no", parsed.data.h_no)
    .maybeSingle<{ id: string; h_no: string; status: string; acknowledged_at: string | null }>();
  if (!order)                          return { ok: false, error: "not_found" };
  if (order.status !== "completed")    return { ok: false, error: "not_delivered_yet" };

  // 2. Idempotent
  if (order.acknowledged_at) {
    return {
      ok: true,
      data: { acknowledged_at: order.acknowledged_at, already_acked: true },
    };
  }

  // 3. Admin UPDATE restricted to ack columns + re-verify guards
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error: updErr } = await admin
    .from("service_orders")
    .update({
      acknowledged_at:   now,
      acknowledged_note: parsed.data.note ?? null,
    })
    .eq("id", order.id)
    .eq("profile_id", user.id)
    .eq("status", "completed")
    .is("acknowledged_at", null);
  if (updErr) return { ok: false, error: `ack update: ${updErr.message}` };

  revalidatePath(`/service-order/${order.h_no}`);
  revalidatePath("/service-order");

  void sendNotification(user.id, {
    category:       "order",
    severity:       "success",
    title:          `ยืนยันรับสินค้า ${order.h_no}`,
    body:           parsed.data.note
      ? `ขอบคุณที่ยืนยันการรับสินค้า — โน้ต: ${parsed.data.note.slice(0, 120)}`
      : "ขอบคุณที่ยืนยันการรับสินค้าครบถ้วน",
    link_href:      `/service-order/${order.h_no}`,
    reference_type: "service_order",
    reference_id:   order.id,
  });

  return {
    ok: true,
    data: { acknowledged_at: now, already_acked: false },
  };
}
