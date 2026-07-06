"use server";

/**
 * กระสอบรวม (consolidated-sack) server actions — READ-ONLY partner MIRROR.
 *
 * There is NO `sack` table. A "กระสอบ" is a GROUP of `momo_import_tracks` rows that
 * share the same `momo_sack_no` (the MOMO partner mirror already on prod — กวางโจว
 * uses MOMO; อี้อู uses TTW, out of scope). Pacred MIRRORS this data — it does not
 * originate sacks (warehouse-created sacks are a future own-freight feature).
 *
 * 🔒 GUARDRAILS:
 *   - READ-ONLY over momo_import_tracks. NO create / edit / delete — mirror only.
 *   - PHYSICAL-ONLY — weight_kg / cbm / quantity + shipment_status. There is NO
 *     price / cost / profit on momo_import_tracks and none is read/written here.
 *   - Never touches tb_forwarder / tb_cnt / tb_payment / any money table.
 *   - All actions gated withAdmin(['warehouse','super','ops']).
 *   - "use server" exports ONLY async functions.
 *   - error destructured on every Supabase call.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, type AdminActionResult } from "./common";
import {
  transportTypeOf,
  type DerivedSack,
  type SackParcel,
} from "@/lib/warehouse/sack";

const SACK_ROLES = ["warehouse", "super", "ops"] as const;

// The subset of momo_import_tracks columns we aggregate for the list. Fetch a
// bounded page of TAGGED rows (momo_sack_no present), then group in JS by sack.
const LIST_COLS =
  "momo_sack_no, momo_container_no, container_batch_no, quantity, weight_kg, cbm, shipment_status, current_location, last_synced_at, momo_user_code";
// Rows for one sack's detail — one card per parcel.
const DETAIL_COLS =
  "momo_tracking_no, momo_sack_no, momo_container_no, momo_user_code, momo_cg_no, weight_kg, cbm, quantity, shipment_status, current_location, last_synced_at";

// The per-fetch cap. A sack groups small parcels, so 5000 tagged rows is a wide
// safety margin over the live ~33 tagged rows; PostgREST would otherwise page at 1000.
const LIST_FETCH_CAP = 5000;

export type ListSacksFilters = {
  container?: string;   // momo_container_no / container_batch_no contains
  sackNo?: string;      // momo_sack_no contains
  memberCode?: string;  // momo_user_code contains (PR)
};

type ListRow = {
  momo_sack_no: string | null;
  momo_container_no: string | null;
  container_batch_no: string | null;
  quantity: number | null;
  weight_kg: number | null;
  cbm: number | null;
  shipment_status: string | null;
  current_location: string | null;
  last_synced_at: string | null;
  momo_user_code: string | null;
};

// ── list (group momo_import_tracks by momo_sack_no) ──────────
export async function listSacks(
  rawFilters: ListSacksFilters = {},
): Promise<AdminActionResult<DerivedSack[]>> {
  const f = {
    container: (rawFilters.container ?? "").trim(),
    sackNo: (rawFilters.sackNo ?? "").trim(),
    memberCode: (rawFilters.memberCode ?? "").trim(),
  };

  return withAdmin<DerivedSack[]>([...SACK_ROLES], async () => {
    const admin = createAdminClient();

    // Only rows that carry a sack (momo_sack_no present). PostgREST can't GROUP BY,
    // so we fetch the tagged rows (bounded) and aggregate by momo_sack_no in JS.
    let q = admin
      .from("momo_import_tracks")
      .select(LIST_COLS)
      .not("momo_sack_no", "is", null)
      .neq("momo_sack_no", "")
      .order("last_synced_at", { ascending: false, nullsFirst: false })
      .limit(LIST_FETCH_CAP);

    if (f.sackNo) q = q.ilike("momo_sack_no", `%${f.sackNo}%`);
    if (f.memberCode) q = q.ilike("momo_user_code", `%${f.memberCode}%`);
    if (f.container) {
      // container search matches EITHER the MOMO routing batch OR the real batch no.
      q = q.or(
        `momo_container_no.ilike.%${f.container}%,container_batch_no.ilike.%${f.container}%`,
      );
    }

    const { data, error } = await q;
    if (error) {
      console.error("[listSacks] failed", { code: error.code, message: error.message });
      return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    }

    const rows = (data ?? []) as ListRow[];

    // Aggregate by momo_sack_no.
    const bySack = new Map<
      string,
      {
        parcels: number;
        qty: number;
        weight: number;
        cbm: number;
        container: string | null;
        status: string | null;
        lastSynced: string | null;
      }
    >();

    for (const r of rows) {
      const key = (r.momo_sack_no ?? "").trim();
      if (!key) continue;
      const cur =
        bySack.get(key) ??
        { parcels: 0, qty: 0, weight: 0, cbm: 0, container: null, status: null, lastSynced: null };
      cur.parcels += 1;
      cur.qty += Number(r.quantity) || 0;
      cur.weight += Number(r.weight_kg) || 0;
      cur.cbm += Number(r.cbm) || 0;
      // representative container = the first non-empty momo_container_no seen.
      if (!cur.container && r.momo_container_no && r.momo_container_no.trim()) {
        cur.container = r.momo_container_no.trim();
      }
      // representative status = first non-empty shipment_status, else current_location.
      if (!cur.status) {
        const s = (r.shipment_status ?? "").trim() || (r.current_location ?? "").trim();
        if (s) cur.status = s;
      }
      // latest last_synced_at across the group.
      if (r.last_synced_at && (!cur.lastSynced || r.last_synced_at > cur.lastSynced)) {
        cur.lastSynced = r.last_synced_at;
      }
      bySack.set(key, cur);
    }

    const sacks: DerivedSack[] = Array.from(bySack.entries())
      .map(([sack_no, v]) => ({
        sack_no,
        container: v.container,
        transport_type: transportTypeOf(v.container),
        parcels: v.parcels,
        qty: v.qty,
        weight: v.weight,
        cbm: v.cbm,
        status: v.status,
        last_synced_at: v.lastSynced,
      }))
      // newest-synced sacks first (null last).
      .sort((a, b) => (b.last_synced_at ?? "").localeCompare(a.last_synced_at ?? ""));

    return { ok: true, data: sacks };
  });
}

// ── get one sack (its momo_import_tracks rows + computed header) ──
export async function getSack(
  sackNo: string,
): Promise<AdminActionResult<{ sack: DerivedSack; parcels: SackParcel[] }>> {
  const key = (sackNo ?? "").trim();
  if (!key) return { ok: false, error: "invalid_sack_no" };

  return withAdmin<{ sack: DerivedSack; parcels: SackParcel[] }>([...SACK_ROLES], async () => {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("momo_import_tracks")
      .select(DETAIL_COLS)
      .eq("momo_sack_no", key)
      .order("momo_tracking_no", { ascending: true });
    if (error) {
      console.error("[getSack] failed", { code: error.code, message: error.message });
      return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    }

    const rows = (data ?? []) as Array<{
      momo_tracking_no: string | null;
      momo_sack_no: string | null;
      momo_container_no: string | null;
      momo_user_code: string | null;
      momo_cg_no: string | null;
      weight_kg: number | null;
      cbm: number | null;
      quantity: number | null;
      shipment_status: string | null;
      current_location: string | null;
      last_synced_at: string | null;
    }>;

    if (rows.length === 0) return { ok: false, error: "ไม่พบกระสอบ" };

    const parcels: SackParcel[] = rows.map((r) => ({
      momo_tracking_no: r.momo_tracking_no,
      momo_user_code: r.momo_user_code,
      momo_cg_no: r.momo_cg_no,
      weight_kg: Number(r.weight_kg) || 0,
      cbm: Number(r.cbm) || 0,
      quantity: Number(r.quantity) || 0,
      shipment_status: r.shipment_status,
      current_location: r.current_location,
    }));

    // Computed header — the same aggregation the list does, for this one sack.
    let container: string | null = null;
    let status: string | null = null;
    let lastSynced: string | null = null;
    let qty = 0;
    let weight = 0;
    let cbm = 0;
    for (const r of rows) {
      qty += Number(r.quantity) || 0;
      weight += Number(r.weight_kg) || 0;
      cbm += Number(r.cbm) || 0;
      if (!container && r.momo_container_no && r.momo_container_no.trim()) {
        container = r.momo_container_no.trim();
      }
      if (!status) {
        const s = (r.shipment_status ?? "").trim() || (r.current_location ?? "").trim();
        if (s) status = s;
      }
      if (r.last_synced_at && (!lastSynced || r.last_synced_at > lastSynced)) {
        lastSynced = r.last_synced_at;
      }
    }

    const sack: DerivedSack = {
      sack_no: key,
      container,
      transport_type: transportTypeOf(container),
      parcels: rows.length,
      qty,
      weight,
      cbm,
      status,
      last_synced_at: lastSynced,
    };

    return { ok: true, data: { sack, parcels } };
  });
}
