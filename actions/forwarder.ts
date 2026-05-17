"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOwnedProfileId } from "@/lib/auth/owned-write";
import { forwarderSchema, type ForwarderInput } from "@/lib/validators/forwarder";
import { calcPrice, type CalcPriceBreakdown, DEFAULT_SETTINGS } from "@/lib/forwarder/calc-price";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import { getWalletAvailableBalance } from "@/lib/wallet/balance";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type ForwarderSummary = {
  id: string;
  f_no: string | null;
  status:
    | "pending_payment" | "shipped_china" | "in_transit" | "arrived_thailand"
    | "out_for_delivery" | "delivered" | "cancelled";
  source_warehouse: string;
  transport_type:   string;
  product_type:     string;
  box_count:        number;
  weight_kg:        number;
  volume_cbm:       number;
  total_price:      number;
  tracking_chn:     string | null;
  tracking_th:      string | null;
  created_at:       string;
  date_arrived_thailand: string | null;
  date_delivered:        string | null;
};

// ────────────────────────────────────────────────────────────
// RATE LOOKUP — used by the price preview + by createForwarder
// ────────────────────────────────────────────────────────────
type ResolvedRates = {
  rate_custom_user: { kg?: number; cbm?: number } | null;
  rate_vip:         { kg?: number; cbm?: number } | null;
  rate_general:     {
    kg?:  { tier1?: number | null; tier2?: number | null; tier3?: number | null };
    cbm?: { tier1?: number | null; tier2?: number | null; tier3?: number | null };
  } | null;
};

async function resolveRatesFor(
  profileId: string,
  customerGroup: string,
  sourceWarehouse: string,
  transportType: string,
  productType: string,
): Promise<ResolvedRates> {
  const supabase = await createClient();
  const baseFilter = {
    source_warehouse: sourceWarehouse,
    transport_type:   transportType,
    product_type:     productType,
  };

  // Parallel fetches
  const [customUser, vip, general] = await Promise.all([
    supabase.from("rate_custom_user")
      .select("basis, rate")
      .eq("profile_id", profileId)
      .match(baseFilter),
    supabase.from("rate_vip")
      .select("basis, rate")
      .eq("customer_group", customerGroup)
      .match(baseFilter),
    supabase.from("rate_general")
      .select("basis, tier1, tier2, tier3")
      .eq("customer_group", customerGroup)
      .match(baseFilter),
  ]);

  const pivot = <T extends { basis: string }>(rows: T[] | null) => {
    const out: Record<string, T> = {};
    for (const r of rows ?? []) out[r.basis] = r;
    return out;
  };

  const cuRows  = pivot(customUser.data as Array<{ basis: string; rate: number }>);
  const vipRows = pivot(vip.data as Array<{ basis: string; rate: number }>);
  const gnRows  = pivot(general.data as Array<{ basis: string; tier1: number; tier2: number; tier3: number }>);

  return {
    rate_custom_user: (cuRows.kg || cuRows.cbm) ? {
      kg:  cuRows.kg?.rate,
      cbm: cuRows.cbm?.rate,
    } : null,
    rate_vip: (vipRows.kg || vipRows.cbm) ? {
      kg:  vipRows.kg?.rate,
      cbm: vipRows.cbm?.rate,
    } : null,
    rate_general: (gnRows.kg || gnRows.cbm) ? {
      kg:  gnRows.kg  ? { tier1: gnRows.kg.tier1,  tier2: gnRows.kg.tier2,  tier3: gnRows.kg.tier3 }  : undefined,
      cbm: gnRows.cbm ? { tier1: gnRows.cbm.tier1, tier2: gnRows.cbm.tier2, tier3: gnRows.cbm.tier3 } : undefined,
    } : null,
  };
}

// ────────────────────────────────────────────────────────────
// PRICE PREVIEW — client calls this as the user types
// ────────────────────────────────────────────────────────────
export type PricePreviewInput = {
  source_warehouse: "guangzhou" | "yiwu";
  transport_type:   "truck" | "ship" | "air";
  product_type:     "general" | "tisi" | "fda" | "special";
  rate_basis:       "kg" | "cbm" | "auto";
  weight_kg:        number;
  width_cm:         number;
  length_cm:        number;
  height_cm:        number;
  crate:            boolean;
  qc:               boolean;
  domestic_china_thb:    number;
  thailand_delivery_thb: number;
  other_price:           number;
};

export async function previewPrice(
  input: PricePreviewInput,
): Promise<ActionResult<CalcPriceBreakdown>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type, customer_group")
    .eq("id", user.id)
    .maybeSingle<{ account_type: "personal" | "juristic"; customer_group: string }>();

  if (!profile) return { ok: false, error: "no_profile" };

  const { data: settings } = await supabase
    .from("settings")
    .select("service_fee, juristic_discount_threshold, juristic_discount_pct, qc_fee_per_item, crate_fee_base")
    .eq("id", 1)
    .maybeSingle<{
      service_fee: number;
      juristic_discount_threshold: number;
      juristic_discount_pct: number;
      qc_fee_per_item: number;
      crate_fee_base: number;
    }>();

  const rates = await resolveRatesFor(
    user.id, profile.customer_group,
    input.source_warehouse, input.transport_type, input.product_type,
  );

  const volume_cbm =
    (input.width_cm * input.length_cm * input.height_cm) / 1_000_000;

  const breakdown = calcPrice({
    source_warehouse: input.source_warehouse,
    transport_type:   input.transport_type,
    product_type:     input.product_type,
    rate_basis:       input.rate_basis,
    weight_kg:        input.weight_kg,
    volume_cbm,
    crate:        input.crate,
    crate_price:  input.crate ? Number(settings?.crate_fee_base ?? 100) : 0,
    qc:           input.qc,
    qc_price:     input.qc    ? Number(settings?.qc_fee_per_item ?? 5)  : 0,
    domestic_china_thb:    input.domestic_china_thb,
    thailand_delivery_thb: input.thailand_delivery_thb,
    other_price:           input.other_price,
    price_update:          0,
    discount:              0,
    service_fee:           Number(settings?.service_fee ?? 50),
    is_juristic:           profile.account_type === "juristic",
    rate_custom_hs:   null,
    rate_custom_user: rates.rate_custom_user,
    rate_vip:         rates.rate_vip,
    rate_general:     rates.rate_general,
    settings: {
      juristic_discount_threshold: Number(settings?.juristic_discount_threshold ?? DEFAULT_SETTINGS.juristic_discount_threshold),
      juristic_discount_pct:       Number(settings?.juristic_discount_pct ?? DEFAULT_SETTINGS.juristic_discount_pct),
      tier_kg_threshold1:          DEFAULT_SETTINGS.tier_kg_threshold1,
      tier_kg_threshold2:          DEFAULT_SETTINGS.tier_kg_threshold2,
      tier_cbm_threshold1:         DEFAULT_SETTINGS.tier_cbm_threshold1,
      tier_cbm_threshold2:         DEFAULT_SETTINGS.tier_cbm_threshold2,
    },
  });

  return { ok: true, data: breakdown };
}

// ────────────────────────────────────────────────────────────
// READ ONE (detail page)
// ────────────────────────────────────────────────────────────
export type ForwarderDetail = ForwarderSummary & {
  pay_method: "origin" | "destination";
  rate_basis: "kg" | "cbm" | "auto";
  ship_by: string | null;
  width_cm: number;
  length_cm: number;
  height_cm: number;
  crate: boolean;
  crate_price: number;
  qc: boolean;
  qc_price: number;
  domestic_china_thb: number;
  thailand_delivery_thb: number;
  other_price: number;
  service_fee: number;
  transport_price: number;
  ship_first_name: string;
  ship_last_name: string;
  ship_phone: string;
  ship_phone2: string | null;
  ship_address_line: string;
  ship_sub_district: string;
  ship_district: string;
  ship_province: string;
  ship_postal_code: string;
  ship_note: string | null;
  cabinet_number: string | null;
  tracking_chn2: string | null;
  detail: string | null;
  note_user: string | null;
  bill_to_name_override: string | null;        // V-C2
  items: Array<{
    id: string;
    product_name: string;
    product_tracking: string | null;
    product_qty: number;
    weight_per_item_kg: number | null;
  }>;
  images: Array<{
    id: string;
    image_path: string;
    is_cover: boolean;
  }>;
};

const SUMMARY_FORWARDER_COLS =
  "id, f_no, status, source_warehouse, transport_type, product_type, box_count, weight_kg, volume_cbm, total_price, tracking_chn, tracking_th, created_at, date_arrived_thailand, date_delivered";

export async function getForwarderByNo(fNo: string): Promise<ActionResult<ForwarderDetail>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data, error } = await supabase
    .from("forwarders")
    .select(
      `${SUMMARY_FORWARDER_COLS}, pay_method, rate_basis, ship_by,
       width_cm, length_cm, height_cm, crate, crate_price, qc, qc_price,
       domestic_china_thb, thailand_delivery_thb, other_price, service_fee, transport_price,
       ship_first_name, ship_last_name, ship_phone, ship_phone2, ship_address_line,
       ship_sub_district, ship_district, ship_province, ship_postal_code, ship_note,
       cabinet_number, tracking_chn2, detail, note_user, bill_to_name_override`,
    )
    .eq("f_no", fNo)
    .maybeSingle();

  if (error)  return { ok: false, error: error.message };
  if (!data)  return { ok: false, error: "not_found" };

  const id = (data as { id: string }).id;
  const [{ data: items }, { data: images }] = await Promise.all([
    supabase.from("forwarder_items")
      .select("id, product_name, product_tracking, product_qty, weight_per_item_kg")
      .eq("forwarder_id", id)
      .order("created_at"),
    supabase.from("forwarder_images")
      .select("id, image_path, is_cover")
      .eq("forwarder_id", id)
      .order("sort_order"),
  ]);

  return {
    ok: true,
    data: {
      ...(data as unknown as Omit<ForwarderDetail, "items" | "images">),
      items:  (items  ?? []) as ForwarderDetail["items"],
      images: (images ?? []) as ForwarderDetail["images"],
    },
  };
}

// ────────────────────────────────────────────────────────────
// LIST / READ
// ────────────────────────────────────────────────────────────
export async function listForwarders(opts?: {
  status?: ForwarderSummary["status"][];
  limit?: number;
}): Promise<ActionResult<ForwarderSummary[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  let q = supabase
    .from("forwarders")
    .select(
      "id, f_no, status, source_warehouse, transport_type, product_type, box_count, weight_kg, volume_cbm, total_price, tracking_chn, tracking_th, created_at, date_arrived_thailand, date_delivered",
    )
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);

  if (opts?.status && opts.status.length) {
    q = q.in("status", opts.status);
  }

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as ForwarderSummary[] };
}

// ────────────────────────────────────────────────────────────
// CREATE
// ────────────────────────────────────────────────────────────
export async function createForwarder(
  input: ForwarderInput,
): Promise<ActionResult<{ id: string; f_no: string; total_price: number }>> {
  const parsed = forwarderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type, customer_group")
    .eq("id", user.id)
    .maybeSingle<{ account_type: "personal" | "juristic"; customer_group: string }>();
  if (!profile) return { ok: false, error: "no_profile" };

  // Resolve rates + settings, then compute price server-side (trust nothing
  // from the client; client preview is courtesy only)
  const { data: settings } = await supabase
    .from("settings")
    .select("service_fee, juristic_discount_threshold, juristic_discount_pct, qc_fee_per_item, crate_fee_base, yuan_rate")
    .eq("id", 1)
    .maybeSingle<{
      service_fee: number;
      juristic_discount_threshold: number;
      juristic_discount_pct: number;
      qc_fee_per_item: number;
      crate_fee_base: number;
      yuan_rate: number;
    }>();

  const rates = await resolveRatesFor(
    user.id, profile.customer_group,
    d.source_warehouse, d.transport_type, d.product_type,
  );

  const volume_cbm = (d.width_cm * d.length_cm * d.height_cm) / 1_000_000;

  const breakdown = calcPrice({
    source_warehouse: d.source_warehouse,
    transport_type:   d.transport_type,
    product_type:     d.product_type,
    rate_basis:       d.rate_basis,
    weight_kg:        d.weight_kg,
    volume_cbm,
    crate:        d.crate,
    crate_price:  d.crate ? Number(settings?.crate_fee_base ?? 100) : 0,
    qc:           d.qc,
    qc_price:     d.qc    ? Number(settings?.qc_fee_per_item ?? 5)  : 0,
    domestic_china_thb:    d.domestic_china_thb,
    thailand_delivery_thb: d.thailand_delivery_thb,
    other_price:           d.other_price,
    price_update:          0,
    discount:              0,
    service_fee:           Number(settings?.service_fee ?? 50),
    is_juristic:           profile.account_type === "juristic",
    rate_custom_hs:   null,
    rate_custom_user: rates.rate_custom_user,
    rate_vip:         rates.rate_vip,
    rate_general:     rates.rate_general,
    settings: {
      juristic_discount_threshold: Number(settings?.juristic_discount_threshold ?? DEFAULT_SETTINGS.juristic_discount_threshold),
      juristic_discount_pct:       Number(settings?.juristic_discount_pct ?? DEFAULT_SETTINGS.juristic_discount_pct),
      tier_kg_threshold1:          DEFAULT_SETTINGS.tier_kg_threshold1,
      tier_kg_threshold2:          DEFAULT_SETTINGS.tier_kg_threshold2,
      tier_cbm_threshold1:         DEFAULT_SETTINGS.tier_cbm_threshold1,
      tier_cbm_threshold2:         DEFAULT_SETTINGS.tier_cbm_threshold2,
    },
  });

  // Insert forwarder header
  const { data: created, error } = await supabase
    .from("forwarders")
    .insert({
      profile_id:        user.id,
      status:            "pending_payment",
      source_warehouse:  d.source_warehouse,
      transport_type:    d.transport_type,
      product_type:      d.product_type,
      rate_basis:        d.rate_basis,
      ship_by:           d.ship_by ?? null,
      pay_method:        d.pay_method,
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
      box_count:         d.box_count,
      weight_kg:         d.weight_kg,
      width_cm:          d.width_cm,
      length_cm:         d.length_cm,
      height_cm:         d.height_cm,
      volume_cbm,
      crate:             d.crate,
      crate_price:       breakdown.crate_price,
      qc:                d.qc,
      qc_price:          breakdown.qc_price,
      yuan_rate_locked:  settings?.yuan_rate ?? 5,
      domestic_china_thb:    d.domestic_china_thb,
      thailand_delivery_thb: d.thailand_delivery_thb,
      other_price:           d.other_price,
      other_price_desc:      d.other_price_desc ?? null,
      service_fee:           breakdown.service_fee,
      transport_price:       breakdown.transport_subtotal,
      total_price:           breakdown.total_price,
      detail:                d.detail ?? null,
      note_user:             d.note_user ?? null,
    })
    .select("id, f_no")
    .single<{ id: string; f_no: string }>();

  if (error) return { ok: false, error: error.message };

  // Insert items
  if (d.items.length > 0) {
    const itemRows = d.items.map((it) => ({
      forwarder_id:      created.id,
      product_name:      it.product_name,
      product_tracking:  it.product_tracking ?? null,
      product_qty:       it.product_qty,
      width_cm:          it.width_cm ?? null,
      length_cm:         it.length_cm ?? null,
      height_cm:         it.height_cm ?? null,
      weight_per_item_kg: it.weight_per_item_kg ?? null,
      product_type_code: it.product_type_code ?? null,
    }));
    await supabase.from("forwarder_items").insert(itemRows);
  }

  // Insert images
  const imageRows = [];
  if (d.cover_image_path) {
    imageRows.push({
      forwarder_id: created.id,
      image_path:   d.cover_image_path,
      is_cover:     true,
      sort_order:   0,
    });
  }
  d.extra_image_paths.forEach((path, i) => {
    imageRows.push({
      forwarder_id: created.id,
      image_path:   path,
      is_cover:     false,
      sort_order:   i + 1,
    });
  });
  if (imageRows.length > 0) {
    await supabase.from("forwarder_images").insert(imageRows);
  }

  revalidatePath("/service-import");
  revalidatePath("/service-import/pending");

  void sendNotification(user.id, notify.forwarderCreated({
    fNo:         created.f_no,
    forwarderId: created.id,
  }));

  return {
    ok: true,
    data: { id: created.id, f_no: created.f_no, total_price: breakdown.total_price },
  };
}

// ────────────────────────────────────────────────────────────
// PAY FROM WALLET — customer self-service (closes import loop)
// ────────────────────────────────────────────────────────────
//
// Mirror of payServiceOrderFromWallet for the ฝากนำเข้า (service-import)
// side.  Without this, every forwarder payment requires admin to flip
// status manually + the wallet movement is fragmented (entered via
// /admin/wallet, no atomic debit-on-status-change).  With this, customer
// self-pays once wallet balance ≥ total_price.
//
// Flow:
//   status='pending_payment' → customer clicks pay → wallet debit
//     (kind='import_payment', amount=-total_price, ref to f_no)
//   → flips status to 'shipped_china' (Pacred staff handles actual
//     china-side dispatch + tracking number from there)
//
// Idempotent: re-click returns the existing tx without double-debit.
// Admin can still override via /admin/forwarders/<fNo> if needed
// (pending: ภูม mirrors adminMarkForwarderPaid per T-P1 pattern).
export async function payForwarderFromWallet(
  fNo: string,
): Promise<ActionResult<{ tx_id: string; already_paid: boolean }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // 1. Verify ownership + status + total via RLS-protected fetch
  const { data: forwarder } = await supabase
    .from("forwarders")
    .select("id, f_no, status, total_price")
    .eq("f_no", fNo)
    .maybeSingle<{ id: string; f_no: string; status: string; total_price: number }>();
  if (!forwarder)                                 return { ok: false, error: "not_found" };
  if (forwarder.status !== "pending_payment")     return { ok: false, error: "forwarder_not_payable" };
  const totalThb = Number(forwarder.total_price);
  if (!(totalThb > 0))                            return { ok: false, error: "total_price_invalid" };

  // 2. Idempotency: existing completed payment tx for this forwarder?
  const { data: existingTx } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("reference_type", "forwarder")
    .eq("reference_id", forwarder.f_no)
    .eq("kind", "import_payment")
    .eq("status", "completed")
    .maybeSingle<{ id: string }>();
  if (existingTx) {
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

  // W-1/S-2: assertOwnedProfileId makes the ownership check un-skippable
  // — if a future edit sets profile_id from an untrusted input, this
  // throws instead of writing a cross-customer wallet debit.
  const { data: tx, error: txErr } = await admin
    .from("wallet_transactions")
    .insert(assertOwnedProfileId(user.id, {
      profile_id:     user.id,
      bucket:         "main",
      amount:         -totalThb,
      kind:           "import_payment",
      status:         "completed",
      reference_type: "forwarder",
      reference_id:   forwarder.f_no,
      admin_id:       null,
      note:           `ชำระค่าฝากนำเข้า ${forwarder.f_no} (ตัดจาก wallet โดยลูกค้า)`,
    }))
    .select("id")
    .single<{ id: string }>();
  if (txErr) {
    // 23505 = the 0061 partial-unique guard (wallet_tx_import_payment_uniq)
    // caught a concurrent double-debit. Re-SELECT the winning tx and return
    // idempotently — mirrors the F-11 pattern in payServiceOrderFromWallet.
    if (txErr.code === "23505" || /duplicate|unique/i.test(txErr.message)) {
      const { data: raced } = await admin
        .from("wallet_transactions")
        .select("id")
        .eq("reference_type", "forwarder")
        .eq("reference_id", forwarder.f_no)
        .eq("kind", "import_payment")
        .eq("status", "completed")
        .maybeSingle<{ id: string }>();
      if (raced) return { ok: true, data: { tx_id: raced.id, already_paid: true } };
    }
    return { ok: false, error: `wallet insert: ${txErr.message}` };
  }

  const { error: fwdErr } = await admin
    .from("forwarders")
    .update({ status: "shipped_china" })
    .eq("id", forwarder.id);
  if (fwdErr) {
    return {
      ok: false,
      error: `forwarder update failed AFTER wallet debit (tx ${tx.id} stays): ${fwdErr.message}`,
    };
  }

  // 5. Notify customer (self-action confirmation)
  void sendNotification(user.id, notify.walletTxStatusChanged({
    kind:   "import_payment",
    status: "completed",
    amount: -totalThb,
    note:   `ฝากนำเข้า ${forwarder.f_no}`,
    txId:   tx.id,
  }));

  revalidatePath(`/service-import/${forwarder.f_no}`);
  revalidatePath("/service-import");
  revalidatePath("/service-import/pending");
  revalidatePath("/wallet");
  revalidatePath("/wallet/history");

  return { ok: true, data: { tx_id: tx.id, already_paid: false } };
}
