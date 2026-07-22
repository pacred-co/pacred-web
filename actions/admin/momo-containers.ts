"use server";

/**
 * MOMO ตรวจตู้ — container list (เฟส 1 · ภูม 2026-07-14).
 *
 * One row per MOMO container (tb_forwarder grouped by fcabinetnumber, MOMO-committed
 * rows) with the system aggregate (box/weight/cbm · bill-header-deduped) joined to
 * its latest packing-list upload + reverse-check → a per-container VERIFY status
 * (✅ตรง / 💗กล่องขาด / ⚖️น้ำหนักหาย / 📄ยังไม่มี packing · + 💗API ขาด N).
 *
 * Read-only display (no money write). Gated ops/super/warehouse.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, type AdminActionResult } from "./common";
import { filterCountableForwarderRows } from "@/lib/admin/momo-bill-header";
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import { deriveContainerVerify, type ContainerVerify } from "@/lib/admin/momo-container-view";

const num = (v: number | string | null | undefined): number | null =>
  v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

const BILLED = new Set(["5", "6", "7"]);

type FwdRow = {
  fcabinetnumber: string | null;
  fstatus: string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  famount: number | string | null;
  ftrackingchn: string | null;
  userid: string | null;
  ftotalprice: number | string | null;
};

export type MomoContainerRow = {
  cabinet: string;
  transport: "1" | "2" | "3" | null;
  minFstatus: string | null;
  trackCount: number;
  boxes: number | null;
  weight: number | null;
  cbm: number | null;
  billedCount: number;
  // packing side (latest upload)
  hasPacking: boolean;
  packingBoxes: number | null;
  packingWeight: number | null;
  packingCbm: number | null;
  packingUploadedAt: string | null;
  apiMissing: number;
  verify: ContainerVerify;
};

/** MIN over fstatus text codes ("1".."7", "40", "99"); numeric-aware, '' last. */
function minStatus(codes: (string | null)[]): string | null {
  let best: string | null = null;
  let bestN = Infinity;
  for (const c of codes) {
    const s = (c ?? "").trim();
    if (!s) continue;
    const nval = Number(s);
    const key = Number.isFinite(nval) ? nval : Infinity;
    if (key < bestN) { bestN = key; best = s; }
  }
  return best;
}

export async function listMomoContainers(): Promise<AdminActionResult<MomoContainerRow[]>> {
  return withAdmin<MomoContainerRow[]>(["ops", "super", "warehouse"], async () => {
    const admin = createAdminClient();

    // 1. MOMO forwarder rows that carry a cabinet (the committed containers).
    const { data: fwd, error } = await admin
      .from("tb_forwarder")
      .select("fcabinetnumber, fstatus, fweight, fvolume, famount, ftrackingchn, userid, ftotalprice")
      .like("session", "admin-momo%")
      .not("fcabinetnumber", "is", null)
      .neq("fcabinetnumber", "")
      .limit(8000);
    if (error) {
      console.error("[momo-containers] forwarder query failed", { code: error.code, message: error.message });
      return { ok: false, error: "โหลดตู้ไม่สำเร็จ" };
    }

    // 2. group by cabinet
    const byCab = new Map<string, FwdRow[]>();
    for (const r of (fwd ?? []) as FwdRow[]) {
      const cab = (r.fcabinetnumber ?? "").trim();
      if (!cab) continue;
      const arr = byCab.get(cab);
      if (arr) arr.push(r);
      else byCab.set(cab, [r]);
    }

    // 3. latest packing upload per container
    const { data: pk, error: pkErr } = await admin
      .from("momo_packing_upload")
      .select("container_no, total_boxes, total_weight, total_cbm, reverse_check, uploaded_at")
      .order("uploaded_at", { ascending: false })
      .limit(2000);
    if (pkErr) console.error("[momo-containers] packing query failed", { code: pkErr.code, message: pkErr.message });
    const latestPacking = new Map<string, { boxes: number | null; weight: number | null; cbm: number | null; apiMissing: number; uploadedAt: string }>();
    for (const p of (pk ?? []) as Array<{ container_no: string | null; total_boxes: number | null; total_weight: number | null; total_cbm: number | null; reverse_check: unknown; uploaded_at: string }>) {
      const cab = (p.container_no ?? "").trim();
      if (!cab || latestPacking.has(cab)) continue; // ordered desc → first = latest
      const rc = (p.reverse_check ?? {}) as { missing?: unknown };
      const apiMissing = Array.isArray(rc.missing) ? rc.missing.length : 0;
      latestPacking.set(cab, {
        boxes: p.total_boxes ?? null,
        weight: num(p.total_weight),
        cbm: num(p.total_cbm),
        apiMissing,
        uploadedAt: p.uploaded_at,
      });
    }

    // 4. compose one row per cabinet
    const rows: MomoContainerRow[] = [];
    for (const [cabinet, group] of byCab) {
      const countable = filterCountableForwarderRows(group, {
        tracking: (r) => r.ftrackingchn,
        weight: (r) => num(r.fweight),
        userid: (r) => r.userid,
        // ftotalprice=0 → drop an aggregate-weight bare base from the box Σ (owner
        // 2026-07-16 · #52559); a priced anchor stays. weight/cbm sum the SAME set.
        money: (r) => num(r.ftotalprice),
      });
      const boxes = countable.reduce((s, r) => s + (num(r.famount) ?? 0), 0);
      // น้ำหนัก/คิว รวมจากชุด countable ชุดเดียวกับกล่อง (ตัดแถวรวมที่น้ำหนักซ้ำ · #52559)
      // ไม่งั้นน้ำหนัก/คิวนับซ้ำแล้วไปติดธง ⚖️น้ำหนักไม่ตรง ผิดๆ.
      const weight = countable.reduce((s, r) => s + (num(r.fweight) ?? 0), 0);
      const cbm = countable.reduce((s, r) => s + (num(r.fvolume) ?? 0), 0);
      const billedCount = group.filter((r) => BILLED.has((r.fstatus ?? "").trim())).length;
      const min = minStatus(group.map((r) => r.fstatus));
      const transport = resolveTransportMode(cabinet, null);
      const pack = latestPacking.get(cabinet);

      const verify = deriveContainerVerify({
        hasPacking: !!pack,
        systemBoxes: boxes,
        packingBoxes: pack?.boxes ?? null,
        systemWeight: weight,
        packingWeight: pack?.weight ?? null,
        apiMissing: pack?.apiMissing ?? 0,
      });

      rows.push({
        cabinet,
        transport,
        minFstatus: min,
        trackCount: group.length,
        boxes,
        weight,
        cbm,
        billedCount,
        hasPacking: !!pack,
        packingBoxes: pack?.boxes ?? null,
        packingWeight: pack?.weight ?? null,
        packingCbm: pack?.cbm ?? null,
        packingUploadedAt: pack?.uploadedAt ?? null,
        apiMissing: pack?.apiMissing ?? 0,
        verify,
      });
    }

    // newest cabinet-close first: sort by cabinet code descending (codes embed the date)
    rows.sort((a, b) => b.cabinet.localeCompare(a.cabinet));
    return { ok: true, data: rows };
  });
}
