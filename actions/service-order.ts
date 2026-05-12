"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { placeOrderSchema, type PlaceOrderInput, type Provider } from "@/lib/validators/cart";
import { isFreeShippingZip } from "@/lib/bkk-zip";

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
