"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// V-A4 (cargo forensics): 'rate-entry validation — block the "เรทเบิ้ล"
// (doubled-rate) class of error'. Schema bounds tightened: yuan_rate
// realistic range is ~4-7 THB/CNY (extreme crisis ~ 8-9). Allowing 100
// would let a typo of "50" through. Now bounded (0, 20]; the further
// per-field SUSPICIOUS_FACTOR check catches accidental ×2/×10 changes
// even within range by comparing against the previous saved value.
const updateSchema = z.object({
  service_fee:                 z.number().min(0).max(10000),
  juristic_discount_threshold: z.number().min(0).max(1000000),
  juristic_discount_pct:       z.number().min(0).max(1),       // 0-1 (e.g. 0.01 = 1%)
  qc_fee_per_item:             z.number().min(0).max(10000),
  crate_fee_base:              z.number().min(0).max(100000),
  free_shipping_enabled:       z.boolean(),
  free_shipping_threshold:     z.number().min(0).max(1000000).optional().nullable(),
  yuan_rate:                   z.number().positive().max(20),  // V-A4: tightened from 100
  // V-A4: when admin really wants to apply an unusual jump (e.g., real
  // exchange-rate spike), set true to bypass the suspicious-change check.
  // Audit log records when this bypass was used.
  confirm_unusual_rate:        z.boolean().optional(),
});
export type AdminUpdateSettingsInput = z.infer<typeof updateSchema>;

// V-A4 thresholds: a new value within RATIO×prev is "expected"; beyond
// requires confirm_unusual_rate=true. yuan_rate is the most common typo
// source so tightest. Discount % gets widest because policy intentional.
const SUSPICIOUS_FACTOR: Record<string, number> = {
  yuan_rate:                   1.5,    // ±50% — typical day-to-day move ~1-2%
  service_fee:                 2.0,    // ±100% — service fee tweaks are policy
  qc_fee_per_item:             2.0,
  crate_fee_base:              2.0,
  juristic_discount_pct:       3.0,    // ±200% — discount tweaks intentional
};

function isSuspiciousChange(field: string, oldValue: number, newValue: number): boolean {
  if (oldValue <= 0) return false;                // first-time set, no baseline
  if (newValue === oldValue) return false;
  if (newValue <= 0) return false;                // setting to 0 = explicit, not typo
  const factor = SUSPICIOUS_FACTOR[field];
  if (!factor) return false;
  const ratio = Math.max(oldValue, newValue) / Math.min(oldValue, newValue);
  return ratio > factor;
}

export async function adminUpdateSettings(input: AdminUpdateSettingsInput): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // V-A4: fetch previous values to compare against new for suspicious-change detection
    const { data: prev } = await admin
      .from("settings")
      .select("yuan_rate, service_fee, qc_fee_per_item, crate_fee_base, juristic_discount_pct")
      .eq("id", 1)
      .maybeSingle<{
        yuan_rate: number;
        service_fee: number;
        qc_fee_per_item: number;
        crate_fee_base: number;
        juristic_discount_pct: number;
      }>();

    if (prev && !d.confirm_unusual_rate) {
      const suspicious: string[] = [];
      const checks: Array<[string, number, number]> = [
        ["yuan_rate",             Number(prev.yuan_rate),             d.yuan_rate],
        ["service_fee",           Number(prev.service_fee),           d.service_fee],
        ["qc_fee_per_item",       Number(prev.qc_fee_per_item),       d.qc_fee_per_item],
        ["crate_fee_base",        Number(prev.crate_fee_base),        d.crate_fee_base],
        ["juristic_discount_pct", Number(prev.juristic_discount_pct), d.juristic_discount_pct],
      ];
      for (const [field, oldV, newV] of checks) {
        if (isSuspiciousChange(field, oldV, newV)) {
          suspicious.push(`${field} ${oldV} → ${newV}`);
        }
      }
      if (suspicious.length > 0) {
        return {
          ok: false,
          error: `⚠ ตรวจพบการเปลี่ยนค่าผิดปกติ (อาจเป็น typo): ${suspicious.join(" · ")}. ` +
                 `ถ้าตั้งใจ ให้กดยืนยันอีกครั้ง (UI จะถาม) เพื่อ bypass.`,
        };
      }
    }

    const { error } = await admin
      .from("settings")
      .update({
        service_fee:                 d.service_fee,
        juristic_discount_threshold: d.juristic_discount_threshold,
        juristic_discount_pct:       d.juristic_discount_pct,
        qc_fee_per_item:             d.qc_fee_per_item,
        crate_fee_base:              d.crate_fee_base,
        free_shipping_enabled:       d.free_shipping_enabled,
        free_shipping_threshold:     d.free_shipping_threshold ?? null,
        yuan_rate:                   d.yuan_rate,
      })
      .eq("id", 1);

    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "settings.update", "settings", "1", {
      ...d,
      ...(d.confirm_unusual_rate ? { __suspicious_change_bypassed: true } : {}),
    });
    revalidatePath("/admin/settings");
    return { ok: true };
  });
}
