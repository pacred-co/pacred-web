"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGodRole, type AdminRole } from "@/lib/auth/require-admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  ALL_COST_COLUMNS_SET,
  MASTER_NUMERIC_COLUMNS,
  COST_RATE_MIN,
  COST_RATE_MAX,
  COST_CELL_MIN,
  COST_CELL_MAX,
} from "@/app/[locale]/(admin)/admin/settings/forwarder-costs/costs-model";

/**
 * V-A4 (D1 faithful-port) — rate-entry validation guard for tb_settings.
 *
 * Spec: see PORT_PLAN Part V-A4 — "Rate-entry validation — exchange/price
 * rate range-guarded; block the 'เรทเบิ้ล' (doubled-rate) class of error".
 *
 * Legacy reference: member/pcs-admin/settings.php
 *   • L3-8   — UPDATE tb_settings SET rsDefault=$rsDefault  (shop yuan-rate)
 *   • L17-22 — UPDATE tb_settings SET rpDefault=$rsDefault  (transfer rate)
 *   • L1801  — <input type="number" min="0" step="0.01"> — NO max
 *
 * The legacy admin UI accepts ANY positive number with NO upper bound.
 * Typos like 47.5 (meant 4.75) or 0.475 (meant 4.75) ship through silently
 * and invoice the entire day's orders at the wrong rate → customer-dispute
 * pile-up. This is the "เรทเบิ้ล" (doubled-rate) class of error.
 *
 * D1 NOTE — this is a Pacred safety improvement; the legacy never had it.
 * We're adding it because the owner's mandate is "100% sameness FIRST then
 * improve", and a safety guard that REJECTS bad input does not change the
 * happy-path behaviour staff see. The block is faithful — the value still
 * lands in tb_settings.rsdefault exactly as the legacy did — we just stop
 * the typo before it gets there. Genuine off-band rates (crisis exchange-
 * rate spike) flow through via `force_override` reserved for super.
 *
 * Validation:
 *   • All three legacy yuan-rate columns (rsdefault / rpdefault / rgdefault)
 *     must be in [2.0, 8.0] THB/CNY — covers ±50% of legacy default 4.75
 *     and rejects 47.5 / 0.475. Beyond that range = typo with overwhelming
 *     likelihood vs. genuine rate.
 *   • force_override?: boolean — super (only) bypasses the guard; the
 *     audit row records the bypass with __range_guard_bypassed=true.
 *
 * RBAC:
 *   • super + accounting can set in-range.
 *   • Only super can pass force_override=true (accounting cannot bypass).
 *
 * Audit: every change logs an admin_audit_log row with the full payload
 * and old/new values.
 */

// V-A4: THB-per-CNY rate range guard. Legacy historical default is 4.75
// (settings.php). 2.0-8.0 = ±50% — wide enough for genuine 6.0+ spikes,
// narrow enough to block 47.5 / 0.475 typos.
const RATE_MIN_THB_PER_CNY = 2.0;
const RATE_MAX_THB_PER_CNY = 8.0;

const setTbSettingsRatesSchema = z.object({
  // tb_settings.id = 1 (singleton row, per legacy)
  rsdefault:      z.number().positive(),
  rpdefault:      z.number().positive(),
  rgdefault:      z.number().positive(),
  force_override: z.boolean().optional(),
});
export type SetTbSettingsRatesInput = z.infer<typeof setTbSettingsRatesSchema>;

type RateField = "rsdefault" | "rpdefault" | "rgdefault";

function rangeFailures(d: SetTbSettingsRatesInput): string[] {
  const fields: [RateField, number][] = [
    ["rsdefault", d.rsdefault],
    ["rpdefault", d.rpdefault],
    ["rgdefault", d.rgdefault],
  ];
  const fails: string[] = [];
  for (const [name, value] of fields) {
    if (value < RATE_MIN_THB_PER_CNY || value > RATE_MAX_THB_PER_CNY) {
      fails.push(
        `เรทผิดปกติ ${name}=${value}. ` +
        `ช่วงที่ยอมรับ ${RATE_MIN_THB_PER_CNY.toFixed(2)} - ${RATE_MAX_THB_PER_CNY.toFixed(2)}. ` +
        `ถ้าตั้งใจให้ใช้ค่านี้จริง ต้องติดต่อ super admin`
      );
    }
  }
  return fails;
}

export async function adminSetTbSettingsRates(
  input: SetTbSettingsRatesInput,
): Promise<AdminActionResult<{ updated: RateField[] }>> {
  const parsed = setTbSettingsRatesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  // Note: roles=["super","accounting"] — we further check inside that ONLY
  // super may use force_override. withAdmin's `roles` is just a coarse gate;
  // the fine-grained super-only-bypass needs a second check after entry.
  return withAdmin<{ updated: RateField[] }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      // Range guard — refuse if any rate is out of [2.0, 8.0] and the caller
      // didn't (or can't) bypass.
      const failures = rangeFailures(d);
      if (failures.length > 0 && !d.force_override) {
        return { ok: false, error: failures.join(" · ") };
      }

      // If force_override is set, confirm caller actually has super role —
      // accounting cannot bypass. We re-check roles via the admins table
      // (mirrors lib/auth/require-admin.ts: profile_id + is_active=true).
      if (failures.length > 0 && d.force_override) {
        const adminCheck = createAdminClient();
        const { data: rolesRows, error: rolesErr } = await adminCheck
          .from("admins")
          .select("role")
          .eq("profile_id", adminId)
          .eq("is_active", true);
        if (rolesErr) {
          console.error(`[tb-settings adminSetTbSettingsRates] roles lookup failed`, {
            code: rolesErr.code, message: rolesErr.message, adminId,
          });
          return { ok: false, error: `roles lookup failed: ${rolesErr.message}` };
        }
        const roles = (rolesRows ?? []).map((r: { role: string }) => r.role) as AdminRole[];
        if (!isGodRole(roles)) {
          return {
            ok: false,
            error: "เฉพาะ super admin เท่านั้นที่ bypass การตรวจช่วงเรทได้",
          };
        }
      }

      const admin = createAdminClient();
      const { data: before, error: readErr } = await admin
        .from("tb_settings")
        .select("rsdefault, rpdefault, rgdefault")
        .eq("id", 1)
        .maybeSingle<{ rsdefault: number; rpdefault: number; rgdefault: number }>();
      if (readErr) return { ok: false, error: readErr.message };
      if (!before) return { ok: false, error: "tb_settings row id=1 not found" };

      const { error: updErr } = await admin
        .from("tb_settings")
        .update({
          rsdefault: d.rsdefault,
          rpdefault: d.rpdefault,
          rgdefault: d.rgdefault,
        })
        .eq("id", 1);
      if (updErr) return { ok: false, error: updErr.message };

      const updated: RateField[] = (
        ["rsdefault", "rpdefault", "rgdefault"] as const
      ).filter((f) => Number(before[f]) !== d[f]);

      await logAdminAction(adminId, "tb_settings.set_rates", "tb_settings", "1", {
        before: {
          rsdefault: Number(before.rsdefault),
          rpdefault: Number(before.rpdefault),
          rgdefault: Number(before.rgdefault),
        },
        after: {
          rsdefault: d.rsdefault,
          rpdefault: d.rpdefault,
          rgdefault: d.rgdefault,
        },
        ...(failures.length > 0 && d.force_override
          ? { __range_guard_bypassed: true, range_failures: failures }
          : {}),
      });

      revalidatePath("/admin/settings");
      // Tier A6 (2026-05-29): also revalidate the legacy-rates editor + the
      // two surfaces that read tb_settings rates directly so accounting sees
      // the change without a manual page refresh.
      revalidatePath("/admin/settings/legacy-rates");
      revalidatePath("/admin/yuan-payments/new");
      revalidatePath("/service-payment/add");
      return { ok: true, data: { updated } };
    },
  );
}

/**
 * V-A4 — per-customer CBM-rate override guard. The legacy
 * `tb_rate_custom_cbm` table stores a CUSTOMER × (transport × warehouse ×
 * product-type)-keyed override of the CBM shipping rate. Same typo class
 * applies — a typo here mis-bills a single customer for every shipment
 * until someone spots it.
 *
 * Range: CBM rates in legacy data range ~30-300 THB/cbm depending on lane
 * and grade. We accept [10, 2000] — covers extreme freight surcharges,
 * rejects a digit-misplace (typed 30 → 3000 or 300 → 30000 → both blocked).
 */
const CBM_RATE_MIN = 10;
const CBM_RATE_MAX = 2000;

const setTbRateCustomCbmSchema = z.object({
  userid:          z.string().trim().min(1).max(10),
  rtransporttype:  z.string().trim().length(1),
  sourcewarehouse: z.string().trim().length(1),
  rproductstype:   z.string().trim().length(1),
  rcbm:            z.number().positive(),
  force_override:  z.boolean().optional(),
});
export type SetTbRateCustomCbmInput = z.infer<typeof setTbRateCustomCbmSchema>;

export async function adminSetTbRateCustomCbm(
  input: SetTbRateCustomCbmInput,
): Promise<AdminActionResult<{ id: number }>> {
  const parsed = setTbRateCustomCbmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  // Range guard — same shape as the tb_settings version.
  const outOfBand = d.rcbm < CBM_RATE_MIN || d.rcbm > CBM_RATE_MAX;
  if (outOfBand && !d.force_override) {
    return {
      ok: false,
      error:
        `เรทผิดปกติ: rcbm=${d.rcbm}. ` +
        `ช่วงที่ยอมรับ ${CBM_RATE_MIN.toFixed(2)} - ${CBM_RATE_MAX.toFixed(2)}. ` +
        `ถ้าตั้งใจให้ใช้ค่านี้จริง ต้องติดต่อ super admin`,
    };
  }

  return withAdmin<{ id: number }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      // super-only override (mirrors tb_settings flow above).
      if (outOfBand && d.force_override) {
        const adminCheck = createAdminClient();
        const { data: rolesRows, error: rolesErr } = await adminCheck
          .from("admins")
          .select("role")
          .eq("profile_id", adminId)
          .eq("is_active", true);
        if (rolesErr) {
          console.error(`[tb-settings adminSetTbRateCustomCbm] roles lookup failed`, {
            code: rolesErr.code, message: rolesErr.message, adminId,
          });
          return { ok: false, error: `roles lookup failed: ${rolesErr.message}` };
        }
        const roles = (rolesRows ?? []).map((r: { role: string }) => r.role) as AdminRole[];
        if (!isGodRole(roles)) {
          return {
            ok: false,
            error: "เฉพาะ super admin เท่านั้นที่ bypass การตรวจช่วงเรทได้",
          };
        }
      }

      const admin = createAdminClient();
      const { data: existing, error: existingErr } = await admin
        .from("tb_rate_custom_cbm")
        .select("id, rcbm")
        .eq("userid",          d.userid)
        .eq("rtransporttype",  d.rtransporttype)
        .eq("sourcewarehouse", d.sourcewarehouse)
        .eq("rproductstype",   d.rproductstype)
        .maybeSingle<{ id: number; rcbm: number }>();
      if (existingErr) {
        console.error(`[tb-settings adminSetTbRateCustomCbm] existing-rate lookup failed`, {
          code: existingErr.code, message: existingErr.message, userid: d.userid,
        });
        return { ok: false, error: `lookup failed: ${existingErr.message}` };
      }

      let id: number;
      if (existing) {
        const { error: updErr } = await admin
          .from("tb_rate_custom_cbm")
          .update({ rcbm: d.rcbm, adminidupdate: adminId.slice(0, 10) })
          .eq("id", existing.id);
        if (updErr) return { ok: false, error: updErr.message };
        id = existing.id;
      } else {
        const { data: inserted, error: insErr } = await admin
          .from("tb_rate_custom_cbm")
          .insert({
            userid:          d.userid,
            rtransporttype:  d.rtransporttype,
            sourcewarehouse: d.sourcewarehouse,
            rproductstype:   d.rproductstype,
            rcbm:            d.rcbm,
            adminidupdate:   adminId.slice(0, 10),
          })
          .select("id")
          .single<{ id: number }>();
        if (insErr) return { ok: false, error: insErr.message };
        id = inserted.id;
      }

      await logAdminAction(adminId, "tb_rate_custom_cbm.upsert", "tb_rate_custom_cbm", String(id), {
        key: {
          userid:          d.userid,
          rtransporttype:  d.rtransporttype,
          sourcewarehouse: d.sourcewarehouse,
          rproductstype:   d.rproductstype,
        },
        before: existing ? { rcbm: Number(existing.rcbm) } : null,
        after:  { rcbm: d.rcbm },
        ...(outOfBand && d.force_override
          ? { __range_guard_bypassed: true }
          : {}),
      });

      revalidatePath("/admin/rates");
      return { ok: true, data: { id } };
    },
  );
}

/**
 * Re-sweep A2 #28 (money P0) — admin editor for the DEFAULT forwarder-cost
 * matrix on the `tb_settings` singleton (id=1).
 *
 * Legacy reference: `pcs-admin/settings.php` — the "ตั้งค่าเรทนำเข้าสินค้า
 * <CARRIER>" sections. Each carrier × transport × product-type × warehouse-city
 * cell is one `tb_settings` cost column (144 total · all lowercase on prod);
 * the legacy UI had one `update_<col>` POST per cell. These auto-fill a NEW
 * forwarder row's per-tier cost when an order lands (the read side is
 * `actions/admin/report-cnt-detail.ts:warehouseSegment()`), so a wrong value
 * here silently under/over-costs every future forwarder of that lane → margin
 * leak. Before this action the matrix could only be edited by raw SQL.
 *
 * This is the natural Wave-2 sibling of `adminSetTbSettingsRates` (CNY rates).
 * It writes:
 *   • any subset of the 144 cost columns (`costs` map), each [0, 100000]
 *   • the two master cost-rate columns hratecostdefault / hratecostsale
 *     ([2.0, 8.0] CNY-per-THB guard, same class as the rate editor)
 *   • numberpaymemt (text running number — เลขที่ฝากจ่าย)
 *   • freeshipping ("1" on | "2" off)
 *
 * Faithful: the value lands in the exact same `tb_settings` column the legacy
 * wrote; we only add an allow-list (reject unknown keys), a typo range-guard,
 * read-before-write, and an audit row. rs/rp/rgdefault are intentionally NOT
 * writable here — they have their own editor (`/admin/settings/legacy-rates`)
 * to avoid two writers for the same field.
 *
 * RBAC: super + accounting (mirrors adminSetTbSettingsRates). Only super may
 * `force_override` an out-of-range master cost-rate.
 */

const costColumnRecordSchema = z
  .record(z.string(), z.number())
  .refine(
    (rec) => Object.keys(rec).every((k) => ALL_COST_COLUMNS_SET.has(k)),
    { message: "พบคอลัมน์ต้นทุนที่ไม่รู้จัก (ไม่อยู่ใน allow-list ของ tb_settings)" },
  )
  .refine(
    (rec) =>
      Object.values(rec).every(
        (v) => Number.isFinite(v) && v >= COST_CELL_MIN && v <= COST_CELL_MAX,
      ),
    {
      message:
        `ค่าต้นทุนต้องอยู่ในช่วง ${COST_CELL_MIN.toLocaleString()} - ${COST_CELL_MAX.toLocaleString()}`,
    },
  );

const setTbSettingsForwarderCostsSchema = z
  .object({
    // partial map: only columns the admin actually changed are sent
    costs: costColumnRecordSchema.optional(),
    hratecostdefault: z.number().positive().optional(),
    hratecostsale: z.number().positive().optional(),
    // เลขที่ฝากจ่าย — free text (legacy stores e.g. "123412345")
    numberpaymemt: z.string().trim().max(50).optional(),
    // ฟรีค่าขนส่ง — legacy "1"=on, "2"=off
    freeshipping: z.enum(["1", "2"]).optional(),
    force_override: z.boolean().optional(),
  })
  .refine(
    (d) =>
      (d.costs && Object.keys(d.costs).length > 0) ||
      d.hratecostdefault !== undefined ||
      d.hratecostsale !== undefined ||
      d.numberpaymemt !== undefined ||
      d.freeshipping !== undefined,
    { message: "ไม่มีค่าที่จะบันทึก" },
  );

export type SetTbSettingsForwarderCostsInput = z.infer<
  typeof setTbSettingsForwarderCostsSchema
>;

// The master cost-rate columns that carry the [2.0, 8.0] CNY-per-THB guard.
const MASTER_RATE_COLS = MASTER_NUMERIC_COLUMNS.map((m) => m.col);

export async function adminSetTbSettingsForwarderCosts(
  input: SetTbSettingsForwarderCostsInput,
): Promise<AdminActionResult<{ updated: string[] }>> {
  const parsed = setTbSettingsForwarderCostsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // Range guard for the two master cost-rates (same typo class as rsdefault).
  const rateFailures: string[] = [];
  for (const col of MASTER_RATE_COLS) {
    const v = d[col as "hratecostdefault" | "hratecostsale"];
    if (v !== undefined && (v < COST_RATE_MIN || v > COST_RATE_MAX)) {
      rateFailures.push(
        `เรทผิดปกติ ${col}=${v}. ` +
          `ช่วงที่ยอมรับ ${COST_RATE_MIN.toFixed(2)} - ${COST_RATE_MAX.toFixed(2)}. ` +
          `ถ้าตั้งใจให้ใช้ค่านี้จริง ต้องติดต่อ super admin`,
      );
    }
  }
  if (rateFailures.length > 0 && !d.force_override) {
    return { ok: false, error: rateFailures.join(" · ") };
  }

  return withAdmin<{ updated: string[] }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      // super-only bypass for out-of-band master cost-rate (accounting cannot).
      if (rateFailures.length > 0 && d.force_override) {
        const adminCheck = createAdminClient();
        const { data: rolesRows, error: rolesErr } = await adminCheck
          .from("admins")
          .select("role")
          .eq("profile_id", adminId)
          .eq("is_active", true);
        if (rolesErr) {
          console.error(`[tb-settings adminSetTbSettingsForwarderCosts] roles lookup failed`, {
            code: rolesErr.code, message: rolesErr.message, adminId,
          });
          return { ok: false, error: `roles lookup failed: ${rolesErr.message}` };
        }
        const roles = (rolesRows ?? []).map((r: { role: string }) => r.role) as AdminRole[];
        if (!isGodRole(roles)) {
          return {
            ok: false,
            error: "เฉพาะ super admin เท่านั้นที่ bypass การตรวจช่วงเรทได้",
          };
        }
      }

      // Build the full update payload (cost cells + master config).
      const updatePayload: Record<string, number | string> = {};
      if (d.costs) {
        for (const [col, val] of Object.entries(d.costs)) updatePayload[col] = val;
      }
      if (d.hratecostdefault !== undefined) updatePayload.hratecostdefault = d.hratecostdefault;
      if (d.hratecostsale !== undefined) updatePayload.hratecostsale = d.hratecostsale;
      if (d.numberpaymemt !== undefined) updatePayload.numberpaymemt = d.numberpaymemt;
      if (d.freeshipping !== undefined) updatePayload.freeshipping = d.freeshipping;

      const changedCols = Object.keys(updatePayload);

      const admin = createAdminClient();

      // Read-before-write — fetch ONLY the columns we're about to change, so
      // the audit row captures a precise before/after diff and we can skip
      // no-op writes.
      const { data: before, error: readErr } = await admin
        .from("tb_settings")
        .select(changedCols.join(", "))
        .eq("id", 1)
        .maybeSingle<Record<string, number | string | null>>();
      if (readErr) {
        console.error(`[tb-settings adminSetTbSettingsForwarderCosts] read-before-write failed`, {
          code: readErr.code, message: readErr.message,
        });
        return { ok: false, error: readErr.message };
      }
      if (!before) return { ok: false, error: "tb_settings row id=1 not found" };

      // Compute the genuinely-changed columns (string-vs-number safe compare).
      const updated: string[] = [];
      const beforeDiff: Record<string, number | string | null> = {};
      const afterDiff: Record<string, number | string> = {};
      for (const col of changedCols) {
        const newVal = updatePayload[col];
        const oldRaw = before[col];
        // Numeric columns compare by Number(); text columns by string.
        const isNumeric = typeof newVal === "number";
        const changed = isNumeric
          ? Number(oldRaw ?? NaN) !== newVal
          : String(oldRaw ?? "") !== String(newVal);
        if (changed) {
          updated.push(col);
          beforeDiff[col] = oldRaw ?? null;
          afterDiff[col] = newVal;
        }
      }

      if (updated.length === 0) {
        return { ok: true, data: { updated: [] } };
      }

      // Write ONLY the changed columns.
      const writePayload: Record<string, number | string> = {};
      for (const col of updated) writePayload[col] = updatePayload[col];

      const { error: updErr } = await admin
        .from("tb_settings")
        .update(writePayload)
        .eq("id", 1);
      if (updErr) {
        console.error(`[tb-settings adminSetTbSettingsForwarderCosts] update failed`, {
          code: updErr.code, message: updErr.message,
        });
        return { ok: false, error: updErr.message };
      }

      await logAdminAction(
        adminId,
        "tb_settings.set_forwarder_costs",
        "tb_settings",
        "1",
        {
          changed_count: updated.length,
          before: beforeDiff,
          after: afterDiff,
          ...(rateFailures.length > 0 && d.force_override
            ? { __range_guard_bypassed: true, range_failures: rateFailures }
            : {}),
        },
      );

      // The cost matrix auto-fills NEW forwarder rows; refresh the editor +
      // the rate-cost sibling so accounting sees the change immediately.
      revalidatePath("/admin/settings/forwarder-costs");
      revalidatePath("/admin/settings/legacy-rates");
      revalidatePath("/admin/settings");
      return { ok: true, data: { updated } };
    },
  );
}
