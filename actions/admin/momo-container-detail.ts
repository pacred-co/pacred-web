"use server";

/**
 * MOMO ตรวจตู้ — container DETAIL (เฟส 2 · ภูม 2026-07-14 · แบบไอแต้ม image 3-5).
 *
 * กดเลขตู้ → หน้ารายละเอียด: หัวตู้ + สรุปต่อลูกค้า PR + tabs (รายการในตู้ ระบบ ·
 * เทียบ packing list · รูปสินค้า · ประวัติ packing). READ-ONLY (ไม่แตะเงิน/commit).
 * Scoped to ONE cabinet → เร็ว (ตู้เดียว = ไม่กี่ร้อยแถว). Gated ops/super/warehouse.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, type AdminActionResult } from "./common";
import { filterCountableForwarderRows, baseTracking } from "@/lib/admin/momo-bill-header";
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import { forwarderCoverUrl, NO_COVER_IMAGE } from "@/lib/legacy-image";
import { deriveContainerVerify, type ContainerVerify } from "@/lib/admin/momo-container-view";
import { deriveMomoBoxConsistency, type BoxConsistencyInput } from "@/lib/admin/momo-box-consistency";
import type { PackingUploadSnapshot } from "./momo-packing-history";

const num = (v: number | string | null | undefined): number | null =>
  v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

const BILLED = new Set(["5", "6", "7"]);
const PRODUCT_TYPE: Record<string, string> = { "1": "ทั่วไป", "2": "มอก.", "3": "อย.", "4": "พิเศษ" };

type FwdRow = {
  id: number;
  ftrackingchn: string | null;
  fstatus: string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  famount: number | string | null;
  fwidth: number | string | null;
  flength: number | string | null;
  fheight: number | string | null;
  fproductstype: string | null;
  fcover: string | null;
  userid: string | null;
  ftotalprice: number | string | null;
};

/** "MOMO มั่ว" data-quality flag on ONE row — MOMO's per-box numbers contradict the
 *  aggregate AND dims can't reconcile → the auto box-split refuses it → ต้องอัพแต้ม. */
export type MomoBoxGarbage = {
  reason: "weight" | "cbm";
  boxCount: number;
  boxWeightSum: number;
  aggWeight: number;
  boxCbmSum: number;
  aggCbm: number;
};

export type MomoContainerItem = {
  id: number;
  tracking: string | null;
  pr: string | null;
  status: string | null;
  boxes: number | null;
  weight: number | null;
  cbm: number | null;
  w: number | null;
  l: number | null;
  h: number | null;
  productType: string | null;
  cover: string | null;
  /** 🚩 set when this row's momo_box_detail contradicts its aggregate weight/คิว. */
  garbage?: MomoBoxGarbage | null;
};

export type MomoContainerDetail = {
  cabinet: string;
  transport: "1" | "2" | "3" | null;
  trackCount: number;
  boxes: number | null;
  weight: number | null;
  cbm: number | null;
  billedCount: number;
  verify: ContainerVerify;
  /** how many rows in this container carry a 🚩 "MOMO มั่ว" flag (0 = clean). */
  garbageCount: number;
  items: MomoContainerItem[];
  perPr: Array<{ pr: string; count: number; boxes: number; weight: number; cbm: number }>;
  images: Array<{ src: string; tracking: string | null; pr: string | null }>;
  packing: null | {
    uploadedAt: string;
    boxes: number | null;
    weight: number | null;
    cbm: number | null;
    apiMissing: number;
    missing: string[];
    rows: PackingUploadSnapshot["rows"];
  };
};

export async function getMomoContainerDetail(cabinet: string): Promise<AdminActionResult<MomoContainerDetail>> {
  const cab = (cabinet ?? "").trim();
  if (!cab) return { ok: false, error: "invalid_cabinet" };

  return withAdmin<MomoContainerDetail>(["ops", "super", "warehouse"], async () => {
    const admin = createAdminClient();

    // 1. every tb_forwarder row in this cabinet (per-parcel)
    const { data: fwd, error } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus, fweight, fvolume, famount, fwidth, flength, fheight, fproductstype, fcover, userid, ftotalprice")
      .eq("fcabinetnumber", cab)
      .limit(3000);
    if (error) {
      console.error("[momo-container-detail] forwarder query failed", { code: error.code, message: error.message });
      return { ok: false, error: "โหลดรายละเอียดตู้ไม่สำเร็จ" };
    }
    const rows = (fwd ?? []) as FwdRow[];

    const items: MomoContainerItem[] = rows.map((r) => ({
      id: r.id,
      tracking: r.ftrackingchn,
      pr: r.userid,
      status: r.fstatus,
      boxes: num(r.famount),
      weight: num(r.fweight),
      cbm: num(r.fvolume),
      w: num(r.fwidth),
      l: num(r.flength),
      h: num(r.fheight),
      productType: r.fproductstype ? (PRODUCT_TYPE[r.fproductstype] ?? r.fproductstype) : null,
      cover: r.fcover ? forwarderCoverUrl(r.fcover) : null,
    }));

    const countable = filterCountableForwarderRows(rows, {
      tracking: (r) => r.ftrackingchn,
      weight: (r) => num(r.fweight),
      userid: (r) => r.userid,
      // ftotalprice=0 → drop an aggregate-weight bare base from the box Σ (owner
      // 2026-07-16 · #52559); a priced anchor stays. weight/cbm sum the SAME set.
      money: (r) => num(r.ftotalprice),
    });
    const boxes = countable.reduce((s, r) => s + (num(r.famount) ?? 0), 0);
    // น้ำหนัก/คิว รวมจากชุด countable ชุดเดียวกับกล่อง — แถวรวมที่น้ำหนักเป็นยอดรวมของกล่อง
    // (fweight = Σ กล่อง · ftotalprice ≤ 0 · #52559) ถูกตัดออกทั้งสามค่า ไม่งั้นน้ำหนัก/คิวจะนับซ้ำ
    // แล้วไปติดธง ⚖️น้ำหนักไม่ตรง ผิดๆ. ส่วนแถว bare ที่มีราคาของตัวเอง (ล็อตแยกจริง · 888073444322)
    // money > 0 → countable เก็บไว้ → น้ำหนักจริงไม่หาย.
    const weight = countable.reduce((s, r) => s + (num(r.fweight) ?? 0), 0);
    const cbm = countable.reduce((s, r) => s + (num(r.fvolume) ?? 0), 0);
    const billedCount = rows.filter((r) => BILLED.has((r.fstatus ?? "").trim())).length;

    // per-PR summary (ไอแต้ม "ข้อมูลสรุปในตู้" — but per customer PR)
    const prMap = new Map<string, { count: number; boxes: number; weight: number; cbm: number }>();
    for (const r of rows) {
      const pr = (r.userid ?? "—").trim() || "—";
      const g = prMap.get(pr) ?? { count: 0, boxes: 0, weight: 0, cbm: 0 };
      g.count += 1;
      g.weight += num(r.fweight) ?? 0;
      g.cbm += num(r.fvolume) ?? 0;
      prMap.set(pr, g);
    }
    // box count per PR from countable rows only (dedup headers)
    for (const r of countable) {
      const pr = (r.userid ?? "—").trim() || "—";
      const g = prMap.get(pr);
      if (g) g.boxes += num(r.famount) ?? 0;
    }
    const perPr = [...prMap.entries()]
      .map(([pr, g]) => ({ pr, ...g }))
      .sort((a, b) => b.weight - a.weight);

    const images = items
      .filter((i) => !!i.cover && i.cover !== NO_COVER_IMAGE)
      .map((i) => ({ src: i.cover as string, tracking: i.tracking, pr: i.pr }));

    // 1.5 🚩 "MOMO มั่ว" flag — for each UNSPLIT aggregate (a base with exactly ONE
    // tb_forwarder row in this cabinet) whose momo_box_detail (>1 box) contradicts the
    // aggregate weight/คิว AND dims can't reconcile, the auto box-split refuses it →
    // the row needs a real แต้ม packing list. Already-split shipments (a base with
    // sibling rows here) are SKIPPED — the anchor's weight is reduced to box-1's share,
    // so comparing it to the full box_detail would false-flag a resolved shipment.
    let garbageCount = 0;
    {
      const rowsPerBase = new Map<string, number>();
      for (const it of items) {
        const b = baseTracking(it.tracking);
        if (b) rowsPerBase.set(b, (rowsPerBase.get(b) ?? 0) + 1);
      }
      const unsplitBases = [...rowsPerBase.entries()].filter(([, n]) => n === 1).map(([b]) => b);
      const boxesByBase = new Map<string, BoxConsistencyInput[]>();
      const CHUNK = 200;
      for (let i = 0; i < unsplitBases.length; i += CHUNK) {
        const slice = unsplitBases.slice(i, i + CHUNK);
        const { data: bd, error: bdErr } = await admin
          .from("momo_box_detail")
          .select("base_tracking, box_tracking, weight_kg, cbm, width, length, height, quantity")
          .in("base_tracking", slice);
        if (bdErr) {
          console.error("[momo-container-detail] box_detail lookup failed", { code: bdErr.code, message: bdErr.message });
          continue;
        }
        for (const r of (bd ?? []) as Array<Record<string, number | string | null>>) {
          const b = String(r.base_tracking ?? "").trim();
          if (!b) continue;
          const arr = boxesByBase.get(b) ?? [];
          arr.push({
            boxTracking: String(r.box_tracking ?? "").trim(),
            weightKgPerPiece: num(r.weight_kg) ?? 0,
            cbmPerPiece: num(r.cbm) ?? 0,
            width: num(r.width) ?? 0,
            length: num(r.length) ?? 0,
            height: num(r.height) ?? 0,
            quantity: num(r.quantity) ?? 0,
          });
          boxesByBase.set(b, arr);
        }
      }
      for (const it of items) {
        const b = baseTracking(it.tracking);
        if (!b || (rowsPerBase.get(b) ?? 0) !== 1) continue; // unsplit aggregate only
        const boxes = boxesByBase.get(b);
        if (!boxes || boxes.length <= 1) continue;
        const v = deriveMomoBoxConsistency({ fweight: it.weight ?? 0, fvolume: it.cbm ?? 0 }, boxes);
        if (v.garbage && v.reason) {
          it.garbage = {
            reason: v.reason, boxCount: v.boxCount,
            boxWeightSum: v.boxWeightSum, aggWeight: v.aggWeight,
            boxCbmSum: v.boxCbmSum, aggCbm: v.aggCbm,
          };
          garbageCount++;
        }
      }
    }

    // 2. latest packing upload for this container (+ snapshot rows)
    const { data: pk, error: pkErr } = await admin
      .from("momo_packing_upload")
      .select("total_boxes, total_weight, total_cbm, reverse_check, parsed_snapshot, uploaded_at")
      .eq("container_no", cab)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pkErr) console.error("[momo-container-detail] packing query failed", { code: pkErr.code, message: pkErr.message });

    let packing: MomoContainerDetail["packing"] = null;
    if (pk) {
      const rc = (pk.reverse_check ?? {}) as { missing?: unknown };
      const missing = Array.isArray(rc.missing) ? rc.missing.filter((m): m is string => typeof m === "string") : [];
      const snap = (pk.parsed_snapshot as PackingUploadSnapshot | null) ?? null;
      packing = {
        uploadedAt: pk.uploaded_at as string,
        boxes: (pk.total_boxes as number | null) ?? null,
        weight: num(pk.total_weight as number | null),
        cbm: num(pk.total_cbm as number | null),
        apiMissing: missing.length,
        missing,
        rows: snap?.rows ?? [],
      };
    }

    const verify = deriveContainerVerify({
      hasPacking: !!packing,
      systemBoxes: boxes,
      packingBoxes: packing?.boxes ?? null,
      systemWeight: weight,
      packingWeight: packing?.weight ?? null,
      apiMissing: packing?.apiMissing ?? 0,
    });

    return {
      ok: true,
      data: {
        cabinet: cab,
        transport: resolveTransportMode(cab, null),
        trackCount: rows.length,
        boxes,
        weight,
        cbm,
        billedCount,
        verify,
        garbageCount,
        items,
        perPr,
        images,
        packing,
      },
    };
  });
}
