/**
 * container-cost-rollup.ts — ต้นทุนตู้แบบ "ยกเข่ง" สำหรับหน้า รายการตู้ (LIST).
 *
 * owner 2026-07-23: "ตู้นี้ทำไมไปโชว์ −เป็นแสนบาทเลยครับ แต่พอกดข้างใน +สามหมื่นห้า
 * ทันยังไงกันแน่ครับ ... ทุกข้อมูลทุกคนเชื่อ และเอาไปทำงานจริงนะครับ"
 *
 * ก่อนหน้านี้ LIST กับ DETAIL คิดต้นทุนคนละเครื่อง:
 *   LIST   = Σ `fcosttotalprice` ที่เก็บใน DB (ผ่าน RPC get_container_summary.sum_cost)
 *   DETAIL = คิดสด เรทต้นทุน × คิว ทุกครั้งที่เปิดหน้า
 * ⇒ ค่าที่เก็บผิดเมื่อไหร่ สองจอพูดคนละเรื่องทันที (GZE260720-1: 391,437 vs 25,068).
 *
 * ไฟล์นี้ทำให้ LIST ใช้ **เครื่องเดียวกับ DETAIL** (lib/forwarder/container-cost-engine)
 * → ต่อให้ค่าที่เก็บไว้เพี้ยน สองจอก็ยังตรงกัน เพราะมันมาจากกฎเดียวกัน.
 *
 * ══ ราคาที่ต้องจ่าย (perf) ══
 * 3 query ต่อการโหลด LIST หนึ่งครั้ง แต่ scope แค่ "ตู้ที่มองเห็นบนจอ" เท่านั้น
 * (prod 2026-07-23: waiting 11 ตู้/282 แถว · succeed 90 วัน 40 ตู้/568 แถว) —
 * เล็กกว่า fallback เดิมที่ดึง 50,000 แถวมาก. แพทเทินเดียวกับ
 * getContainerCompletenessBatch ที่หน้านี้เรียกอยู่แล้ว.
 *
 * READ-ONLY ล้วน — ไม่เขียน DB. fail-soft ทุก query (พังแล้วคืน {} → LIST ตกกลับไป
 * ใช้ค่าที่เก็บไว้แบบเดิม ไม่ทำให้หน้าพัง).
 */

import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import { costColumn, type WarehouseDigit, type CostTransport } from "@/lib/forwarder/resolve-cost";
import {
  resolveContainerWarehouse,
  rollupContainerCost,
  type ContainerRates,
  type CostEngineRow,
} from "@/lib/forwarder/container-cost-engine";

type AdminClient = ReturnType<typeof createAdminClient>;

type FwCostRow = CostEngineRow & {
  fcabinetnumber: string;
  fwarehousename: string | null;
  fwarehousechina: string | null;
  ftransporttype: string | null;
};

export type ContainerCostSummary = {
  /** Σ ต้นทุนของตู้ — ตัวเลขเดียวกับที่หน้า DETAIL โชว์ */
  costSum: number;
  /** จำนวนแถวที่คิดสด (ตู้ยังไม่จ่ายค่าตู้ + มีเรท) */
  liveRows: number;
  /** จำนวนแถวที่ใช้ค่าที่เก็บไว้ (จ่ายค่าตู้แล้ว / ไม่มีเรท) */
  storedRows: number;
};

const SETTINGS_ID = 1;

/**
 * ต้นทุนของหลายตู้ในทีเดียว.
 *
 * @param cabinets       เลขตู้ที่กำลังแสดงบนจอ
 * @param paidCabinets   ตู้ที่จ่ายค่าตู้แล้ว (มีแถวใน tb_cnt_item) → ล็อกค่าที่เก็บไว้
 *                       ตรงกับกติกาของ DETAIL (cabinetIsPaid)
 * @returns Record keyed by เลขตู้ — ตู้ที่ไม่มีข้อมูลจะไม่มี key (ให้ caller fallback เอง)
 */
export async function getContainerCostRollupBatch(
  admin: AdminClient,
  cabinets: string[],
  paidCabinets: Set<string>,
): Promise<Record<string, ContainerCostSummary>> {
  const uniqCabs = Array.from(new Set(cabinets.filter(Boolean)));
  if (uniqCabs.length === 0) return {};

  // ── 1) แถวสินค้าของตู้ที่มองเห็น ──
  const { data: fwRaw, error: fwErr } = await admin
    .from("tb_forwarder")
    .select(
      "fcabinetnumber, fwarehousename, fwarehousechina, ftransporttype, fproductstype, fvolume, famount, famountcount, fweight, fcosttotalprice",
    )
    .in("fcabinetnumber", uniqCabs)
    .neq("fstatus", "99") // ตู้/แถวที่ยกเลิก — ตรงกับ RPC (mig 0190)
    .limit(100_000);
  if (fwErr) {
    console.error(`[getContainerCostRollupBatch tb_forwarder] failed`, {
      code: fwErr.code, message: fwErr.message, cabinetCount: uniqCabs.length,
    });
    return {};
  }
  const rows = (fwRaw ?? []) as FwCostRow[];
  if (rows.length === 0) return {};

  const byCabinet = new Map<string, FwCostRow[]>();
  for (const r of rows) {
    const key = r.fcabinetnumber;
    if (!key) continue;
    const arr = byCabinet.get(key);
    if (arr) arr.push(r);
    else byCabinet.set(key, [r]);
  }

  // ── 2) เรทที่บัญชีตั้งไว้ต่อตู้ (tb_cost_container ชนะเสมอ) ──
  const rateByCab = new Map<string, ContainerRates>();
  {
    const { data: crRaw, error: crErr } = await admin
      .from("tb_cost_container")
      .select("fcabinetnumber, fproductstype1, fproductstype2, fproductstype3, fproductstype4")
      .in("fcabinetnumber", uniqCabs);
    if (crErr) {
      console.error(`[getContainerCostRollupBatch tb_cost_container] failed`, {
        code: crErr.code, message: crErr.message,
      });
    }
    for (const c of (crRaw ?? []) as Array<{
      fcabinetnumber: string;
      fproductstype1: number | string | null;
      fproductstype2: number | string | null;
      fproductstype3: number | string | null;
      fproductstype4: number | string | null;
    }>) {
      rateByCab.set(c.fcabinetnumber, {
        p1: Number(c.fproductstype1 ?? 0) || 0,
        p2: Number(c.fproductstype2 ?? 0) || 0,
        p3: Number(c.fproductstype3 ?? 0) || 0,
        p4: Number(c.fproductstype4 ?? 0) || 0,
      });
    }
  }

  // ── 3) tb_settings (fallback เมื่อบัญชียังไม่ตั้งเรทให้ตู้นั้น) — ดึงครั้งเดียว ──
  let settingsRow: Record<string, number | string | null> | null = null;
  const needsSettings = Array.from(byCabinet.keys()).some((cab) => !rateByCab.has(cab));
  if (needsSettings) {
    const { data: sRaw, error: sErr } = await admin
      .from("tb_settings")
      .select("*")
      .eq("id", SETTINGS_ID)
      .maybeSingle<Record<string, number | string | null>>();
    if (sErr) {
      console.error(`[getContainerCostRollupBatch tb_settings] failed`, { code: sErr.code, message: sErr.message });
    }
    settingsRow = sRaw ?? null;
  }

  // ── 4) คิดต่อตู้ ด้วยเครื่องเดียวกับ DETAIL ──
  const result: Record<string, ContainerCostSummary> = {};
  for (const [cab, cabRows] of byCabinet) {
    const containerWarehouse = resolveContainerWarehouse(cabRows);
    let rates = rateByCab.get(cab);
    if (!rates) {
      // เรทมาตรฐาน: โกดัง × โหมดขนส่ง × ประเภทสินค้า × เมืองต้นทาง
      // โหมดขนส่ง ยึด "ชื่อตู้" เป็นหลัก (GZS=เรือ · GZE/EK=รถ) เหมือน DETAIL —
      // ftransporttype ที่เก็บไว้เชื่อไม่ได้เสมอ (owner 2026-06-19).
      const firstChina = cabRows.find((r) => String(r.fwarehousechina ?? "").trim())?.fwarehousechina ?? "";
      const storedTransport = cabRows.find((r) => String(r.ftransporttype ?? "").trim())?.ftransporttype ?? null;
      const mode = resolveTransportMode(cab, storedTransport);
      const transport: CostTransport = mode === "2" ? "2" : "1";
      const cols = ([1, 2, 3, 4] as const).map((i) =>
        containerWarehouse ? costColumn(containerWarehouse as WarehouseDigit, i, transport, String(firstChina)) : null,
      );
      const pick = (col: string | null): number => {
        if (!col || !settingsRow) return 0;
        return Number(settingsRow[col] ?? 0) || 0;
      };
      rates = { p1: pick(cols[0]), p2: pick(cols[1]), p3: pick(cols[2]), p4: pick(cols[3]) };
    }
    result[cab] = rollupContainerCost(cabRows, {
      rates,
      containerWarehouse,
      cabinetIsPaid: paidCabinets.has(cab),
    });
  }
  return result;
}
