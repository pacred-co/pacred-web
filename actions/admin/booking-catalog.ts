"use server";

/**
 * Server actions — Booking pricing catalog (ปอน 2026-07-10).
 * Persists to Supabase `booking_pricing_catalog` (mig 0248). One row per combo key
 * (id + jsonb = CatalogTemplate). Bootstraps from the CSV-derived seed on empty DB.
 *
 * MONEY-SAFE (lib/admin/money-visibility.ts):
 *   • READ (loadBookingCatalog) — any admin, but cost/profit are STRIPPED at the data
 *     layer per the caller's role (super sees profit-not-cost · sales sees neither).
 *   • WRITE (save/reset) — canViewCost only (managing the catalog needs to see cost).
 *
 * Resilient: if the table doesn't exist yet (migration 0248 not applied), READ returns
 * the seed with persisted:false (feature works read-only); WRITE returns a clear error.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { canViewCost, canViewProfit } from "@/lib/admin/money-visibility";
import { stripTemplateMoney, type CatalogTemplate } from "@/lib/booking/catalog";
import { buildCatalogSeed } from "@/lib/booking/catalog-seed";

type Admin = ReturnType<typeof createAdminClient>;

const TABLE = "booking_pricing_catalog";

function tableMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || /does not exist|could not find the table|schema cache/i.test(err.message ?? "");
}

async function writeSeed(admin: Admin, templates: CatalogTemplate[]): Promise<void> {
  const now = new Date().toISOString();
  const rows = templates.map((t) => ({ id: t.key, data: { ...t, updatedAt: now }, updated_at: now }));
  await admin.from(TABLE).upsert(rows, { onConflict: "id" });
}

export type LoadCatalogResult = {
  templates: Record<string, CatalogTemplate>;
  showCost: boolean;
  showProfit: boolean;
  persisted: boolean; // false = migration 0248 ยังไม่ apply (โชว์ seed อ่านอย่างเดียว)
};

/** อ่าน catalog ทั้งชุด. cost/profit ถูก strip ตามสิทธิ์ก่อนส่งกลับ. bootstrap seed เมื่อว่าง. */
export async function loadBookingCatalog(): Promise<LoadCatalogResult> {
  const { roles } = await requireAdmin();
  const showCost = canViewCost(roles);
  const showProfit = canViewProfit(roles);
  const admin = createAdminClient();

  const { data, error } = await admin.from(TABLE).select("data");
  if (error && tableMissing(error)) {
    // migration ยังไม่ apply → คืน seed (อ่านอย่างเดียว)
    return {
      templates: mapTemplates(buildCatalogSeed(), showCost, showProfit),
      showCost, showProfit, persisted: false,
    };
  }
  if (error) throw new Error(`[booking-catalog] load failed: ${error.message}`);

  let rows = (data ?? []).map((r) => r.data as CatalogTemplate);
  if (rows.length === 0) {
    const seed = buildCatalogSeed();
    await writeSeed(admin, seed);
    rows = seed;
  }
  return { templates: mapTemplates(rows, showCost, showProfit), showCost, showProfit, persisted: true };
}

function mapTemplates(rows: CatalogTemplate[], showCost: boolean, showProfit: boolean): Record<string, CatalogTemplate> {
  const map: Record<string, CatalogTemplate> = {};
  for (const t of rows) map[t.key] = stripTemplateMoney(t, { showCost, showProfit });
  return map;
}

export type SaveCatalogResult = { ok: boolean; error?: string };

/** บันทึก template ของ combo หนึ่ง (upsert). canViewCost เท่านั้น (ต้องเห็นต้นทุน). */
export async function saveBookingCatalogTemplate(key: string, template: CatalogTemplate): Promise<SaveCatalogResult> {
  const { user, roles } = await requireAdmin();
  if (!canViewCost(roles)) return { ok: false, error: "ไม่มีสิทธิ์ตั้งราคา (เฉพาะ Pricing/Ultra)" };
  if (!key || key !== template.key) return { ok: false, error: "key ไม่ถูกต้อง" };

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const data: CatalogTemplate = { ...template, updatedAt: now, updatedBy: user.email ?? undefined };
  const { error } = await admin.from(TABLE).upsert({ id: key, data, updated_at: now }, { onConflict: "id" });
  if (error) {
    if (tableMissing(error)) return { ok: false, error: "ยังไม่ได้รัน migration 0248 — บันทึกไม่ได้ (แจ้งทีมรัน migration ก่อน)" };
    console.error(`[booking-catalog] save ${key} failed`, { message: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** ล้าง + reseed catalog ทั้งชุด (คืนค่าตั้งต้น). canViewCost เท่านั้น. */
export async function resetBookingCatalog(): Promise<SaveCatalogResult> {
  const { roles } = await requireAdmin();
  if (!canViewCost(roles)) return { ok: false, error: "ไม่มีสิทธิ์ (เฉพาะ Pricing/Ultra)" };
  const admin = createAdminClient();
  const { error: delErr } = await admin.from(TABLE).delete().neq("id", "__never__");
  if (delErr && tableMissing(delErr)) return { ok: false, error: "ยังไม่ได้รัน migration 0248" };
  await writeSeed(admin, buildCatalogSeed());
  return { ok: true };
}
