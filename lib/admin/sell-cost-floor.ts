import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  CBM_COST_FALLBACK,
  allCostColumns,
  parseCbmCostFloor,
  type CbmCostFloor,
} from "./sell-cost-floor-core";

/**
 * ทุนจริงต่อคิว — ฝั่ง I/O (อ่าน `tb_settings`).
 * กติกา เหตุผล และตัวตัดสินทั้งหมดอยู่ใน `sell-cost-floor-core.ts` (PURE · มีเทส).
 *
 * READ-ONLY ล้วน · NEVER throws — อ่านไม่ได้ = คืนค่าสำรอง (ยังบล็อกได้ ไม่ปล่อยผ่านหมด).
 */

export {
  CBM_COST_FALLBACK,
  isCbmRateBelowCost,
  parseCbmCostFloor,
  type CbmCostFloor,
} from "./sell-cost-floor-core";

/** อ่านทุนจริงต่อคิวจาก tb_settings (ชุดคอลัมน์เดียวกับ resolve-cost.ts). */
export async function getCbmCostFloor(): Promise<CbmCostFloor> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tb_settings")
      .select(allCostColumns().join(", "))
      .limit(1)
      .maybeSingle<Record<string, unknown>>();
    if (error) {
      console.error("[sell-cost-floor] tb_settings read failed", { code: error.code, message: error.message });
      return { "1": { ...CBM_COST_FALLBACK["1"] }, "2": { ...CBM_COST_FALLBACK["2"] } };
    }
    return parseCbmCostFloor(data);
  } catch (e) {
    console.error("[sell-cost-floor] unexpected", { error: String(e) });
    return { "1": { ...CBM_COST_FALLBACK["1"] }, "2": { ...CBM_COST_FALLBACK["2"] } };
  }
}
