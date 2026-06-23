import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MOMO_STATUS_TH, type MomoShipmentStatus } from "@/lib/integrations/momo-isolated/types";
import { transportModeFromCabinetName } from "@/lib/forwarder/cabinet-transport";

/**
 * MOMO recent-arrivals summary — the "ตัวบอก ว่าของอยู่ MOMO แล้ว ตู้ไหน · แทรคกิ้งไหน ·
 * กี่คิว · กี่กล่อง" the owner asked for (2026-06-23). Reads the FRESH MOMO feed
 * (`momo_import_tracks`, upserted by the 10-min cron) — richer than the tb_forwarder
 * fstatus view: it carries the real cabinet (container_batch_no), per-tracking คิว/กล่อง/
 * น้ำหนัก, MOMO status, ETA. Grouped by container so staff scan "ตู้ X — N กล่อง · M คิว ·
 * พร้อมจัดการ" at a glance, then click through to /admin/api-forwarder-momo.
 *
 * READ-ONLY · no writes · no money. The collect action stays on the forwarder/billing
 * surfaces (this only surfaces the arrival so nobody has to wait for the MOMO chat).
 */

const MODE_TH: Record<string, string> = { "1": "รถ", "2": "เรือ", "3": "อากาศ" };

export type MomoArrivalContainer = {
  container: string;
  modeTh: string;
  trackingCount: number;
  committedCount: number; // already pulled into tb_forwarder
  totalCbm: number;
  totalBoxes: number;
  totalWeight: number;
  latestStatusTh: string;
  arrivedTh: boolean; // any member at AT_WAREHOUSE_TH → ready to bill/collect
  eta: string | null;
  lastUpdate: string | null;
};

export type MomoArrivalSummary = {
  containers: MomoArrivalContainer[];
  totalContainers: number;
  totalTrackings: number;
  totalCbm: number;
  totalBoxes: number;
  arrivedThCount: number; // trackings already at TH warehouse (ready to collect)
};

const EMPTY: MomoArrivalSummary = {
  containers: [], totalContainers: 0, totalTrackings: 0, totalCbm: 0, totalBoxes: 0, arrivedThCount: 0,
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Recent MOMO arrivals grouped by container (cap = newest `limit` containers).
 * "Arrival" = has a real cabinet assigned (container_batch_no) — i.e. MOMO has
 * routed it into a closed/closing container at the China warehouse onward.
 */
export async function getMomoRecentArrivals(limit = 12): Promise<MomoArrivalSummary> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("momo_import_tracks")
    .select("momo_tracking_no, container_batch_no, shipment_status, cbm, weight_kg, quantity, eta, committed_at, updated_at")
    .not("container_batch_no", "is", null)
    .neq("container_batch_no", "")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(800);
  if (error) {
    console.error("[getMomoRecentArrivals] query failed", { code: error.code, message: error.message });
    return EMPTY;
  }
  const rows = data ?? [];
  if (rows.length === 0) return EMPTY;

  // group by container — keep insertion order (already newest-first by updated_at)
  const byContainer = new Map<string, typeof rows>();
  for (const r of rows) {
    const c = (r.container_batch_no ?? "").trim();
    if (!c) continue;
    const arr = byContainer.get(c);
    if (arr) arr.push(r);
    else byContainer.set(c, [r]);
  }

  const containers: MomoArrivalContainer[] = [];
  let totalTrackings = 0, totalCbm = 0, totalBoxes = 0, arrivedThCount = 0;

  for (const [container, members] of byContainer) {
    const mode = transportModeFromCabinetName(container);
    let cbm = 0, boxes = 0, weight = 0, committed = 0, arrivedHere = 0;
    let latest = members[0];
    for (const m of members) {
      cbm += num(m.cbm);
      boxes += num(m.quantity);
      weight += num(m.weight_kg);
      if (m.committed_at) committed += 1;
      if (m.shipment_status === "AT_WAREHOUSE_TH") { arrivedHere += 1; arrivedThCount += 1; }
      // latest = most recently updated member (rows already newest-first, so members[0])
      if ((m.updated_at ?? "") > (latest.updated_at ?? "")) latest = m;
    }
    const statusKey = (latest.shipment_status ?? "") as MomoShipmentStatus;
    containers.push({
      container,
      modeTh: mode ? (MODE_TH[mode] ?? "—") : "—",
      trackingCount: members.length,
      committedCount: committed,
      totalCbm: Math.round(cbm * 1000) / 1000,
      totalBoxes: boxes,
      totalWeight: Math.round(weight * 100) / 100,
      latestStatusTh: MOMO_STATUS_TH[statusKey] ?? (latest.shipment_status || "—"),
      arrivedTh: arrivedHere > 0,
      eta: latest.eta ?? null,
      lastUpdate: latest.updated_at ?? null,
    });
    totalTrackings += members.length;
    totalCbm += cbm;
    totalBoxes += boxes;
  }

  return {
    containers: containers.slice(0, limit),
    totalContainers: byContainer.size,
    totalTrackings,
    totalCbm: Math.round(totalCbm * 1000) / 1000,
    totalBoxes,
    arrivedThCount,
  };
}
