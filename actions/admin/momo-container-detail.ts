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
import { filterCountableForwarderRows } from "@/lib/admin/momo-bill-header";
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import { forwarderCoverUrl, NO_COVER_IMAGE } from "@/lib/legacy-image";
import { deriveContainerVerify, type ContainerVerify } from "@/lib/admin/momo-container-view";
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
      .select("id, ftrackingchn, fstatus, fweight, fvolume, famount, fwidth, flength, fheight, fproductstype, fcover, userid")
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
    });
    const boxes = countable.reduce((s, r) => s + (num(r.famount) ?? 0), 0);
    const weight = rows.reduce((s, r) => s + (num(r.fweight) ?? 0), 0);
    const cbm = rows.reduce((s, r) => s + (num(r.fvolume) ?? 0), 0);
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
        items,
        perPr,
        images,
        packing,
      },
    };
  });
}
