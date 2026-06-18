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
import { costBasisMode } from "@/lib/forwarder/resolve-cost";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";

// Valid warehouse digits → costBasisMode is the SINGLE source of the carrier
// cost basis (Sang"1"/MX"4" = weight · every other carrier incl. MOMO"8" = cbm).
const VALID_WH = new Set<string>(["1", "2", "3", "4", "5", "6", "7", "8"]);
import {
  evaluateReportCntAddCheckStatus,
  REPORT_CNT_ADD_CHECK_MIN_FSTATUS,
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

type WarehouseDigit = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
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
      .select("id, fvolume, fweight, fproductstype, fwarehousename")
      .eq("fcabinetnumber", fCabinetNumber);
    if (rowsErr) return { ok: false, error: rowsErr.message };

    const rates = {
      p1: fProductsType1,
      p2: fProductsType2,
      p3: fProductsType3,
      p4: fProductsType4,
    };

    let updated = 0;
    for (const r of (rows ?? []) as Array<{ id: number; fvolume: number | null; fweight: number | null; fproductstype: string | null; fwarehousename: string | null }>) {
      const rate = pickRate(rates, r.fproductstype);
      const wh = r.fwarehousename ?? "";
      const basis = VALID_WH.has(wh) ? costBasisMode(wh as WarehouseDigit) : mode; // carrier wins; unknown wh → modal default
      const dim = basis === "weight" ? r.fweight : r.fvolume;
      const cost = calcRowCost(dim, rate);
      const { error: updErr } = await admin
        .from("tb_forwarder")
        .update({ fcosttotalprice: cost, frefprice: basis === "weight" ? "1" : "2" })
        .eq("id", r.id);
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
      .select("id, fvolume, fweight, fproductstype, fwarehousename, fwarehousechina, ftransporttype")
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
      fproductstype: string | null;
      fwarehousename: string | null;
      fwarehousechina: string | null;
      ftransporttype: string | null;
    }>) {
      const wh = (r.fwarehousename ?? "") as WarehouseDigit;
      const transport = ((r.ftransporttype ?? "1") as TransportMode) === "2" ? "2" : "1";
      if (!wh || (wh !== "1" && wh !== "2" && wh !== "3" && wh !== "4" && wh !== "5" && wh !== "6" && wh !== "7" && wh !== "8")) continue;

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
      // Then compute cost using the matching dimension.
      const carrierDefaultMode: "weight" | "cbm" = (wh === "1" || wh === "4") ? "weight" : "cbm";
      const refPriceValue = carrierDefaultMode === "weight" ? "1" : "2";
      const dim = carrierDefaultMode === "weight" ? r.fweight : r.fvolume;
      const cost = calcRowCost(dim, rate);
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
// 2026-06-09 (ภูม-reported bug fix) — STATUS GATE.
//   The legacy POST handler accepted any fID the admin checked, which
//   meant a row whose physical goods were still in transit (fstatus '1'/
//   '2'/'3' / not yet at the TH warehouse) could land in the QA queue
//   and be "ตรวจสอบ"-ed against nothing. New gate: reject the WHOLE
//   request when ANY selected fID has fstatus < REPORT_CNT_ADD_CHECK_MIN_FSTATUS.
//   All-or-nothing (better UX than silent partial: the staff fix the
//   selection, retry, and KNOW which rows were rejected).
//
//   NULL fstatus is treated as "<min" → rejected (defensive · a row
//   with no status string predates the workflow and shouldn't be queued).
//   fstatus '7' (ส่งแล้ว = delivered) is also accepted — a delivered
//   row CAN go back into QA if there's a customer dispute / damage claim,
//   the legacy let it (no upper bound), and we keep that behaviour.
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
        reason:           "fstatus_too_low",
        min_fstatus:      REPORT_CNT_ADD_CHECK_MIN_FSTATUS,
        blocked_count:    gate.blockedCount,
        blocked_sample:   gate.blockedFidorcos,
        sample_statuses:  gate.sampleStatuses,
        attempted_total:  parsed.data.fIDs.length,
      });
      const moreSuffix = gate.blockedCount > gate.blockedFidorcos.length
        ? ` (และอีก ${gate.blockedCount - gate.blockedFidorcos.length} รายการ)`
        : "";
      const minLabel = FSTATUS_LABEL[REPORT_CNT_ADD_CHECK_MIN_FSTATUS] ?? REPORT_CNT_ADD_CHECK_MIN_FSTATUS;
      return {
        ok:    false,
        error: `บางรายการยังไม่ถึงโกดังไทย — รอ MOMO sync update สถานะถึง "${minLabel}" ก่อน (รายการ ${gate.blockedFidorcos.join(", ")})${moreSuffix}`,
      };
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
): Promise<AdminActionResult<{ fID: number; pricePay: number; alreadyBilled: boolean }>> {
  const parsed = billToCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const fID = parsed.data.fID;

  return withAdmin<{ fID: number; pricePay: number; alreadyBilled: boolean }>(
    ["super", "ops", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // ── (a) Read the row's pricing + status BEFORE the flip ──
      const { data: row, error: rowErr } = await admin
        .from("tb_forwarder")
        .select(
          "id, fstatus, userid, fidorco, ftrackingchn, ftotalprice, ftransportprice, fpriceupdate, fshippingservice, fdiscount",
        )
        .eq("id", fID)
        .maybeSingle<{
          id: number;
          fstatus: string | null;
          userid: string | null;
          fidorco: string | null;
          ftrackingchn: string | null;
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
      const { fDiscount, pricePay } = await computeBillToCustomerAmounts({ ...row, promoId });

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
      });

      // ── (e) Status-log row (4→5) — matches legacy saveHistory($sql,41) ──
      // Best-effort: a log failure does NOT roll back the flip above.
      await appendStatusLog(admin, fID, fromStatus, "5", adminIdSafe);

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
      return { ok: true, data: { fID, pricePay, alreadyBilled: false } };
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
// no-op or refusal, never a wrong bill.
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

    // Sequential (not Promise.all): each member is an independent 4→5 flip with
    // its own idempotency guard; serial keeps the writes ordered + avoids
    // hammering the DB with N concurrent updates for a large split.
    for (const fID of fIDs) {
      const res = await adminReportCntBillToCustomer({ fID });
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
