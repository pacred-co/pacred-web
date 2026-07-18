"use server";

/**
 * บันทึกแพ็กเกจใบเสนอราคา (owner ปอน 2026-07-18) — write half ของ data-driven quote packages.
 *
 * upsert business_config json key `pricing.quote_packages` = QuotePackage[] ทั้งชุด
 * (super/accounting แก้ชื่อ/เรท/เงื่อนไข/ระยะเวลา + เพิ่ม/ลบแพ็ก บนหน้า "ตั้งเรทใบเสนอราคา").
 * READ half = lib/quote/quote-packages.ts (getQuotePackages · fallback seed).
 *
 * แพ็ก = พรีเซ็ต display ในใบเสนอราคาเท่านั้น — ไม่แตะ billing (บิลจริง = SVIP ?? tb_rate_g_*).
 * key ไม่ถูก migration-seed → upsert insert-if-absent (mirror sell-floor.ts). validate +
 * logAdminAction เหมือน adminUpdateBusinessConfig. value_type='json' · category 'pricing'.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateBusinessConfig } from "@/lib/business-config";
import { QUOTE_PACKAGES_KEY } from "@/lib/quote/quote-packages";

const pkgRate = z.object({
  cbm: z.number().finite().min(0).max(999_999),
  kg: z.number().finite().min(0).max(99_999),
});
const groupRates = z.object({ general: pkgRate, fda: pkgRate });
const transportRates = z.object({ "1": groupRates, "2": groupRates });
const gridSchema = z.object({ "1": transportRates, "2": transportRates });

const quotePackageSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1, "ชื่อแพ็กห้ามว่าง").max(120),
  conditions: z.array(z.string().max(500)).max(50),
  days: z.object({ truck: z.string().max(40), ship: z.string().max(40) }),
  rates: gridSchema,
});

const saveSchema = z.object({
  packages: z.array(quotePackageSchema).min(1, "ต้องมีอย่างน้อย 1 แพ็ก").max(50, "แพ็กเกจมากเกินไป"),
});
export type AdminSaveQuotePackagesInput = z.infer<typeof saveSchema>;

export async function adminSaveQuotePackages(
  input: AdminSaveQuotePackagesInput,
): Promise<AdminActionResult<{ count: number }>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลแพ็กเกจไม่ถูกต้อง" };
  }
  // รหัสแพ็กต้องไม่ซ้ำ (dropdown/lookup ในใบเสนอราคาใช้ id)
  const ids = parsed.data.packages.map((p) => p.id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "รหัสแพ็กซ้ำ — กรุณาลองใหม่" };
  }

  return withAdmin<{ count: number }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    // UPSERT — key ไม่ถูก migration-seed → insert-if-absent (mirror sell-floor).
    const { error: upErr } = await admin.from("business_config").upsert(
      {
        key: QUOTE_PACKAGES_KEY,
        value: parsed.data.packages,
        value_type: "json",
        category: "pricing",
        description:
          "แพ็กเกจใบเสนอราคา (พรีเซ็ต) — แก้/เพิ่ม/ลบได้ · เลือกแพ็กในใบเสนอราคา → โชว์เรทแพ็กนั้น · ไม่กระทบบิลจริง",
        updated_by_admin_id: adminId,
        updated_at: nowIso,
      },
      { onConflict: "key" },
    );
    if (upErr) {
      console.error("[quote-packages upsert] failed", { code: upErr.code, message: upErr.message });
      return { ok: false, error: `บันทึกไม่สำเร็จ: ${upErr.message}` };
    }

    invalidateBusinessConfig(QUOTE_PACKAGES_KEY);
    await logAdminAction(adminId, "business_config.quote_packages.update", "business_config", QUOTE_PACKAGES_KEY, {
      count: parsed.data.packages.length,
    });

    // แพ็กถูกอ่านโดยหน้าตั้งเรท + ใบเสนอราคาลูกค้า
    revalidatePath("/admin/rates/quote-default");
    revalidatePath("/admin/customers", "layout");

    return { ok: true, data: { count: parsed.data.packages.length } };
  });
}
