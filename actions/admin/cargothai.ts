"use server";

/**
 * CargoThai admin sync actions — Sprint-7 foundation.
 *
 * The legacy `test-api/update-data-cargothai/index.php` walks the
 * CargoThai GetContainerV2 endpoint with `?Sdate=&Edate=` and upserts
 * every container + its product list into:
 *   - tb_tmp_forwarder_cargothai       (one row per `sm_code`)
 *   - tb_tmp_forwarder_item_cargothai  (one row per `product_id`)
 *
 * This action is the modern equivalent — called from the /admin/cargothai
 * page button (manual trigger) and from the cron (`/api/cron/cargothai-sync`).
 * Auth-gated to ops/accounting; service-role admin client does the writes
 * (the tb_tmp_forwarder_* tables are RLS-locked per 0081).
 *
 * Idempotent — re-running for the same window is safe (upsert on
 * sm_code / product_id, mirroring the legacy `INSERT vs UPDATE` branch).
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  fetchContainers,
  normaliseUserId,
  splitSmCode,
  type CargoThaiContainer,
  type CargoThaiProduct,
} from "@/lib/integrations/cargothai/client";
import { logger } from "@/lib/logger";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type CargoThaiSyncSummary = {
  /** Total containers returned by the API page(s). */
  containers_scanned:  number;
  containers_inserted: number;
  containers_updated:  number;
  /** Total products across all containers in the window. */
  items_scanned:       number;
  items_inserted:      number;
  items_updated:       number;
  /** Pages fetched from CargoThai (we cap at `MAX_PAGES` per run). */
  pages_fetched:       number;
};

/** Cap pages-per-run so a runaway upstream never times the cron out. */
const MAX_PAGES = 5;

export type CargoThaiSyncInput = {
  /** YYYY-MM-DD inclusive. Defaults to yesterday. */
  from?: string;
  /** YYYY-MM-DD inclusive. Defaults to today. */
  to?:   string;
};

/**
 * Manual / cron-triggered sync. Auth-gates first; then walks pages of
 * CargoThai container data + upserts into the two tb_tmp_* tables.
 *
 * Returns `not_configured` (translated to a friendly error) when
 * PACRED_CARGOTHAI_TOKEN env var is unset — the foundation ships
 * with the wiring in place, gated until ก๊อต gets the partner token.
 */
export async function adminSyncCargoThai(
  input: CargoThaiSyncInput = {},
): Promise<ActionResult<CargoThaiSyncSummary>> {
  await requireAdmin(["ops", "accounting"]);

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const summary: CargoThaiSyncSummary = {
    containers_scanned:  0,
    containers_inserted: 0,
    containers_updated:  0,
    items_scanned:       0,
    items_inserted:      0,
    items_updated:       0,
    pages_fetched:       0,
  };

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await fetchContainers({ from: input.from, to: input.to, page });
    summary.pages_fetched = page;

    if (!res.ok) {
      // Token unset → friendly TH error so the admin UI shows the
      // "ขอ token จาก CargoThai ops" banner instead of a generic crash.
      if (res.reason === "not_configured") {
        return {
          ok: false,
          error: "ระบบยังไม่ได้ตั้งค่า PACRED_CARGOTHAI_TOKEN — ติดต่อทีม Pacred",
        };
      }
      if (res.reason === "auth_failed") {
        return { ok: false, error: "token CargoThai หมดอายุหรือไม่ถูกต้อง — ขอใหม่จาก CargoThai" };
      }
      if (res.reason === "rate_limited") {
        return { ok: false, error: "CargoThai rate-limit — ลองอีกครั้งใน 5 นาที" };
      }
      logger.warn("cargothai-sync", "page fetch failed", {
        page, reason: res.reason, http: res.httpStatus, message: res.message,
      });
      return { ok: false, error: `CargoThai sync failed: ${res.reason}${res.message ? ` (${res.message})` : ""}` };
    }

    summary.containers_scanned += res.containers.length;

    for (const c of res.containers) {
      const counts = await upsertContainer(admin, c, nowIso);
      summary.containers_inserted += counts.containerInserted;
      summary.containers_updated  += counts.containerUpdated;
      summary.items_scanned       += counts.itemsScanned;
      summary.items_inserted      += counts.itemsInserted;
      summary.items_updated       += counts.itemsUpdated;
    }

    if (!res.hasMore) break;
  }

  revalidatePath("/admin/cargothai");
  logger.info("cargothai-sync", "sync done", summary);

  return { ok: true, data: summary };
}

/** Upsert one container + its product_list into tb_tmp_forwarder_*.
 *  Returns per-row counters so the caller can aggregate. */
async function upsertContainer(
  admin:   ReturnType<typeof createAdminClient>,
  row:     CargoThaiContainer,
  nowIso:  string,
): Promise<{
  containerInserted: number;
  containerUpdated:  number;
  itemsScanned:      number;
  itemsInserted:     number;
  itemsUpdated:      number;
}> {
  const counters = {
    containerInserted: 0,
    containerUpdated:  0,
    itemsScanned:      0,
    itemsInserted:     0,
    itemsUpdated:      0,
  };

  if (!row.sm_code) return counters;

  const userID  = normaliseUserId(row);
  const { sm, hNo } = splitSmCode(row.sm_code);

  // Container-level upsert via "fetch then INSERT or UPDATE" (mirrors
  // legacy index.php L97-148). Supabase doesn't expose a true ON CONFLICT
  // for the legacy table (no unique on sm_code at the PostgREST surface),
  // so we use the same query-then-write split.
  const { data: existing, error: lookupErr } = await admin
    .from("tb_tmp_forwarder_cargothai")
    .select("sm_code")
    .eq("sm_code", row.sm_code)
    .maybeSingle<{ sm_code: string }>();
  if (lookupErr) {
    logger.warn("cargothai-sync", "container lookup failed", { sm_code: row.sm_code, reason: lookupErr.message });
    return counters;
  }

  const payload = {
    smid:                String(row.id ?? ""),
    customer_code:       row.customer_code ?? row.costomer_code ?? "",
    order_no:            row.order_no ?? "",
    updated_at:          row.updated_at ?? null,
    tracking:            row.tracking ?? "",
    container_name:      row.container_name ?? "",
    container_code:      row.container_code ?? "",
    due_date:            row.due_date ?? null,
    box_total:           row.box_total ?? null,
    box_weight:          row.box_weight ?? null,
    box_cbm:             row.box_cbm ?? null,
    sm_code:             row.sm_code,
    sm_date:             row.sm_date ?? null,
    manifest_date:       row.manifest_date ?? null,
    estimated_date:      row.estimated_date ?? null,
    etd:                 row.etd ?? null,
    eta:                 row.eta ?? null,
    re:                  row.re ?? "",
    created_at:          row.created_at ?? null,
    note:                row.note ?? "",
    note_amount:         row.note_amount ?? null,
    transport_name:      row.transport_name ?? "",
    transport_code:      row.transport_code ?? "",
    warehouse_name:      row.warehouse_name ?? "",
    warehouse_code:      row.warehouse_code ?? "",
    sm,
    userid:              userID,
    hno:                 hNo,
    api_lasttimeupdated: nowIso,
  };

  if (existing) {
    const { error } = await admin
      .from("tb_tmp_forwarder_cargothai")
      .update(payload)
      .eq("sm_code", row.sm_code);
    if (!error) counters.containerUpdated = 1;
  } else {
    const { error } = await admin
      .from("tb_tmp_forwarder_cargothai")
      .insert(payload);
    if (!error) counters.containerInserted = 1;
  }

  // Per-item upsert — mirrors legacy index.php L150-220.
  const products = row.product_list ?? [];
  for (const p of products) {
    counters.itemsScanned += 1;
    const itemCounters = await upsertItem(admin, row, p, userID, sm, nowIso);
    counters.itemsInserted += itemCounters.inserted;
    counters.itemsUpdated  += itemCounters.updated;
  }

  return counters;
}

async function upsertItem(
  admin:   ReturnType<typeof createAdminClient>,
  parent:  CargoThaiContainer,
  p:       CargoThaiProduct,
  userID:  string,
  sm:      string,
  nowIso:  string,
): Promise<{ inserted: number; updated: number }> {
  if (p.product_id == null || p.product_id === "") return { inserted: 0, updated: 0 };

  const tracking = (p.product_tracking ?? "").toString().trim() || sm;

  const { data: existing, error: lookupErr } = await admin
    .from("tb_tmp_forwarder_item_cargothai")
    .select("productid")
    .eq("productid", String(p.product_id))
    .maybeSingle<{ productid: string }>();
  if (lookupErr) {
    logger.warn("cargothai-sync", "item lookup failed", { productid: String(p.product_id), reason: lookupErr.message });
    return { inserted: 0, updated: 0 };
  }

  if (existing) {
    const { error } = await admin
      .from("tb_tmp_forwarder_item_cargothai")
      .update({
        productqty:             p.product_qty ?? null,
        productweightall:       p.product_weight_all ?? null,
        productcbmall:          p.product_cbm_all ?? null,
        productweightformat:    p.product_weight_format ?? "",
        containercode:          parent.container_code ?? "",
        userid:                 userID,
        date:                   parent.sm_date ?? null,
        lasttimeupdated:        nowIso,
        adminid:                "admin_tam",
        adminidupdated:         "admin_tam",
        productcostchn:         parent.note_amount ?? null,
        transport_code:         parent.transport_code ?? "",
      })
      .eq("productid", String(p.product_id));
    if (!error) return { inserted: 0, updated: 1 };
    return { inserted: 0, updated: 0 };
  }

  const { error } = await admin
    .from("tb_tmp_forwarder_item_cargothai")
    .insert({
      productid:            String(p.product_id),
      productname:          p.product_name ?? "",
      producttracking:      tracking,
      producttrackingnote:  p.product_tracking_note ?? "",
      productqty:           p.product_qty ?? null,
      productbagid:         "",
      productwidth:         p.product_width ?? null,
      productlength:        p.product_length ?? null,
      productheight:        p.product_height ?? null,
      productweightperitem: p.product_weight_per_item ?? null,
      productweightall:     p.product_weight_all ?? null,
      productcbmperitem:    p.product_cbm_per_item ?? null,
      productcbmall:        p.product_cbm_all ?? null,
      productweightformat:  p.product_weight_format ?? "",
      producttypecode:      p.product_type_code ?? "",
      containercode:        parent.container_code ?? "",
      userid:               userID,
      fid:                  "",
      date:                 parent.sm_date ?? null,
      lasttimeupdated:      nowIso,
      adminid:              "admin_tam",
      adminidupdated:       "admin_tam",
      sm_code:              parent.sm_code,
      sm,
      container_code:       parent.container_code ?? "",
      productcostchn:       parent.note_amount ?? null,
      transport_code:       parent.transport_code ?? "",
    });
  if (!error) return { inserted: 1, updated: 0 };
  return { inserted: 0, updated: 0 };
}
