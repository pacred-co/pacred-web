"use server";

/**
 * Ultra-editable sell-rate CBM floor (เดฟ · #5b).
 *
 * The ราคาขายขั้นต่ำ (CBM sell floor) is a HARD guardrail — staff can't sell a
 * customer below it (commit 06d34711). The owner (ภูม) asked that ONLY `ultra`
 * (Ultra Admin Z) be able to CHANGE the floor, inline where it's shown, no new
 * page. This action is the write half: it upserts the `business_config` json
 * key `pricing.sell_rate_floor_cbm` (the per-warehouse × transport CBM floor
 * matrix). The READ half (the resolver with the constant fallback) lives in
 * lib/admin/sell-floor-config.ts.
 *
 * 🔐 Role gate — `isGodRole` ONLY (ultra/super). This changes a money guardrail,
 * so it must NEVER be wider. We pass `["ultra", "super"]` to withAdmin (which
 * also grants any god-role via requireAdmin's isGodRole bypass — same set) AND
 * re-assert isGodRole on the resolved roles inside the body (defense-in-depth).
 *
 * The key is NOT migration-seeded (owner: no migration), so this UPSERTs the
 * row (insert-if-absent) — unlike adminUpdateBusinessConfig/setBusinessConfig
 * which refuse unknown keys. Validation + logAdminAction mirror that audited
 * writer. value_type='json' (the matrix), category 'pricing'.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { getAdminRoles, isGodRole } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateBusinessConfig } from "@/lib/business-config";
import {
  SELL_FLOOR_CBM_KEY,
  SELL_FLOOR_KG_KEY,
  SELL_FLOOR_MIN,
  SELL_FLOOR_MAX,
  SELL_FLOOR_KG_MIN,
  SELL_FLOOR_KG_MAX,
  defaultSellFloorCbm,
  defaultSellFloorKg,
  type SellFloorCbmConfig,
  type SellFloorKgConfig,
} from "@/lib/admin/sell-floor-config";

// A single CBM floor value: positive + sane bounds (≥1000 ≤99999).
const floorValue = z
  .number()
  .finite()
  .min(SELL_FLOOR_MIN, `ต้องไม่ต่ำกว่า ${SELL_FLOOR_MIN}`)
  .max(SELL_FLOOR_MAX, `ต้องไม่เกิน ${SELL_FLOOR_MAX}`);

const transportFloor = z.object({ "1": floorValue, "2": floorValue });
const updateSchema = z.object({
  // the 4 numbers: warehouse '1'/'2' × transport '1'รถ/'2'เรือ.
  floor: z.object({ "1": transportFloor, "2": transportFloor }),
});
export type AdminUpdateSellFloorCbmInput = z.infer<typeof updateSchema>;

export async function adminUpdateSellFloorCbm(
  input: AdminUpdateSellFloorCbmInput,
): Promise<AdminActionResult<{ before: SellFloorCbmConfig | null; after: SellFloorCbmConfig }>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "กรอกราคาขั้นต่ำให้ครบ 4 ช่อง (ตัวเลข)" };
  }
  // Normalize to the stored shape (4 positive numbers).
  const after: SellFloorCbmConfig = {
    "1": { "1": parsed.data.floor["1"]["1"], "2": parsed.data.floor["1"]["2"] },
    "2": { "1": parsed.data.floor["2"]["1"], "2": parsed.data.floor["2"]["2"] },
  };

  // 🔐 ultra/super ONLY. withAdmin(["ultra","super"]) admits exactly the god
  // roles (a plain accounting/pricing/sales admin is rejected); the re-check
  // below is defense-in-depth on the resolved roles.
  return withAdmin<{ before: SellFloorCbmConfig | null; after: SellFloorCbmConfig }>(
    ["ultra", "super"],
    async ({ adminId }) => {
      const roles = (await getAdminRoles()) ?? [];
      if (!isGodRole(roles)) {
        return { ok: false, error: "forbidden — เฉพาะ Ultra Admin Z แก้ราคาขั้นต่ำได้" };
      }

      const admin = createAdminClient();

      // Before-image (for the audit) — the existing key value, if any.
      const { data: existing, error: readErr } = await admin
        .from("business_config")
        .select("value")
        .eq("key", SELL_FLOOR_CBM_KEY)
        .maybeSingle<{ value: unknown }>();
      if (readErr) {
        console.error(`[sell-floor read] failed`, { code: readErr.code, message: readErr.message });
        return { ok: false, error: `db_error:${readErr.code ?? "unknown"}` };
      }
      const before = (existing?.value as SellFloorCbmConfig | null) ?? null;

      // UPSERT — the key is NOT migration-seeded, so insert-if-absent. On the
      // first ultra-save the row is created (value_type='json', category
      // 'pricing'); subsequent saves update value + the audit columns.
      const nowIso = new Date().toISOString();
      const { error: upErr } = await admin
        .from("business_config")
        .upsert(
          {
            key: SELL_FLOOR_CBM_KEY,
            value: after,
            value_type: "json",
            category: "pricing",
            description:
              "ราคาขายขั้นต่ำ CBM (฿/คิว) ต่อโกดัง×ขนส่ง — ห้ามขายต่ำกว่านี้ · แก้ได้เฉพาะ Ultra Admin Z",
            updated_by_admin_id: adminId,
            updated_at: nowIso,
          },
          { onConflict: "key" },
        );
      if (upErr) {
        console.error(`[sell-floor upsert] failed`, { code: upErr.code, message: upErr.message });
        return { ok: false, error: `บันทึกไม่สำเร็จ: ${upErr.message}` };
      }

      // Drop the cache key so getSellFloorCbm() sees the new floor immediately.
      invalidateBusinessConfig(SELL_FLOOR_CBM_KEY);

      await logAdminAction(adminId, "business_config.sell_floor_cbm.update", "business_config", SELL_FLOOR_CBM_KEY, {
        before: before ?? defaultSellFloorCbm(),
        after,
      });

      // The floor is read by the customer rate page (enforcement + display).
      revalidatePath("/admin/customers", "layout");

      return { ok: true, data: { before, after } };
    },
  );
}

// ── KG floor twin (per-transport flat · owner 2026-07-03 "รถ 17 เรือ 7") ─────
// A single KG floor value: positive + sane bounds (≥1 ≤999).
const kgFloorValue = z
  .number()
  .finite()
  .min(SELL_FLOOR_KG_MIN, `ต้องไม่ต่ำกว่า ${SELL_FLOOR_KG_MIN}`)
  .max(SELL_FLOOR_KG_MAX, `ต้องไม่เกิน ${SELL_FLOOR_KG_MAX}`);

// The owner gave ONE value per transport (truck/sea), shared both warehouses.
const updateKgSchema = z.object({
  truck: kgFloorValue, // transport '1' รถ
  sea: kgFloorValue, // transport '2' เรือ
});
export type AdminUpdateSellFloorKgInput = z.infer<typeof updateKgSchema>;

export async function adminUpdateSellFloorKg(
  input: AdminUpdateSellFloorKgInput,
): Promise<AdminActionResult<{ before: SellFloorKgConfig | null; after: SellFloorKgConfig }>> {
  const parsed = updateKgSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "กรอกราคาขั้นต่ำ KG ให้ครบ (รถ · เรือ)" };
  }
  // Normalize to the stored shape (transport → flat ฿/กก.).
  const after: SellFloorKgConfig = { "1": parsed.data.truck, "2": parsed.data.sea };

  // 🔐 ultra/super ONLY (same gate as the CBM action).
  return withAdmin<{ before: SellFloorKgConfig | null; after: SellFloorKgConfig }>(
    ["ultra", "super"],
    async ({ adminId }) => {
      const roles = (await getAdminRoles()) ?? [];
      if (!isGodRole(roles)) {
        return { ok: false, error: "forbidden — เฉพาะ Ultra Admin Z แก้ราคาขั้นต่ำได้" };
      }

      const admin = createAdminClient();

      // Before-image (for the audit) — the existing key value, if any.
      const { data: existing, error: readErr } = await admin
        .from("business_config")
        .select("value")
        .eq("key", SELL_FLOOR_KG_KEY)
        .maybeSingle<{ value: unknown }>();
      if (readErr) {
        console.error(`[sell-floor-kg read] failed`, { code: readErr.code, message: readErr.message });
        return { ok: false, error: `db_error:${readErr.code ?? "unknown"}` };
      }
      const before = (existing?.value as SellFloorKgConfig | null) ?? null;

      // UPSERT — the key is NOT migration-seeded, so insert-if-absent. On the
      // first ultra-save the row is created (value_type='json', category
      // 'pricing'); subsequent saves update value + the audit columns.
      const nowIso = new Date().toISOString();
      const { error: upErr } = await admin
        .from("business_config")
        .upsert(
          {
            key: SELL_FLOOR_KG_KEY,
            value: after,
            value_type: "json",
            category: "pricing",
            description:
              "ราคาขายขั้นต่ำ KG (฿/กก.) ต่อขนส่ง (รถ/เรือ) ทุกโกดัง — ห้ามขายต่ำกว่านี้ · แก้ได้เฉพาะ Ultra Admin Z",
            updated_by_admin_id: adminId,
            updated_at: nowIso,
          },
          { onConflict: "key" },
        );
      if (upErr) {
        console.error(`[sell-floor-kg upsert] failed`, { code: upErr.code, message: upErr.message });
        return { ok: false, error: `บันทึกไม่สำเร็จ: ${upErr.message}` };
      }

      // Drop the cache key so getSellFloorKg() sees the new floor immediately.
      invalidateBusinessConfig(SELL_FLOOR_KG_KEY);

      await logAdminAction(adminId, "business_config.sell_floor_kg.update", "business_config", SELL_FLOOR_KG_KEY, {
        before: before ?? defaultSellFloorKg(),
        after,
      });

      // The floor is read by the customer rate page (enforcement + display).
      revalidatePath("/admin/customers", "layout");

      return { ok: true, data: { before, after } };
    },
  );
}
