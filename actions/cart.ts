"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cartItemSchema, type CartItemInput, type Provider } from "@/lib/validators/cart";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { error } = await supabase.from("cart_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/service-order/cart");
  return { ok: true };
}

export async function clearCart(): Promise<ActionResult> {
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
