"use server";

/**
 * Server actions for /admin/report-cnt/[fNo] (Wave 16 P0-1).
 *
 * Faithful port of three POST handlers in `pcs-admin/report-cnt.php`:
 *   - L912-993  `customRate`       → adminReportCntCustomRate()
 *   - L994-1070 `resetCustomRate`  → adminReportCntResetRate()
 *   - L916 fixed-bottom bulk "เพิ่มในรายการตรวจสอบแล้ว"
 *                                  → adminReportCntAddCheck()
 *
 * Tables (migration 0081):
 *   - tb_cost_container — per-container custom rate for the 4 product types
 *     (id, fcabinetnumber, fproductstype1..4, adminid, date)
 *   - tb_forwarder       — the goods rows; we bulk-update fcosttotalprice
 *     after a custom-rate write so the per-row cost reflects the new rate
 *   - tb_settings        — global default rate matrix (fcost{car|ship}{1..4}
 *     default{Warehouse}{|2}) used when no custom rate is set
 *   - tb_check_forwarder — audit-queue join table (id, cfstatus, fid, date,
 *     adminid) — presence = row already in the "ตรวจสอบแล้ว" queue
 *
 * Auth — legacy `departmentKey` gate (CEO/Manager/QA/Accounting/IT) maps to
 * the Pacred V3 admin roles: super · ops · accounting. Warehouse explicitly
 * EXCLUDED (warehouse staff sees the detail page but cannot edit cost).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { appendStatusLog } from "@/lib/notifications/status-flip-helper";
import { resolveProfileIdForLegacyUserid } from "@/lib/auth/tb-users-resolver";
import { logger } from "@/lib/logger";
import { totalCbmOf } from "@/lib/forwarder/quantities";
import {
  costBasisForWarehouse,
  checkCostWritePlausible,
} from "@/lib/forwarder/container-cost-engine";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { autoFillThShippingForForwarder } from "@/lib/admin/auto-fill-th-shipping";
import {
  isThShippingCostMissing,
  codBaseTrackings,
  type AutoThShippingFill,
} from "@/lib/forwarder/domestic-shipping";
import { baseTracking } from "@/lib/admin/momo-bill-header";

// Valid warehouse digits → costBasisMode is the SINGLE source of the carrier
// cost basis (Sang"1"/MX"4" = weight · every other carrier incl. MOMO"8" = cbm).
const VALID_WH = new Set<string>(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
import {
  evaluateReportCntAddCheckStatus,
  REPORT_CNT_ADD_CHECK_MIN_FSTATUS,
  REPORT_CNT_ADD_CHECK_MAX_FSTATUS,
  FSTATUS_LABEL,
} from "@/lib/admin/report-cnt-add-check-gate";

/** Cost-access gate (owner 2026-06-18, mig 0189): the rate writers below persist
 *  tb_forwarder.fcosttotalprice. `withAdmin` admits god roles (ultra+super), so
 *  this guard (canViewCostProfit excludes `super`) is what keeps super out of
 *  setting cost — money internals are ultra/accounting/pricing only. */
async function assertCostAccess(): Promise<{ ok: false; error: string } | null> {
  const roles = await getAdminRoles();
  if (!canViewCostProfit(roles)) {
    return { ok: false, error: "ไม่มีสิทธิ์แก้ไขต้นทุน (เฉพาะ Ultra Admin Z / บัญชี / Pricing)" };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Schema — the 4-rate payload from the modal form.
// ─────────────────────────────────────────────────────────────────────

const rate = z
  .union([z.string(), z.number()])
  .transform((v) => Number(v))
  .refine((n) => Number.isFinite(n) && n >= 0, {
    message: "เรทราคาไม่ถูกต้อง",
  });

// INTERNAL — `"use server"` files may only export async functions.
const customRateSchema = z.object({
  fCabinetNumber: z.string().trim().min(1, { message: "กรุณาระบุหมายเลขตู้" }).max(300),
  fProductsType1: rate,
  fProductsType2: rate,
  fProductsType3: rate,
  fProductsType4: rate,
  /** Wave 16 Follow-up C — admin picks dimension per container. Defaults
   *  to "cbm" if caller omits (back-compat with the legacy POST shape). */
  mode: z.enum(["cbm", "weight"]).default("cbm"),
});
export type CustomRateInput = z.input<typeof customRateSchema>;

// ─────────────────────────────────────────────────────────────────────
// Helpers — replicate the legacy `nameColumn` lookup that picks the
// right `tb_settings` column for a given warehouse + transport mode +
// product type. There are 8 warehouses × 2 transport modes × 4 product
// types × 2 warehouse cities (gz / yw) = 128 columns; the lookup
// concatenates the parts.
//
// Per legacy report-cnt.php L1297-1457:
//   fTransportTypeCost = 'Car' | 'Ship'             (1 → Car, 2 → Ship)
//   fWarehouseChina    = '' | '2'                   (1 gz='', 2 yw='2')
//   warehouse-name segment varies by fWarehouseName (1..8)
//
// We surface only the 4-name lookup needed for fallback when no
// tb_cost_container row exists yet.
// ─────────────────────────────────────────────────────────────────────

type WarehouseDigit = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type TransportMode = "1" | "2"; // 1=Car, 2=Ship

function warehouseSegment(fWarehouseName: WarehouseDigit, productTypeIdx: 1 | 2 | 3 | 4, transport: TransportMode, fWarehouseChina: string): string {
  const prefix = transport === "1" ? "fcostcar" : "fcostship";
  // legacy uses '2' suffix when fWarehouseChina='2' (อี้อู) — these are the *2 columns
  const citySuffix = fWarehouseChina === "2" ? "2" : "";

  switch (fWarehouseName) {
    case "1":
      // แสง — uses 'sang' segment (no city variation)
      return `${prefix}${productTypeIdx}defaultsang${citySuffix}`;
    case "2":
      // CTT — uses the bare default (fcostcar1default / fcostcar1default2)
      return `${prefix}${productTypeIdx}default${citySuffix}`;
    case "3":
      // MK — uses 'mkcargo'
      return `${prefix}${productTypeIdx}defaultmkcargo${citySuffix}`;
    case "4":
      // MX — also uses 'mkcargo' per legacy L1350-L1352 + L1379-L1381
      return `${prefix}${productTypeIdx}defaultmkcargo${citySuffix}`;
    case "5":
      return `${prefix}${productTypeIdx}defaultjmf${citySuffix}`;
    case "6":
      return `${prefix}${productTypeIdx}defaultgogo${citySuffix}`;
    case "7":
      return `${prefix}${productTypeIdx}defaultcargocenter${citySuffix}`;
    case "8":
      return `${prefix}${productTypeIdx}defaultmomo${citySuffix}`; // MOMO (กวางโจว)
    case "9":
      // TTW (อี้อู · owner 2026-07-19) — origin-driven COST rate: same momo cells + the
      // citySuffix → a TTW row (fwarehousechina='2') resolves …defaultmomo2 = อี้อู rate
      // (เรือ 2600 / รถ 5300). MOMO stays …defaultmomo (กวางโจว · 2500/4700). Mirror of
      // lib/forwarder/resolve-cost.ts costColumn (keep the two in lockstep).
      return `${prefix}${productTypeIdx}defaultmomo${citySuffix}`;
  }
}

/**
 * Pick the per-row rate from a {1..4} → number map keyed by fProductsType.
 * Mirrors legacy `if($row['fProductsType']=='1') echo $fProductsType1; …`.
 */
function pickRate(rates: { p1: number; p2: number; p3: number; p4: number }, fProductsType: string | null): number {
  switch ((fProductsType ?? "").trim()) {
    case "1":
      return rates.p1;
    case "2":
      return rates.p2;
    case "3":
      return rates.p3;
    case "4":
      return rates.p4;
    default:
      return 0;
  }
}

/**
 * Cost = rate × dimension. Wave 16 Follow-up C extends legacy:
 *   - mode="cbm"     → cost = rate × fVolume
 *   - mode="weight"  → cost = rate × fWeight
 *
 * Legacy `calPriceForwarderCost()` is more complex (handles per-row
 * fRefPrice, a special MX weight-vs-CBM max() tier, and Sang's literal
 * width×length×height multiplier). The per-container bulk-update path
 * here applies one mode uniformly across every row — the admin's
 * intent ("คิดทั้งตู้แบบเดียวกัน"). The Sang width×length×height
 * formula is not exposed here; admin uses per-row edit (Wave 16 P0-3)
 * for that.
 */
function calcRowCost(dimension: number | null, rate: number): number {
  const v = Number(dimension ?? 0);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.round(v * rate * 100) / 100;
}

// Sanity backstop (owner 2026-07-05 · the GZE260627-1 −฿328M fire): a whole
// container's real cost is at most a few hundred-k THB (MOMO ~2,500/CBM ×
// tens of CBM). A total above this = a basis/rate error — the classic one is a
// per-CBM rate (e.g. 4,700) applied to KG weight (66,150 kg × 4,700 = ฿310M).
// We REJECT the apply before writing rather than persist garbage that then
// shows as a catastrophic negative กำไรตู้.
const CONTAINER_COST_SANITY_MAX = 5_000_000;

// ─────────────────────────────────────────────────────────────────────
// adminReportCntCustomRate — report-cnt.php L912-993
//   UPSERT tb_cost_container + bulk-update tb_forwarder.fcosttotalprice
//   for every row in this container.
// ─────────────────────────────────────────────────────────────────────

export async function adminReportCntCustomRate(input: CustomRateInput): Promise<AdminActionResult<{ updated: number; mode: "cbm" | "weight" }>> {
  const denied = await assertCostAccess();
  if (denied) return denied;
  const parsed = customRateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const {
    fCabinetNumber,
    fProductsType1,
    fProductsType2,
    fProductsType3,
    fProductsType4,
    mode,
  } = parsed.data;

  return withAdmin<{ updated: number; mode: "cbm" | "weight" }>(["super", "ops", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // ── (a) UPSERT tb_cost_container ──
    const { data: existing, error: existingErr } = await admin
      .from("tb_cost_container")
      .select("id")
      .eq("fcabinetnumber", fCabinetNumber)
      .maybeSingle<{ id: number }>();
    if (existingErr) {
      console.error(`[tb_cost_container list] failed`, { code: existingErr.code, message: existingErr.message });
    }

    const nowIso = new Date().toISOString();
    if (existing?.id) {
      const { error: upErr } = await admin
        .from("tb_cost_container")
        .update({
          fproductstype1: fProductsType1,
          fproductstype2: fProductsType2,
          fproductstype3: fProductsType3,
          fproductstype4: fProductsType4,
          adminid:        adminId.slice(0, 50),
          date:           nowIso,
        })
        .eq("id", existing.id);
      if (upErr) return { ok: false, error: upErr.message };
    } else {
      const { error: insErr } = await admin.from("tb_cost_container").insert({
        fcabinetnumber: fCabinetNumber,
        fproductstype1: fProductsType1,
        fproductstype2: fProductsType2,
        fproductstype3: fProductsType3,
        fproductstype4: fProductsType4,
        adminid:        adminId.slice(0, 50),
        date:           nowIso,
      });
      if (insErr) return { ok: false, error: insErr.message };
    }

    // ── (b)+(c) Bulk-update fcosttotalprice + frefprice per row, by CARRIER basis ──
    // 🔴 Cost basis is determined by the CARRIER, NOT the admin's modal toggle
    //    (owner 2026-06-18: "MOMO เก็บเราเป็นคิว" — MOMO + every CBM-charged carrier
    //    MUST cost by CBM; only Sang(1)/MX(4) cost by weight — costBasisMode()).
    //    Bug it fixes: using the modal `mode` let a MOMO container be weight-rated
    //    → cost = weight × rate (e.g. 4.10 kg × 2,500 = ฿10,250 for a 0.0022-คิว
    //    parcel that should cost ฿5.5). We force the carrier basis per row so this
    //    can't recur; frefprice ('1'=น้ำหนัก '2'=ปริมาตร) follows the same basis.
    //    The modal `mode` is honoured ONLY when the warehouse digit is unknown
    //    (no carrier signal). Mirrors the reset path (b) which already uses
    //    costBasisMode — so the two recompute paths can no longer diverge.
    const { data: rows, error: rowsErr } = await admin
      .from("tb_forwarder")
      .select("id, fvolume, fweight, famount, famountcount, fproductstype, fwarehousename")
      .eq("fcabinetnumber", fCabinetNumber);
    if (rowsErr) return { ok: false, error: rowsErr.message };

    const rates = {
      p1: fProductsType1,
      p2: fProductsType2,
      p3: fProductsType3,
      p4: fProductsType4,
    };

    // Pass 1 — compute the per-row cost plan + guards BEFORE any write.
    //
    // 🔴 2026-07-23 (owner "ตู้นี้ทำไมไปโชว์ −เป็นแสนบาท") — ฐานคิดต้นทุนตัดสินด้วย
    // **CARRIER เท่านั้น** (costBasisForWarehouse). ของเดิมเขียนว่า
    //     basis = VALID_WH.has(wh) ? costBasisMode(wh) : mode
    // คือ carrier ชนะ *ยกเว้น* ตอนที่ `fwarehousename` ว่าง/ไม่รู้จัก แล้วตกไปใช้
    // ปุ่ม "คิว/น้ำหนัก" บน modal แทน. เคสจริง GZE260720-1 (audit log
    // report_cnt.custom_rate · mode:"weight" · เรท 4,700/คิว · 83 แถว):
    //   80 แถว fwarehousename='8' (MOMO) → carrier ชนะ → คิว → ถูกต้อง
    //    4 แถว fwarehousename=''         → ตกไปใช้ modal → **น้ำหนัก × เรทต่อคิว**
    //   ⇒ 78.50 กก. × 4,700 = ฿368,950 (ที่ถูกคือ 0.5276 คิว × 4,700 = ฿2,480)
    //   ⇒ รายการตู้โชว์กำไร −330,786 ขณะที่หน้าในตู้โชว์ +35,584
    // เรททุกตัวในระบบเป็น "ต่อคิว" (prod: tb_cost_container 42/42 = 2,500-4,700 ·
    // tb_settings 2,400-6,500 · ไม่มีเรทต่อกิโล) → โกดังว่าง = ห้ามเดาเป็นน้ำหนักเด็ดขาด.
    // ปุ่ม modal ยังถูกบันทึกลง audit log ไว้ดูเจตนา แต่ไม่ใช่ตัวตัดสินเงินอีกต่อไป.
    const plan: Array<{ id: number; cost: number; frefprice: string }> = [];
    let plannedTotal = 0;
    const implausible: string[] = [];
    for (const r of (rows ?? []) as Array<{ id: number; fvolume: number | null; fweight: number | null; famount: number | string | null; famountcount: number | string | null; fproductstype: string | null; fwarehousename: string | null }>) {
      const rate = pickRate(rates, r.fproductstype);
      const wh = r.fwarehousename ?? "";
      const basis = costBasisForWarehouse(wh);
      // CBM basis = row-TOTAL CBM (totalCbmOf honours famountcount: '1'=total,
      // else per-box × famount) — raw fvolume under-costed per-box rows ×famount.
      const totalCbm = totalCbmOf(r);
      const dim = basis === "weight" ? r.fweight : totalCbm;
      const cost = calcRowCost(dim, rate);
      // ด่านสุดท้ายก่อนเขียน — ต้นทุนต่อคิว ต้องไม่โตเกินเรทแบบผิดหน่วย.
      const plausible = checkCostWritePlausible({ rate, basis, warehouse: wh, totalCbm, cost });
      if (!plausible.ok) {
        implausible.push(`#${r.id} (฿${cost.toLocaleString("th-TH")} — ${plausible.reason})`);
        continue;
      }
      plannedTotal += cost;
      plan.push({ id: r.id, cost, frefprice: basis === "weight" ? "1" : "2" });
    }
    // ถ้ามีแถวที่คิดออกมาแล้วไม่สมเหตุสมผล → ไม่เขียนทั้งตู้ (all-or-nothing) และ
    // บอกไปเลยว่าแถวไหน เพราะอะไร — ดีกว่าเขียนบางแถวแล้วยอดตู้เพี้ยนเงียบๆ.
    if (implausible.length > 0) {
      return {
        ok: false,
        error:
          `ไม่ได้บันทึก — คิดต้นทุนบางแถวออกมาผิดปกติ (${implausible.length} แถว): ` +
          `${implausible.slice(0, 5).join(" · ")}${implausible.length > 5 ? " …" : ""}. ` +
          `ตรวจสอบเรท (ต่อคิว) และข้อมูล คิว/น้ำหนัก/โกดัง ของแถวเหล่านี้ก่อน`,
      };
    }
    // Sanity backstop — refuse an absurd total (a basis/rate error) instead of
    // persisting garbage that reads as a −hundreds-of-millions กำไรตู้.
    if (plannedTotal > CONTAINER_COST_SANITY_MAX) {
      return {
        ok: false,
        error: `ต้นทุนรวมที่คำนวณได้สูงผิดปกติ (฿${plannedTotal.toLocaleString("th-TH", { maximumFractionDigits: 0 })}) — น่าจะคิดหน่วยผิด (เรทต่อ "คิว" ไปคูณกับ "น้ำหนัก(กก.)"). ตรวจสอบเรท + หน่วย (คิว/น้ำหนัก) ก่อนบันทึก`,
      };
    }
    let updated = 0;
    for (const p of plan) {
      const { error: updErr } = await admin
        .from("tb_forwarder")
        .update({ fcosttotalprice: p.cost, frefprice: p.frefprice })
        .eq("id", p.id);
      if (!updErr) updated += 1;
    }

    await logAdminAction(adminId, "report_cnt.custom_rate", "tb_cost_container", fCabinetNumber, {
      cabinet:    fCabinetNumber,
      rates,
      mode,
      row_count:  updated,
    });

    revalidatePath(`/admin/report-cnt/${fCabinetNumber}`);
    revalidatePath("/admin/report-cnt");
    return { ok: true, data: { updated, mode } };
  });
}

// ─────────────────────────────────────────────────────────────────────
// adminReportCntResetRate — report-cnt.php L994-1070
//   DELETE the tb_cost_container row, then bulk-update tb_forwarder
//   using the tb_settings default for this warehouse+transport.
// ─────────────────────────────────────────────────────────────────────

// INTERNAL — `"use server"` files may only export async functions.
const resetRateSchema = z.object({
  fCabinetNumber: z.string().trim().min(1).max(300),
});

export async function adminReportCntResetRate(fCabinetNumber: string): Promise<AdminActionResult<{ updated: number }>> {
  const denied = await assertCostAccess();
  if (denied) return denied;
  const parsed = resetRateSchema.safeParse({ fCabinetNumber });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  return withAdmin<{ updated: number }>(["super", "ops", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // ── (a) DELETE tb_cost_container ──
    await admin.from("tb_cost_container").delete().eq("fcabinetnumber", parsed.data.fCabinetNumber);

    // ── (b) Load settings + container rows ──
    const { data: rows, error: rowsErr } = await admin
      .from("tb_forwarder")
      .select("id, fvolume, fweight, famount, famountcount, fproductstype, fwarehousename, fwarehousechina, ftransporttype")
      .eq("fcabinetnumber", parsed.data.fCabinetNumber);
    if (rowsErr) return { ok: false, error: rowsErr.message };

    // We need the full settings row to look up arbitrary columns; pull row 1.
    const { data: settingsRow, error: setErr } = await admin
      .from("tb_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle<Record<string, number | string | null>>();
    if (setErr) return { ok: false, error: setErr.message };

    let updated = 0;
    for (const r of (rows ?? []) as Array<{
      id: number;
      fvolume: number | null;
      fweight: number | null;
      famount: number | string | null;
      famountcount: number | string | null;
      fproductstype: string | null;
      fwarehousename: string | null;
      fwarehousechina: string | null;
      ftransporttype: string | null;
    }>) {
      const wh = (r.fwarehousename ?? "") as WarehouseDigit;
      const transport = ((r.ftransporttype ?? "1") as TransportMode) === "2" ? "2" : "1";
      if (!wh || !VALID_WH.has(wh)) continue; // VALID_WH is the SOT (incl. TTW "9" · was a hardcoded 1-8 list that silently skipped TTW rows)

      const idx = ((): 1 | 2 | 3 | 4 => {
        switch ((r.fproductstype ?? "").trim()) {
          case "1": return 1;
          case "2": return 2;
          case "3": return 3;
          case "4": return 4;
          default: return 1; // fallback to "ทั่วไป" rate
        }
      })();

      const col = warehouseSegment(wh, idx, transport, r.fwarehousechina ?? "");
      const rate = Number(settingsRow?.[col] ?? 0);

      // Reset fRefPrice to the carrier default (Wave 16 Follow-up C):
      //   MX (4) + Sang (1) → '1' (weight) — historical default
      //   others             → '2' (CBM)
      // 2026-07-23 — ใช้ costBasisForWarehouse (SOT เดียวกับ custom-rate + หน้าจอ)
      // แทนการ inline เงื่อนไข wh==='1'||'4' ซ้ำอีกที่ (ก๊อปกฎ = drift รอเกิด).
      const carrierDefaultMode = costBasisForWarehouse(wh);
      const refPriceValue = carrierDefaultMode === "weight" ? "1" : "2";
      const totalCbm = totalCbmOf(r); // row-TOTAL CBM (famountcount rule)
      const dim = carrierDefaultMode === "weight" ? r.fweight : totalCbm;
      const cost = calcRowCost(dim, rate);
      // ด่านเดียวกับ custom-rate — ที่นี่ข้ามเฉพาะแถวที่ผิด (ไม่ใช่ all-or-nothing)
      // เพราะ reset เป็นการล้างกลับเป็นค่า default ทีละแถวอยู่แล้ว.
      const plausible = checkCostWritePlausible({ rate, basis: carrierDefaultMode, warehouse: wh, totalCbm, cost });
      if (!plausible.ok) {
        console.error(`[report-cnt reset_rate] ข้ามแถวที่ต้นทุนผิดปกติ`, {
          fid: r.id, cabinet: parsed.data.fCabinetNumber, rate, cost, totalCbm, warehouse: wh, reason: plausible.reason,
        });
        continue;
      }
      const { error: updErr } = await admin
        .from("tb_forwarder")
        .update({ fcosttotalprice: cost, frefprice: refPriceValue })
        .eq("id", r.id);
      if (!updErr) updated += 1;
    }

    await logAdminAction(adminId, "report_cnt.reset_rate", "tb_cost_container", parsed.data.fCabinetNumber, {
      cabinet:   parsed.data.fCabinetNumber,
      row_count: updated,
    });

    revalidatePath(`/admin/report-cnt/${parsed.data.fCabinetNumber}`);
    revalidatePath("/admin/report-cnt");
    return { ok: true, data: { updated } };
  });
}

// ─────────────────────────────────────────────────────────────────────
// adminReportCntAddCheck — report-cnt.php L1916 "เพิ่มในรายการตรวจสอบแล้ว"
//   INSERT INTO tb_check_forwarder (cfstatus, fid, date, adminid)
//   for each selected fID. Skips IDs that already have a row.
//
// 2026-06-09 (ภูม-reported bug fix) — STATUS GATE (ขอบล่าง).
//   The legacy POST handler accepted any fID the admin checked, which
//   meant a row whose physical goods were still in transit (fstatus '1'/
//   '2'/'3' / not yet at the TH warehouse) could land in the QA queue
//   and be "ตรวจสอบ"-ed against nothing. New gate: reject the WHOLE
//   request when ANY selected fID has fstatus < REPORT_CNT_ADD_CHECK_MIN_FSTATUS.
//   All-or-nothing (better UX than silent partial: the staff fix the
//   selection, retry, and KNOW which rows were rejected).
//
// 2026-07-17 (owner) — STATUS GATE (ขอบบน) · แก้ที่ต้นตอ:
//   owner: "บางสถานะมัน ส่งแล้ว หรือ รอส่ง มันจะยังไม่ส่งแจ้งชำระในรอตรวจสอบอีก
//   ได้ไงหละครับ · มันควรจะเข้าไปแค่ รายการที่จะให้ลูกค้าชำระเงิน"
//   คิวนี้มี consumer เดียว = adminCallPriceUser (แจ้งชำระ 4→5) ที่อ่าน
//   `.eq("fstatus","4")` → แถว ≥5 เข้าคิวได้แต่แจ้งชำระไม่ได้ + ไม่เคยถูกลบ
//   (ลบเฉพาะ successfulFids) → **ค้างถาวร**. prod 2026-07-17 คิว 168 แถว =
//   fstatus 4 แค่ 8 · ค้าง 159 (5:27 · 6:112 · 7:20).
//   → gate เป็น '4' เป๊ะ (min == max) = เซ็ตเดียวกับที่ consumer ทำงานด้วยได้.
//   money-safe: '4' = แถวที่ยังไม่เก็บเงิน ยังผ่านเหมือนเดิม · ≥5 = แจ้งชำระไป
//   แล้ว (การ flip 4→5 คือตัวแจ้งชำระเอง) → กันออกไม่ทำให้เก็บเงินขาด.
//   เคลม/ของเสียหายของแถวที่ส่งแล้ว → ใช้ /admin/forwarders/exceptions (G7 · mig 0230).
//
//   NULL fstatus is treated as "<min" → rejected (defensive · a row
//   with no status string predates the workflow and shouldn't be queued).
// ─────────────────────────────────────────────────────────────────────

// INTERNAL — `"use server"` files may only export async functions.
const addCheckSchema = z.object({
  fIDs: z
    .array(z.union([z.string(), z.number()]).transform((v) => Number(v)))
    .min(1, { message: "กรุณาเลือกอย่างน้อย 1 รายการ" })
    .refine((arr) => arr.every((n) => Number.isFinite(n) && n > 0), {
      message: "fID ไม่ถูกต้อง",
    }),
});

export async function adminReportCntAddCheck(fIDs: number[]): Promise<AdminActionResult<{ inserted: number; skipped: number }>> {
  const parsed = addCheckSchema.safeParse({ fIDs });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  return withAdmin<{ inserted: number; skipped: number }>(["super", "ops", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // ── STATUS GATE (2026-06-09 bug fix) ──
    // Fetch fstatus + fidorco for every selected fID, then reject the
    // whole batch if ANY row hasn't reached the TH-warehouse stage.
    const { data: statusRows, error: statusErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, fidorco")
      .in("id", parsed.data.fIDs);
    if (statusErr) {
      console.error(`[tb_forwarder status-gate] failed`, { code: statusErr.code, message: statusErr.message });
      return { ok: false, error: "โหลดสถานะรายการไม่สำเร็จ — กรุณาลองใหม่" };
    }

    const fetched = (statusRows ?? []) as Array<{ id: number; fstatus: string | null; fidorco: string | null }>;

    // Reject IDs that don't exist in tb_forwarder at all (defensive · they
    // can't be "QA-checked" if the goods row was deleted between page-render
    // and click). Treat missing as "blocked".
    const fetchedIds = new Set(fetched.map((r) => Number(r.id)));
    const missing = parsed.data.fIDs.filter((id) => !fetchedIds.has(id));
    if (missing.length > 0) {
      await logAdminAction(adminId, "report_cnt.add_check_rejected", "tb_forwarder", missing.slice(0, 5).join(","), {
        reason:  "rows_not_found",
        missing: missing.slice(0, 20),
        attempted: parsed.data.fIDs.length,
      });
      return {
        ok:    false,
        error: `ไม่พบรายการบางรายการ (อาจถูกลบไปแล้ว) — รายการ ${missing.slice(0, 5).map((n) => `#${n}`).join(", ")}${missing.length > 5 ? ` (อีก ${missing.length - 5} รายการ)` : ""}`,
      };
    }

    const gate = evaluateReportCntAddCheckStatus(fetched);
    if (!gate.ok) {
      await logAdminAction(adminId, "report_cnt.add_check_rejected", "tb_forwarder", gate.blockedFidorcos.join(","), {
        reason:              gate.tooEarly.count > 0 && gate.alreadyBilled.count > 0
          ? "fstatus_out_of_range"
          : gate.tooEarly.count > 0
            ? "fstatus_too_low"
            : "fstatus_already_billed",
        min_fstatus:         REPORT_CNT_ADD_CHECK_MIN_FSTATUS,
        max_fstatus:         REPORT_CNT_ADD_CHECK_MAX_FSTATUS,
        blocked_count:       gate.blockedCount,
        blocked_sample:      gate.blockedFidorcos,
        sample_statuses:     gate.sampleStatuses,
        too_early_count:     gate.tooEarly.count,
        already_billed_count: gate.alreadyBilled.count,
        attempted_total:     parsed.data.fIDs.length,
      });

      // ข้อความต้องบอก "บล็อกจริงเพราะอะไร" แยกตามเหตุผล — ยุบเป็นข้อความเดียว
      // ไม่ได้ เพราะแถว fstatus=6 จะได้ "ยังไม่ถึงโกดังไทย" = โกหก → พนักงานไป
      // รอ MOMO sync ที่ไม่มีวันมา ([[wrong-error-message-hides-real-block]]).
      const minLabel = FSTATUS_LABEL[REPORT_CNT_ADD_CHECK_MIN_FSTATUS] ?? REPORT_CNT_ADD_CHECK_MIN_FSTATUS;
      const part = (count: number, fidorcos: string[], text: string) => {
        const more = count > fidorcos.length ? ` (และอีก ${count - fidorcos.length} รายการ)` : "";
        return `${text} — ${count} รายการ (${fidorcos.join(", ")})${more}`;
      };
      const parts: string[] = [];
      if (gate.alreadyBilled.count > 0) {
        parts.push(part(
          gate.alreadyBilled.count,
          gate.alreadyBilled.fidorcos,
          `แจ้งชำระเงินไปแล้ว · ไม่ต้องเข้าคิวแจ้งชำระอีก (ถ้าลูกค้าเคลม/ของเสียหาย ให้ใช้ "คิวปัญหาพัสดุ" ที่ /admin/forwarders/exceptions)`,
        ));
      }
      if (gate.tooEarly.count > 0) {
        parts.push(part(
          gate.tooEarly.count,
          gate.tooEarly.fidorcos,
          `ยังไม่ถึงโกดังไทย · รอ MOMO sync update สถานะถึง "${minLabel}" ก่อน`,
        ));
      }
      return { ok: false, error: parts.join(" · ") };
    }

    // ── 🔴 ADDRESS GATE (owner 2026-07-18 "บางรายการยังไม่ได้ตั้งที่อยู่จัดส่ง ก็ยัง
    // เข้ามาในการตรวจสอบ — ต้องใส่ให้ครบก่อน ไม่งั้นบัคเรื่องเงิน") ──
    // A row with NO delivery address can't have its ค่าขนส่งไทย computed → billing
    // it under-collects. Refuse the batch until the address (or self-pickup) is set.
    // "has address" = province OR zipcode present · self-pickup (fshipby='PCS') is
    // exempt (the warehouse address is the destination · no domestic leg to price).
    {
      const { data: addrRows, error: addrErr } = await admin
        .from("tb_forwarder")
        .select("id, fidorco, fshipby, faddressprovince, faddresszipcode")
        .in("id", parsed.data.fIDs);
      if (addrErr) {
        console.error(`[tb_forwarder address-gate] failed`, { code: addrErr.code, message: addrErr.message });
        return { ok: false, error: "โหลดที่อยู่จัดส่งไม่สำเร็จ — กรุณาลองใหม่" };
      }
      const noAddress = ((addrRows ?? []) as Array<{
        id: number; fidorco: string | null; fshipby: string | null;
        faddressprovince: string | null; faddresszipcode: string | null;
      }>).filter((r) => {
        if ((r.fshipby ?? "").trim() === "PCS") return false; // รับเองโกดัง — exempt
        const hasAddr = (r.faddressprovince ?? "").trim() !== "" || (r.faddresszipcode ?? "").trim() !== "";
        return !hasAddr;
      });
      if (noAddress.length > 0) {
        const sample = noAddress.slice(0, 5).map((r) => r.fidorco ?? `#${r.id}`);
        await logAdminAction(adminId, "report_cnt.add_check_rejected", "tb_forwarder", sample.join(","), {
          reason: "no_delivery_address",
          blocked_count: noAddress.length,
          blocked_sample: sample,
          attempted_total: parsed.data.fIDs.length,
        });
        return {
          ok: false,
          error:
            `มี ${noAddress.length} รายการที่ยังไม่ได้ตั้งที่อยู่จัดส่ง (${sample.join(", ")}${noAddress.length > 5 ? ` และอีก ${noAddress.length - 5} รายการ` : ""}) — ` +
            `กรุณาตั้งที่อยู่จัดส่ง/เลือกขนส่ง ที่หน้ารายละเอียดออเดอร์ก่อนเข้าคิวแจ้งชำระ (กันค่าขนส่งไทยตกหล่นตอนวางบิล)`,
        };
      }
    }

    // Skip rows that already exist (legacy doesn't guard — leaves a dup
    // row when an admin clicks twice. We guard for cleanliness; the
    // observable behaviour matches "the row is in the queue").
    const { data: existing, error: existingErr } = await admin
      .from("tb_check_forwarder")
      .select("fID")
      .in("fID", parsed.data.fIDs);
    if (existingErr) {
      console.error(`[tb_check_forwarder list] failed`, { code: existingErr.code, message: existingErr.message });
    }
    const seen = new Set((existing ?? []).map((r) => Number((r as { fID: number }).fID)));

    const toInsert = parsed.data.fIDs
      .filter((id) => !seen.has(id))
      .map((id) => ({
        cfStatus: "1",
        fID:      id,
        date:     new Date().toISOString(),
        adminID:  adminId.slice(0, 50),
      }));

    if (toInsert.length === 0) {
      return { ok: true, data: { inserted: 0, skipped: parsed.data.fIDs.length } };
    }

    const { error: insErr } = await admin.from("tb_check_forwarder").insert(toInsert);
    if (insErr) return { ok: false, error: insErr.message };

    await logAdminAction(adminId, "report_cnt.add_check", "tb_check_forwarder", toInsert.map((r) => r.fID).join(","), {
      inserted: toInsert.length,
      skipped:  parsed.data.fIDs.length - toInsert.length,
    });

    revalidatePath("/admin/forwarder-check");
    return {
      ok:   true,
      data: { inserted: toInsert.length, skipped: parsed.data.fIDs.length - toInsert.length },
    };
  });
}

// ═════════════════════════════════════════════════════════════════════
// adminReportCntBillToCustomer — report-cnt.php L835-911
//   `update_forwarder_to5` — bill ONE customer's forwarder from the
//   container drill-down: flip tb_forwarder.fstatus 4→5 (รอชำระเงิน),
//   stamp fdatestatus5, recompute the promo discount, then notify the
//   customer of the outstanding balance.
// ═════════════════════════════════════════════════════════════════════
//
// re-sweep A2 #6 / P1-7. The legacy "ตัวหลักในการชำระเงิน" — moving a row
// to fStatus=5 is what makes it payable by the customer + surfaces the
// "ยอดค้างชำระ". DISTINCT from the generic `adminBulkUpdateForwarderTbStatus`
// (actions/admin/forwarders.ts): that bulk action flips status + notifies
// but does NOT run the legacy promo-discount recompute that this billing
// transition performs (L860-878). This handler is the faithful per-row
// billing action wired into the report-cnt drill-down.
//
// Legacy promo recompute (L862-878):
//   SELECT promoID FROM tb_promotion WHERE fID=<ID>
//   if promoID==3  → fDiscount = fTotalPrice * 0.10
//   if promoID==4  → fDiscount = fTotalPrice * 0.07
//   else            → keep the row's existing fDiscount
//   UPDATE tb_forwarder SET fDiscount=<recomputed>
//
// Outstanding balance shown to the customer (legacy L880):
//   pricePay = (fTotalPrice + fTransportPrice + fPriceUpdate
//               + fShippingService) - fDiscount
//
// Notify: legacy fired SMS + email + LINE-Notify. Pacred uses the modern
// `sendNotification` (in-app + LINE OA push + email fallback) — legacy
// LINE-Notify is dead (Apr-2025 EOL). The legacy `userid` (text) is bridged
// to a profiles.id via the tb-users-resolver; if the customer has no profile
// row, the status flip still lands (best-effort notify).
//
// Money path: every query destructures `error`; the flip is verified with a
// before-read so an already-billed (fstatus≥5) row is a no-op (idempotent),
// never a double-bill. Status-log row appended (4→5) so the history view
// matches legacy.
//
// Reachability (§0d): per-row "แจ้งหนี้ลูกค้า (4→5)" button in the container
// drill-down (/admin/report-cnt/[fNo]), shown only on rows whose fstatus<5
// to money-tier roles.

// Promo discount rates — legacy report-cnt.php L870-874.
const PROMO_DISCOUNT_RATE: Record<string, number> = {
  "3": 0.10,
  "4": 0.07,
};

const billToCustomerSchema = z.object({
  fID: z.union([z.string(), z.number()]).transform((v) => Number(v)).refine(
    (n) => Number.isFinite(n) && n > 0,
    { message: "fID ไม่ถูกต้อง" },
  ),
  /** C2 (2026-07-13) ค่าส่งไทย "ห้ามลืม" ack — mirrors createBillingRunInvoice's
   *  allowMissingThShip. When false/absent (default) a row whose domestic delivery leg
   *  applies but whose ค่าส่งไทย (ftransportprice) is still ฿0 (auto-fill couldn't quote)
   *  is refused, never billed at a ฿0 domestic leg. Set true to bill anyway. */
  allowMissingThShip: z.boolean().optional(),
});
export type BillToCustomerInput = z.input<typeof billToCustomerSchema>;

/**
 * Pure billing math for the 4→5 transition — faithful to report-cnt.php
 * L862-880. Exported `async` (so it can live in this `"use server"` file
 * AND be unit-tested) but performs NO IO.
 *
 *   - promo discount: promoID 3 → fTotalPrice × 10% · promoID 4 → × 7% ·
 *     else keep the row's existing fDiscount (legacy default branch).
 *   - pricePay (ยอดค้างชำระ): fTotalPrice + fTransportPrice + fPriceUpdate
 *     + fShippingService − fDiscount.
 */
export async function computeBillToCustomerAmounts(row: {
  ftotalprice: number | null;
  ftransportprice: number | null;
  fpriceupdate: number | null;
  fshippingservice: number | null;
  fdiscount: number | null;
  promoId: string | null;
}): Promise<{ fDiscount: number; pricePay: number }> {
  const fTotalPrice = Number(row.ftotalprice ?? 0);
  const promoRate = PROMO_DISCOUNT_RATE[row.promoId ?? ""];
  const fDiscount =
    promoRate !== undefined
      ? Math.round(fTotalPrice * promoRate * 100) / 100
      : Number(row.fdiscount ?? 0);
  const pricePay =
    fTotalPrice +
    Number(row.ftransportprice ?? 0) +
    Number(row.fpriceupdate ?? 0) +
    Number(row.fshippingservice ?? 0) -
    fDiscount;
  return { fDiscount, pricePay };
}

export async function adminReportCntBillToCustomer(
  input: BillToCustomerInput,
  /** C2 (2026-07-13) — SHIPMENT-level COD base-tracking set, passed IN-PROCESS by the
   *  group action (adminReportCntBillGroupToCustomer) so a box-split sibling that kept
   *  paymethod='1' is exempted from the ค่าส่งไทย gate when its base tracking is COD.
   *  The standalone (client single-bill) call omits it → COD exemption falls back to the
   *  row's OWN paymethod (isThShippingCostRequired handles paymethod='2'). Not a client
   *  arg — a Set can't cross the server-action boundary; the group calls this directly. */
  opts?: { codBases?: ReadonlySet<string> },
): Promise<AdminActionResult<{ fID: number; pricePay: number; alreadyBilled: boolean; autoThShipping?: AutoThShippingFill | null }>> {
  const parsed = billToCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const fID = parsed.data.fID;
  const allowMissingThShip = parsed.data.allowMissingThShip === true;

  return withAdmin<{ fID: number; pricePay: number; alreadyBilled: boolean; autoThShipping?: AutoThShippingFill | null }>(
    ["super", "ops", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // ── (a) Read the row's pricing + status BEFORE the flip ──
      const { data: row, error: rowErr } = await admin
        .from("tb_forwarder")
        .select(
          "id, fstatus, userid, fidorco, ftrackingchn, fshipby, paymethod, ftotalprice, ftransportprice, fpriceupdate, fshippingservice, fdiscount",
        )
        .eq("id", fID)
        .maybeSingle<{
          id: number;
          fstatus: string | null;
          userid: string | null;
          fidorco: string | null;
          ftrackingchn: string | null;
          fshipby: string | null;       // C2 — carrier, for the ค่าส่งไทย gate
          paymethod: string | null;     // C2 — '2'=COD → domestic leg exempt
          ftotalprice: number | null;
          ftransportprice: number | null;
          fpriceupdate: number | null;
          fshippingservice: number | null;
          fdiscount: number | null;
        }>();
      if (rowErr) return { ok: false, error: rowErr.message };
      if (!row) return { ok: false, error: "not_found" };

      const fromStatus = String(row.fstatus ?? "");

      // LOWER-BOUND gate (audit 2026-06-18 · money-safety): the bill is a 4→5
      // flip (ถึงไทยแล้ว → รอชำระเงิน) that notifies the customer "ยอดค้างชำระ".
      // Without a floor, a row still in China (fstatus 1/2/3) could be billed
      // before the goods arrive — refuse it. fstatus 4 = ถึงไทยแล้ว is the only
      // valid from-state (≥5 is handled by the idempotency no-op below).
      if (Number(fromStatus) < 4) {
        return {
          ok: false,
          error: "ยังแจ้งหนี้ลูกค้าไม่ได้ — สินค้ายังไม่ถึงไทย (ต้องสถานะ “ถึงไทยแล้ว” ก่อน)",
        };
      }

      // Idempotency: legacy had no guard, but re-billing a row already at
      // fstatus≥5 would re-stamp fdatestatus5 + re-notify "ยอดค้างชำระ" — a
      // double-bill ping. Refuse it cleanly (money path). For the already-billed
      // case we report the existing balance WITHOUT re-running the promo recompute
      // (the discount is already on the row).
      if (Number(fromStatus) >= 5) {
        const { pricePay: pricePayExisting } = await computeBillToCustomerAmounts({
          ...row,
          promoId: null,
        });
        return {
          ok:   true,
          data: { fID, pricePay: pricePayExisting, alreadyBilled: true },
        };
      }

      // ── ZERO-IMPORT-COST GATE (owner 2026-07-13 · "เงินไม่ซิงค์ · เก็บเงินขาด") ──
      // Mirror the createBillingRunInvoice guard (billing-run.ts a2): a row whose
      // import subtotal SELL (ค่านำเข้า · ftotalprice) is still ฿0 was never
      // measured/priced — the customer has no rate card for its warehouse × transport
      // × product tuple, so computeAndFillForwarderImportRate wrote nothing and left
      // it 0. Flipping it 4→5 would notify the customer "ยอดค้างชำระ 0.00 บาท" + let
      // them pay ฿0 = เก็บเงินขาด. Refuse the new bill (this per-row path has NO
      // positive-override channel, so any ftotalprice<=0 is a genuine under-charge).
      // Only reached for fstatus==4 (the real new-bill flip) — a ฿0 row already billed
      // (fstatus≥5) stays an idempotent no-op above, never re-refused. The group action
      // loops this writer, so a batch can't sneak a ฿0 row either (each ฿0 member is
      // refused here → lands in the group's errors[] so the operator sees which row).
      if (Number(row.ftotalprice ?? 0) <= 0) {
        return {
          ok: false,
          error:
            "ค่านำเข้า ฿0 — ยังไม่ได้วัด/ตั้งราคา · อาจเก็บเงินขาด (กรุณาตั้งเรท/วัดขนาดที่โกดังก่อนแจ้งหนี้ลูกค้า)",
        };
      }

      // ── (a2) #7 auto-fill ค่าส่งไทย (owner 2026-07-08 "ต้อง auto") ──
      // If a delivery leg applies but ftransportprice is still ฿0, auto-fill the
      // zone default (เหมาๆ ฿100 / Flash) so ตรวจตู้→เก็บเงิน stays continuous.
      // Best-effort · never overwrites a set cost · returns what it filled (UI toast).
      const autoThShipping = await autoFillThShippingForForwarder(admin, fID);
      const rowForBill = autoThShipping
        ? { ...row, ftransportprice: autoThShipping.cost }
        : row;

      // ── (a3) ค่าส่งไทย "ห้ามลืม" GATE (C2 · 2026-07-13 · MONEY) ──
      // Mirror createBillingRunInvoice's a3 gate on this direct-bill path. After the
      // auto-fill, if a domestic delivery leg still applies (effective fshipby ≠
      // self-pickup/เหมาๆ/COD) but ค่าส่งไทย (ftransportprice) is STILL ฿0 (auto-fill
      // couldn't quote — parcel unmeasured/oversize → resolveThShippingAutoPrice returned
      // null → nothing written), flipping 4→5 + notifying "ยอดค้างชำระ" would collect ฿0
      // for the domestic leg = เก็บเงินขาด. Refuse unless the operator acked
      // allowMissingThShip. เหมาๆ ฿0 (B1 isMaoCarrier) + COD rows/siblings (shipmentIsCod)
      // are exempt. NO orphan write: if this fires, autoFillThShippingForForwarder returned
      // null (nothing was written). The group action passes opts.codBases so a box-split
      // COD sibling (paymethod='1') is exempted like createBillingRunInvoice.
      const effFshipby = autoThShipping?.carrier ?? row.fshipby;
      const effPaymethod = autoThShipping?.payMethod ?? row.paymethod;
      const shipmentIsCod = opts?.codBases?.has(baseTracking(row.ftrackingchn ?? "") ?? "") ?? false;
      if (
        !allowMissingThShip &&
        isThShippingCostMissing({
          fshipby: effFshipby,
          ftransportprice: rowForBill.ftransportprice,
          payMethod: effPaymethod,
          shipmentIsCod,
        })
      ) {
        return {
          ok: false,
          error:
            "ยังไม่กรอกค่าส่งไทย (ค่าขนส่งในไทย ฿0 · ไม่ใช่รับเองที่โกดัง) — กรุณาให้โกดัง/CS กรอกค่าส่งไทยก่อนแจ้งหนี้ลูกค้า",
        };
      }

      // ── (b) Recompute the promo discount (legacy L862-878) ──
      const { data: promoRow, error: promoErr } = await admin
        .from("tb_promotion")
        .select("promoid")
        .eq("fid", fID)
        .limit(1)
        .maybeSingle<{ promoid: number | null }>();
      if (promoErr) {
        // Non-fatal — keep the existing fDiscount (the legacy default branch).
        console.error("[adminReportCntBillToCustomer] tb_promotion lookup failed", {
          fid: fID, code: promoErr.code, message: promoErr.message,
        });
      }
      const promoId = promoRow?.promoid == null ? "" : String(promoRow.promoid);
      const { fDiscount, pricePay } = await computeBillToCustomerAmounts({ ...rowForBill, promoId });

      // ── (c) Flip fstatus 4→5 + stamp fdatestatus5 + recomputed fDiscount ──
      const nowIso = new Date().toISOString();
      const adminIdSafe = String(adminId).slice(0, 10); // adminidupdate varchar(10)
      const { error: updErr } = await admin
        .from("tb_forwarder")
        .update({
          fstatus:          "5",
          fdatestatus5:     nowIso,
          fdateadminstatus: nowIso,
          adminidupdate:    adminIdSafe,
          fdiscount:        fDiscount,
        })
        .eq("id", fID);
      if (updErr) return { ok: false, error: updErr.message };

      await logAdminAction(adminId, "report_cnt.bill_to_customer", "tb_forwarder", String(fID), {
        from_status: fromStatus,
        to_status:   "5",
        promo_id:    promoId || null,
        f_discount:  fDiscount,
        price_pay:   pricePay,
        auto_th_shipping: autoThShipping
          ? { carrier: autoThShipping.carrier, cost: autoThShipping.cost, zone: autoThShipping.zone }
          : null,
      });

      // ── (e) Status-log row (4→5) — matches legacy saveHistory($sql,41) ──
      // Best-effort: a log failure does NOT roll back the flip above.
      await appendStatusLog(admin, fID, fromStatus, "5", adminIdSafe);

      // ── (e2) B3 (2026-07-21 · flow-gap sweep) — the row is now billed (4→5), so its
      // tb_check_forwarder (ตรวจตู้) queue row is stale and must be cleared or it leaks
      // into the ตรวจสอบ list. Mirror the delete in adminCallPriceUser. BEST-EFFORT:
      // the flip already committed — a queue-delete failure NEVER fails/rolls back the
      // bill; log + continue. Never touches fstatus/money.
      {
        const { error: cqDelErr } = await admin
          .from("tb_check_forwarder")
          .delete()
          .eq("fID", fID);
        if (cqDelErr) {
          logger.warn("report_cnt.bill_to_customer", "tb_check_forwarder cleanup failed (bill OK)", {
            fid: fID, code: cqDelErr.code, message: cqDelErr.message,
          });
        }
      }

      // ── (f) Notify the customer of the outstanding balance ──
      // Legacy fired SMS + email + LINE-Notify; Pacred uses sendNotification
      // (in-app + LINE OA push + email). Resolve userid → profiles.id; if the
      // customer has no profile, the flip still stands (best-effort).
      const legacyUserId = String(row.userid ?? "");
      if (legacyUserId) {
        try {
          const profileId = await resolveProfileIdForLegacyUserid(legacyUserId);
          if (profileId) {
            const fNo = row.fidorco ?? String(fID);
            // Custom payload — the legacy 4→5 notify is specifically the
            // "ยอดค้างชำระ" billing ping, not the generic status-change line.
            await sendNotification(profileId, {
              category:       "forwarder",
              severity:       "info",
              title:          `ฝากนำเข้า ${fNo} รอชำระเงิน`,
              body:           `ยอดค้างชำระ ${pricePay.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`,
              link_href:      `/service-import/${fNo}`,
              reference_type: "forwarder",
              reference_id:   String(fID),
            });
          } else {
            logger.info("report_cnt.bill_to_customer", "no profile for userid — flip OK, notify skipped", {
              fid: fID,
            });
          }
        } catch (err) {
          logger.warn("report_cnt.bill_to_customer", "notification failed (flip OK)", {
            fid:   fID,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // The drill-down client calls router.refresh() after a successful flip;
      // revalidate the list + forwarders surfaces too (the per-cabinet path is
      // refreshed client-side since this action only has fID, not the cabinet).
      revalidatePath("/admin/report-cnt", "layout");
      revalidatePath("/admin/forwarders");
      return { ok: true, data: { fID, pricePay, alreadyBilled: false, autoThShipping } };
    },
  );
}

// ═════════════════════════════════════════════════════════════════════
// adminReportCntBillGroupToCustomer — group bill (FIX 3 · 2026-06-18 owner)
//   Bill an ENTIRE -N sibling group ("ซอยตู้") in ONE motion. A MOMO carrier
//   splits one customer shipment into -N/-N/M sub-tracking rows, each a
//   separate tb_forwarder row; billing them per-row makes the customer owe
//   per-box. This action loops the PROVEN per-row money writer
//   `adminReportCntBillToCustomer` over every member fID — there is NO new
//   money path; each member runs through the same 4→5 flip + promo recompute
//   + idempotency guard + status-log + notify.
//
// Customer-side aggregation: after every member flips to fstatus 5 (รอชำระเงิน)
// they ALL surface in the customer's forwarder list, and the existing multi-bill
// pay modal (`ForwarderPayModal` · legacy payForwarder([ids])) lets the customer
// tick + pay the whole group in one payment that sums by user. So the customer
// owes ONE combined amount for the group with no further change needed.
//
// Validation + auth + reachability mirror the per-row action. The fIDs are
// pre-resolved client-side from the group's billable members (fstatus 4); the
// server re-runs the per-row gate on each, so an ineligible/stale row is a safe
// no-op or refusal, never a wrong bill — INCLUDING the ZERO-IMPORT-COST gate
// (a ฿0 ค่านำเข้า member is refused by the per-row writer → counted in `failed`
// + surfaced in `errors[]`, so a batch can't sneak a เก็บเงินขาด row and the
// operator sees exactly which fID was blocked).
// ═════════════════════════════════════════════════════════════════════

const billGroupSchema = z.object({
  fIDs: z
    .array(z.union([z.string(), z.number()]).transform((v) => Number(v)))
    .min(1, { message: "กรุณาเลือกอย่างน้อย 1 รายการ" })
    .max(500, { message: "เลือกได้สูงสุด 500 รายการต่อกลุ่ม" })
    .refine((arr) => arr.every((n) => Number.isFinite(n) && n > 0), {
      message: "fID ไม่ถูกต้อง",
    }),
});
export type BillGroupInput = z.input<typeof billGroupSchema>;

export async function adminReportCntBillGroupToCustomer(
  input: BillGroupInput,
): Promise<
  AdminActionResult<{
    billed: number;
    alreadyBilled: number;
    failed: number;
    totalPricePay: number;
    errors: Array<{ fID: number; error: string }>;
  }>
> {
  const parsed = billGroupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  // De-dup defensively (a double-tick shouldn't bill the same row twice — though
  // the per-row idempotency below already no-ops fstatus≥5).
  const fIDs = Array.from(new Set(parsed.data.fIDs));

  // Role-gate ONCE here (the per-row action also gates, but gating up front means
  // a non-money role is refused before any row is touched). The loop then reuses
  // the per-row writer — the single money writer for this transition.
  return withAdmin<{
    billed: number;
    alreadyBilled: number;
    failed: number;
    totalPricePay: number;
    errors: Array<{ fID: number; error: string }>;
  }>(["super", "ops", "accounting"], async ({ adminId }) => {
    let billed = 0;
    let alreadyBilled = 0;
    let failed = 0;
    let totalPricePay = 0;
    const errors: Array<{ fID: number; error: string }> = [];

    // C2 (2026-07-13) — read the group members' {ftrackingchn, paymethod} once to build the
    // SHIPMENT-level COD base-tracking set, so a box-split sibling that kept paymethod='1' is
    // exempted from the per-row ค่าส่งไทย gate when its base tracking is COD (same rule
    // createBillingRunInvoice uses over its selected set). Best-effort: a read error → empty
    // set (each per-row then falls back to its own paymethod for the COD exemption).
    const admin = createAdminClient();
    const { data: groupRows, error: groupErr } = await admin
      .from("tb_forwarder")
      .select("ftrackingchn, paymethod")
      .in("id", fIDs);
    if (groupErr) {
      console.error("[adminReportCntBillGroupToCustomer cod-set read] failed", {
        code: groupErr.code, message: groupErr.message,
      });
    }
    const codBases = codBaseTrackings(
      (groupRows ?? []) as Array<{ ftrackingchn: string | null; paymethod: string | null }>,
    );

    // Sequential (not Promise.all): each member is an independent 4→5 flip with
    // its own idempotency guard; serial keeps the writes ordered + avoids
    // hammering the DB with N concurrent updates for a large split.
    for (const fID of fIDs) {
      const res = await adminReportCntBillToCustomer({ fID }, { codBases });
      if (!res.ok) {
        failed += 1;
        errors.push({ fID, error: res.error });
        continue;
      }
      if (res.data?.alreadyBilled) {
        alreadyBilled += 1;
      } else {
        billed += 1;
      }
      totalPricePay += res.data?.pricePay ?? 0;
    }

    await logAdminAction(adminId, "report_cnt.bill_group_to_customer", "tb_forwarder", fIDs.join(","), {
      requested:      fIDs.length,
      billed,
      already_billed: alreadyBilled,
      failed,
      total_price_pay: totalPricePay,
    });

    revalidatePath("/admin/report-cnt", "layout");
    revalidatePath("/admin/forwarders");
    return { ok: true, data: { billed, alreadyBilled, failed, totalPricePay, errors } };
  });
}
