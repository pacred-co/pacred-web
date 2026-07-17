/**
 * เรท default ของใบเสนอราคา = เรททั่วไป `tb_rate_g_*` (coid 'PR' · GENERAL_COID)
 * โปรเจกต์เป็นกริดสไตล์ quote card (โกดัง × ทาง × กลุ่มสินค้า) — owner ปอน 2026-07-17.
 *
 * หน้า "ตั้งเรทใบเสนอราคา" (/admin/rates/quote-default) แก้ค่าเหล่านี้ (บันทึกทีละแถว
 * ผ่าน adminUpdateGeneralRateCells) และใบเสนอราคา (CompareEditor · quote-tab.tsx)
 * อ่านค่าเหล่านี้เป็นชั้น default: SVIP (tb_rate_custom_*) ?? general (ตัวนี้) ??
 * promo/FDA hardcoded. เพราะ billing engine (resolve-rate.ts) อ่าน tb_rate_g_* อยู่แล้ว
 * → ตั้งที่นี่ = กระทบทั้งใบเสนอราคา + เรทคิดเงินจริง.
 *
 * โมเดล "แบน per กลุ่ม": อ่าน rep product (ทั่วไป·มอก. → '1' · อย.·พิเศษ → '3') + tier 1
 * (rgcbm1/rgkg1) เท่านั้น (quote card โชว์ค่าเดียว · ไม่มี weight-tier). transport อ่าน
 * แค่ '1' รถ + '2' เรือ (ไม่แตะอากาศ '3').
 *
 * Server-only (reads DB via service-role) — ห้าม import จาก Client Component.
 * types + constants ที่ client ใช้ อยู่ที่ ./quote-default-rates-shared (ไม่ server-only).
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { GENERAL_COID } from "@/lib/forwarder/coid";
import type { TransportId, WarehouseId } from "@/lib/admin/customer-rate-tables";
import {
  GROUP_REP_PRODUCT,
  quoteGroupOf,
  type QuoteDefaultCell,
  type QuoteDefaultGrid,
} from "./quote-default-rates-shared";

export type { QuoteDefaultCell, QuoteDefaultGrid, QuoteRateGroup } from "./quote-default-rates-shared";

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function emptyGrid(): QuoteDefaultGrid {
  const cell = (): QuoteDefaultCell => ({ cbm: null, kg: null });
  const groups = () => ({ general: cell(), fda: cell() });
  const transports = (): Record<TransportId, ReturnType<typeof groups>> => ({ "1": groups(), "2": groups() });
  return { "1": transports(), "2": transports() };
}

/**
 * โหลดเรท default ใบเสนอราคาจาก tb_rate_g_* → กริด. NEVER throws — DB error/ช่องว่าง
 * → กริดว่าง (null) เพื่อให้ consumer fallback เรทโปรฯ ต่อไป.
 */
export async function getQuoteDefaultRates(): Promise<QuoteDefaultGrid> {
  const grid = emptyGrid();
  const reps = [GROUP_REP_PRODUCT.general, GROUP_REP_PRODUCT.fda]; // ['1','3']
  try {
    const admin = createAdminClient();
    const [{ data: kgRaw, error: kgErr }, { data: cbmRaw, error: cbmErr }] = await Promise.all([
      admin.from("tb_rate_g_kg")
        .select("sourcewarehouse,rgtransporttype,rgproductstype,rgkg1")
        .eq("coid", GENERAL_COID).in("rgproductstype", reps),
      admin.from("tb_rate_g_cbm")
        .select("sourcewarehouse,rgtransporttype,rgproductstype,rgcbm1")
        .eq("coid", GENERAL_COID).in("rgproductstype", reps),
    ]);
    if (kgErr) console.error("[getQuoteDefaultRates kg] failed", { code: kgErr.code, message: kgErr.message });
    if (cbmErr) console.error("[getQuoteDefaultRates cbm] failed", { code: cbmErr.code, message: cbmErr.message });

    const place = (row: Record<string, unknown>, apply: (c: QuoteDefaultCell) => void) => {
      const wh = String(row.sourcewarehouse), tt = String(row.rgtransporttype);
      if ((wh !== "1" && wh !== "2") || (tt !== "1" && tt !== "2")) return;
      const g = quoteGroupOf(String(row.rgproductstype));
      if (!g) return;
      apply(grid[wh as WarehouseId][tt as TransportId][g]);
    };
    for (const r of (kgRaw ?? []) as Array<Record<string, unknown>>) place(r, (c) => { c.kg = num(r.rgkg1); });
    for (const r of (cbmRaw ?? []) as Array<Record<string, unknown>>) place(r, (c) => { c.cbm = num(r.rgcbm1); });
  } catch (e) {
    console.error("[getQuoteDefaultRates] unexpected", e);
  }
  return grid;
}
