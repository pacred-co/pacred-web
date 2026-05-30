"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { placeOrderSchema, type PlaceOrderInput, type Provider } from "@/lib/validators/cart";
import { isFreeShippingZip } from "@/lib/bkk-zip";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { computeShopOrderDebitTotal } from "@/lib/service-order/debit-total";
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
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  // Resolve the customer's legacy member code (the tb_* join key).
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("member_code")
    .eq("id", user.id)
    .maybeSingle<{ member_code: string | null }>();
  if (profileErr) {
    console.error(`[profiles list] failed`, { code: profileErr.code, message: profileErr.message });
  }
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
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("member_code")
    .eq("id", user.id)
    .maybeSingle<{ member_code: string | null }>();
  if (profileErr) {
    console.error(`[profiles list] failed`, { code: profileErr.code, message: profileErr.message });
  }
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

  const { data: items, error: itemsErr } = await admin
    .from("tb_order")
    .select(
      "id, cprovider, cnameshop, ctitle, curl, cimages, ccolor, csize, cprice, camount, cdetails, ctrackingnumber, cshippingnumber, cshippingchn, cpriceupdate, crewallet",
    )
    .eq("hno", hNo)
    .order("id", { ascending: true });
  if (itemsErr) {
    console.error(`[tb_order list] failed`, { code: itemsErr.code, message: itemsErr.message });
  }

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
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data: ownProfile, error: ownProfileErr } = await supabase
    .from("profiles")
    .select("member_code")
    .eq("id", user.id)
    .maybeSingle<{ member_code: string | null }>();
  if (ownProfileErr) {
    console.error(`[profiles list] failed`, { code: ownProfileErr.code, message: ownProfileErr.message });
  }
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
  const { data: legacyUser, error: legacyUserErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userEmail, userTel, userCompany")
    .eq("userID", memberCode)
    .maybeSingle<{
      userID:      string | null;
      userName:    string | null;
      userLastName: string | null;
      userEmail:   string | null;
      userTel:     string | null;
      userCompany: string | null;
    }>();
  if (legacyUserErr) {
    console.error(`[tb_users list] failed`, { code: legacyUserErr.code, message: legacyUserErr.message });
  }

  const accountType: "personal" | "juristic" =
    legacyUser?.userCompany === "1" ? "juristic" : "personal";

  // Corporate detail (company name / tax id) is a Pacred-native enrichment —
  // best-effort lookup; the receipt + tax-invoice panel degrade gracefully
  // when it isn't present for a migrated customer.
  let company_name: string | null    = null;
  let tax_id:       string | null    = null;
  let company_address: string | null = null;
  if (accountType === "juristic") {
    const { data: corp, error: corpErr } = await supabase
      .from("corporate")
      .select("company_name, tax_id, company_address")
      .eq("profile_id", user.id)
      .maybeSingle<{
        company_name:    string | null;
        tax_id:          string | null;
        company_address: string | null;
      }>();
    if (corpErr) {
      console.error(`[corporate list] failed`, { code: corpErr.code, message: corpErr.message });
    }
    company_name    = corp?.company_name    ?? null;
    tax_id          = corp?.tax_id          ?? null;
    company_address = corp?.company_address ?? null;
  }

  // 3. Items — exclude refunded lines (legacy crewallet flag = PHP cReWallet).
  const { data: items, error: itemsErr } = await admin
    .from("tb_order")
    .select(
      "id, cprovider, cnameshop, ctitle, curl, cimages, ccolor, csize, cprice, camount, cdetails, ctrackingnumber, cshippingnumber, cshippingchn, cpriceupdate, crewallet",
    )
    .eq("hno", hNo)
    .order("id", { ascending: true });
  if (itemsErr) {
    console.error(`[tb_order list] failed`, { code: itemsErr.code, message: itemsErr.message });
  }

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
        member_code:  legacyUser?.userID       ?? memberCode,
        first_name:   legacyUser?.userName      ?? null,
        last_name:    legacyUser?.userLastName  ?? null,
        email:        legacyUser?.userEmail     ?? null,
        phone:        legacyUser?.userTel       ?? null,
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
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
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
  const { data: settings, error: settingsErr } = await supabase
    .from("settings")
    .select("yuan_rate, service_fee")
    .eq("id", 1)
    .maybeSingle<{ yuan_rate: number; service_fee: number }>();
  if (settingsErr) {
    console.error(`[settings list] failed`, { code: settingsErr.code, message: settingsErr.message });
  }
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
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
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
// D1 / ADR-0017 Phase-B faithful port — implements ADR-0018 §D-2 rule 1
// (customer DEBIT-on-submit, shop-from-wallet sub-case). Closes the
// cust-02 P0-6 audit gap (legacy gap 2026-05-30 §3 P0-6): the previous
// body SELECT'd the REBUILT empty `service_orders` table → not_found for
// every migrated order, and debited the rebuilt `wallet_transactions`
// (empty on prod). Both dead on prod. The 8,898 customers' real orders
// live in `tb_header_order`; their real balances in `tb_wallet` +
// `tb_wallet_hs`.
//
// ── Why pivot in-place (NOT a new service-order-tb.ts) ──────────────
//
//   The customer action stays here; its admin twin already lives in
//   `actions/admin/service-orders-tb.ts::adminMarkServiceOrderPaidTb`.
//   This customer-side action is the MIRROR of that admin action — same
//   tb_wallet_hs shape (type='2', typenew='3', typeservice='1',
//   status='2'), same tb_header_order flip (hstatus 2→3, hdate3=NOW,
//   paydeposit='1'). The only differences: customer-initiated (adminID
//   empty · adminIDcrate = the customer's own member_code), no
//   allow_overdraw (customer must have balance), ownership re-verified.
//
// ── Legacy contract (pcs-admin/pay-users.php L48-83 + L162-180) ─────
//
//   1. Pre-check: SELECT walletTotal FROM tb_wallet WHERE userID=?
//      Refuse if walletTotal < pricePay (legacy `if($walletTotal>=$pricePay)`,
//      else sweetalert='eWallet').
//   2. UPDATE tb_wallet SET walletTotal = walletTotal - pricePay.
//   3. INSERT tb_wallet_hs (date, status='2', amount=pricePay, type='2',
//      userID, refOrder=hNo, adminIDCrate).
//   4. UPDATE tb_header_order SET hStatus='3', hDate3=NOW(),
//      paydeposit='1', hDateUpdate=NOW() WHERE hNo=? AND userID=?.
//
//   pricePay = the order's stored total `htotalpriceuser` (set by the
//   legacy update2 flow when admin prices the order at hStatus 2). We
//   reuse `computeShopOrderDebitTotal` (READ-ONLY) — same helper the
//   admin twin uses — so we charge the SAME amount the customer was
//   quoted (no recompute drift, refund adjustments propagate).
//
// ── Payable status (verified against the live detail page + legacy) ─
//
//   Customer self-pay is gated to hstatus='2' (รอชำระเงิน) ONLY. The
//   detail page (`service-order/[hNo]/page.tsx` L44, L144) mounts the
//   PayFromWalletButton solely when `o.status === "2"` and reads the
//   balance from tb_wallet there too. At hstatus='1' the order has no
//   price yet (admin update2 sets htotalpriceuser + hStatus='2'); at
//   '3'+ payment already landed. So '2' is the only payable state for
//   the customer; '3'+ → idempotent already-done; everything else →
//   refuse. (The admin twin additionally allows '1' because admin can
//   force-pay; the customer cannot.)
//
// ── Idempotency (the legacy double-pay guard) ───────────────────────
//
//   update.php L919 / pay-users.php L13 gate re-pay by checking
//   tb_wallet_hs WHERE refOrder=hNo AND type='2' AND status='2'. We
//   probe that BEFORE inserting; a hit → return { already_paid:true }
//   (re-click from flaky network / two browser tabs is safe).
//
// ── Partial-failure rollback (Supabase REST has no real txn) ────────
//
//   - tb_wallet_hs INSERT fails (nothing else written) → return error.
//   - tb_wallet UPDATE fails after the hs INSERT → DELETE the hs row
//     (mirror of payment-tb.ts / Tier-A recovery — keep books balanced).
//   - tb_header_order UPDATE fails after both → surface a LOUD error
//     carrying the hs id + order id so ops reconcile (the wallet already
//     moved; auto-rollback would race downstream readers — same stance
//     as adminMarkServiceOrderPaidTb).
//
// Schema reference: supabase/migrations/0081_pcs_legacy_schema.sql
//   L2506 (tb_header_order), L6135 (tb_wallet), L6159 (tb_wallet_hs).
//
// tb_wallet_hs type/status legend (0081 L6213 + L6220):
//   type='2' = รายการชำระเงินฝากสั่ง (shop-order paid from wallet)
//   status='2' = สำเร็จ (approved — customer DEBIT-on-submit is final)
//
// Return shape stays { tx_id, already_paid } (tx_id = the tb_wallet_hs
// id as string) so both call-sites (the detail-page button + the bulk
// pay loop in /service-order/add) keep working unchanged — they read
// only res.ok / res.error.
//
// Reachability (AGENTS.md §0d): sidebar "ฝากสั่งซื้อ" → /service-order
// (listServiceOrders, tb_header_order) → click an order at รอชำระเงิน →
// /service-order/[hNo] (getServiceOrder, tb_header_order) → the yellow
// payment-due card renders PayFromWalletButton (mounted iff hstatus='2'),
// which calls THIS action. ≤3 clicks from the sidebar.
export async function payServiceOrderFromWallet(
  hNo: string,
): Promise<ActionResult<{ tx_id: string; already_paid: boolean }>> {
  // G-4 — impersonation is read-only; refuse customer-facing mutations.
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  // Resolve the customer's legacy member code (the tb_* join key) — same
  // helper actions/payment-tb.ts uses for the yuan wallet-paid flow.
  const userData = await getCurrentUserWithProfile();
  if (!userData?.user) return { ok: false, error: "not_signed_in" };
  if (!userData.profile?.member_code) {
    return { ok: false, error: "ยังไม่ได้รับ member_code — กรุณาติดต่อทีมงาน" };
  }
  const userId     = userData.user.id;
  const memberCode = userData.profile.member_code;   // PR####

  const admin = createAdminClient();

  // ── 1. Load the order from tb_header_order (ownership-gated) ─────
  // Ownership = the order's userid must equal the signed-in customer's
  // member_code (a customer can only ever pay their own PR<n> rows).
  const { data: header, error: headerErr } = await admin
    .from("tb_header_order")
    .select(
      "id,hno,userid,hstatus,htotalpriceuser,htotalpricechn,hshippingchn,hshippingservice,hrate",
    )
    .eq("hno", hNo)
    .eq("userid", memberCode)                        // ownership gate
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
    console.error(`[tb_header_order pay-from-wallet lookup] failed`, {
      code: headerErr.code, message: headerErr.message, hno: hNo, userid: memberCode,
    });
    return { ok: false, error: `db_error:${headerErr.code ?? "unknown"}` };
  }
  if (!header) return { ok: false, error: "not_found" };

  const status = (header.hstatus ?? "").trim();
  // Already paid (hstatus >= 3) → idempotent success (let the UI refresh).
  if (status === "3" || status === "4" || status === "5") {
    return { ok: true, data: { tx_id: "", already_paid: true } };
  }
  // Customer self-pay is allowed ONLY at hstatus='2' (รอชำระเงิน). '1'
  // has no price yet; '6' is cancelled. (Admin can force-pay '1' via the
  // admin twin; the customer cannot.)
  if (status !== "2") {
    return { ok: false, error: "order_not_payable" };
  }

  // ── 2. Compute the debit amount (READ-ONLY helper) ──────────────
  // Prefer the stored htotalpriceuser; fall back to the legacy formula.
  // NaN / ≤0 → refuse (silently substituting 0 would advance the order
  // with zero cash collected).
  const priceToPay = computeShopOrderDebitTotal(header);
  if (!Number.isFinite(priceToPay) || priceToPay <= 0) {
    return { ok: false, error: "total_thb_invalid" };
  }

  // ── 3. Read tb_wallet + pre-check balance (legacy L51-55) ───────
  const { data: walletBefore, error: walletReadErr } = await admin
    .from("tb_wallet")
    .select("userid, wallettotal")
    .eq("userid", memberCode)
    .maybeSingle<{ userid: string; wallettotal: number | string | null }>();
  if (walletReadErr) {
    console.error(`[tb_wallet pay-from-wallet read] failed`, {
      code: walletReadErr.code, message: walletReadErr.message, userid: memberCode,
    });
    return { ok: false, error: `db_error:${walletReadErr.code ?? "unknown"}` };
  }
  const currentBalance = Number(walletBefore?.wallettotal ?? 0);
  if (!(currentBalance >= priceToPay)) {
    return {
      ok: false,
      error: `wallet_insufficient — มี ฿${currentBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ต้อง ฿${priceToPay.toLocaleString("th-TH", { minimumFractionDigits: 2 })} เติมเงินก่อนชำระ`,
    };
  }

  const nowIso = new Date().toISOString();

  // ── 4. Idempotency probe — already paid via wallet? ─────────────
  // Legacy double-pay guard (pay-users.php L13 / update.php L919):
  // tb_wallet_hs WHERE refOrder=hNo AND type='2' AND status='2'.
  const { data: existingHs, error: existingHsErr } = await admin
    .from("tb_wallet_hs")
    .select("id")
    .eq("userid", memberCode)
    .eq("type", "2")
    .eq("reforder", header.hno)
    .eq("status", "2")
    .limit(1)
    .maybeSingle<{ id: number }>();
  if (existingHsErr) {
    console.error(`[tb_wallet_hs idempotency probe] failed`, {
      code: existingHsErr.code, message: existingHsErr.message, hno: header.hno, userid: memberCode,
    });
    return { ok: false, error: `db_error:${existingHsErr.code ?? "unknown"}` };
  }
  if (existingHs) {
    // Already debited by a prior call. Best-effort nudge the header to 3
    // if it's still sitting at 2 (covers a half-state where the wallet
    // moved but the header update failed previously).
    const { error: nudgeErr } = await admin
      .from("tb_header_order")
      .update({ hstatus: "3", hdate3: nowIso, hdateupdate: nowIso, paydeposit: "1" })
      .eq("id", header.id)
      .eq("hstatus", "2");
    if (nudgeErr) {
      console.error(`[tb_header_order idempotency-nudge] failed`, {
        code: nudgeErr.code, message: nudgeErr.message, hno: header.hno,
      });
    }
    revalidatePath(`/service-order/${header.hno}`);
    revalidatePath("/service-order");
    return { ok: true, data: { tx_id: String(existingHs.id), already_paid: true } };
  }

  // ── 5. INSERT tb_wallet_hs (type='2', status='2') ───────────────
  // Mirror of adminMarkServiceOrderPaidTb's row (the admin twin), minus
  // the admin identity — customer-initiated, so adminID empty +
  // adminIDcrate = the customer's own member_code (matches payment-tb.ts
  // customer-self pattern). amount POSITIVE; debit direction encoded by
  // type='2' per the schema comment + legacy pay-users.php L65.
  const { data: hsRow, error: hsInsErr } = await admin
    .from("tb_wallet_hs")
    .insert({
      date:            nowIso,
      amount:          priceToPay,
      status:          "2",                       // approved (customer DEBIT-on-submit is final)
      type:            "2",                       // รายการชำระเงินฝากสั่ง (0081 L6220)
      typenew:         "3",                       // ชำระฝากสั่ง (0081 L6227)
      typeservice:     "1",                       // ฝากสั่งซื้อ (0081 L6234)
      paydeposit:      "1",                       // paid-from-wallet (matches legacy self-pay branch)
      imagesslip:      "",                        // wallet-paid → no slip
      depositnamebank: "WALLET",
      nameuserbank:    "",
      nouserbank:      "",
      note:            `รายการชำระเงิน ฝากสั่งสินค้า #${header.hno} (ตัดจาก wallet โดยลูกค้า)`,
      adminid:         "",                        // no admin involved
      adminidupdate:   "",
      session:         "customer-self",
      reforder:        header.hno,                // refOrder = hNo (legacy pay-users.php L65)
      whno:            "",                         // NOT NULL — no warehouse # for shop-order debit
      wusercredit:     "0",                        // NOT NULL — not a VIP-credit topup
      userid:          memberCode,
      adminidcrate:    memberCode,                 // NOT NULL — customer self-initiated
    })
    .select("id")
    .single<{ id: number }>();
  if (hsInsErr || !hsRow) {
    console.error(`[tb_wallet_hs pay-from-wallet insert] failed`, {
      code: hsInsErr?.code, message: hsInsErr?.message, hno: header.hno, userid: memberCode,
    });
    return {
      ok: false,
      error: `บันทึก tb_wallet_hs ล้มเหลว: ${hsInsErr?.message ?? "no row returned"}`,
    };
  }

  // ── 6. UPDATE tb_wallet (read-modify-write; INSERT-if-no-row) ───
  // The pre-check guaranteed walletBefore exists for any positive
  // priceToPay (missing row → balance 0 → refuse), so the INSERT branch
  // is purely defensive against a delete-race (impossible in practice).
  const newBalance = Math.round((currentBalance - priceToPay) * 100) / 100;
  if (!walletBefore) {
    const { error: walletInsErr } = await admin
      .from("tb_wallet")
      .insert({ userid: memberCode, wallettotal: -priceToPay });
    if (walletInsErr) {
      // Roll back the hs row — the debit never landed.
      await admin.from("tb_wallet_hs").delete().eq("id", hsRow.id);
      console.error(`[tb_wallet pay-from-wallet insert] failed`, {
        code: walletInsErr.code, message: walletInsErr.message, hno: header.hno, userid: memberCode,
      });
      return { ok: false, error: `บันทึกยอดกระเป๋าล้มเหลว · ยกเลิกรายการ: ${walletInsErr.message}` };
    }
  } else {
    const { error: walletUpdErr } = await admin
      .from("tb_wallet")
      .update({ wallettotal: newBalance })
      .eq("userid", memberCode);
    if (walletUpdErr) {
      // Roll back the hs row — keep books balanced (payment-tb.ts pattern).
      await admin.from("tb_wallet_hs").delete().eq("id", hsRow.id);
      console.error(`[tb_wallet pay-from-wallet update] failed`, {
        code: walletUpdErr.code, message: walletUpdErr.message, hno: header.hno,
        userid: memberCode, before: currentBalance, target: newBalance,
      });
      return { ok: false, error: `หักยอดกระเป๋าล้มเหลว · ยกเลิกรายการ: ${walletUpdErr.message}` };
    }
  }

  // ── 7. Flip header status 2 → 3 + stamp hdate3 + paydeposit='1' ─
  // Matches pay-users.php L166 (self-pay branch): hStatus='3',
  // hDate3=NOW, paydeposit='1', hDateUpdate=NOW.
  const { error: ordErr } = await admin
    .from("tb_header_order")
    .update({
      hstatus:     "3",
      hdate3:      nowIso,
      hdateupdate: nowIso,
      paydeposit:  "1",
    })
    .eq("id", header.id);
  if (ordErr) {
    // tb_wallet_hs already wrote + tb_wallet already debited; don't
    // auto-rollback (would race downstream readers). Surface LOUD so ops
    // reconcile (mirror of adminMarkServiceOrderPaidTb + payment-tb.ts).
    console.error(`[tb_header_order pay-from-wallet status flip] FAILED post-debit`, {
      code: ordErr.code, message: ordErr.message,
      hno: header.hno, userid: memberCode, tb_wallet_hs_id: hsRow.id, amount: priceToPay,
    });
    return {
      ok: false,
      error: `ชำระเงินสำเร็จ แต่อัพเดทสถานะออเดอร์ล้มเหลว (กระเป๋าถูกหัก ฿${priceToPay} แล้ว · tb_wallet_hs id=${hsRow.id} · ออเดอร์ ${header.hno}) — ติดต่อทีมงาน: ${ordErr.message}`,
    };
  }

  // ── 8. Refresh customer-visible surfaces + notify ───────────────
  revalidatePath(`/service-order/${header.hno}`);
  revalidatePath("/service-order");
  revalidatePath("/service-order/pending");
  revalidatePath("/pay");
  revalidatePath("/wallet");
  revalidatePath("/wallet/history");

  console.info(`[payServiceOrderFromWallet] hno=${header.hno} userid=${memberCode} priceToPay=${priceToPay} balance ${currentBalance} → ${newBalance} · tb_wallet_hs=${hsRow.id}`);

  void sendNotification(userId, {
    category:       "order",
    severity:       "success",
    title:          `ชำระค่าฝากสั่งสำเร็จ ${header.hno}`,
    body:           `฿${priceToPay.toLocaleString("th-TH", { minimumFractionDigits: 2 })} · ตัดจากกระเป๋าเงิน`,
    link_href:      `/service-order/${header.hno}`,
    reference_type: "service_order",
    reference_id:   String(header.id),
  });

  return { ok: true, data: { tx_id: String(hsRow.id), already_paid: false } };
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
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return { ok: false, error: "not_signed_in" };

  // 1. Verify ownership + status + ack-state via RLS-protected fetch
  const { data: order, error: orderErr } = await supabase
    .from("service_orders")
    .select("id, h_no, status, acknowledged_at")
    .eq("h_no", parsed.data.h_no)
    .maybeSingle<{ id: string; h_no: string; status: string; acknowledged_at: string | null }>();
  if (orderErr) {
    console.error(`[service_orders mutation lookup] failed`, { code: orderErr.code, message: orderErr.message });
    return { ok: false, error: `db_error:${orderErr.code ?? "unknown"}` };
  }
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
