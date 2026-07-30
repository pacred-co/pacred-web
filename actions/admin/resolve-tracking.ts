"use server";

/**
 * resolveTrackingToForwarder — ค้นหา "แทรคกิ้งเดียว" → คืน forwarder id ตรงๆ
 *
 * owner/ภูม 2026-07-30: ช่องค้นหาแทรคกิ้งบนหน้าแอปคลัง (warehouse/home) เดิมเด้งไป
 * หน้า /admin/forwarders/bulk-search (หน้า "วางหลายแทรค") แล้วให้กดค้นซ้ำ — เสียเวลา.
 * พนักงานคลังพิมพ์/สแกน "แทรคเดียว" ต้องการเห็นพัสดุนั้นเลย. helper นี้ resolve แทรค
 * → forwarder เดียว → หน้า home ก็พาไป /admin/forwarders/[fNo] ตรง ๆ.
 *
 * ค้นจากแหล่งเดียวกับ bulk-tracking-search (live tb_*):
 *   - tb_forwarder.ftrackingchn  (แทรคจีน)
 *   - tb_forwarder.ftrackingth   (แทรคไทย · ข้าม "-" placeholder ของ MOMO)
 *   - tb_forwarder_item.producttracking (แทรครายชิ้น)
 *
 * ผลลัพธ์:
 *   one   → เจอ forwarder เดียว (พาไปหน้านั้นได้ทันที)
 *   many  → แทรคเดียวชนหลาย forwarder (หายาก) → ให้ไปหน้า bulk-search แจงเอง
 *   none  → ไม่พบ → หน้า home โชว์ข้อความ "ไม่พบ" (ไม่เด้งไปไหน)
 *
 * READ-ONLY · gate เดียวกับ bulk-search + forwarders/[fNo] (มี warehouse).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, type AdminActionResult } from "./common";

export type TrackingResolveResult =
  | { kind: "one"; fid: number }
  | { kind: "many"; count: number }
  | { kind: "none" };

export async function resolveTrackingToForwarder(
  tracking: string,
): Promise<AdminActionResult<TrackingResolveResult>> {
  const t = (tracking ?? "").trim();
  if (!t) return { ok: false, error: "empty" };

  return withAdmin(["super", "ops", "accounting", "warehouse"], async (): Promise<AdminActionResult<TrackingResolveResult>> => {
    const admin = createAdminClient();
    const fids = new Set<number>();

    const [chnRes, thRes, itemRes] = await Promise.all([
      admin.from("tb_forwarder").select("id").eq("ftrackingchn", t),
      // ftrackingth ของแถว MOMO เป็น "-" (placeholder) — อย่าให้ "-" กวาดทุกแถว
      t === "-"
        ? Promise.resolve({ data: [] as { id: number }[], error: null })
        : admin.from("tb_forwarder").select("id").eq("ftrackingth", t),
      admin.from("tb_forwarder_item").select("fid").eq("producttracking", t),
    ]);

    if (chnRes.error) {
      console.error(`[resolveTrackingToForwarder chn]`, { message: chnRes.error.message });
      return { ok: false, error: `ค้นหาไม่สำเร็จ: ${chnRes.error.message}` };
    }
    for (const r of (chnRes.data ?? []) as { id: number }[]) if (r.id != null) fids.add(r.id);
    for (const r of (thRes.data ?? []) as { id: number }[]) if (r.id != null) fids.add(r.id);
    for (const it of (itemRes.data ?? []) as { fid: number | null }[]) if (it.fid != null) fids.add(it.fid);

    const ids = Array.from(fids);
    if (ids.length === 0) return { ok: true, data: { kind: "none" } };
    if (ids.length === 1) return { ok: true, data: { kind: "one", fid: ids[0] } };
    return { ok: true, data: { kind: "many", count: ids.length } };
  });
}
