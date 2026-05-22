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
