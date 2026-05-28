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

    // ── (b) Normalise fRefPrice across every row in the container ──
    // Wave 16 Follow-up C: container-wide mode is stored implicitly by
    // forcing each row's fRefPrice to match. Legacy comment from migration
    // 0081: fRefPrice '1' = น้ำหนัก, '2' = ปริมาตร (badge code treats
    // '' / null same as '2'). We always write the explicit value here.
    const refPriceValue = mode === "weight" ? "1" : "2";
    const { error: refErr } = await admin
      .from("tb_forwarder")
      .update({ frefprice: refPriceValue })
      .eq("fcabinetnumber", fCabinetNumber);
    if (refErr) return { ok: false, error: refErr.message };

    // ── (c) Bulk-update fcosttotalprice per row ──
    // Legacy looped every tb_forwarder row and called calPriceForwarderCost();
    // for the CBM warehouses this simplifies to rate × CBM. Pacred extends:
    // when mode="weight", cost = rate × fWeight (admin's chosen dimension
    // applies to the whole container).
    const { data: rows, error: rowsErr } = await admin
      .from("tb_forwarder")
      .select("id, fvolume, fweight, fproductstype")
      .eq("fcabinetnumber", fCabinetNumber);
    if (rowsErr) return { ok: false, error: rowsErr.message };

    const rates = {
      p1: fProductsType1,
      p2: fProductsType2,
      p3: fProductsType3,
      p4: fProductsType4,
    };

    let updated = 0;
    for (const r of (rows ?? []) as Array<{ id: number; fvolume: number | null; fweight: number | null; fproductstype: string | null }>) {
      const rate = pickRate(rates, r.fproductstype);
      const dim = mode === "weight" ? r.fweight : r.fvolume;
      const cost = calcRowCost(dim, rate);
      const { error: updErr } = await admin
        .from("tb_forwarder")
        .update({ fcosttotalprice: cost })
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

    // Skip rows that already exist (legacy doesn't guard — leaves a dup
    // row when an admin clicks twice. We guard for cleanliness; the
    // observable behaviour matches "the row is in the queue").
    const { data: existing, error: existingErr } = await admin
      .from("tb_check_forwarder")
      .select("fid")
      .in("fid", parsed.data.fIDs);
    if (existingErr) {
      console.error(`[tb_check_forwarder list] failed`, { code: existingErr.code, message: existingErr.message });
    }
    const seen = new Set((existing ?? []).map((r) => Number(r.fid)));

    const toInsert = parsed.data.fIDs
      .filter((id) => !seen.has(id))
      .map((id) => ({
        cfstatus: "1",
        fid:      id,
        date:     new Date().toISOString(),
        adminid:  adminId.slice(0, 50),
      }));

    if (toInsert.length === 0) {
      return { ok: true, data: { inserted: 0, skipped: parsed.data.fIDs.length } };
    }

    const { error: insErr } = await admin.from("tb_check_forwarder").insert(toInsert);
    if (insErr) return { ok: false, error: insErr.message };

    await logAdminAction(adminId, "report_cnt.add_check", "tb_check_forwarder", toInsert.map((r) => r.fid).join(","), {
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
