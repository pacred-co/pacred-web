/**
 * W10 — China-warehouse worker-app read layer.
 *
 * Read helpers over the cargo spine (tb_forwarder / tb_forwarder_item) +
 * the isolated 0169/0170/0171 tables. Server-only (uses the admin client —
 * the worker pages are admin-gated and bypass RLS). READ-ONLY · no writes.
 *
 * Reference: docs/research/cargothai-warehouse-ops-blueprint-2026-06-01.md.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type WorkerForwarderRow = {
  id: number;
  ftrackingchn: string | null;
  fidorco: string | null;
  fstatus: string | null;
  fwarehousename: string | null;
  fcabinetnumber: string | null;
  fcabinet_locked: boolean | null;
  userid: string | null;
  fdetail: string | null;
  famount: number | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  fdate: string | null;
  fdatestatus2: string | null;
};

// NOTE: deliberately does NOT select tb_forwarder.warehouse_app_intake (mig 0171)
// so the read path stays decoupled from the not-yet-applied W10 migrations. The
// "intaked today" count comes from warehouse_intake_log (mig 0169), not this col.
const WORKER_SELECT =
  "id, ftrackingchn, fidorco, fstatus, fwarehousename, fcabinetnumber, fcabinet_locked, userid, fdetail, famount, fweight, fvolume, fdate, fdatestatus2";

/** Today's intake counts + the active worker queues for the dashboard. */
export async function loadWarehouseDashboard(): Promise<{
  awaitingArrival: number;   // fstatus 1 — รอเข้าโกดังจีน
  atWarehouse: number;       // fstatus 2 — ถึงโกดังจีน (needs measure/sack)
  inTransit: number;         // fstatus 3 — กำลังส่งมาไทย
  arrivedTh: number;         // fstatus 4 — ถึงไทยแล้ว
  intakedToday: number;      // warehouse_app_intake rows touched today
  openSacks: number;         // un-sealed sacks
  recentEvents: Array<{
    id: string; fid: number; step: string; fstatus_from: string | null;
    fstatus_to: string | null; admin_id: string; created_at: string;
  }>;
}> {
  const admin = createAdminClient();

  async function countStatus(status: string): Promise<number> {
    const { count, error } = await admin
      .from("tb_forwarder")
      .select("id", { count: "exact", head: true })
      .eq("fstatus", status);
    if (error) {
      console.error(`[warehouse dashboard count ${status}] failed`, { code: error.code, message: error.message });
      return 0;
    }
    return count ?? 0;
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [awaitingArrival, atWarehouse, inTransit, arrivedTh] = await Promise.all([
    countStatus("1"),
    countStatus("2"),
    countStatus("3"),
    countStatus("4"),
  ]);

  const { count: intakedToday, error: intakedErr } = await admin
    .from("warehouse_intake_log")
    .select("id", { count: "exact", head: true })
    .eq("step", "intake")
    .gte("created_at", startOfDay.toISOString());
  if (intakedErr) {
    console.error("[warehouse dashboard intakedToday] failed", { code: intakedErr.code, message: intakedErr.message });
  }

  const { count: openSacks, error: sacksErr } = await admin
    .from("warehouse_sack")
    .select("id", { count: "exact", head: true })
    .eq("sealed", false);
  if (sacksErr) {
    console.error("[warehouse dashboard openSacks] failed", { code: sacksErr.code, message: sacksErr.message });
  }

  const { data: events, error: evErr } = await admin
    .from("warehouse_intake_log")
    .select("id, fid, step, fstatus_from, fstatus_to, admin_id, created_at")
    .order("created_at", { ascending: false })
    .limit(15);
  if (evErr) {
    console.error("[warehouse dashboard events] failed", { code: evErr.code, message: evErr.message });
  }

  return {
    awaitingArrival,
    atWarehouse,
    inTransit,
    arrivedTh,
    intakedToday: intakedToday ?? 0,
    openSacks: openSacks ?? 0,
    recentEvents: (events ?? []) as Array<{
      id: string; fid: number; step: string; fstatus_from: string | null;
      fstatus_to: string | null; admin_id: string; created_at: string;
    }>,
  };
}

/** Forwarder rows at a given fstatus (a worker queue), most-recent first. */
export async function loadWorkerQueue(
  fstatus: string,
  limit = 100,
): Promise<WorkerForwarderRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_forwarder")
    .select(WORKER_SELECT)
    .eq("fstatus", fstatus)
    .order("fdate", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    console.error(`[loadWorkerQueue ${fstatus}] failed`, { code: error.code, message: error.message });
    return [];
  }
  return (data ?? []) as unknown as WorkerForwarderRow[];
}

/** Find one forwarder by tracking / order id (the scan box). fstatus<5 only. */
export async function findForwarderByKey(keysearch: string): Promise<WorkerForwarderRow[]> {
  const admin = createAdminClient();
  const k = keysearch.trim();
  if (!k) return [];
  const { data, error } = await admin
    .from("tb_forwarder")
    .select(WORKER_SELECT)
    .or(`ftrackingchn.eq.${k},fidorco.eq.${k}`)
    .lt("fstatus", "5")
    .limit(20);
  if (error) {
    console.error(`[findForwarderByKey] failed`, { code: error.code, message: error.message });
    return [];
  }
  return (data ?? []) as unknown as WorkerForwarderRow[];
}

/** Items on a forwarder (for the measure + sack views). */
export async function loadForwarderItems(fid: number): Promise<Array<{
  id: number; productname: string | null; productqty: number | null;
  productweightall: number | string | null; productcbmall: number | string | null;
  productbagid: number | null; producttracking: string | null;
}>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_forwarder_item")
    .select("id, productname, productqty, productweightall, productcbmall, productbagid, producttracking")
    .eq("fid", fid)
    .order("id", { ascending: true });
  if (error) {
    console.error(`[loadForwarderItems ${fid}] failed`, { code: error.code, message: error.message });
    return [];
  }
  return (data ?? []) as Array<{
    id: number; productname: string | null; productqty: number | null;
    productweightall: number | string | null; productcbmall: number | string | null;
    productbagid: number | null; producttracking: string | null;
  }>;
}

/** Sacks for the sacks view (filter by sealed flag). */
export async function loadSacks(opts?: { sealed?: boolean; limit?: number }): Promise<Array<{
  id: number; sack_no: string; warehouse_code: string; container_no: string;
  weight_kg: number | string; cbm: number | string; parcel_count: number;
  sealed: boolean; created_at: string; admin_id: string;
}>> {
  const admin = createAdminClient();
  let q = admin
    .from("warehouse_sack")
    .select("id, sack_no, warehouse_code, container_no, weight_kg, cbm, parcel_count, sealed, created_at, admin_id")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  if (typeof opts?.sealed === "boolean") q = q.eq("sealed", opts.sealed);
  const { data, error } = await q;
  if (error) {
    console.error("[loadSacks] failed", { code: error.code, message: error.message });
    return [];
  }
  return (data ?? []) as Array<{
    id: number; sack_no: string; warehouse_code: string; container_no: string;
    weight_kg: number | string; cbm: number | string; parcel_count: number;
    sealed: boolean; created_at: string; admin_id: string;
  }>;
}

/** Per-shipment worker event timeline (follow-product view). */
export async function loadShipmentTimeline(fid: number): Promise<Array<{
  id: string; step: string; fstatus_from: string | null; fstatus_to: string | null;
  admin_id: string; note: string | null; created_at: string;
}>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("warehouse_intake_log")
    .select("id, step, fstatus_from, fstatus_to, admin_id, note, created_at")
    .eq("fid", fid)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error(`[loadShipmentTimeline ${fid}] failed`, { code: error.code, message: error.message });
    return [];
  }
  return (data ?? []) as Array<{
    id: string; step: string; fstatus_from: string | null; fstatus_to: string | null;
    admin_id: string; note: string | null; created_at: string;
  }>;
}
