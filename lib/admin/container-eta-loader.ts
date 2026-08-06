/**
 * container-eta-loader.ts — วัดวันเดินทางจริงจากประวัติ แล้วผูกเป็น ETD/ETA ประมาณการ
 * (owner 2026-08-07 · "ดู data เก่าเทียบเลยว่าเคยวิ่งเท่าไร")
 *
 * READ-ONLY 100% · ไม่แตะเงิน/สถานะ/ข้อมูลใดๆ. กฎการคำนวณอยู่ใน
 * `lib/forwarder/container-eta-estimate.ts` (PURE + 51 เทส) — ที่นี่แค่ดึงประวัติ.
 *
 * ประวัติ = ตู้ที่มีคนยิงรับแล้ว: วันเดินทางจริง = (แทรคแรกที่ยิงรับ − 1 วัน) − วันปิดตู้
 * (−1 วันเพราะโกดังเราต้องรอเขาลงของก่อน ถึงจะไปเอาของมายิงได้ — owner อธิบาย).
 * ยิ่งมีตู้ถึงมากขึ้น มัธยฐานยิ่งแม่นเอง ไม่ต้องมาแก้ค่าคงที่ในโค้ด.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  actualTransitDays,
  estimateContainerEta,
  routeOfCabinet,
  type EtaEstimate,
} from "@/lib/forwarder/container-eta-estimate";

type Row = { fcabinetnumber: string | null; fdatestatus4: string | null };

/**
 * ประวัติวันเดินทางจริง ต่อเส้นทาง (GZE/GZS/YWS/…) จากตู้ที่ยิงรับแล้วทั้งหมด.
 * พังเมื่อไหร่ = คืน {} (ประมาณการจะตกไปใช้ค่าที่วัดไว้ — จอไม่ล้ม).
 */
export async function loadTransitHistory(
  admin: SupabaseClient,
): Promise<Record<string, number[]>> {
  const { data, error } = await fetchAllRows<Row>(() =>
    admin
      .from("tb_forwarder")
      .select("fcabinetnumber, fdatestatus4")
      .not("fdatestatus4", "is", null)
      .neq("fcabinetnumber", "")
      .order("id", { ascending: true }),
  );
  if (error) {
    console.error("[container-eta] อ่านประวัติวันเดินทางไม่สำเร็จ", {
      code: error.code, message: error.message,
    });
    return {};
  }

  // แทรคแรกที่ยิงรับของแต่ละตู้ (MIN fdatestatus4)
  const firstScan = new Map<string, string>();
  for (const r of data ?? []) {
    const cab = (r.fcabinetnumber ?? "").trim();
    const at = (r.fdatestatus4 ?? "").slice(0, 10);
    if (!cab || !at) continue;
    const prev = firstScan.get(cab);
    if (!prev || at < prev) firstScan.set(cab, at);
  }

  const byRoute: Record<string, number[]> = {};
  for (const [cab, at] of firstScan) {
    const route = routeOfCabinet(cab);
    if (!route) continue; // ชื่อไม่เข้ารูป (verbatim/placeholder) = ไม่เอามาคิด
    const days = actualTransitDays(cab, at);
    if (days == null) continue;
    (byRoute[route] ??= []).push(days);
  }
  return byRoute;
}

/**
 * ETD/ETA ประมาณการต่อตู้ — ใช้เมื่อ **ไม่มีของจริง** (taem_container_etd_eta / MOMO).
 * caller ต้องให้ของจริงชนะเสมอ.
 */
export async function loadEtaEstimates(
  admin: SupabaseClient,
  cabinets: string[],
): Promise<Record<string, EtaEstimate>> {
  const cabs = [...new Set(cabinets.map((c) => (c ?? "").trim()).filter(Boolean))];
  if (cabs.length === 0) return {};
  const history = await loadTransitHistory(admin);
  const out: Record<string, EtaEstimate> = {};
  for (const cab of cabs) {
    const est = estimateContainerEta(cab, history);
    if (est.etd || est.eta) out[cab] = est; // ประมาณการไม่ได้เลย = ไม่ใส่ (จอโชว์ "—")
  }
  return out;
}
