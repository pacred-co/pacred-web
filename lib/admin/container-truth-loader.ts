/**
 * container-truth-loader.ts — ตัวโหลดข้อมูลให้ `momo-container-truth` (SOT).
 *
 * owner 2026-07-29: *"สรุปมันอยู่ตู้ไหนกันแน่ครับ ในแพคกิ้งลิส มีไหมครับ อยู่ในตู้ไหนครับ
 * มันควรจะเชื่อมโยง ประมวลผลกัน และ map match กันได้และถูกต้องจริงๆไปเลยครับ"*
 *
 * ไฟล์นี้ = ขา I/O อย่างเดียว (อ่าน DB → ป้อน SOT ที่ pure+เทสแล้ว) เพื่อให้
 * **ทั้งหน้าอัพแพคกิ้งลิส และหน้าตรวจต้นทุน MOMO ตอบคำถาม "ตู้ไหน" ด้วยสมองเดียวกัน**
 * (ก่อนหน้านี้แต่ละหน้าคำนวณ "ตู้ไม่ตรง" ของตัวเอง แล้วไม่มีหน้าไหนตอบได้ว่าตู้ไหนถูก).
 *
 * READ-ONLY · fail-soft (พังแล้วคืนแผนที่ว่าง → หน้าจอไม่ล้ม แค่ไม่มีคำตอบให้).
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  baseOfTracking,
  buildPackingTruthMap,
  resolveContainerTruth,
  type ContainerTruth,
  type PackingContainerLine,
  type RawPackingSnapshotRow,
  type StagingSubRow,
} from "@/lib/admin/momo-container-truth";

export type ContainerTruthMap = Map<string, ContainerTruth>;

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * โหลด "แพคกิ้งลิสพูดว่าอะไร" ทั้งระบบ → base → บรรทัดต่อตู้.
 * ตู้เดียวอัพซ้ำหลายรอบ = SOT เลือกไฟล์ล่าสุด (เราส่งมาเรียงใหม่→เก่า).
 */
export async function loadPackingTruthMap(
  admin: SupabaseClient,
): Promise<Map<string, PackingContainerLine[]>> {
  const { data, error } = await admin
    .from("momo_packing_upload")
    .select("container_no, parsed_snapshot")
    .not("container_no", "is", null)
    .neq("container_no", "")
    .order("uploaded_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("[loadPackingTruthMap] failed", { code: error.code, message: error.message });
    return new Map();
  }
  return buildPackingTruthMap(
    ((data ?? []) as Array<{ container_no: string; parsed_snapshot: { rows?: RawPackingSnapshotRow[] } | null }>)
      .map((f) => ({ containerNo: f.container_no, rows: f.parsed_snapshot?.rows ?? [] })),
  );
}

/**
 * ตอบ "ตู้ไหนกันแน่" ให้ base tracking ชุดหนึ่ง.
 *
 * @param bases base tracking (ตัด `-N`/`-N/M` แล้ว) — ตัวเรียกส่งเท่าที่จอนั้นแสดง
 *              (หน้าแพคกิ้ง = base ในไฟล์ · หน้าใบวางบิล = base ในใบ) ไม่สแกนทั้งระบบ
 * @param packingMap ผลจาก loadPackingTruthMap (ส่งเข้ามาได้ถ้าโหลดไว้แล้ว)
 */
export async function loadContainerTruthFor(
  admin: SupabaseClient,
  bases: string[],
  packingMap?: Map<string, PackingContainerLine[]>,
): Promise<ContainerTruthMap> {
  const out: ContainerTruthMap = new Map();
  const uniq = [...new Set(bases.map((b) => baseOfTracking(b)).filter(Boolean))];
  if (uniq.length === 0) return out;

  const packing = packingMap ?? (await loadPackingTruthMap(admin));

  // staging ของ base เหล่านี้ (base + ลูก `-N`) — ดึงเป็นชุดๆ กัน URL ยาวเกิน
  const stagingByBase = new Map<string, StagingSubRow[]>();
  for (let i = 0; i < uniq.length; i += 60) {
    const chunk = uniq.slice(i, i + 60);
    const ors = chunk
      .flatMap((b) => [`momo_tracking_no.eq.${b}`, `momo_tracking_no.like.${b}-*`])
      .join(",");
    const { data, error } = await admin
      .from("momo_import_tracks")
      .select("momo_tracking_no, momo_container_no, container_batch_no, weight_kg, cbm, quantity, committed_forwarder_id")
      .or(ors)
      .limit(5000);
    if (error) {
      console.error("[loadContainerTruthFor] staging read failed", { code: error.code, message: error.message });
      continue; // fail-soft ต่อ chunk
    }
    for (const s of (data ?? []) as Array<{
      momo_tracking_no: string; momo_container_no: string | null; container_batch_no: string | null;
      weight_kg: unknown; cbm: unknown; quantity: unknown; committed_forwarder_id: unknown;
    }>) {
      const b = baseOfTracking(s.momo_tracking_no);
      if (!b) continue;
      const row: StagingSubRow = {
        momoTrackingNo: s.momo_tracking_no,
        momoContainerNo: s.momo_container_no,
        containerBatchNo: s.container_batch_no,
        weightKg: num(s.weight_kg),
        cbm: num(s.cbm),
        quantity: num(s.quantity),
        committedForwarderId: s.committed_forwarder_id ? Number(s.committed_forwarder_id) : null,
      };
      stagingByBase.set(b, [...(stagingByBase.get(b) ?? []), row]);
    }
  }

  for (const b of uniq) {
    out.set(b, resolveContainerTruth(b, packing.get(b) ?? [], stagingByBase.get(b) ?? []));
  }
  return out;
}

/** สรุปสั้นๆ ให้เอาไปแสดงข้างแถว — ตอบตรงคำถาม "ตู้ไหน". */
export type ContainerTruthHint = {
  /** เลขตู้ที่ควรเป็นของ fid นี้ (null = ยังตอบไม่ได้) */
  shouldBe: string | null;
  /** ตู้ทั้งหมดที่แพคกิ้งลิสบอกว่ามี base นี้ */
  packingCabinets: string[];
  /** แพคกิ้งบอกว่าของกระจายหลายตู้จริง */
  multiContainer: boolean;
  /** ข้อความไทยพร้อมแสดง */
  message: string;
};

/**
 * แปลงคำตอบของ SOT เป็นข้อความไทยที่คนอ่านรู้เรื่องทันที.
 * `currentCab` = เลขตู้ที่ระบบผูกไว้ตอนนี้ (ใส่เพื่อให้ข้อความบอกว่าตรง/ไม่ตรง).
 */
export function describeContainerTruth(
  truth: ContainerTruth | undefined,
  fid: number | null,
  currentCab: string | null,
): ContainerTruthHint {
  const cur = String(currentCab ?? "").trim();
  if (!truth || truth.packingCabinets.length === 0) {
    return {
      shouldBe: null, packingCabinets: [], multiContainer: false,
      message: "ยังไม่มีแพคกิ้งลิสของพัสดุนี้ — อัพไฟล์แพคกิ้งลิสของตู้ก่อน จึงจะยืนยันตู้ได้",
    };
  }
  const shouldBe = fid != null ? (truth.assignments.get(fid) ?? null) : null;
  const packingCabinets = truth.packingCabinets;
  const multiContainer = truth.isMultiContainer;

  if (shouldBe) {
    const same = cur && cur === shouldBe;
    return {
      shouldBe, packingCabinets, multiContainer,
      message: same
        ? `✅ ตรงกับแพคกิ้งลิส — อยู่ตู้ ${shouldBe}`
        : `ตู้ที่ถูกคือ ${shouldBe}${cur ? ` (ระบบผูกไว้ ${cur})` : ""}${
            multiContainer ? ` · ชิปเม้นนี้ MOMO แยกส่ง ${packingCabinets.length} ตู้: ${packingCabinets.join(" · ")}` : ""
          }`,
    };
  }
  if (multiContainer) {
    return {
      shouldBe: null, packingCabinets, multiContainer,
      message: `แพคกิ้งลิสบอกว่าชิปเม้นนี้แยกส่ง ${packingCabinets.length} ตู้ (${packingCabinets.join(" · ")}) แต่ยังจับคู่แถวนี้กับตู้ไหนไม่ได้ — ให้คนตรวจ (ยอดน้ำหนัก/คิว/จำนวนกล่องไม่ตรงบรรทัดไหนเลย หรือมีตู้ที่ยอดเท่ากันหลายตู้)`,
    };
  }
  return {
    shouldBe: packingCabinets[0] ?? null, packingCabinets, multiContainer,
    message: `แพคกิ้งลิสมีพัสดุนี้อยู่ตู้ ${packingCabinets[0]}${cur && cur !== packingCabinets[0] ? ` (ระบบผูกไว้ ${cur})` : ""}`,
  };
}
