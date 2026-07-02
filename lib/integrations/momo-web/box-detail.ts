import "server-only";

/**
 * MOMO Live → momo_box_detail (per-box dimensions) writer + the pure box-row
 * builder (owner/ภูม 2026-07-02).
 *
 * WHY THIS EXISTS
 * ──────────────
 * A cargo tracking can be split by MOMO into N boxes with DIFFERENT sizes
 * (e.g. 1782103385 = 6 boxes: 204×61×80 / 194×125×166 / 190×115×110 / …).
 * tb_forwarder holds ONE row per BASE tracking (the aggregate), so it can only
 * carry ก×ย×ส for a SINGLE-box tracking (propagate-live-data.ts fills dims only
 * when parcelCount===1). This module PERSISTS the per-box breakdown MOMO's Live
 * scrape already carries into the isolated momo_box_detail table so the
 * report-cnt "แยกตามขนาด" panel + the forwarder per-box view can show each box's
 * real size.
 *
 * 💰 MONEY-SAFETY — DISPLAY/DETAIL only. momo_box_detail is NEVER read by any
 *    pricing/billing/cost path (the price uses tb_forwarder.fvolume aggregate),
 *    and this writer NEVER touches tb_forwarder. best-effort: a failing upsert is
 *    logged + skipped, never fatal to the money-fill / status pass.
 *
 * @see lib/integrations/momo-web/propagate-live-data.ts — the caller (shares the scrape)
 * @see lib/integrations/momo-web/live-parcel-metrics.ts  — baseTrackingOf (shared suffix rule)
 * @see supabase/migrations/0240_momo_box_detail.sql       — the table
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MomoLiveParcel } from "./types";
import { baseTrackingOf } from "./live-parcel-metrics";

/** A row ready to upsert into momo_box_detail (one per split box). */
export type MomoBoxDetailRow = {
  base_tracking: string;
  box_tracking: string;
  member_code: string | null;
  container_name: string | null;
  container_code: string | null;
  container_no: string | null;
  width: number;
  length: number;
  height: number;
  weight_kg: number;
  cbm: number;
  quantity: number;
  status_id: number;
  status_text: string;
};

/** Round to 2dp (dims/weight — momo_box_detail numeric). */
function r2(n: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Number(v.toFixed(2)) : 0;
}
/** Round to 6dp (per-piece คิว). */
function r6(n: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Number(v.toFixed(6)) : 0;
}
/** Pieces count — floored at 1 (a box is at least one piece). */
function piecesOf(q: number): number {
  const n = Math.round(Number(q));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * PURE — build the momo_box_detail rows from a set of Live parcels.
 *
 * ONE row per split box (per parcel). Deduped by the exact box tracking (the
 * newest sighting wins — later parcels in the array overwrite earlier ones with
 * the same box tracking; the caller already dedupes by tracking across boards, so
 * this is a defensive guard). Parcels with no tracking are skipped.
 *
 * We keep EVERY box (single-box trackings too) so the report grouping can show a
 * real box size even for a one-box tracking whose tb_forwarder dims are somehow
 * still blank. The per-piece weight/cbm are preserved as MOMO reports them.
 */
export function buildBoxDetailRows(
  parcels: readonly MomoLiveParcel[],
): MomoBoxDetailRow[] {
  const byBox = new Map<string, MomoBoxDetailRow>();
  for (const p of parcels) {
    const boxTracking = (p.tracking ?? "").trim();
    if (!boxTracking) continue;
    byBox.set(boxTracking, {
      base_tracking: baseTrackingOf(boxTracking),
      box_tracking: boxTracking,
      member_code: (p.memberCode ?? "").trim() || null,
      container_name: (p.containerName ?? "").trim() || null,
      container_code: (p.containerCode ?? "").trim() || null,
      container_no: (p.containerNo ?? "").trim() || null,
      width: r2(p.width),
      length: r2(p.length),
      height: r2(p.height),
      weight_kg: r2(p.weightKg),
      cbm: r6(p.cbm),
      quantity: piecesOf(p.quantity),
      status_id: Number.isFinite(Number(p.statusId)) ? Number(p.statusId) : 0,
      status_text: (p.statusText ?? "").trim(),
    });
  }
  return Array.from(byBox.values());
}

/** A per-box detail row for DISPLAY (the forwarder editor's read-only breakdown). */
export type MomoBoxDetailView = {
  boxTracking: string;
  memberCode: string | null;
  width: number;
  length: number;
  height: number;
  weightKg: number;
  cbm: number;
  quantity: number;
};

/**
 * Read the per-box detail for a set of BASE trackings → a Map keyed by base
 * tracking → its boxes (sorted by the "-i/n" suffix then tracking). Read-only ·
 * best-effort: on a missing table / any error returns an EMPTY map (the caller
 * degrades to "no per-box detail"). NEVER touches tb_forwarder / money.
 */
export async function getBoxDetailsForBaseTrackings(
  admin: SupabaseClient,
  baseTrackings: readonly string[],
): Promise<Map<string, MomoBoxDetailView[]>> {
  const byBase = new Map<string, MomoBoxDetailView[]>();
  const keys = Array.from(new Set(baseTrackings.map((t) => (t ?? "").trim()).filter(Boolean)));
  if (keys.length === 0) return byBase;

  const CHUNK = 200;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const slice = keys.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("momo_box_detail")
      .select("base_tracking, box_tracking, member_code, width, length, height, weight_kg, cbm, quantity")
      .in("base_tracking", slice);
    if (error) {
      console.error("[getBoxDetailsForBaseTrackings] lookup failed (fallback to none)", {
        code: error.code,
        message: error.message,
      });
      return byBase; // degrade — no per-box detail
    }
    for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
      const base = String(r.base_tracking ?? "").trim();
      if (!base) continue;
      const view: MomoBoxDetailView = {
        boxTracking: String(r.box_tracking ?? ""),
        memberCode: (String(r.member_code ?? "").trim() || null),
        width: Number(r.width ?? 0) || 0,
        length: Number(r.length ?? 0) || 0,
        height: Number(r.height ?? 0) || 0,
        weightKg: Number(r.weight_kg ?? 0) || 0,
        cbm: Number(r.cbm ?? 0) || 0,
        quantity: Math.max(1, Math.round(Number(r.quantity ?? 0)) || 0) || 1,
      };
      const arr = byBase.get(base);
      if (arr) arr.push(view);
      else byBase.set(base, [view]);
    }
  }
  // Sort each base's boxes by the numeric "-i/n" suffix (then tracking) for a stable
  // display order matching MOMO's "-1/6 … -6/6".
  for (const arr of byBase.values()) {
    arr.sort((a, b) => suffixOf(a.boxTracking) - suffixOf(b.boxTracking) || a.boxTracking.localeCompare(b.boxTracking));
  }
  return byBase;
}

/** The leading number of a MOMO "-i/n" (or "-i") split-suffix; 0 when none. */
function suffixOf(tracking: string): number {
  const m = /-(\d+)(?:\/\d+)?$/.exec((tracking ?? "").trim());
  return m ? Number(m[1]) : 0;
}

/**
 * One edited box to persist (from the forwarder editor's staff-fixed dims). The
 * dimension/weight/คิว/pieces the pricer typed for THIS box.
 */
export type MomoBoxDetailEdit = {
  boxTracking: string;
  width: number;
  length: number;
  height: number;
  weightKg: number;
  cbm: number;
  quantity: number;
};

/**
 * UPSERT staff-edited per-box dims into momo_box_detail (keyed by
 * base_tracking + box_tracking). Recomputes each box's cbm from its own dims
 * (fallback to the passed cbm when all dims are 0). Preserves the box's existing
 * member_code/container_* (this edit path only touches the physical measurements,
 * so the identity/container columns set by the Live scrape are left intact via the
 * merge-select below). best-effort chunked · idempotent (ON CONFLICT overwrites in
 * place). NEVER touches tb_forwarder / money — the caller recomputes the ONE row.
 *
 * @param baseTracking the base tracking these boxes belong to (the JOIN key).
 * @returns count upserted + any per-chunk error (never throws).
 */
export async function upsertEditedBoxDetails(
  admin: SupabaseClient,
  baseTracking: string,
  edits: readonly MomoBoxDetailEdit[],
): Promise<{ upserted: number; errors: Array<{ scope: string; message: string }> }> {
  const base = (baseTracking ?? "").trim();
  const result = { upserted: 0, errors: [] as Array<{ scope: string; message: string }> };
  if (!base || edits.length === 0) return result;

  // Read the existing rows so we KEEP the identity/container columns MOMO's Live
  // scrape set (member_code / container_*) — this staff-edit only rewrites the
  // physical dims. Missing table / any error → we still upsert with nulls (the box
  // dims are the point; identity columns just won't be back-filled).
  const boxKeys = Array.from(new Set(edits.map((e) => (e.boxTracking ?? "").trim()).filter(Boolean)));
  const existingByBox = new Map<string, Record<string, unknown>>();
  {
    const { data, error } = await admin
      .from("momo_box_detail")
      .select("box_tracking, member_code, container_name, container_code, container_no, status_id, status_text")
      .eq("base_tracking", base)
      .in("box_tracking", boxKeys);
    if (error) {
      console.error("[upsertEditedBoxDetails] existing lookup failed (upsert w/o identity merge)", {
        code: error.code, message: error.message, base,
      });
    } else {
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        const bt = String(r.box_tracking ?? "").trim();
        if (bt) existingByBox.set(bt, r);
      }
    }
  }

  const nowIso = new Date().toISOString();
  const rows = edits
    .map((e) => {
      const boxTracking = (e.boxTracking ?? "").trim();
      if (!boxTracking) return null;
      const w = r2(e.width), l = r2(e.length), h = r2(e.height);
      const cbm = w > 0 || l > 0 || h > 0 ? r6((w * l * h) / 1_000_000) : r6(e.cbm);
      const prev = existingByBox.get(boxTracking) ?? {};
      return {
        base_tracking: base,
        box_tracking: boxTracking,
        member_code: (prev.member_code as string | null) ?? null,
        container_name: (prev.container_name as string | null) ?? null,
        container_code: (prev.container_code as string | null) ?? null,
        container_no: (prev.container_no as string | null) ?? null,
        width: w,
        length: l,
        height: h,
        weight_kg: r2(e.weightKg),
        cbm,
        quantity: piecesOf(e.quantity),
        status_id: Number.isFinite(Number(prev.status_id)) ? Number(prev.status_id) : 0,
        status_text: (prev.status_text as string | null) ?? "",
        last_synced_at: nowIso,
        updated_at: nowIso,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await admin
      .from("momo_box_detail")
      .upsert(slice, { onConflict: "base_tracking,box_tracking" });
    if (error) {
      console.error("[upsertEditedBoxDetails] upsert failed", { code: error.code, message: error.message });
      result.errors.push({ scope: `chunk:${i}`, message: `${error.code} ${error.message}` });
      continue;
    }
    result.upserted += slice.length;
  }
  return result;
}

export type BoxDetailFillResult = {
  /** Distinct split boxes seen across the Live parcels. */
  boxesSeen: number;
  /** Rows upserted into momo_box_detail. */
  upserted: number;
  /** Per-chunk errors. best-effort: an error never aborts the run. */
  errors: Array<{ scope: string; message: string }>;
};

/**
 * Upsert the per-box detail into momo_box_detail. best-effort + chunked.
 *
 * Idempotent via ON CONFLICT (base_tracking, box_tracking) — re-sync overwrites
 * the same box in place (the latest MOMO measurement wins). NEVER touches
 * tb_forwarder or any money path.
 */
export async function fillMomoBoxDetails(
  admin: SupabaseClient,
  parcels: readonly MomoLiveParcel[],
  result: BoxDetailFillResult = { boxesSeen: 0, upserted: 0, errors: [] },
): Promise<BoxDetailFillResult> {
  const rows = buildBoxDetailRows(parcels);
  result.boxesSeen = rows.length;
  if (rows.length === 0) return result;

  const nowIso = new Date().toISOString();
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK).map((r) => ({ ...r, last_synced_at: nowIso, updated_at: nowIso }));
    const { error } = await admin
      .from("momo_box_detail")
      .upsert(slice, { onConflict: "base_tracking,box_tracking" });
    if (error) {
      console.error("[fillMomoBoxDetails] upsert failed", { code: error.code, message: error.message });
      result.errors.push({ scope: `chunk:${i}`, message: `${error.code} ${error.message}` });
      continue;
    }
    result.upserted += slice.length;
  }
  return result;
}
