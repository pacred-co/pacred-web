"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { placeOrderSchema, type PlaceOrderInput, type Provider } from "@/lib/validators/cart";
import { isFreeShippingZip } from "@/lib/bkk-zip";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type ServiceOrderSummary = {
  id: string;
  h_no: string | null;
  status:
    | "pending" | "awaiting_payment" | "ordered"
    | "awaiting_chn_dispatch" | "completed" | "cancelled";
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

const SUMMARY_COLS =
  "id, h_no, status, title, cover_image_path, item_count, warehouse_china, transport_type, ship_by, yuan_rate_locked, subtotal_cny, total_thb, payment_due_at, date_completed, created_at";

// ────────────────────────────────────────────────────────────
// LIST
// ────────────────────────────────────────────────────────────
export async function listServiceOrders(opts?: {
  status?: ServiceOrderSummary["status"][];
  limit?: number;
}): Promise<ActionResult<ServiceOrderSummary[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  let q = supabase
    .from("service_orders")
    .select(SUMMARY_COLS)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);

  if (opts?.status && opts.status.length) q = q.in("status", opts.status);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as ServiceOrderSummary[] };
}

// ────────────────────────────────────────────────────────────
// READ ONE (with items)
// ────────────────────────────────────────────────────────────
export async function getServiceOrder(hNo: string): Promise<ActionResult<ServiceOrderDetail>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data: order, error } = await supabase
    .from("service_orders")
    .select(
      `${SUMMARY_COLS}, pay_method, free_shipping, crate, service_fee, domestic_china_cny,
       ship_first_name, ship_last_name, ship_phone, ship_phone2, ship_address_line,
       ship_sub_district, ship_district, ship_province, ship_postal_code, ship_note, note_user`,
    )
    .eq("h_no", hNo)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!order) return { ok: false, error: "not_found" };

  const { data: items } = await supabase
    .from("service_order_items")
    .select("id, provider, shop_name, title, url, image_path, color, size, price_cny, amount, details, tracking_number")
    .eq("service_order_id", (order as { id: string }).id)
    .order("created_at", { ascending: true });

  return { ok: true, data: { ...(order as unknown as Omit<ServiceOrderDetail, "items">), items: (items ?? []) as ServiceOrderDetail["items"] } };
}

// ────────────────────────────────────────────────────────────
// READ ONE for PDF receipt (full data: profile + corporate + items with per-item china shipping)
// ────────────────────────────────────────────────────────────
export type ShopOrderReceiptData = {
  // header
  h_no:                  string | null;
  status:                ServiceOrderSummary["status"];
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // 1. Header (RLS guarantees we only see our own)
  const { data: order, error: orderErr } = await supabase
    .from("service_orders")
    .select(
      `id, h_no, status, created_at, date_awaiting_payment, payment_due_at, date_completed,
       yuan_rate_locked, subtotal_cny, domestic_china_cny, service_fee, total_thb,
       free_shipping, crate, warehouse_china, transport_type,
       ship_first_name, ship_last_name, ship_phone, ship_phone2,
       ship_address_line, ship_sub_district, ship_district, ship_province, ship_postal_code,
       profile_id`,
    )
    .eq("h_no", hNo)
    .maybeSingle();

  if (orderErr) return { ok: false, error: orderErr.message };
  if (!order)   return { ok: false, error: "not_found" };

  const o = order as unknown as {
    id: string;
    profile_id: string;
    status: ServiceOrderSummary["status"];
  } & Omit<ShopOrderReceiptData, "customer" | "items">;

  // Legacy PHP refused to print receipts on cancelled orders + on pending
  // (status=1) — we adopt the same rule. Status 2..5 only.
  if (o.status === "pending" || o.status === "cancelled") {
    return { ok: false, error: "receipt_not_available" };
  }

  // 2. Customer (profile + optional corporate)
  const { data: profile } = await supabase
    .from("profiles")
    .select("member_code, first_name, last_name, email, phone, account_type")
    .eq("id", o.profile_id)
    .maybeSingle<{
      member_code:  string | null;
      first_name:   string | null;
      last_name:    string | null;
      email:        string | null;
      phone:        string | null;
      account_type: "personal" | "juristic" | null;
    }>();

  let company_name: string | null    = null;
  let tax_id:       string | null    = null;
  let company_address: string | null = null;

  if (profile?.account_type === "juristic") {
    const { data: corp } = await supabase
      .from("corporate")
      .select("company_name, tax_id, company_address")
      .eq("profile_id", o.profile_id)
      .maybeSingle<{
        company_name:    string | null;
        tax_id:          string | null;
        company_address: string | null;
      }>();
    company_name    = corp?.company_name    ?? null;
    tax_id          = corp?.tax_id          ?? null;
    company_address = corp?.company_address ?? null;
  }

  // 3. Items — include per-item china shipping + shipping/tracking numbers
  const { data: items } = await supabase
    .from("service_order_items")
    .select(
      "id, provider, shop_name, title, color, size, price_cny, amount, domestic_china_cny, shipping_number, tracking_number",
    )
    .eq("service_order_id", o.id)
    .eq("re_wallet", false)                       // exclude refunded lines (PHP cReWallet filter)
    .order("created_at", { ascending: true });

  return {
    ok: true,
    data: {
      h_no:                  o.h_no,
      status:                o.status,
      created_at:            o.created_at,
      date_awaiting_payment: o.date_awaiting_payment,
      payment_due_at:        o.payment_due_at,
      date_completed:        o.date_completed,
      yuan_rate_locked:      o.yuan_rate_locked,
      subtotal_cny:          Number(o.subtotal_cny),
      domestic_china_cny:    Number(o.domestic_china_cny),
      service_fee:           Number(o.service_fee),
      total_thb:             Number(o.total_thb),
      free_shipping:         o.free_shipping,
      crate:                 o.crate,
      warehouse_china:       o.warehouse_china,
      transport_type:        o.transport_type,
      ship_first_name:       o.ship_first_name,
      ship_last_name:        o.ship_last_name,
      ship_phone:            o.ship_phone,
      ship_phone2:           o.ship_phone2,
      ship_address_line:     o.ship_address_line,
      ship_sub_district:     o.ship_sub_district,
      ship_district:         o.ship_district,
      ship_province:         o.ship_province,
      ship_postal_code:      o.ship_postal_code,
      customer: {
        member_code:  profile?.member_code  ?? null,
        first_name:   profile?.first_name   ?? null,
        last_name:    profile?.last_name    ?? null,
        email:        profile?.email        ?? null,
        phone:        profile?.phone        ?? null,
        account_type: profile?.account_type ?? null,
        company_name,
        tax_id,
        company_address,
      },
      items: (items ?? []).map((it) => ({
        id:                 (it as { id: string }).id,
        provider:           (it as { provider: Provider }).provider,
        shop_name:          (it as { shop_name: string }).shop_name,
        title:              (it as { title: string | null }).title,
        color:              (it as { color: string | null }).color,
        size:               (it as { size: string | null }).size,
        price_cny:          Number((it as { price_cny: number }).price_cny),
        amount:             Number((it as { amount: number }).amount),
        domestic_china_cny: Number((it as { domestic_china_cny: number }).domestic_china_cny),
        shipping_number:    (it as { shipping_number: string | null }).shipping_number,
        tracking_number:    (it as { tracking_number: string | null }).tracking_number,
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

  // 3. Balance check (main bucket) — RLS guarantees own wallet only
  const { data: wallet } = await supabase
    .from("wallet")
    .select("balance")
    .eq("profile_id", user.id)
    .maybeSingle<{ balance: number }>();
  const balance = Number(wallet?.balance ?? 0);
  if (balance < totalThb) {
    return {
      ok: false,
      error: `wallet_insufficient — มี ฿${balance.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ต้อง ฿${totalThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })} เติมเงินก่อนชำระ`,
    };
  }

  // 4. Debit + status flip — admin client (gated by ownership check above)
  const admin = createAdminClient();

  const { data: tx, error: txErr } = await admin
    .from("wallet_transactions")
    .insert({
      profile_id:     user.id,
      bucket:         "main",
      amount:         -totalThb,
      kind:           "order_payment",
      status:         "completed",
      reference_type: "order_header",
      reference_id:   order.h_no,
      admin_id:       null,
      note:           `ชำระค่าฝากสั่ง ${order.h_no} (ตัดจาก wallet โดยลูกค้า)`,
    })
    .select("id")
    .single<{ id: string }>();
  if (txErr) return { ok: false, error: `wallet insert: ${txErr.message}` };

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
